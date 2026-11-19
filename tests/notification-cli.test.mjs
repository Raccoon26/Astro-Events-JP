import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

const run = (args) =>
  spawnSync(process.execPath, ['scripts/notifications.mjs', ...args], {
    encoding: 'utf8',
    timeout: 20000,
  });
it.each([
  ['list', '--remote'],
  ['list', '--live'],
  ['list', '--api-token', 'no-secret'],
  ['list', '--production'],
  ['dispatch', '--apply'],
  ['enqueue', '--apply', '--simulation', '--local-budget'],
])(
  'blocks unsupported or insufficiently authorized CLI options %j',
  (...args) => {
    const r = run(args);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(
      /UNSUPPORTED_NOTIFICATION_OPTION|EXPLICIT_LOCAL_SIMULATION|EXPECTED_SOURCE_FINGERPRINT/,
    );
  },
);
it('reports unknown email prerequisites without claiming delivery or loading credentials', () => {
  const r = run(['email']);
  expect(r.status).toBe(0);
  const result = JSON.parse(r.stdout);
  expect(result.externalRequests).toBe(0);
  expect(result.deliveryVerified).toBe(false);
  expect(result.canPlanSeparateApprovedTest).toBe(false);
  expect(result.missing.length).toBeGreaterThan(0);
});
