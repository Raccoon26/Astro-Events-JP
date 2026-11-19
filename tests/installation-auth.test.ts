import { describe, expect, it, vi } from 'vitest';
import {
  InstallationCredential,
  type InstallationGrant,
} from '../src/notifications/installation-auth';

const HOUR = 3600000;
function grant(
  now: number,
  token = 'synthetic-installation-credential',
): InstallationGrant {
  return {
    ok: true,
    token,
    expiresAt: now + HOUR,
    repositoryIds: [123],
    permissions: { metadata: 'read', issues: 'write' },
  };
}
describe('isolated GitHub App credential lifecycle', () => {
  it('shares one exchange, caches in memory and refreshes near expiry', async () => {
    let now = 1;
    const exchange = vi.fn(async () => grant(now));
    const auth = new InstallationCredential(123, { exchange }, () => now);
    await Promise.all([auth.get(), auth.get(), auth.get()]);
    expect(exchange).toHaveBeenCalledTimes(1);
    await auth.get();
    expect(exchange).toHaveBeenCalledTimes(1);
    now += HOUR - 120000;
    await auth.get();
    expect(exchange).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(auth)).toBe('{}');
  });
  it('discards a rejected active credential and delays the next independent refresh', async () => {
    let now = 1;
    const exchange = vi.fn(async () => grant(now));
    const auth = new InstallationCredential(123, { exchange }, () => now);
    const token = await auth.get();
    auth.observeRejection('stale-unrelated-test-credential', 401);
    expect(await auth.get()).toBe(token);
    auth.observeRejection(token, 401);
    await expect(auth.get()).rejects.toThrow('backoff');
    now += 60000;
    await auth.get();
    expect(exchange).toHaveBeenCalledTimes(2);
    auth.observeRejection(token, 403);
    await expect(auth.get()).rejects.toThrow('denied');
  });
  it.each([403, 429])(
    'respects a rate limit and performs no extra request (%s)',
    async (status) => {
      let now = 1;
      const exchange = vi.fn(async () => ({
        ok: false as const,
        status,
        retryAt: 120001,
      }));
      const auth = new InstallationCredential(123, { exchange }, () => now);
      await expect(auth.get()).rejects.toThrow('backoff');
      now += 120000 - 1;
      await expect(auth.get()).rejects.toThrow('backoff');
      expect(exchange).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { repositoryIds: [123, 456] },
    { repositoryIds: [456] },
    { permissions: { metadata: 'read', issues: 'write', contents: 'read' } },
    { permissions: { metadata: 'read', issues: 'read' } },
    { expiresAt: 0 },
  ])(
    'fails closed on an incorrectly scoped or expired provider grant (%o)',
    async (override) => {
      const auth = new InstallationCredential(
        123,
        {
          exchange: async () => ({ ...grant(1), ...override }),
        },
        () => 1,
      );
      await expect(auth.get()).rejects.toThrow('invalid-grant');
    },
  );
  it('cannot reuse an in-flight grant after revoke and redacts exchange errors', async () => {
    let release: (g: InstallationGrant) => void = () => {};
    const auth = new InstallationCredential(
      123,
      {
        exchange: () =>
          new Promise<InstallationGrant>((resolve) => {
            release = resolve;
          }),
      },
      () => 1,
    );
    const pending = auth.get();
    auth.revoke();
    release(grant(1));
    await expect(pending).rejects.toThrow('revoked');
    await expect(auth.get()).rejects.toThrow('revoked');
    const broken = new InstallationCredential(
      123,
      {
        exchange: async () => {
          throw Error('provider-body-simulated-secret');
        },
      },
      () => 1,
    );
    await expect(broken.get()).rejects.toThrow(/^temporary$/);
  });
});
