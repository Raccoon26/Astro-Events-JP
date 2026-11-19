import { safeUrl } from '../collection/policy';
import { digest } from '../collection/text';
import { parseTemporal } from '../verification/temporal';
import type { VerificationResult } from '../verification/types';

export const MATCH_LIMIT = 24;

export function identityText(text: string | null) {
  return (text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\s]+/gu, '');
}

export function identityUrl(value: string) {
  const url = safeUrl(value, [new URL(value).hostname]);
  url.hash = '';
  if (url.search)
    url.search = url.search
      .slice(1)
      .split('&')
      .filter((part) => {
        const name = decodeURIComponent(part.split('=', 1)[0]!).toLowerCase();
        return (
          !/^utm_(source|medium|campaign|term|content|id)$/u.test(name) &&
          !['gclid', 'fbclid'].includes(name)
        );
      })
      .join('&');
  return url.href;
}

function titleParts(value: string) {
  const title = value.normalize('NFKC');
  return {
    year: title.match(/(?<!\d)(20\d{2})年(?:度)?/u)?.[1] ?? null,
    edition: title.match(/第\s*(\d{1,4})\s*回/u)?.[1] ?? null,
    session:
      title.match(
        /(?:第\s*\d{1,2}\s*(?:部|枠)|午前の部|午後の部|夜の部|追加公演|オンライン配信|現地開催)/u,
      )?.[0] ?? null,
    ancillary: /関連企画|同時開催|プレイベント|事前講座|展示解説/u.test(title),
  };
}
export async function eventIdentity(result: VerificationResult) {
  const { event, fields, packet } = result;
  const schedule =
    fields.schedule.state === 'confirmed' ? fields.schedule.value : null;
  const location =
    fields.location.state === 'confirmed' ? fields.location.value : null;
  const title = titleParts(event.title);
  const url = identityUrl(event.officialUrl);
  const official = packet?.canonicalEvent;
  const canonicalUrl = official ? identityUrl(official.url) : url;
  const predecessor = official?.previousTiming
    ? parseTemporal(official.previousTiming)
    : null;
  return {
    title: identityText(event.title),
    organizer: identityText(event.organizer),
    venue: identityText(event.venue),
    municipality: identityText(event.municipality),
    prefecture: event.prefecture,
    facilityId: event.facilityId,
    online: location?.online ?? null,
    category: event.category,
    kind: result.kind,
    status: event.status,
    year: title.year ? Number(title.year) : event.editionYear,
    titleYear: title.year,
    edition: event.edition ?? title.edition,
    session: title.session ? identityText(title.session) : null,
    ancillary: title.ancillary,
    date: schedule?.startDate ?? schedule?.startDatetime?.slice(0, 10) ?? null,
    endDate: schedule?.endDate ?? null,
    time: schedule?.startDatetime ? Date.parse(schedule.startDatetime) : null,
    endTime: schedule?.endDatetime ? Date.parse(schedule.endDatetime) : null,
    urlKey: await digest(canonicalUrl),
    providerKey: official?.id
      ? await digest(
          JSON.stringify([
            new URL(canonicalUrl).origin,
            official.id,
            official.session ?? null,
          ]),
        )
      : null,
    providerSession: official?.session ?? null,
    canonicalUrl,
    predecessor: predecessor?.state === 'confirmed' ? predecessor.value : null,
    originalUrl: event.officialUrl,
  };
}
export type Identity = Awaited<ReturnType<typeof eventIdentity>>;

