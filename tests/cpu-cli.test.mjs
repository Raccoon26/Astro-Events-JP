import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import { preflight } from '../scripts/path-policy.mjs';

const localDriveVerified = preflight().localDriveVerified;

it.each([
  {
    args: ['scripts/cloudflare-ci.mjs', 'production', 'profile-cpu-matrix'],
    error: 'Explicit validate/deploy required',
  },
  {
    args: ['scripts/cloudflare-ci.mjs', 'production', 'profile-cpu-optimized'],
    error: 'Explicit validate/deploy required',
  },
  {
    args: ['scripts/staging-cpu-matrix.mjs', 'production'],
    error: 'STAGING_CPU_MATRIX_ONLY',
  },
  {
    args: ['scripts/profile-post-store.mjs', '--remote'],
    error: 'LOCAL_STORE_PROFILE_ONLY',
  },
  {
    args: ['scripts/read-cpu-matrix.mjs', 'C:/not-a-project-report.json'],
    error: localDriveVerified
      ? 'REPORT_PATH_REFUSED'
      : 'EXPLICIT_E_REPORT_REQUIRED',
  },
])(
  'refuses unsupported or production CPU operation before authentication: %s',
  ({ args, error }) => {
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
    expect(r.stderr).toContain('Error: ' + error);
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
