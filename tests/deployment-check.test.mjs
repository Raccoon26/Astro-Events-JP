import { describe, expect, it } from 'vitest';
import { assertTrustedQuality } from '../scripts/deployment-check-policy.mjs';

const sha = 'synthetic-head';
const check = (overrides = {}) => ({
  id: 1,
  name: 'quality',
  head_sha: sha,
  app: { id: 15368 },
  status: 'completed',
  conclusion: 'success',
  started_at: '2026-11-11T00:00:00Z',
  ...overrides,
});
const snapshot = (checks) => ({
  total_count: checks.length,
  check_runs: checks,
});
describe('deployment commit CI evidence', () => {
  it('accepts the current trusted success while its deployment job runs', () => {
    expect(() =>
      assertTrustedQuality(
        snapshot([
          check(),
          check({ name: 'deploy', status: 'in_progress', conclusion: null }),
        ]),
        sha,
      ),
    ).not.toThrow();
  });
  it('rejects old head success and a forged quality application', () => {
    expect(() =>
      assertTrustedQuality(snapshot([check({ head_sha: 'previous' })]), sha),
    ).toThrow();
    expect(() =>
      assertTrustedQuality(snapshot([check({ app: { id: 1 } })]), sha),
    ).toThrow();
  });
  it('rejects a failed or pending newer rerun instead of reusing an old success', () => {
    for (const override of [
      { conclusion: 'failure' },
      { status: 'in_progress', conclusion: null },
    ])
      expect(() =>
        assertTrustedQuality(
          snapshot([
            check(),
            check({ id: 2, started_at: '2026-11-11T01:00:00Z', ...override }),
          ]),
          sha,
        ),
      ).toThrow();
  });
  it('blocks failed other checks and incomplete paginated evidence', () => {
    expect(() =>
      assertTrustedQuality(
        snapshot([check(), check({ name: 'security', conclusion: 'failure' })]),
        sha,
      ),
    ).toThrow();
    expect(() =>
      assertTrustedQuality({ total_count: 101, check_runs: [check()] }, sha),
    ).toThrow();
  });
});
