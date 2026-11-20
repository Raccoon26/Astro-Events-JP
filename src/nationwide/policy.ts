import type { Format } from '../collection/types';
import type { Category } from '../domain';
import type { Registration } from '../registry';

export const HOUR = 3600000;
export const GENERAL = [
  'astronomy',
  'facility',
  'space-development',
  'research',
  'local',
] as const;
export const CATEGORY_SLOTS = [...GENERAL, 'practice', 'lecture'] as const;
export const FORMATS: readonly Format[] = ['rss', 'atom', 'html', 'sitemap'];
export const PAGE = 8;
export const LANES = ['regional', 'category', 'vtuber'] as const;
export type Lane = (typeof LANES)[number];

export function municipalityKey(code: number | null, input: string | null) {
  if (!code || !input) return null;
  // Preserve the display name separately. Match only typography and explicitly scoped equivalents.
  const name = input.normalize('NFKC').replace(/\s+/gu, '');
  const aliases: Record<string, string> = {
    '15:柏崎': '柏崎市',
    '25:甲賀': '甲賀市',
    '25:甲賀市水口町': '甲賀市',
    '9:益子': '益子町',
  };
  return `${code}:${aliases[`${code}:${name}`] ?? name}`;
}

export function surveyKind(source: Pick<Registration, 'kind' | 'category'>) {
  if (source.category === 'vtuber') return 'vtuber';
  if (/photo|workshop|course/u.test(source.kind)) return 'practice';
  if (/university|lecture/u.test(source.kind)) return 'lecture';
  if (
    /citizen|municipal|library|community|festival|education/u.test(source.kind)
  )
    return 'community';
  if (/observator/u.test(source.kind) || source.category === 'astronomy')
    return 'observation';
  if (source.category === 'space-development' || source.category === 'research')
    return 'space-research';
  if (source.category === 'local') return 'community';
  return 'science-museum';
}

export function ready(
  source: Pick<
    Registration,
    'state' | 'nextCrawlAt' | 'lastCrawledAt' | 'minIntervalSeconds'
  >,
  now: number,
) {
  if (
    source.state !== 'active' ||
    !Number.isFinite(now) ||
    !(Date.parse(source.nextCrawlAt) <= now)
  )
    return false;
  return (
    !source.lastCrawledAt ||
    Date.parse(source.lastCrawledAt) +
      (source.minIntervalSeconds ?? 3600) * 1000 <=
      now
  );
}

export interface RegionalSignals {
  code: number;
  lastOpportunity: number | null;
  registered: number;
  official: number;
  municipalities: number;
  recentFinds: number;
}

export function regionOrder(
  rows: RegionalSignals[],
  cursor: number,
  now: number,
) {
  const distance = (code: number) => (code - cursor + 46) % 47;
  // An entire 3h aging band outranks all deficit bonuses. Empty regions can be probed independently.
  const band = (r: RegionalSignals) =>
    r.lastOpportunity === null
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, Math.floor((now - r.lastOpportunity) / (3 * HOUR)));
  const deficit = (r: RegionalSignals) =>
    Number(r.official <= 1) * 4 +
    Number(r.registered <= 2) * 2 +
    Number(r.municipalities <= 1) +
    Number(r.recentFinds === 0);
  return [...rows].sort(
    (a, b) =>
      band(b) - band(a) ||
      deficit(b) - deficit(a) ||
      distance(a.code) - distance(b.code) ||
      a.code - b.code,
  );
}

export interface SurveyCandidate {
  id: string;
  category: Category;
  kind: string;
  municipality: string | null;
  lastCrawledAt: string | null;
  deadline: string | null;
  officialChange: boolean;
  failures: number;
}
export function candidateOrder(
  rows: SurveyCandidate[],
  now: number,
  previousTown: string | null,
) {
  const urgent = (r: SurveyCandidate) =>
    r.officialChange
      ? 2
      : r.deadline &&
          Date.parse(r.deadline) > now &&
          Date.parse(r.deadline) - now <= 24 * HOUR
        ? 1
        : 0;
  const age = (r: SurveyCandidate) =>
    r.lastCrawledAt
      ? Math.floor((now - Date.parse(r.lastCrawledAt)) / (24 * HOUR))
      : Number.MAX_SAFE_INTEGER;
  const local = (r: SurveyCandidate) =>
    ['community', 'observation', 'lecture', 'practice'].includes(surveyKind(r))
      ? 1
      : 0;
  return [...rows].sort(
    (a, b) =>
      age(b) - age(a) ||
      urgent(b) - urgent(a) ||
      Number(a.municipality === previousTown) -
        Number(b.municipality === previousTown) ||
      local(b) - local(a) ||
      a.failures - b.failures ||
      (a.id < b.id ? -1 : a.id === b.id ? 0 : 1),
  );
}
