import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

it.each([
  ['scripts/cloudflare-ci.mjs', 'production', 'profile-cpu-matrix'],
  ['scripts/cloudflare-ci.mjs', 'production', 'profile-cpu-optimized'],
  ['scripts/staging-cpu-matrix.mjs', 'production'],
  ['scripts/profile-post-store.mjs', '--remote'],
  ['scripts/read-cpu-matrix.mjs', 'C:/not-a-project-report.json'],
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
    expect(r.stderr).toMatch(
      /ONLY|REPORT_PATH_REFUSED|Explicit validate\/deploy required/,
    );
  },
);
it('keeps dispatch choices aligned with staging-only CPU modes', () => {
  const workflow = parse(readFileSync('.github/workflows/deploy.yml', 'utf8'));
  expect(workflow.on.workflow_dispatch.inputs.mode.options).toEqual(
    expect.arrayContaining(['profile-cpu-matrix', 'profile-cpu-optimized']),
  );
  expect(workflow.jobs.deploy.concurrency).toBeUndefined();
  expect(workflow.concurrency['cancel-in-progress']).toBe(false);
});
