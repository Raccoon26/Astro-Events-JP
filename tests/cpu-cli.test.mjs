import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it.each([
  ['scripts/cloudflare-ci.mjs', 'production', 'profile-cpu-matrix'],
  ['scripts/staging-cpu-matrix.mjs', 'production'],
  ['scripts/profile-post-store.mjs', '--remote'],
])(
  'refuses unsupported or production CPU operation before authentication: %s',
  (...args) => {
    const r = spawnSync(process.execPath, args, {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: 'synthetic-invalid-not-a-credential',
      },
    });
    expect(r.status).not.toBe(0);
    expect(r.error).toBeUndefined();
    expect(r.stdout + r.stderr).not.toContain(
      'synthetic-invalid-not-a-credential',
    );
    expect(r.stderr).toMatch(/ONLY|Explicit validate\/deploy required/);
  },
);
