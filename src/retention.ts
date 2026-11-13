// All timestamps are normalized UTC ISO strings. Unknown/ongoing/future dates are never inferred as expired.
export function retentionCutoffs(now: Date) {
  if (!Number.isFinite(now.getTime()))
    throw new Error('Invalid retention date');
  const day = 86400000;
  return {
    details: new Date(now.getTime() - 90 * day).toISOString(),
    runs: new Date(now.getTime() - 30 * day).toISOString(),
    now: now.toISOString(),
  };
}
export const EXPIRED_EVENTS_SQL = `SELECT stable_event_id FROM events
WHERE confirmed_ended_at IS NOT NULL AND confirmed_ended_at < ?1
AND end_datetime IS NOT NULL AND end_datetime < ?2
AND (start_datetime IS NULL OR start_datetime < ?2)
AND NOT EXISTS (SELECT 1 FROM facility_notices n WHERE n.resolved_at IS NULL AND (n.event_id = events.stable_event_id OR n.facility_id = events.facility_id))
ORDER BY confirmed_ended_at LIMIT ?3`;
