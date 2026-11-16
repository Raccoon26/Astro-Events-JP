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

it('does not label unavailable provider errors as zero', () => {
  const r = correlateCpu({ groups: [] }, [sample], 'v');
  expect(r.summary.optimized.providerErrors).toBeNull();
  expect(r.summary.optimized.observed).toBe(0);
});
it.each([true, false])(
  'keeps grouped=%s GraphQL structurally balanced and uses version variables',
  async (grouped) => {
    let captured;
    const units = ['cpuTimeP50', 'cpuTimeP95', 'cpuTimeP99'].map((name) => ({
      name,
      description: 'microseconds',
    }));
    await queryCpuMetrics({
      token: 'synthetic',
      accountId: 'a'.repeat(32),
      scriptName: 'astro-events-jp-staging',
      start: '2026-11-16T15:00Z',
      end: '2026-11-16T15:01Z',
      grouped,
      scriptVersion: 'dec92dbb-f5b2-452c-85ec-0d6a133adfac',
      fetcher: async (_url, init) => {
        captured = JSON.parse(init.body);
        return Response.json({
          data: {
            unit: { fields: units },
            viewer: { accounts: [{ workersInvocationsAdaptive: [] }] },
          },
        });
      },
    });
    expect([...captured.query].filter((c) => c === '{').length).toBe(
      [...captured.query].filter((c) => c === '}').length,
    );
    expect(captured.variables.v).toBe('dec92dbb-f5b2-452c-85ec-0d6a133adfac');
    expect(captured.query).toContain('scriptVersion:$v');
  },
);
it.each([
  [401, 'credentials hidden', 'AUTHORIZATION'],
  [200, 'Syntax Error: private details', 'QUERY_SYNTAX'],
  [200, 'Cannot query field: private details', 'QUERY_SCHEMA'],
])(
  'reports safe metric failure category %i',
  async (status, message, category) => {
    await expect(
      queryCpuMetrics({
        token: 'synthetic',
        accountId: 'a'.repeat(32),
        scriptName: 'astro-events-jp-staging',
        start: '2026-11-16T15:00Z',
        end: '2026-11-16T15:01Z',
        fetcher: async () =>
          Response.json({ errors: [{ message }] }, { status }),
      }),
    ).rejects.toThrow(`CPU_METRICS_${category}_${status}`);
  },
);
