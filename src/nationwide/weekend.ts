import { safeUrl } from '../collection/policy';
import { digest } from '../collection/text';
import { extractUrls, validateLength } from '../posts/length';
import { formatTemporal } from '../posts/temporal';
import { prefecture } from '../prefectures';
import type { DetailedVerifiedEvent } from '../verification/types';

const DAY = 86400000,
  JST = 9 * 3600000;
export const MAX_PARTS = 3;
export const ITEMS_PER_PART = 2;
export const ROUNDUP_VERSION = 'dev08-1';
export type WeekendScope =
  | 'nationwide'
  | 'local'
  | 'research'
  | 'vtuber'
  | `region:${string}`;
export interface Window {
  saturday: string;
  sunday: string;
  start: number;
  end: number;
}
export function weekend(now: number, offset: 0 | 1): Window {
  if (!Number.isFinite(now) || ![0, 1].includes(offset))
    throw new Error('WEEKEND_INPUT');
  const jst = new Date(now + JST);
  const monday = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate() - ((jst.getUTCDay() + 6) % 7),
  );
  const saturday = monday + (5 + 7 * offset) * DAY;
  return {
    saturday: new Date(saturday).toISOString().slice(0, 10),
    sunday: new Date(saturday + DAY).toISOString().slice(0, 10),
    start: saturday - JST,
    end: saturday + 2 * DAY - JST,
  };
}

