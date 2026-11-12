import { build } from 'esbuild';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  accountSnapshot,
  graphql,
  sumUsage,
  verifyFreePlan,
} from '../scripts/account-snapshot.mjs';
import { checkFreeAccount } from '../scripts/cloudflare-policy.mjs';
import {
  scheduledTimes,
  validateStageSchedules,
} from '../scripts/cron-policy.mjs';
import { verifyStagingRecovery } from '../scripts/recovery-policy.mjs';

const accountId = 'a'.repeat(32),
  dbId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const proof = () => ({
  accountId,
  plan: 'free',
  source: 'authenticated-cloudflare-dashboard',
  checkedAt: new Date().toISOString(),
});
let benchmarkWorker;
beforeAll(async () => {
  const bundle = await build({
    entryPoints: ['src/remote-benchmark.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
  });
  benchmarkWorker = (
    await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
    )
  ).default;
});
describe('fixed staging benchmark version', () => {
  const env = (target = 'staging') => ({
    APP_ENV: target,
    DEPLOYMENT_ENV: target,
    DATABASE_ENVIRONMENT: target,
    DATABASE_NAME: `astro-events-jp-${target}`,
    REPORTS_REPOSITORY: 'Raccoon26/Astro-Events-JP-Reports',
    COLLECTION_ENABLED: 'false',
    NOTIFICATIONS_ENABLED: 'false',
    DB: {
      prepare: vi.fn(() => ({
        bind: () => ({
          all: async () => ({
            success: true,
            results: [
              {
                environment: target,
                database_name: `astro-events-jp-${target}`,
                schema_version: 2,
              },
            ],
            meta: { rows_read: 1, rows_written: 0, size_after: 4096 },
          }),
        }),
      })),
    },
  });
  it('runs four small fixed parsers without accepting arbitrary input or activating a source', async () => {
    for (const format of ['rss', 'atom', 'html', 'sitemap']) {
      const response = await benchmarkWorker.fetch(
        new Request(`https://fixture.invalid/benchmark/${format}`),
        env(),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        format,
        candidates: 1,
        dbRowsRead: 1,
        dbRowsWritten: 0,
        externalRequests: 0,
        synthetic: true,
        cpuTimeMs: null,
      });
    }
  });
  it('blocks the benchmark on production, POST and unsupported paths', async () => {
    expect(
      (
        await benchmarkWorker.fetch(
          new Request('https://fixture.invalid/benchmark/html'),
          env('production'),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await benchmarkWorker.fetch(
          new Request('https://fixture.invalid/benchmark/html', {
            method: 'POST',
            body: 'untrusted page',
          }),
          env(),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await benchmarkWorker.fetch(
          new Request('https://fixture.invalid/benchmark/arbitrary'),
          env(),
        )
      ).status,
    ).toBe(404);
  });
  it('keeps Worker transport fail-closed and reports no external requests', async () => {
    expect(
      await (
        await benchmarkWorker.fetch(
          new Request('https://fixture.invalid/benchmark/ssrf'),
          env(),
        )
      ).json(),
    ).toEqual({ code: 'dns-protection-unavailable', externalRequests: 0 });
  });
  it('requires the proper D1 identity even for a synthetic parser diagnostic', async () => {
    const wrong = env();
    wrong.DATABASE_NAME = 'astro-events-jp-production';
    expect(
      (
        await benchmarkWorker.fetch(
          new Request('https://fixture.invalid/benchmark/html'),
          wrong,
        )
      ).status,
    ).toBe(503);
  });
});
describe('authenticated remote prerequisites without external network', () => {
  it('restricts diagnostic schedule writes to one known staging trigger and preserves UTC/JST meaning', () => {
    expect(
      validateStageSchedules(
        '/workers/scripts/astro-events-jp-staging/schedules',
        [{ cron: '* * * * *' }],
      ),
    ).toBe(true);
    expect(
      validateStageSchedules('/workers/scripts/other-project/schedules', [
        { cron: '* * * * *' },
      ]),
    ).toBe(false);
    expect(
      validateStageSchedules(
        '/workers/scripts/astro-events-jp-production/schedules',
        [],
      ),
    ).toBe(false);
    expect(
      validateStageSchedules(
        '/workers/scripts/astro-events-jp-staging/schedules',
        [{ cron: '* * * * *' }, { cron: '0 */3 * * *' }],
      ),
    ).toBe(false);
    expect(scheduledTimes(Date.parse('2026-11-12T00:00:00Z')).jst).toContain(
      '9:00:00',
    );
  });
  it('requires actual dashboard evidence, rejecting account mismatch and paid/unrecognized Workers plans', () => {
    expect(verifyFreePlan(proof(), accountId, [])).toBe(true);
    expect(() =>
      verifyFreePlan({ ...proof(), accountId: 'b'.repeat(32) }, accountId, []),
    ).toThrow();
    expect(() =>
      verifyFreePlan(proof(), accountId, [
        { rate_plan: { id: 'workers_standard' }, price: 5 },
      ]),
    ).toThrow();
    expect(() =>
      verifyFreePlan(proof(), accountId, [{ rate_plan: {} }]),
    ).toThrow();
  });
  it('allows a temporary dashboard fallback only while fresh, and requires subscription reads for CI', () => {
    const old = {
      ...proof(),
      checkedAt: new Date(Date.now() - 900001).toISOString(),
    };
    expect(() => verifyFreePlan(old, accountId, null)).toThrow();
    expect(verifyFreePlan(proof(), accountId, null)).toBe(true);
  });
  it('distinguishes a valid empty provider dataset from missing, incomplete or malformed metrics', () => {
    expect(sumUsage([], ['requests'])).toEqual({ requests: 0 });
    for (const groups of [
      null,
      [{ sum: {} }],
      [{ sum: { requests: -1 } }],
      [{ sum: { requests: 1 } }, { sum: { requests: 2 } }],
    ])
      expect(() => sumUsage(groups, ['requests'])).toThrow();
  });
  it('sanitizes GraphQL permission failures without leaking provider text or substituting zero usage', async () => {
    await expect(
      graphql('fixture', 'query', {}, async () =>
        Response.json({ errors: [{ message: 'sensitive fixture' }] }),
      ),
    ).rejects.toThrow('ACCOUNT_METRICS_UNAVAILABLE');
  });
  it('collects account-wide usage and all existing schedules without mutating any resources', async () => {
    const request = vi.fn(async (url, options) => {
      if (url.endsWith('/graphql'))
        return Response.json({
          data: {
            viewer: {
              accounts: [
                {
                  workersInvocationsAdaptive: [{ sum: { requests: 42 } }],
                  d1AnalyticsAdaptiveGroups: [
                    { sum: { rowsRead: 12, rowsWritten: 3 } },
                  ],
                },
              ],
            },
          },
        });
      const result = url.endsWith('/subscriptions')
        ? []
        : url.endsWith('/d1/database')
          ? []
          : url.endsWith('/workers/scripts')
            ? [{ id: 'existing-project' }]
            : { schedules: [] };
      expect(options.method).toBe('GET');
      return Response.json({ success: true, result });
    });
    const snapshot = await accountSnapshot({
      token: 'fixture',
      accountId,
      planEvidence: proof(),
      fetcher: request,
    });
    expect(snapshot).toMatchObject({
      requests: 42,
      reads: 12,
      writes: 3,
      databaseBytes: 0,
      workerCount: 1,
      cronTriggers: 0,
    });
    expect(
      request.mock.calls.some(([url]) =>
        url.includes('existing-project/schedules'),
      ),
    ).toBe(true);
  });
  it('does not treat inaccessible storage or Cron inventory as spare free capacity', async () => {
    const request = vi.fn(async (url) =>
      Response.json({
        success: true,
        result: url.endsWith('/subscriptions')
          ? []
          : url.endsWith('/d1/database')
            ? [{ uuid: dbId }]
            : url.endsWith('/workers/scripts')
              ? []
              : { uuid: dbId },
      }),
    );
    await expect(
      accountSnapshot({
        token: 'fixture',
        accountId,
        planEvidence: proof(),
        fetcher: request,
      }),
    ).rejects.toThrow('STORAGE_USAGE_UNAVAILABLE');
  });
  it('reserves only the requested Cron slots and allows no-Cron production when all five slots exist', () => {
    const snapshot = {
      accountId,
      plan: 'free',
      checkedAt: new Date().toISOString(),
      requests: 0,
      reads: 0,
      writes: 0,
      databaseBytes: 0,
      cronTriggers: 5,
    };
    expect(() =>
      checkFreeAccount(snapshot, 'production', Date.now(), 0),
    ).not.toThrow();
    expect(() =>
      checkFreeAccount(snapshot, 'staging', Date.now(), 1),
    ).toThrow();
  });
});
describe('staging-only recovery orchestration', () => {
  it('refuses production, mismatched identity and unsafe bookmark before making test changes', async () => {
    const query = vi.fn();
    await expect(
      verifyStagingRecovery({
        target: 'production',
        databaseId: dbId,
        databaseName: 'astro-events-jp-production',
        query,
      }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValue([
      {
        results: [
          {
            environment: 'production',
            database_name: 'astro-events-jp-production',
            schema_version: 2,
          },
        ],
      },
    ]);
    await expect(
      verifyStagingRecovery({
        target: 'staging',
        databaseId: dbId,
        databaseName: 'astro-events-jp-staging',
        query,
      }),
    ).rejects.toThrow('RECOVERY_IDENTITY_MISMATCH');
  });
  it('requires the recorded point, expected DDL failure, unchanged ledger and absence of the restored synthetic row', async () => {
    let exists = false,
      restored = false;
    const query = vi.fn(async (sql) => {
      if (sql.startsWith('CREATE TABLE'))
        throw new Error('CLOUDFLARE_API_FAILED_400');
      if (sql.startsWith('INSERT')) exists = true;
      if (sql.includes('deployment_identity'))
        return [
          {
            results: [
              {
                environment: 'staging',
                database_name: 'astro-events-jp-staging',
                schema_version: 2,
              },
            ],
          },
        ];
      if (sql.includes('d1_migrations'))
        return [{ results: [{ name: '0004_collection.sql' }] }];
      if (sql.startsWith('SELECT reason'))
        return [{ results: [{ reason: 'synthetic updated' }] }];
      if (sql.startsWith('SELECT candidate_id'))
        return [{ results: exists ? [{ candidate_id: 'fixture' }] : [] }];
      if (sql === 'PRAGMA quick_check')
        return [{ results: [{ quick_check: 'ok' }] }];
      return [{ results: [] }];
    });
    const result = await verifyStagingRecovery({
      target: 'staging',
      databaseId: dbId,
      databaseName: 'astro-events-jp-staging',
      query,
      bookmark: async () => 'a'.repeat(40),
      restore: async (point) => {
        expect(point).toBe('a'.repeat(40));
        exists = false;
        restored = true;
      },
    });
    expect(restored).toBe(true);
    expect(result).toMatchObject({
      probeAbsent: true,
      failedDdlObserved: true,
      migrationLedgerPreserved: true,
    });
  });
});
