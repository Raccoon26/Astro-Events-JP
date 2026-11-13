import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('verifier management refuses unsafe operations before opening the local DB', () => {
  it('rejects a verifier-only production profile before reading credentials', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/cloudflare-ci.mjs', 'production', 'profile-verifier'],
      { encoding: 'utf8', timeout: 15000 },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Explicit validate/deploy required');
  });
  it.each([
    ['review', '--remote'],
    ['review', '--env', 'production'],
    ['review', '--apply'],
    ['review', '--apply', '--enable-verifier'],
    ['stats', '--apply', '--enable-verifier', '--local-budget'],
    ['pending', '--limit'],
    ['pending', '--limit', '25', '--limit', '50'],
  ])('rejects %s %s', (...args) => {
    const result = spawnSync(
      process.execPath,
      ['scripts/verifier.mjs', ...args],
      { encoding: 'utf8', timeout: 15000 },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain('CLOUDFLARE_API_TOKEN=');
  });
});