export function validScope(scope: string): scope is WeekendScope {
  return (
    ['nationwide', 'local', 'research', 'vtuber'].includes(scope) ||
    (scope.startsWith('region:') &&
      Array.from({ length: 47 }, (_, i) => prefecture(i + 1).region).includes(
        scope.slice(7),
      ))
  );
}
function scopeMatches(event: DetailedVerifiedEvent, scope: WeekendScope) {
  if (scope === 'vtuber') return event.category === 'vtuber';
  if (event.category === 'vtuber') return false;
  if (scope === 'local')
    return (
      ['local', 'astronomy'].includes(event.category) &&
      event.prefecture !== null
    );
  if (scope === 'research')
    return ['space-development', 'research'].includes(event.category);
  if (scope.startsWith('region:'))
    return (
      event.prefecture !== null &&
      prefecture(event.prefecture).region === scope.slice(7)
    );
  return scope === 'nationwide';
}
export interface Member {
  eventId: string;
  revision: number;
  decisionId: string;
  fingerprint: string;
  validUntil: string;
  date: string;
  duration: boolean;
  days: '土日' | '土' | '日';
  title: string;
  venue: string;
  url: string;
  prefecture: number | null;
  category: string;
  terms: string[];
}
export function weekendMember(
  event: DetailedVerifiedEvent,
  revision: number,
  decisionId: string,
  validUntil: string,
  scope: WeekendScope,
  w: Window,
  now: number,
): Member | null {
  const { verification: v } = event,
    f = v.fields;
  if (
    event.verificationStatus !== 'Verified' ||
    event.status !== 'scheduled' ||
    !scopeMatches(event, scope) ||
    [
      'cancellation',
      'postponement',
      'closure',
      'reopening',
      'deadline',
      'applications-open',
    ].includes(v.kind) ||
    v.primaryDateField !== 'schedule' ||
    f.status.state !== 'confirmed' ||
    f.status.value?.status !== 'scheduled' ||
    v.impacts.length ||
    f.schedule.state !== 'confirmed' ||
    now >= w.end
  )
    return null;
  const t = f.schedule.value;
  if (
    !t?.startDate ||
    !['date', 'datetime'].includes(t.precision) ||
    f.location.state !== 'confirmed'
  )
    return null;
  const location = f.location.value;
  if (!location || (!location.online && !location.venue)) return null;
  const day = (s: string) => Date.parse(s + 'T00:00:00+09:00');
  const start = t.startDatetime
    ? Date.parse(t.startDatetime)
    : day(t.startDate);
  const bound = t.endDatetime
    ? Date.parse(t.endDatetime)
    : t.startDatetime
      ? t.endDate && t.endDate !== t.startDate
        ? day(t.endDate) + DAY
        : start
      : day(t.endDate ?? t.startDate) + DAY;
  // An exact start with unknown duration is eligible only while the start is still upcoming.
  const effectiveEnd = bound === start ? bound + 1 : bound;
  if (
    ![start, bound].every(Number.isFinite) ||
    effectiveEnd <= Math.max(now, w.start) ||
    start >= w.end
  )
    return null;
  const sat = start < w.start + DAY && effectiveEnd > Math.max(now, w.start);
  const sun = start < w.end && effectiveEnd > Math.max(now, w.start + DAY);
  const until = Math.min(
    Date.parse(validUntil),
    Date.parse(v.expiresAt),
    effectiveEnd,
    w.end,
  );
  if (!Number.isFinite(until) || until <= now || (!sat && !sun)) return null;
  const clean = (s: string) =>
    !/[<>@#\r\n]/u.test(s) &&
    validateLength(s).valid &&
    extractUrls(s).length === 0;
  const venue = location.online ? 'オンライン' : location.venue!;
  if (!clean(event.title) || !clean(venue)) return null;
  if (
    /今日|本日|明日|今週末|受付中|締切間近|まもなく締切|残りわずか/u.test(
      event.title,
    )
  )
    return null;
  if (/無料/u.test(event.title)) {
    const fee = f.fee.state === 'confirmed' ? f.fee.value : null;
    const entranceOnly =
      /入場無料|入館無料/u.test(event.title) && !/参加無料/u.test(event.title);
    if (fee?.[entranceOnly ? 'entrance' : 'participation'] !== 'free')
      return null;
  }
  if (
    /予約不要/u.test(event.title) &&
    (f.reservation.state !== 'confirmed' ||
      f.reservation.value?.required !== false)
  )
    return null;
  const url = event.officialUrl;
  try {
    if (safeUrl(url, [new URL(url).hostname]).href !== url) return null;
  } catch {
    return null;
  }
  const terms = [];
  if (f.reservation.state === 'confirmed' && f.reservation.value) {
    const r = f.reservation.value;
    if (['closed', 'full', 'waitlist'].includes(r.reception ?? ''))
      terms.push(
        r.reception === 'full'
          ? '満席'
          : r.reception === 'waitlist'
            ? 'キャンセル待ち'
            : '申込受付終了',
      );
    if (r.required === true) terms.push('要事前申込');
    else if (r.required === false) terms.push('予約不要');
    if (r.selection === 'lottery') terms.push('抽選');
    if (r.selection === 'first-come') terms.push('先着順');
  }
  if (f.fee.state === 'confirmed' && f.fee.value) {
    const fee = f.fee.value;
    for (const [name, key] of [
      ['参加費', 'participation'],
      ['入場料', 'entrance'],
    ] as const) {
      if (fee[key] === 'free') terms.push(name + '無料');
      if (fee[key] === 'paid') {
        const tiers = fee.tiers.filter((x) => x.scope === key);
        if (!tiers.every((x) => clean(x.label))) return null;
        terms.push(
          name +
            (tiers.length
              ? ' ' +
                tiers
                  .map(
                    (x) =>
                      (['参加費', '入場料', '入館料', '未分類'].includes(
                        x.label,
                      )
                        ? ''
                        : x.label + ' ') +
                      x.yen +
                      '円',
                  )
                  .join('／')
              : 'あり'),
        );
      }
    }
  }
  if (
    f.applicationDeadline.state === 'confirmed' &&
    f.applicationDeadline.value &&
    ['date', 'datetime'].includes(f.applicationDeadline.value.precision)
  )
    terms.push('申込締切 ' + formatTemporal(f.applicationDeadline.value));
  if (f.status.value.conditional.length) {
    if (!f.status.value.conditional.every(clean)) return null;
    terms.push(...f.status.value.conditional);
  }
  const range =
    t.precision === 'datetime' &&
    t.endDate &&
    t.startDate !== t.endDate &&
    !t.endDatetime
      ? formatTemporal(t) +
        '〜' +
        formatTemporal({
          ...t,
          precision: 'date',
          startDate: t.endDate,
          endDate: null,
        })
      : formatTemporal(t);
  return {
    eventId: event.stableEventId,
    revision,
    decisionId,
    fingerprint: v.fingerprint,
    validUntil: new Date(until).toISOString(),
    date: range,
    duration: t.endDate !== null || t.endDatetime !== null,
    days: sat && sun ? '土日' : sat ? '土' : '日',
    title: event.title,
    venue,
    url,
    prefecture: event.prefecture,
    category: event.category,
    terms,
  };
}

export function renderWeekendPart(ms: Member[], scope: WeekendScope) {
  if (!ms.length || ms.length > ITEMS_PER_PART) return null;
  const header = scope.startsWith('region:')
    ? `週末の天文イベント（${scope.slice(7)}）`
    : scope === 'research'
      ? '週末の宇宙・研究イベント'
      : scope === 'local'
        ? '週末の地域観望会・天文イベント'
        : scope === 'vtuber'
          ? '週末のVTuber特別イベント'
          : '週末の天文・宇宙イベント';
  const chunks = ms.map((m) =>
    [
      m.title,
      `${m.days}｜${m.date}`,
      m.prefecture ? `${prefecture(m.prefecture).name}・${m.venue}` : m.venue,
      ...m.terms,
      m.url,
    ].join('\n'),
  );
  const body = [
    ms.length === 1 ? '週末のイベント案内' : header,
    ...chunks,
    scope === 'vtuber' ? '#VTuberイベント' : '#天文イベント',
  ].join('\n\n');
  const length = validateLength(body),
    urls = extractUrls(body).map((x) => x.url);
  return length.valid &&
    urls.length === ms.length &&
    urls.every((url, i) => url === ms[i]!.url)
    ? { body, weightedLength: length.weightedLength, members: ms }
    : null;
}
export function buildWeekend(members: Member[], scope: WeekendScope) {
  const unique = [...new Map(members.map((m) => [m.eventId, m])).values()];
  // A different region gets first turn before a prolific region receives another slot.
  const ordered: Member[] = [],
    uses = new Map<number | null, number>();
  for (const _ of unique) {
    const next = unique
      .filter((member) => !ordered.includes(member))
      .sort(
        (a, b) =>
          (uses.get(a.prefecture) ?? 0) - (uses.get(b.prefecture) ?? 0) ||
          (a.date < b.date
            ? -1
            : a.date > b.date
              ? 1
              : a.eventId < b.eventId
                ? -1
                : 1),
      )[0]!;
    ordered.push(next);
    uses.set(next.prefecture, (uses.get(next.prefecture) ?? 0) + 1);
  }
  const omitted: string[] = [],
    parts: { body: string; weightedLength: number; members: Member[] }[] = [];
  for (const m of ordered) {
    const last = parts.at(-1);
    const together =
      last && last.members.length < ITEMS_PER_PART
        ? renderWeekendPart([...last.members, m], scope)
        : null;
    if (together) {
      parts[parts.length - 1] = together;
      continue;
    }
    const single =
      parts.length < MAX_PARTS ? renderWeekendPart([m], scope) : null;
    if (single) parts.push(single);
    else omitted.push(m.eventId);
  }
  return { parts, omitted };
}
export function weekendDigest(
  saturday: string,
  scope: WeekendScope,
  parts: ReturnType<typeof buildWeekend>['parts'],
) {
  return digest(
    JSON.stringify([
      ROUNDUP_VERSION,
      saturday,
      scope,
      parts.map((p) => [
        p.body,
        p.members.map((m) => [
          m.eventId,
          m.revision,
          m.decisionId,
          m.fingerprint,
        ]),
      ]),
    ]),
  );
}
