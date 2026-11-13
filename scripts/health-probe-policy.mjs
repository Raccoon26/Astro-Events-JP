import { randomUUID } from 'node:crypto';
import { guardStagingWrite } from './cloudflare-policy.mjs';

export async function verifyStagingHealthRecovery({ target, query, health }) {
  guardStagingWrite(target);
  const read = async () =>
    (
      await query('SELECT * FROM deployment_identity WHERE singleton=?1', [1])
    )[0]?.results?.[0];
  const before = await read();
  if (
    before?.environment !== 'staging' ||
    before.database_name !== 'astro-events-jp-staging' ||
    before.schema_version !== 2
  )
    throw new Error('HEALTH_PROBE_IDENTITY_MISMATCH');
  const owner = `dev01r-health-${randomUUID()}`;
  let failure;
  try {
    // Both identities satisfy the immutable schema. Only the already-verified STAGING DB is targeted.
    // The production label is a temporary mismatch, never a production DB binding or schema change.
    const updated = await query(
      'UPDATE deployment_identity SET environment=?1,database_name=?2,initialized_at=?3 WHERE singleton=?4 AND environment=?5 AND database_name=?6 AND schema_version=?7 AND initialized_at=?8',
      [
        'production',
        'astro-events-jp-production',
        owner,
        1,
        'staging',
        before.database_name,
        2,
        before.initialized_at,
      ],
    );
    if (updated[0]?.meta?.changes !== 1)
      throw new Error('HEALTH_PROBE_CAS_FAILED');
    failure = await health();
    if (
      failure.httpStatus !== 503 ||
      failure.code !== 'DB_IDENTITY' ||
      failure.collectionEnabled !== false
    )
      throw new Error('HEALTH_PROBE_FAILURE_NOT_OBSERVED');
  } finally {
    // Restore only this probe's marker; never overwrite a concurrent administrator change.
    await query(
      'UPDATE deployment_identity SET environment=?1,database_name=?2,initialized_at=?3 WHERE singleton=?4 AND environment=?5 AND database_name=?6 AND schema_version=?7 AND initialized_at=?8',
      [
        'staging',
        before.database_name,
        before.initialized_at,
        1,
        'production',
        'astro-events-jp-production',
        2,
        owner,
      ],
    );
    const restored = await read();
    if (JSON.stringify(restored) !== JSON.stringify(before))
      throw new Error('HEALTH_PROBE_RESTORE_FAILED');
  }
  const recovered = await health();
  if (recovered.httpStatus !== 200 || recovered.code !== 'OK')
    throw new Error('HEALTH_PROBE_RECOVERY_FAILED');
  return { target, remote: true, success: true, failure, recovered };
}
