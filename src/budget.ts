import type { Usage } from './domain';
// Deliberate headroom; these are project ceilings, not Cloudflare plan limits.
export const DAILY_BUDGET: Usage = {
  requests: 80000,
  reads: 4000000,
  writes: 80000,
  databaseBytes: 400000000,
};
export function withinBudget(used: Usage, estimated: Usage): boolean {
  return (Object.keys(DAILY_BUDGET) as (keyof Usage)[]).every(
    (key) =>
      Number.isFinite(used[key]) &&
      Number.isFinite(estimated[key]) &&
      used[key] >= 0 &&
      estimated[key] >= 0 &&
      used[key] + estimated[key] <= DAILY_BUDGET[key],
  );
}
