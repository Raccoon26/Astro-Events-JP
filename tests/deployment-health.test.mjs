import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { verifyDeploymentHealth } from '../scripts/deployment-health.mjs';

const good = () =>
  Response.json({
    status: 'ok',
    code: 'OK',
    environment: 'staging',
    database: 'ok',
    collectionEnabled: false,
    mode: 'diagnostic-only',
  });
describe('bounded deployment propagation verification', () => {
  it('rejects production diagnostics before credentials or remote requests', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/staging-diagnostics.mjs', 'production'],
      { encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Explicit staging-only diagnostics required',
    );
  });
  it('allows a temporary routing 404 before a valid public health response', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('not activated yet', { status: 404 }))
      .mockResolvedValueOnce(good());
    const delay = vi.fn();
    expect(
      await verifyDeploymentHealth(
        'https://fixture.invalid/health',
        'staging',
        { fetcher, delay },
      ),
    ).toMatchObject({ httpStatus: 200, attempts: 2 });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    expect(delay).toHaveBeenCalledExactlyOnceWith(5000);
  });
  it('caps retries and does not report an unavailable deployment as successful', async () => {
    const fetcher = vi.fn(async () => new Response('pending', { status: 404 }));
    await expect(
      verifyDeploymentHealth('https://fixture.invalid/health', 'staging', {
        fetcher,
        delay: vi.fn(),
        attempts: 3,
      }),
    ).rejects.toThrow('HEALTH_PROPAGATION_TIMEOUT');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('retries transient network failures within the same bound', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('sensitive provider text'))
      .mockResolvedValueOnce(good());
    expect(
      (
        await verifyDeploymentHealth(
          'https://fixture.invalid/health',
          'staging',
          { fetcher, delay: vi.fn() },
        )
      ).attempts,
    ).toBe(2);
  });
  it('fails immediately on a real database identity error', async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { code: 'DB_IDENTITY', collectionEnabled: false },
        { status: 503 },
      ),
    );
    await expect(
      verifyDeploymentHealth('https://fixture.invalid/health', 'staging', {
        fetcher,
      }),
    ).rejects.toThrow('HEALTH_CONTRACT_FAILED');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects a different environment, enabled collection and unexpected public fields', async () => {
    for (const change of [
      { environment: 'production' },
      { collectionEnabled: true },
      { internalDatabaseId: 'do-not-expose' },
    ]) {
      const body = await good().json();
      await expect(
        verifyDeploymentHealth('https://fixture.invalid/health', 'staging', {
          fetcher: async () => Response.json({ ...body, ...change }),
        }),
      ).rejects.toThrow('HEALTH_CONTRACT_FAILED');
    }
  });
  it('bounds the actual response stream rather than trusting Content-Length', async () => {
    await expect(
      verifyDeploymentHealth('https://fixture.invalid/health', 'staging', {
        fetcher: async () =>
          new Response('x'.repeat(4097), {
            headers: {
              'content-length': '1',
              'content-type': 'application/json',
            },
          }),
      }),
    ).rejects.toThrow('HEALTH_BODY_TOO_LARGE');
  });
  it('rejects malformed data and unbounded retry configuration', async () => {
    await expect(
      verifyDeploymentHealth('https://fixture.invalid/health', 'staging', {
        fetcher: async () => new Response('{'),
      }),
    ).rejects.toThrow('HEALTH_INVALID_RESPONSE');
    await expect(
      verifyDeploymentHealth('https://fixture.invalid/health', 'staging', {
        attempts: 9,
      }),
    ).rejects.toThrow('INVALID_HEALTH_CHECK');
  });
});
