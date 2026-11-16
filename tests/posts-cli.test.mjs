import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('posts CLI refuses unsafe actions before loading a DB or credentials', () => {
  it('refuses production fixed profiling before credentials or remote access', () => {
    const r = spawnSync(
      process.execPath,
      ['scripts/cloudflare-ci.mjs', 'production', 'profile-posts'],
      { encoding: 'utf8', timeout: 15000 },
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Explicit validate/deploy required');
  });
  it.each([
    ['preview', '--remote'],
    ['preview', '--env', 'production'],
    ['preview', '--apply'],
    ['preview', '--apply', '--enable-posts', '--local-budget'],
    ['history', '--apply'],
    ['list', '--limit'],
    ['list', '--limit', '10', '--limit', '20'],
    ['anything'],
  ])('rejects %s %s', (...args) => {
    const r = spawnSync(process.execPath, ['scripts/posts.mjs', ...args], {
      encoding: 'utf8',
      timeout: 15000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).not.toContain('CLOUDFLARE_API_TOKEN=');
  });
});
