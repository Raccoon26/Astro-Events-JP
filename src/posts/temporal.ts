import type { Temporal } from '../verification/types';
import { PostError } from './types';

function date(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new PostError('unsafe-input');
  const [y, m, d] = value.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}
function month(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
    throw new PostError('unsafe-input');
  const [y, m] = value.split('-').map(Number);
  return `${y}年${m}月`;
}
function datetime(value: string) {
  date(value.slice(0, 10));
  if (
    !/T\d{2}:\d{2}/.test(value) ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new PostError('unsafe-input');
  const jst = new Date(Date.parse(value) + 9 * 3600000).toISOString();
  return `${date(jst.slice(0, 10))} ${jst.slice(11, 16)}`;
}
export function formatTemporal(t: Temporal): string {
  let start: string, end: string | null;
  if (t.precision === 'datetime' && t.startDatetime) {
    start = datetime(t.startDatetime);
    end = t.endDatetime ? datetime(t.endDatetime) : null;
  } else if (t.precision === 'date' && t.startDate) {
    start = date(t.startDate);
    end = t.endDate ? date(t.endDate) : null;
  } else if (t.precision === 'month' && t.startMonth) {
    start = month(t.startMonth);
    end = t.endMonth ? month(t.endMonth) : null;
  } else throw new PostError('date-role-ambiguous');
  if (
    t.precision === 'datetime' &&
    end &&
    start.split(' ')[0] === end.split(' ')[0] &&
    end !== start
  )
    return `${start}〜${end.split(' ')[1]}`;
  return end && end !== start ? `${start}〜${end}` : start;
}
/** Exclusive eligibility bound only; never displayed as a fabricated event time. */
export function temporalEnd(t: Temporal) {
  if (t.precision === 'datetime' && t.startDatetime)
    return Date.parse(t.endDatetime ?? t.startDatetime);
  if (t.precision === 'date' && t.startDate) {
    const day = t.endDate ?? t.startDate;
    date(day);
    return Date.parse(`${day}T00:00:00+09:00`) + 86400000;
  }
  if (t.precision === 'month' && t.startMonth) {
    const value = t.endMonth ?? t.startMonth;
    month(value);
    const [y, m] = value.split('-').map(Number);
    return Date.UTC(y!, m!, 1) - 9 * 3600000;
  }
  throw new PostError('date-role-ambiguous');
}
