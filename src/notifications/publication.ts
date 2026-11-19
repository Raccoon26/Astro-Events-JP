/** Calendar-year retention with month-end clamping; never rolls February into March. */
export function fingerprintExpiry(now: number) {
  if (!Number.isFinite(now)) throw Error('INVALID_RETENTION_DATE');
  const date = new Date(now),
    month = date.getUTCMonth(),
    day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + 2);
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), month + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString();
}
