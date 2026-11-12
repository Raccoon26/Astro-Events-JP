import { randomUUID } from 'node:crypto';
import { guardStagingWrite } from './cloudflare-policy.mjs';
export async function verifyStagingRecovery({
  target,
  databaseId,
  databaseName,
  query,
  bookmark,
  restore,
  record = () => {},
}) {
  guardStagingWrite(target);
  if (
    databaseName !== 'astro-events-jp-staging' ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(databaseId)
  )
    throw new Error('RECOVERY_TARGET_INVALID');
  async function identity() {
    const rows = await query(
      'SELECT environment,database_name,schema_version FROM deployment_identity WHERE singleton=?1',
      [1],
    );
    const r = rows[0]?.results?.[0];
    if (
      r?.environment !== 'staging' ||
      r.database_name !== databaseName ||
      r.schema_version !== 2
    )
      throw new Error('RECOVERY_IDENTITY_MISMATCH');
  }
  await identity();
  const before = await query('SELECT name FROM d1_migrations ORDER BY id');
  const point = await bookmark();
  if (!/^[a-f0-9-]{20,100}$/.test(point))
    throw new Error('INVALID_RECOVERY_BOOKMARK');
  record({ phase: 'bookmark', databaseId, bookmark: point });
  const id = `dev01r-recovery-${randomUUID()}`;
  await query(
    'INSERT INTO discovery_candidates(candidate_id,canonical_url,discovered_from,reason,created_at) VALUES(?1,?2,?3,?4,?5)',
    [
      id,
      `https://example.invalid/${id}`,
      'DEV01R staging recovery',
      'synthetic disposable',
      new Date().toISOString(),
    ],
  );
  await query(
    'UPDATE discovery_candidates SET reason=?1 WHERE candidate_id=?2',
    ['synthetic updated', id],
  );
  const selected = await query(
    'SELECT reason FROM discovery_candidates WHERE candidate_id=?1',
    [id],
  );
  if (selected[0]?.results?.[0]?.reason !== 'synthetic updated')
    throw new Error('RECOVERY_PROBE_NOT_VISIBLE');
  let syntaxFailure = false;
  try {
    await query('CREATE TABLE dev01r_failed_migration(SELECT)');
  } catch (error) {
    syntaxFailure = error.message === 'CLOUDFLARE_API_FAILED_400';
  }
  if (!syntaxFailure)
    throw new Error('EXPECTED_MIGRATION_SYNTAX_FAILURE_NOT_OBSERVED');
  const afterFailure = await query(
    'SELECT name FROM d1_migrations ORDER BY id',
  );
  if (
    JSON.stringify(before[0]?.results) !==
    JSON.stringify(afterFailure[0]?.results)
  )
    throw new Error('MIGRATION_LEDGER_CHANGED');
  record({
    phase: 'restore-request',
    databaseId,
    bookmark: point,
    probeId: id,
  });
  await restore(point);
  await identity();
  const after = await query(
    'SELECT candidate_id FROM discovery_candidates WHERE candidate_id=?1',
    [id],
  );
  const integrity = await query('PRAGMA quick_check'),
    fk = await query('PRAGMA foreign_key_check');
  if (
    after[0]?.results?.length !== 0 ||
    integrity[0]?.results?.[0]?.quick_check !== 'ok' ||
    fk[0]?.results?.length !== 0
  )
    throw new Error('RECOVERY_VERIFICATION_FAILED');
  const result = {
    phase: 'verified',
    databaseId,
    bookmark: point,
    probeAbsent: true,
    failedDdlObserved: true,
    migrationLedgerPreserved: true,
    integrity: 'ok',
    foreignKeys: 'ok',
  };
  record(result);
  return result;
}
