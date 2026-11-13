import type { Judgement, Temporal } from './types';

export function judgement<T>(
  raw: string,
  value: T | null,
  state: Judgement<T>['state'] = value === null ? 'unknown' : 'confirmed',
  reasons: string[] = [],
): Judgement<T> {
  return { state, value, raw: raw ? [raw] : [], reasons, evidence: [] };
}
const pad = (n: number) => String(n).padStart(2, '0');
const DAYS = ['日', '月', '火', '水', '木', '金', '土'];
function date(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2199) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
    ? `${year}-${pad(month)}-${pad(day)}`
    : null;
}
function nextDay(value: string): string {
  return new Date(Date.parse(`${value}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
}
const blank = (raw: string): Temporal => ({
  precision: 'unknown',
  startDate: null,
  endDate: null,
  startMonth: null,
  endMonth: null,
  startDatetime: null,
  endDatetime: null,
  doorsTime: null,
  raw,
});
/** Conservative grammar. The field role is explicit; publication timestamps are never fallback dates. */
export function parseTemporal(
  raw: string,
  role: 'schedule' | 'applicationStart' | 'applicationDeadline' = 'schedule',
): Judgement<Temporal> {
  const text = raw.normalize('NFKC').replace(/[〜～]/gu, '~');
  if (!text.trim()) return judgement<Temporal>(raw, null);
  const out = blank(raw);
  const ambiguous = (reason: string) =>
    judgement(raw, out, 'ambiguous', [reason]);
  if (
    /開催日未定|日程未定|調整中|日程調整|延期日/u.test(text) ||
    (/未定/u.test(text) && !/終了(?:日)?未定|再開日未定/u.test(text))
  )
    return ambiguous('date-undecided');
  const labels =
    /開催日|開催期間|日時|申込締切|申込期限|締切|募集開始|申込開始|受付開始|公開日|投稿日|更新日/gu;
  const roles = [...text.matchAll(labels)].map((m) => m[0]);
  const allowed =
    role === 'schedule'
      ? /開催日|開催期間|日時/u
      : role === 'applicationStart'
        ? /募集開始|申込開始|受付開始/u
        : /締切|申込期限/u;
  if (roles.some((label) => !allowed.test(label)))
    return ambiguous('mixed-or-wrong-date-role');
  const matches = [
    ...text.matchAll(
      /(?:(\d{4})[年/.-])?(\d{1,2})[月/.-](\d{1,2})日?(?:\s*\(([日月火水木金土])(?:曜日)?\))?/gu,
    ),
  ];
  if (!matches.length) {
    const month = text.match(/(\d{4})年(\d{1,2})月(?!\d)/u);
    if ([...text.matchAll(/\d{1,2}月/gu)].length > 1)
      return ambiguous('unsupported-month-range');
    if (
      month &&
      Number(month[1]) >= 1900 &&
      Number(month[1]) <= 2199 &&
      Number(month[2]) >= 1 &&
      Number(month[2]) <= 12
    ) {
      out.precision = 'month';
      out.startMonth = `${month[1]}-${pad(Number(month[2]))}`;
      return judgement(raw, out);
    }
    return ambiguous('unsupported-or-incomplete-date');
  }
  if (
    matches.length > 2 ||
    (matches.length === 2 && !/[~～〜]|から|まで/u.test(text))
  )
    return ambiguous('multiple-date-candidates');
  const firstYear = matches[0]?.[1];
  if (!firstYear) return ambiguous('year-missing');
  const dates: string[] = [];
  for (const m of matches) {
    const value = date(Number(m[1] ?? firstYear), Number(m[2]), Number(m[3]));
    if (!value) return ambiguous('invalid-calendar-date');
    if (m[4] && DAYS[new Date(`${value}T00:00:00Z`).getUTCDay()] !== m[4])
      return ambiguous('weekday-conflict');
    dates.push(value);
  }
  out.startDate = dates[0] ?? null;
  out.endDate = dates[1] ?? null;
  out.precision = 'date';
  if (out.endDate && out.startDate && out.endDate < out.startDate)
    return ambiguous('date-range-reversed');
  // Support a day-only range end when the first endpoint explicitly supplies year/month.
  if (matches.length === 1) {
    const tail = text.slice(
      (matches[0]?.index ?? 0) + (matches[0]?.[0].length ?? 0),
    );
    const dayEnd = tail.match(/^\s*(?:~|から)\s*(\d{1,2})日/u);
    if (dayEnd) {
      out.endDate = date(
        Number(firstYear),
        Number(matches[0]?.[2]),
        Number(dayEnd[1]),
      );
      if (!out.endDate || (out.startDate && out.endDate < out.startDate))
        return ambiguous('invalid-range-end');
    }
  }
  const timeMatches = [
    ...text.matchAll(/(翌日?|)(\d{1,2})(?::|時)(\d{2})分?/gu),
  ];
  for (const t of timeMatches)
    if (Number(t[2]) > 23 || Number(t[3]) > 59)
      return ambiguous('invalid-time');
  const door = text.match(/開場\s*(\d{1,2}):?(\d{2})/u);
  if (door) out.doorsTime = `${pad(Number(door[1]))}:${door[2]}`;
  const relevant = timeMatches.filter(
    (t) => !/開場\s*$/u.test(text.slice(0, t.index)),
  );
  if (relevant.length > 2) return ambiguous('multiple-time-candidates');
  const start = relevant[0],
    end = relevant[1];
  if (start && out.startDate) {
    out.precision = 'datetime';
    out.startDatetime = `${out.startDate}T${pad(Number(start[2]))}:${start[3]}:00+09:00`;
    if (end) {
      const endDay = end[1]
        ? nextDay(out.startDate)
        : (out.endDate ?? out.startDate);
      out.endDatetime = `${endDay}T${pad(Number(end[2]))}:${end[3]}:00+09:00`;
      out.endDate = endDay;
      if (Date.parse(out.endDatetime) < Date.parse(out.startDatetime))
        return ambiguous('overnight-not-explicit');
    }
  }
  if (/開場/u.test(text) && !relevant.length)
    return ambiguous('doors-only-not-event-start');
  return judgement(raw, out);
}
