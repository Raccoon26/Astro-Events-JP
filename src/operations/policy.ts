import { DAILY_BUDGET } from '../budget';
import type { Usage } from '../domain';
export const CRON = '0 */3 * * *';
const THREE_HOURS = 10800000;
const MINUTE = 60000;
export const PHASES = [
  'recover',
  'regional',
  'category',
  'vtuber',
  'urgent-track',
  'urgent-post',
  'urgent-outbox',
  'collect',
  'verify',
  'verify-vtuber',
  'track',
  'posts',
  'outbox',
  'weekend',
  'retention',
  'prune-fingerprints',
  'prune-crawl',
  'prune-ops',
  'report',
] as const;
export type Phase = (typeof PHASES)[number];
export type BudgetCost = Usage & { subrequests: number; telemetry: number };
export const STRUCTURAL: BudgetCost = {
  requests: 1,
  reads: 500,
  writes: 100,
  databaseBytes: 32768,
  subrequests: 0,
  telemetry: 8192,
};
export const COSTS = Object.fromEntries(
  PHASES.map((p) => [
    p,
    {
      ...STRUCTURAL,
      reads: [
        'recover',
        'regional',
        'category',
        'vtuber',
        'retention',
        'report',
      ].includes(p)
        ? 3000
        : 20000,
      writes: p === 'collect' ? 800 : 240,
      databaseBytes: p === 'collect' ? 1200000 : 131072,
      subrequests: p === 'collect' ? 8 : 0,
    },
  ]),
) as Record<Phase, BudgetCost>;
export interface AccountObservation extends Usage {
  checkedAt: string;
  plan: 'free';
  provenance: 'cloudflare' | 'fixture';
  cronTriggers: number;
  cpuP99Ms: number | null;
  projectDatabaseBytes: number | null;
  telemetry: number | null;
  telemetryUnit: 'records' | 'bytes';
}
export interface Reserved extends Usage {
  telemetry: number;
}
export const ZERO: Reserved = {
  requests: 0,
  reads: 0,
  writes: 0,
  databaseBytes: 0,
  telemetry: 0,
};
export const DAILY_PHASES = [
  'retention',
  'prune-fingerprints',
  'prune-crawl',
  'prune-ops',
  'report',
] as const;
export const critical = (phase: Phase) =>
  phase === 'recover' ||
  phase.startsWith('urgent-') ||
  DAILY_PHASES.some((p) => p === phase);
export function recordedObservation(
  evidence: AccountObservation,
): AccountObservation {
  const {
    checkedAt,
    plan,
    provenance,
    cronTriggers,
    cpuP99Ms,
    projectDatabaseBytes,
    telemetry,
    telemetryUnit,
    requests,
    reads,
    writes,
    databaseBytes,
  } = evidence;
  return {
    checkedAt,
    plan,
    provenance,
    cronTriggers,
    cpuP99Ms,
    projectDatabaseBytes,
    telemetry,
    telemetryUnit,
    requests,
    reads,
    writes,
    databaseBytes,
  };
}
export function iso(now: number) {
  return new Date(now).toISOString();
}
function metric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
export function slot(timestamp: number) {
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp <= 0 ||
    timestamp % THREE_HOURS
  )
    throw Error('OPS_CRON_BOUNDARY');
  const utc = iso(timestamp),
    jst = iso(timestamp + THREE_HOURS * 3);
  return {
    utc,
    jst: jst.slice(0, 19) + '+09:00',
    daily: jst.slice(11, 13) === '00',
  };
}
export function assess(
  evidence: AccountObservation | null,
  prior: Reserved,
  cost: BudgetCost,
  now: number,
  priority = false,
) {
  const at = evidence ? Date.parse(evidence.checkedAt) : NaN;
  const utcDay = iso(now).slice(0, 10);
  if (
    !evidence ||
    evidence.plan !== 'free' ||
    !['cloudflare', 'fixture'].includes(evidence.provenance) ||
    !Number.isFinite(at) ||
    at > now ||
    now - at > 15 * MINUTE ||
    iso(at).slice(0, 10) !== utcDay ||
    !metric(evidence.cronTriggers) ||
    !Number.isInteger(evidence.cronTriggers) ||
    !metric(evidence.cpuP99Ms) ||
    !metric(evidence.projectDatabaseBytes) ||
    evidence.projectDatabaseBytes > evidence.databaseBytes ||
    !metric(evidence.telemetry) ||
    evidence.telemetryUnit !== (utcDay >= '2026-12-01' ? 'bytes' : 'records') ||
    !(
      Object.values(prior).every(metric) && Object.values(cost).every(metric)
    ) ||
    !Object.keys(ZERO).every(
      (k) =>
        metric(evidence[k as keyof Reserved]) &&
        metric(prior[k as keyof Reserved]) &&
        metric(cost[k as keyof Reserved]),
    )
  )
    return { allowed: false, code: 'metrics-unavailable', utcDay } as const;
  if (evidence.cronTriggers > 5 || cost.subrequests > 50)
    return { allowed: false, code: 'platform-limit', utcDay } as const;
  if (evidence.cpuP99Ms >= 10 || (!priority && evidence.cpuP99Ms >= 8))
    return { allowed: false, code: 'cpu-budget', utcDay } as const;
  const limits: Reserved = {
    ...DAILY_BUDGET,
    databaseBytes: 4000000000,
    telemetry: evidence.telemetryUnit === 'bytes' ? 500000000 : 200000,
  };
  const project =
    evidence.projectDatabaseBytes + prior.databaseBytes + cost.databaseBytes;
  if (project > DAILY_BUDGET.databaseBytes)
    return { allowed: false, code: 'project-storage', utcDay } as const;
  let warning =
    evidence.cronTriggers >= 4 ||
    evidence.cpuP99Ms >= 8 ||
    project >= 0.8 * DAILY_BUDGET.databaseBytes;
  for (const key of Object.keys(limits) as (keyof Reserved)[]) {
    // Reservations are added even if some use has reached the provider aggregate.
    const spent = evidence[key]! + prior[key] + cost[key];
    const telemetryFactor =
      key === 'telemetry' && evidence.telemetryUnit === 'records'
        ? 4 / 8192
        : 1;
    const total = evidence[key]! + (prior[key] + cost[key]) * telemetryFactor;
    if ((key !== 'telemetry' && spent > limits[key]) || total > limits[key])
      return { allowed: false, code: 'free-budget', utcDay } as const;
    warning ||= total >= 0.8 * limits[key];
  }
  if (warning && !priority)
    return { allowed: false, code: 'reserve-priority', utcDay } as const;
  return {
    allowed: true,
    code: warning ? 'reserve-only' : 'ok',
    utcDay,
  } as const;
}
