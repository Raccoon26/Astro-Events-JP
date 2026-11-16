import { describe, expect, it } from 'vitest';
import {
  correlateCpu,
  percentile,
  queryCpuMetrics,
} from '../scripts/cpu-metrics.mjs';

const sample = {
  implementation: 'optimized',
  scenario: 'observation',
  serverDate: 'Mon, 16 Nov 2026 15:00:00 GMT',
  colo: 'NRT',
  httpStatus: 200,
  sequence: 1,
};
function metrics() {
  return {
    units: { wallTimeP50: 'microseconds', startupCpuTimeUsP99: 'microseconds' },
    groups: [
      {
        dimensions: {
          datetime: '2026-11-16T15:00:00Z',
          coloCode: 'NRT',
          httpResponseStatus: 200,
          scriptVersion: 'v',
          status: 'success',
        },
        sum: { requests: 1, errors: 0, subrequests: 0 },
        quantiles: {
          cpuTimeP50: 7500,
          cpuTimeP95: 7500,
          cpuTimeP99: 7500,
          wallTimeP50: 90000,
          startupCpuTimeUsP99: 1200,
          memoryUsageBytesP99: 2000000,
        },
      },
    ],
  };
}
describe('provider CPU evidence, never inferred elapsed CPU', () => {
  it('matches one invocation using version/server second/colo/status and converts verified units', () => {
    const r = correlateCpu(metrics(), [sample], 'v');
    expect(r.complete).toBe(true);
    expect(r.measurements[0]).toMatchObject({
      cpuTimeMs: 7.5,
      providerWallTimeMs: 90,
      providerStartupCpuMs: 1.2,
    });
    expect(r.summary.optimized).toMatchObject({
      sent: 1,
      observed: 1,
      p99Ms: 7.5,
      over10ms: 0,
    });
  });
  it.each(['count', 'two-groups', 'version', 'date', 'nonfinite'])(
    'refuses ambiguous/missing %s instead of certifying a latency as CPU',
    (kind) => {
      const m = metrics(),
        s = { ...sample, clientWallMs: 1 };
      if (kind === 'count') m.groups[0].sum.requests = 2;
      if (kind === 'two-groups') m.groups.push(m.groups[0]);
      if (kind === 'version') m.groups[0].dimensions.scriptVersion = 'old';
      if (kind === 'date') s.serverDate = null;
      if (kind === 'nonfinite') m.groups[0].quantiles.cpuTimeP50 = NaN;
      const r = correlateCpu(m, [s], 'v');
      expect(r.complete).toBe(false);
      expect(r.summary.optimized.p99Ms).toBeNull();
      expect(r.measurements[0].cpuTimeMs).toBeNull();
    },
  );
  it('counts observed >10ms precisely and separates first/subsequent cohorts', () => {
    const m = metrics();
    m.groups[0].quantiles.cpuTimeP50 = m.groups[0].quantiles.cpuTimeP99 = 11001;
    const r = correlateCpu(m, [sample], 'v');
    expect(r.summary.optimized.over10ms).toBe(1);
    expect(r.cohorts['optimized/first-in-isolate'].observed).toBe(1);
    expect(percentile([], 0.99)).toBeNull();
  });
  it('forbids production and fails closed on unavailable units', async () => {
    await expect(
      queryCpuMetrics({
        accountId: 'a'.repeat(32),
        scriptName: 'astro-events-jp-production',
        start: '2026-11-16T14:00Z',
        end: '2026-11-16T14:01Z',
      }),
    ).rejects.toThrow('TARGET');
    await expect(
      queryCpuMetrics({
        token: 'synthetic',
        accountId: 'a'.repeat(32),
        scriptName: 'astro-events-jp-staging',
        start: '2026-11-16T14:00Z',
        end: '2026-11-16T14:01Z',
        fetcher: async () => Response.json({ data: { unit: { fields: [] } } }),
      }),
    ).rejects.toThrow('UNIT_UNVERIFIED');
  });
});
