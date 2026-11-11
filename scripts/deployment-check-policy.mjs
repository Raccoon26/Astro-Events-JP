export function assertTrustedQuality(snapshot, sha) {
  if (
    !snapshot ||
    snapshot.total_count > 100 ||
    !Array.isArray(snapshot.check_runs)
  )
    throw new Error('Incomplete CI evidence');
  const latest = new Map();
  for (const check of snapshot.check_runs) {
    if (check.head_sha !== sha) continue;
    const key = `${check.app?.id}:${check.name}`;
    const previous = latest.get(key);
    if (
      !previous ||
      Date.parse(check.started_at) > Date.parse(previous.started_at) ||
      (check.started_at === previous.started_at && check.id > previous.id)
    )
      latest.set(key, check);
  }
  const quality = latest.get('15368:quality');
  if (quality?.status !== 'completed' || quality.conclusion !== 'success')
    throw new Error(
      'Current commit has no successful latest trusted quality check',
    );
  for (const check of latest.values()) {
    if (check.name === 'deploy') continue; // The current deployment job is necessarily running.
    if (
      check.status !== 'completed' ||
      !['success', 'neutral', 'skipped'].includes(check.conclusion)
    )
      throw new Error('Other current commit checks are not satisfied');
  }
}
