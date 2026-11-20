import type { Category } from '../domain';
import {
  CATEGORY_SLOTS,
  candidateOrder,
  GENERAL,
  HOUR,
  regionOrder,
  surveyKind,
} from './policy';

export function simulateSurvey(
  ticks = 410,
  {
    failures = true,
    budgetEvery = 11,
    restart = true,
    emptyRegion = 0,
    emptyKind = '',
  } = {},
) {
  if (
    !Number.isInteger(ticks) ||
    ticks < 1 ||
    ticks > 5000 ||
    !Number.isInteger(budgetEvery) ||
    budgetEvery < 0
  )
    throw Error('SIMULATION_INPUT');
  const epoch = Date.parse('2026-11-01T00:00:00Z');
  const members = Array.from({ length: 47 }, (_, i) =>
    Array.from(
      { length: [13, 14, 27].includes(i + 1) ? 48 : i % 9 === 0 ? 1 : 3 },
      (_, j) => ({
        id: `fixture-${i + 1}-${j}`,
        prefecture: i + 1,
        category: GENERAL[(i + j) % GENERAL.length] as Category,
        kind: ['observatory', 'library', 'photo-course', 'university-lecture'][
          j % 4
        ]!,
        municipality: `架空市${i + 1}-${j}`,
        lastCrawledAt: null as string | null,
        deadline: null as string | null,
        officialChange: false,
        failures: 0,
        due: epoch,
      }),
    ),
  )
    .flat()
    .filter(
      (row) => row.prefecture !== emptyRegion && surveyKind(row) !== emptyKind,
    );
  let state = {
    last: Array<number | null>(47).fill(null),
    lastPick: Array<number | null>(47).fill(null),
    cursor: 0,
    cat: 0,
    lastTown: Array<string | null>(47).fill(null),
    vtuberPending: 0,
  };
  const counts = Array<number>(47).fill(0),
    visits = Array<number>(47).fill(0),
    gap = Array<number>(47).fill(0);
  const categories = Object.fromEntries(GENERAL.map((c) => [c, 0]));
  const categoryLane = Object.fromEntries(CATEGORY_SLOTS.map((c) => [c, 0]));
  const regionalSuccessful = Array<number>(47).fill(0);
  let vtuber = 0,
    backoff = 0,
    deferred = 0,
    categoryEmpty = 0,
    regionEmpty = 0,
    processed = 0;
  const complete = (
    selected: (typeof members)[number],
    now: number,
    tick: number,
  ) => {
    selected.lastCrawledAt = new Date(now).toISOString();
    selected.due = now + 8 * HOUR;
    processed++;
    if (failures && tick % 13 === 0) {
      selected.due = now + 30 * HOUR;
      selected.failures++;
      backoff++;
      return false;
    }
    if (selected.category !== 'vtuber')
      categories[selected.category] = (categories[selected.category] ?? 0) + 1;
    return true;
  };
  for (let tick = 0; tick < ticks; tick++) {
    const now = epoch + tick * 3 * HOUR;
    if (restart && tick % 31 === 0) state = JSON.parse(JSON.stringify(state));
    if (tick % 3 === 0) state.vtuberPending += tick % 17 === 0 ? 13 : 1;
    if (budgetEvery && tick > 0 && tick % budgetEvery === 0) {
      deferred++;
      continue;
    }
    const regions = regionOrder(
      visits.map((_, i) => {
        const registered = members.filter((s) => s.prefecture === i + 1).length;
        return {
          code: i + 1,
          registered,
          official: registered,
          municipalities: registered,
          recentFinds: counts[i]!,
          lastOpportunity: state.last[i]!,
        };
      }),
      state.cursor,
      now,
    );
    const i = regions[0]!.code - 1;
    state.last[i] = now;
    state.cursor = i + 1;
    visits[i] = visits[i]! + 1;
    const due = members.filter((s) => s.prefecture === i + 1 && s.due <= now);
    for (const source of due) {
      source.officialChange = tick % 31 === 0 && source.id.endsWith('-0');
      source.deadline =
        tick % 7 === 0 ? new Date(now + HOUR).toISOString() : null;
    }
    const pick = candidateOrder(due, now, state.lastTown[i]!)[0];
    if (pick) {
      const item = due.find((s) => s.id === pick.id)!;
      if (complete(item, now, tick))
        regionalSuccessful[i] = regionalSuccessful[i]! + 1;
      counts[i] = counts[i]! + 1;
      gap[i] = Math.max(gap[i]!, now - (state.lastPick[i] ?? epoch));
      state.lastPick[i] = now;
      state.lastTown[i] = item.municipality;
    } else regionEmpty++;
    const cat = CATEGORY_SLOTS[state.cat % CATEGORY_SLOTS.length]!;
    state.cat++;
    const categoryDue = members.filter(
      (s) =>
        (cat === 'lecture' || cat === 'practice'
          ? surveyKind(s) === cat
          : s.category === cat) && s.due <= now,
    );
    const chosen = candidateOrder(categoryDue, now, null)[0];
    if (chosen) {
      categoryLane[cat] = (categoryLane[cat] ?? 0) + 1;
      complete(categoryDue.find((s) => s.id === chosen.id)!, now, tick);
    } else categoryEmpty++;
    // A burst in this lane cannot consume a regional or a general category credit.
    if (state.vtuberPending > 0) {
      state.vtuberPending--;
      vtuber++;
    }
  }
  const ended = epoch + (ticks - 1) * 3 * HOUR;
  const wait = gap.map(
    (g, i) => Math.max(g, ended - (state.lastPick[i] ?? epoch)) / HOUR,
  );
  return {
    synthetic: true,
    ticks,
    regionalVisits: visits,
    regionalSelections: counts,
    regionalMaximumGapHours: wait,
    maximumGapHours: Math.max(...wait),
    starved: counts.flatMap((n, i) => (n ? [] : [i + 1])),
    categories,
    categoryLane,
    regionalSuccessful,
    vtuberSelections: vtuber,
    vtuberPending: state.vtuberPending,
    backoffs: backoff,
    evaluatedGeneralJobs: processed,
    successfulGeneralJobs: Object.values(categories).reduce((a, b) => a + b, 0),
    budgetDeferredTicks: deferred,
    regionEmpty,
    categoryEmpty,
    externalRequests: 0,
    cloudflareCpuTime: null,
  };
}
