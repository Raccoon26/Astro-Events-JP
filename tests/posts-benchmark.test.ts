import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/config';
import benchmark from '../src/remote-benchmark';

function environment(): Env {
  return {
    APP_ENV: 'staging',
    DEPLOYMENT_ENV: 'staging',
    DATABASE_ENVIRONMENT: 'staging',
    DATABASE_NAME: 'astro-events-jp-staging',
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
                environment: 'staging',
                database_name: 'astro-events-jp-staging',
                schema_version: 2,
              },
            ],
            meta: { rows_read: 1, rows_written: 0, size_after: 4096 },
          }),
        }),
      })),
    } as unknown as D1Database,
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('fixed staging post diagnostic isolation', () => {
  it('ignores supplied URLs/text, performs SELECT only and never calls an external fetch', async () => {
    const fetch = vi.fn(() => {
      throw new Error('external-disabled');
    });
    vi.stubGlobal('fetch', fetch);
    const env = environment(),
      r = await benchmark.fetch(
        new Request(
          'https://example.test/benchmark/posts?url=http://127.0.0.1&text=forged',
        ),
        env,
      ),
      body = (await r.json()) as {
        valid: boolean;
        synthetic: boolean;
        weightedLength: number;
        dbRowsRead: number;
        dbRowsWritten: number;
        externalRequests: number;
      };
    expect(r.status).toBe(200);
    expect(body).toMatchObject({
      valid: true,
      synthetic: true,
      dbRowsRead: 1,
      dbRowsWritten: 0,
      externalRequests: 0,
    });
    expect(body.weightedLength).toBeLessThanOrEqual(280);
    expect(fetch).not.toHaveBeenCalled();
    expect(env.DB.prepare).toHaveBeenCalledTimes(1);
    expect(env.DB.prepare).toHaveBeenCalledWith(
      expect.stringMatching(/^SELECT /),
    );
  });
  it.each(['production', 'staging'])(
    'refuses mutation methods in %s',
    async (target) => {
      const env = environment();
      env.APP_ENV = target;
      expect(
        (
          await benchmark.fetch(
            new Request('https://example.test/benchmark/posts', {
              method: 'POST',
            }),
            env,
          )
        ).status,
      ).toBe(404);
      expect(env.DB.prepare).not.toHaveBeenCalled();
    },
  );
  it('denies production GET profiling before touching its DB', async () => {
    const env = environment();
    env.APP_ENV = 'production';
    expect(
      (
        await benchmark.fetch(
          new Request('https://example.test/benchmark/posts'),
          env,
        )
      ).status,
    ).toBe(404);
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });
  it('keeps collection and notification configuration mismatches fail-closed', async () => {
    const env = environment();
    env.COLLECTION_ENABLED = 'true';
    expect(
      (
        await benchmark.fetch(
          new Request('https://example.test/benchmark/posts'),
          env,
        )
      ).status,
    ).toBe(503);
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });
});
