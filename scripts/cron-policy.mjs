export function validateStageSchedules(path, body) {
  return (
    path === '/workers/scripts/astro-events-jp-staging/schedules' &&
    Array.isArray(body) &&
    body.length === 1 &&
    Object.keys(body[0] ?? {}).join('') === 'cron' &&
    ['* * * * *', '0 */3 * * *'].includes(body[0].cron)
  );
}
export function scheduledTimes(timestamp) {
  if (!Number.isFinite(timestamp))
    throw new Error('Invalid scheduled timestamp');
  return {
    utc: new Date(timestamp).toISOString(),
    jst: new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      dateStyle: 'short',
      timeStyle: 'medium',
      hour12: false,
    }).format(new Date(timestamp)),
  };
}
