import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/config';
import { validateRuntimeConfig } from '../src/config';
import { diagnose } from '../src/diagnostics';
import worker from '../src/index';

function environment(overrides: Partial<Env> = {}, identity = 'staging'): Env {
  const all = vi.fn(async () => ({
    success: true,
    results: [
      {
        environment: identity,
        database_name: `astro-events-jp-${identity}`,
        schema_version: 2,
      },
    ],
    meta: { rows_read: 1, rows_written: 0, size_after: 4096 },
  }));
  return {
    APP_ENV: 'staging',
    DEPLOYMENT_ENV: 'staging',
    DATABASE_ENVIRONMENT: 'staging',
    DATABASE_NAME: 'astro-events-jp-staging',
    REPORTS_REPOSITORY: 'Raccoon26/Astro-Events-JP-Reports',
    COLLECTION_ENABLED: 'false',
    NOTIFICATIONS_ENABLED: 'false',
    DB: {
      prepare: vi.fn(() => ({ bind: vi.fn(() => ({ all })) })),
    } as unknown as D1Database,
    ...overrides,
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe('deployment runtime', () => {
  it.each(['staging', 'production'])(
    'validates the %s configuration',
    (target) => {
      expect(
        validateRuntimeConfig(
          environment({
            APP_ENV: target,
            DEPLOYMENT_ENV: target,
            DATABASE_ENVIRONMENT: target,
            DATABASE_NAME: `astro-events-jp-${target}`,
          }),
        ),
      ).toBe(target);
    },
  );
  it.each([
    { COLLECTION_ENABLED: 'true' },
    { NOTIFICATIONS_ENABLED: 'true' },
    { DEPLOYMENT_ENV: 'development' },
    { DATABASE_ENVIRONMENT: 'production' },
    { DATABASE_NAME: 'other-project' },
    { DB: undefined },
  ])('fails closed on unsafe configuration %j', async (override) => {
    expect((await diagnose(environment(override as Partial<Env>))).code).toBe(
      'CONFIG',
    );
  });
  it('rejects the wrong bound database even when variables claim staging', async () => {
    const env = environment({}, 'production');
    const response = await worker.fetch(
      new Request('https://example.jp/health'),
      env,
    );
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code: string }).code).toBe(
      'DB_IDENTITY',
    );
  });
  it('returns only public status and logs only bounded safe fields', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const request = new Request(
      'https://example.jp/health?token=sensitive-query',
      { headers: { Authorization: 'Bearer sensitive-header' } },
    );
    const response = await worker.fetch(request, environment());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const json = await response.json();
    expect(Object.keys(json as object).sort()).toEqual([
      'code',
      'collectionEnabled',
      'database',
      'environment',
      'mode',
      'status',
    ]);
    const logs = log.mock.calls.flat().join('');
    expect(logs).not.toMatch(/sensitive|astro-events-jp-staging|Authorization/);
    expect(JSON.parse(logs)).toMatchObject({
      rowsRead: 1,
      rowsWritten: 0,
      processedTasks: 0,
      cpuTimeMs: null,
      accountUsage: 'unknown',
      externalSubrequests: 0,
    });
  });
  it('converts upstream errors into safe 503 responses', async () => {
    const env = environment({
      DB: {
        prepare() {
          throw new Error('private-account-id credential');
        },
      } as unknown as D1Database,
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const response = await worker.fetch(
      new Request('https://example.jp/health'),
      env,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/private-account|credential/);
    expect(log.mock.calls.flat().join('')).not.toMatch(
      /private-account|credential/,
    );
  });
  it('bounds database wait time without claiming cancellation or CPU measurement', async () => {
    vi.useFakeTimers();
    const env = environment({
      DB: {
        prepare() {
          return {
            bind() {
              return { all: () => new Promise(() => {}) };
            },
          };
        },
      } as unknown as D1Database,
    });
    const result = diagnose(env);
    await vi.advanceTimersByTimeAsync(3000);
    expect((await result).code).toBe('DB_TIMEOUT');
  });
  it('rejects unknown routes and methods without database work', async () => {
    const env = environment();
    expect(
      (await worker.fetch(new Request('https://example.jp/admin'), env)).status,
    ).toBe(404);
    expect(
      (
        await worker.fetch(
          new Request('https://example.jp/health', { method: 'POST' }),
          env,
        )
      ).status,
    ).toBe(405);
    expect(env.DB.prepare).not.toHaveBeenCalled();
    const head = await worker.fetch(
      new Request('https://example.jp/health', { method: 'HEAD' }),
      env,
    );
    expect(await head.text()).toBe('');
  });
  it.each(['0 */3 * * *', '17 0 * * *'])(
    'runs %s as read-only diagnostics',
    async (cron) => {
      const env = environment();
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      await worker.scheduled(
        {
          cron,
          scheduledTime: Date.parse('2026-11-11T00:00:00Z'),
        } as ScheduledController,
        env,
      );
      expect(env.DB.prepare).toHaveBeenCalledTimes(1);
      expect(env.DB.prepare).toHaveBeenCalledWith(
        expect.stringMatching(/^SELECT /),
      );
      expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
        kind: 'cron',
        success: true,
        processedTasks: 0,
        collectionEnabled: false,
        rowsWritten: 0,
      });
    },
  );
  it('marks failed Cron invocations as failures', async () => {
    await expect(
      worker.scheduled(
        { scheduledTime: 0 } as ScheduledController,
        environment({}, 'production'),
      ),
    ).rejects.toThrow();
  });
});
