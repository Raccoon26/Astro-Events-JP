import type { VerificationResult } from '../verification/types';

type Fields = VerificationResult['fields'];
const HOUR = 3600000;

export function bookingStatus(fields: Fields, now: number, previous?: Fields) {
  const r =
    fields.reservation.state === 'confirmed' ? fields.reservation.value : null;
  const start =
    fields.applicationStart.state === 'confirmed'
      ? fields.applicationStart.value
      : null;
  const end =
    fields.applicationDeadline.state === 'confirmed'
      ? fields.applicationDeadline.value
      : null;
  const startAt = start?.startDatetime ? Date.parse(start.startDatetime) : null;
  const endAt = end?.startDatetime ? Date.parse(end.startDatetime) : null;
  const today = new Date(now + 9 * HOUR).toISOString().slice(0, 10);
  const future =
    startAt === null
      ? !!start?.startDate && start.startDate > today
      : now < startAt;
  const departed =
    endAt === null ? !!end?.startDate && end.startDate < today : now >= endAt;
  const admissible =
    !['conflicting', 'ambiguous'].includes(fields.reservation.state) &&
    !['conflicting', 'ambiguous'].includes(fields.applicationStart.state) &&
    !['conflicting', 'ambiguous'].includes(fields.applicationDeadline.state);
  const closed = r?.reception === 'closed' || r?.reception === 'full';
  const confirmedClaims =
    fields.reservation.state === 'confirmed'
      ? fields.reservation.raw.map((value) => value.normalize('NFKC')).join(' ')
      : '';
  const changes = [];
  const oldEnd =
    previous?.applicationDeadline.state === 'confirmed'
      ? previous.applicationDeadline.value
      : null;
  const oldReservation =
    previous?.reservation.state === 'confirmed'
      ? previous.reservation.value
      : null;
  if (r && /追加募集(?:を開始|を実施|中)(?!しません)/u.test(confirmedClaims))
    changes.push('additional-recruitment');
  if (
    r?.reception === 'open' &&
    /受付(?:を)?再開(?:しました|します)/u.test(confirmedClaims)
  )
    changes.push('reopened');
  if (closed && /早期(?:受付)?終了|予定より早く受付終了/u.test(confirmedClaims))
    changes.push('closed-early');
  if (
    endAt !== null &&
    oldEnd?.startDatetime &&
    endAt > Date.parse(oldEnd.startDatetime)
  )
    changes.push('deadline-extended');
  else if (
    endAt === null &&
    end?.startDate &&
    oldEnd?.startDate &&
    !oldEnd.startDatetime &&
    end.startDate > oldEnd.startDate
  )
    changes.push('deadline-extended');
  if (
    oldReservation &&
    r &&
    JSON.stringify(oldReservation) !== JSON.stringify(r)
  )
    changes.push('conditions-changed');
  if (
    oldEnd &&
    end &&
    (oldEnd.startDatetime !== end.startDatetime ||
      oldEnd.startDate !== end.startDate)
  )
    changes.push('deadline-changed');
  const open =
    !future &&
    !departed &&
    (r?.reception === 'open' ||
      (startAt !== null && r?.reception !== 'not-yet-open'));
  const imminent =
    open && endAt !== null && endAt - now <= 24 * HOUR && endAt > now;
  const state = !admissible
    ? 'review'
    : closed
      ? 'closed'
      : r?.reception === 'waitlist'
        ? 'waitlist'
        : departed
          ? 'closed'
          : future || r?.reception === 'not-yet-open'
            ? 'scheduled'
            : imminent
              ? 'imminent'
              : open
                ? 'open'
                : 'unknown';
  return {
    state,
    start,
    deadline: end,
    registration:
      r?.required === false
        ? 'not-required'
        : r?.required === true
          ? 'required'
          : r?.method || r?.selection
            ? 'method-only'
            : 'unknown',
    method: r?.method ?? null,
    selection: r?.selection ?? null,
    capacity: r?.capacity ?? null,
    changes: admissible ? changes : [],
    applicationOpeningKey:
      admissible &&
      r?.required !== false &&
      startAt !== null &&
      now - startAt < 24 * HOUR &&
      (state === 'open' || state === 'imminent')
        ? new Date(startAt).toISOString()
        : null,
    deadlineKey:
      admissible &&
      r?.required !== false &&
      state === 'imminent' &&
      endAt !== null
        ? new Date(endAt).toISOString()
        : null,
  } as const;
}

export function bookingWindow(
  fields: Fields,
  kind: 'applications-open' | 'deadline',
  now: number,
) {
  const booking = bookingStatus(fields, now);
  const key =
    kind === 'applications-open'
      ? booking.applicationOpeningKey
      : booking.deadlineKey;
  if (!key) return null;
  const end = booking.deadline?.startDatetime
    ? Date.parse(booking.deadline.startDatetime)
    : Infinity;
  const until =
    kind === 'deadline'
      ? Date.parse(key)
      : Math.min(Date.parse(key) + 24 * HOUR, end);
  return { key, until };
}
