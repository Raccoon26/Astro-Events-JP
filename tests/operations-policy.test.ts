import { describe, expect, it } from 'vitest';
import {
  type AccountObservation,
  assess,
  COSTS,
  STRUCTURAL,
  slot,
  ZERO,
} from '../src/operations/policy';

const now = Date.parse('2026-12-01T15:00:00.000Z');
const sample: AccountObservation = {
  ...ZERO,
  plan: 'free',
  provenance: 'fixture',
  checkedAt: new Date(now).toISOString(),
  cronTriggers: 1,
  cpuP99Ms: 4,
  projectDatabaseBytes: 0,
  telemetryUnit: 'bytes',
};
describe('DEV-09 schedule and Free admission', () => {
  it('maps all eight UTC boundaries and the JST daily rollover', () => {
    const day = Date.parse('2026-12-01');
    const ticks = Array.from({ length: 8 }, (_, i) => slot(day + i * 10800000));
    expect(ticks.map((t) => t.jst.slice(11, 16))).toEqual([
      '09:00',
      '12:00',
      '15:00',
      '18:00',
      '21:00',
      '00:00',
      '03:00',
      '06:00',
    ]);
    expect(ticks.filter((t) => t.daily).map((t) => t.jst)).toEqual([
      '2026-12-02T00:00:00+09:00',
    ]);
    expect(() => slot(day + 60000)).toThrow('OPS_CRON_BOUNDARY');
  });
  it.each([
    null,
    { ...sample, telemetry: null },
    { ...sample, cpuP99Ms: null },
    { ...sample, reads: NaN },
    { ...sample, checkedAt: '2026-12-01T14:44:59Z' },
    { ...sample, checkedAt: '2026-12-01T15:00:01Z' },
    { ...sample, telemetryUnit: 'records' } as const,
  ])('defers instead of imputing missing or stale evidence %#', (evidence) => {
    expect(assess(evidence, ZERO, STRUCTURAL, now)).toMatchObject({
      allowed: false,
      code: 'metrics-unavailable',
    });
  });
  it('reserves the remaining budget for recovery, reports and cleanup at eighty percent', () => {
    const e = { ...sample, requests: 64000 };
    expect(assess(e, ZERO, COSTS.collect, now)).toMatchObject({
      allowed: false,
      code: 'reserve-priority',
    });
    expect(assess(e, ZERO, COSTS.recover, now, true)).toMatchObject({
      allowed: true,
      code: 'reserve-only',
    });
    expect(assess(e, ZERO, COSTS['urgent-outbox'], now, true)).toMatchObject({
      allowed: true,
      code: 'reserve-only',
    });
    expect(
      assess({ ...e, writes: 80000 }, ZERO, COSTS.recover, now, true),
    ).toMatchObject({ allowed: false, code: 'free-budget' });
    expect(
      assess({ ...sample, telemetry: 500000000 }, ZERO, STRUCTURAL, now, true),
    ).toMatchObject({ allowed: false });
  });
  it('distinguishes the project storage cap from the account total', () => {
    const example = {
      ...sample,
      projectDatabaseBytes: 399999990,
      databaseBytes: 500000000,
    };
    expect(assess(example, ZERO, STRUCTURAL, now, true)).toMatchObject({
      allowed: false,
      code: 'project-storage',
    });
  });
  it('does not infer CPU from elapsed time or reset subrequest use between functions', () => {
    expect(
      assess({ ...sample, cpuP99Ms: 10 }, ZERO, STRUCTURAL, now, true),
    ).toMatchObject({ allowed: false, code: 'cpu-budget' });
    expect(
      assess({ ...sample, cpuP99Ms: 8 }, ZERO, STRUCTURAL, now),
    ).toMatchObject({ allowed: false, code: 'cpu-budget' });
    expect(
      assess(sample, ZERO, { ...STRUCTURAL, subrequests: 51 }, now),
    ).toMatchObject({ allowed: false, code: 'platform-limit' });
  });
  it('charges concurrent project reservations against account usage and respects the UTC reset', () => {
    expect(
      assess(
        { ...sample, reads: 3999950 },
        { ...ZERO, reads: 51 },
        STRUCTURAL,
        now,
        true,
      ),
    ).toMatchObject({ allowed: false, code: 'free-budget' });
    const edge = Date.parse('2026-12-02');
    expect(
      assess(
        { ...sample, checkedAt: '2026-12-01T23:59:58Z' },
        ZERO,
        STRUCTURAL,
        edge,
      ),
    ).toMatchObject({ allowed: false, code: 'metrics-unavailable' });
  });
});