function similarity(a: string, b: string) {
  if (a === b) return a ? 1 : 0;
  function pairs(text: string) {
    const chars = Array.from(text.slice(0, 160));
    return new Set(chars.slice(1).map((c, i) => chars[i] + c));
  }
  const left = pairs(a),
    right = pairs(b);
  return (
    (2 * [...left].filter((x) => right.has(x)).length) /
    Math.max(1, left.size + right.size)
  );
}
export function compareIdentity(a: Identity, b: Identity) {
  const sameUrl = a.urlKey === b.urlKey;
  const provider = !!a.providerKey && a.providerKey === b.providerKey;
  const organizer = !!a.organizer && a.organizer === b.organizer;
  const venue =
    (!!a.facilityId && a.facilityId === b.facilityId && a.venue === b.venue) ||
    (!!a.venue &&
      a.venue === b.venue &&
      a.prefecture !== null &&
      a.prefecture === b.prefecture &&
      a.municipality === b.municipality);
  const overlap =
    !!a.date &&
    !!b.date &&
    a.date <= (b.endDate ?? b.date) &&
    b.date <= (a.endDate ?? a.date);
  const titleScore = Math.round(similarity(a.title, b.title) * 100);
  const conflicts: string[] = [];
  const signals: string[] = [];
  if (sameUrl) signals.push('official-url');
  if (provider) signals.push('official-id');
  if (organizer) signals.push('organizer');
  if (venue) signals.push('venue');
  if (overlap) signals.push('date-overlap');
  if (titleScore >= 65) signals.push('title-similarity');
  for (const field of [
    'year',
    'edition',
    'providerSession',
    'session',
    'online',
    'ancillary',
  ] as const) {
    if (a[field] !== null && b[field] !== null && a[field] !== b[field])
      conflicts.push(field);
  }
  if (a.prefecture && b.prefecture && a.prefecture !== b.prefecture)
    conflicts.push('prefecture');
  if (a.date && b.date && !overlap) conflicts.push('schedule-date');
  if (a.time !== null && b.time !== null && a.time !== b.time)
    conflicts.push('session-start');
  if (a.endTime !== null && b.endTime !== null && a.endTime !== b.endTime)
    conflicts.push('session-end');
  if (a.status !== b.status) conflicts.push('official-status');
  if (a.kind !== b.kind || a.category !== b.category)
    conflicts.push('category-or-kind');
  if (!organizer) conflicts.push('organizer');
  if (!venue && !(a.online === true && b.online === true))
    conflicts.push('venue');
  if (titleScore < 100) conflicts.push('title');
  const session =
    a.time !== null && a.time === b.time && a.endTime === b.endTime;
  const hard =
    conflicts.some((c) =>
      [
        'year',
        'edition',
        'providerSession',
        'session',
        'online',
        'ancillary',
      ].includes(c),
    ) ||
    (!provider &&
      overlap &&
      conflicts.includes('session-start') &&
      !a.predecessor);
  const exact =
    !conflicts.length &&
    session &&
    a.providerSession === b.providerSession &&
    a.session === b.session &&
    !!a.year &&
    a.year === b.year &&
    (sameUrl || provider);
  const close =
    !hard &&
    (sameUrl ||
      provider ||
      (organizer && (venue || overlap) && titleScore >= 65));
  return { exact, close, hard, titleScore, signals, conflicts };
}

/** Continuations require explicit official evidence identifying the old occurrence. */
export function isSuccessor(after: Identity, before: Identity) {
  const timing = after.predecessor;
  if (
    !timing ||
    !before.date ||
    after.organizer !== before.organizer ||
    !after.organizer ||
    after.category !== before.category ||
    after.ancillary !== before.ancillary ||
    (after.titleYear &&
      before.titleYear &&
      after.titleYear !== before.titleYear) ||
    (after.edition && before.edition && after.edition !== before.edition) ||
    (after.online !== null &&
      before.online !== null &&
      after.online !== before.online) ||
    (after.providerSession !== null &&
      before.providerSession !== null &&
      after.providerSession !== before.providerSession) ||
    (after.session !== null &&
      before.session !== null &&
      after.session !== before.session) ||
    (after.urlKey !== before.urlKey &&
      (!after.providerKey || after.providerKey !== before.providerKey))
  )
    return false;
  if (
    timing.startDate !== before.date ||
    (timing.endDate && timing.endDate !== (before.endDate ?? before.date))
  )
    return false;
  if (
    before.time !== null &&
    (!timing.startDatetime || Date.parse(timing.startDatetime) !== before.time)
  )
    return false;
  if (before.time === null && timing.precision !== 'date') return false;
  return (
    after.status === 'cancelled' ||
    after.status === 'postponed' ||
    after.date !== before.date ||
    after.time !== before.time ||
    after.endTime !== before.endTime ||
    after.venue !== before.venue ||
    after.facilityId !== before.facilityId
  );
}
