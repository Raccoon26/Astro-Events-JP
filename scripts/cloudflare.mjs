import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cloudflareClient, getCloudflareToken } from './cloudflare-client.mjs';
import {
  assertMigrationIntegrity,
  checkFreeAccount,
  guardStagingWrite,
  isAdditiveMigration,
  parseAccountEvidence,
  readConfig,
  validateBindings,
  validateEnvironment,
} from './cloudflare-policy.mjs';
import { preflight } from './path-policy.mjs';
import { runWrangler } from './wrangler-runner.mjs';

const state = preflight();
const [operation, target, ...options] = process.argv.slice(2);
validateEnvironment(target);
if (
  ![
    'inspect',
    'migrate',
    'initialize',
    'staging-probe',
    'bookmark',
    'restore',
    'deploy',
    'rollback',
  ].includes(operation)
)
  throw new Error('Unknown guarded operation');
if (['staging-probe', 'restore', 'rollback'].includes(operation))
  guardStagingWrite(target);
assertMigrationIntegrity();
const config = readConfig();
const resources = JSON.parse(readFileSync('cloudflare-resources.json', 'utf8'));
validateBindings(config, resources, true); // Placeholders are blocked before auth or any network call.
const evidence = parseAccountEvidence(process.env.CF_ACCOUNT_EVIDENCE);
checkFreeAccount(evidence, target);
if (
  evidence.accountId !== resources.accountId ||
  evidence.source !== 'cloudflare-dashboard' ||
  evidence.utcDay !== new Date().toISOString().slice(0, 10)
)
  throw new Error('Account evidence mismatch');
const api = cloudflareClient(getCloudflareToken(), resources.accountId);
const database = await api(
  'GET',
  `/d1/database/${resources[target].databaseId}`,
);
if (
  database.name !== resources[target].databaseName ||
  database.uuid !== resources[target].databaseId
)
  throw new Error('Live database identity mismatch');
const query = async (sql, params = []) => {
  const result = await api('POST', `/d1/database/${database.uuid}/query`, {
    sql,
    params,
  });
  if (!Array.isArray(result) || result.some((item) => item.success === false))
    throw new Error('D1_QUERY_FAILED');
  return result;
};
async function checkIdentity() {
  const result = await query(
    'SELECT environment,database_name,schema_version FROM deployment_identity WHERE singleton = ?1',
    [1],
  );
  const row = result[0]?.results?.[0];
  if (
    row?.environment !== target ||
    row.database_name !== database.name ||
    row.schema_version !== 2
  )
    throw new Error('Bound database marker mismatch');
}
const report = {
  at: new Date().toISOString(),
  operation,
  target,
  success: false,
  code: 'NOT_RUN',
};
try {
  if (operation === 'inspect') {
    await checkIdentity();
    await query(
      "SELECT name,type FROM sqlite_master WHERE type IN ('table','index') ORDER BY name",
    );
    const integrity = await query('PRAGMA quick_check');
    const foreignKeys = await query('PRAGMA foreign_key_check');
    if (
      integrity[0]?.results?.[0]?.quick_check !== 'ok' ||
      foreignKeys[0]?.results?.length !== 0
    )
      throw new Error('D1_INTEGRITY_FAILED');
  } else if (operation === 'migrate') {
    if (!options.includes(`--approve-${target}-migrations`))
      throw new Error('Explicit migration approval required');
    // Current migrations are additive only. Future destructive changes require a separate reviewed procedure.
    for (const file of readdirSync('migrations').filter((file) =>
      file.endsWith('.sql'),
    )) {
      const sql = readFileSync(`migrations/${file}`, 'utf8').replace(
        /--[^\n]*/g,
        '',
      );
      if (!isAdditiveMigration(sql))
        throw new Error(
          'Non-additive migration needs separate approval and recovery plan',
        );
    }
    const before = runWrangler(
      ['d1', 'time-travel', 'info', 'DB', '--env', target, '--json'],
      { capture: true, authorizedRemote: true },
    );
    if (state.localDriveVerified)
      writeFileSync(
        `${state.root}/reports/d1-before-${target}-${Date.now()}.json`,
        before,
        { flag: 'wx' },
      );
    runWrangler(
      ['d1', 'migrations', 'apply', 'DB', '--remote', '--env', target],
      { capture: true, authorizedRemote: true },
    );
  } else if (operation === 'initialize') {
    const existing = await query(
      'SELECT environment FROM deployment_identity WHERE singleton = ?1',
      [1],
    );
    if (existing[0]?.results?.length) await checkIdentity();
    else {
      const contents = await query('SELECT COUNT(*) AS count FROM events');
      if (contents[0]?.results?.[0]?.count !== 0)
        throw new Error('Cannot initialize a database containing events');
      await query(
        'INSERT INTO deployment_identity(singleton,environment,database_name,schema_version,initialized_at) VALUES(?1,?2,?3,?4,?5)',
        [1, target, database.name, 2, new Date().toISOString()],
      );
      await checkIdentity();
    }
  } else if (operation === 'staging-probe') {
    await checkIdentity();
    const id = `dev01-probe-${randomUUID()}`;
    try {
      await query(
        'INSERT INTO discovery_candidates(candidate_id,canonical_url,discovered_from,reason,created_at) VALUES(?1,?2,?3,?4,?5)',
        [
          id,
          `https://example.invalid/${id}`,
          'dev01-staging-probe',
          'synthetic',
          new Date().toISOString(),
        ],
      );
      const row = await query(
        'SELECT candidate_id FROM discovery_candidates WHERE candidate_id = ?1',
        [id],
      );
      if (row[0]?.results?.[0]?.candidate_id !== id)
        throw new Error('Staging probe mismatch');
    } finally {
      await query('DELETE FROM discovery_candidates WHERE candidate_id = ?1', [
        id,
      ]);
    }
  } else if (operation === 'bookmark') {
    const bookmark = runWrangler(
      ['d1', 'time-travel', 'info', 'DB', '--env', target, '--json'],
      { capture: true, authorizedRemote: true },
    );
    if (state.localDriveVerified)
      writeFileSync(
        `${state.root}/reports/d1-bookmark-${target}-${Date.now()}.json`,
        bookmark,
        { flag: 'wx' },
      );
  } else if (operation === 'restore') {
    const bookmark = options[0];
    if (!/^[a-f0-9-]{20,100}$/.test(bookmark ?? ''))
      throw new Error('Explicit staging bookmark required');
    runWrangler(
      [
        'd1',
        'time-travel',
        'restore',
        'DB',
        '--env',
        target,
        '--bookmark',
        bookmark,
        '--json',
      ],
      { capture: true, authorizedRemote: true },
    );
    await checkIdentity();
  } else if (operation === 'deploy' || operation === 'rollback') {
    await checkIdentity();
    if (operation === 'deploy') {
      const git = (...args) =>
        execFileSync('git', args, { encoding: 'utf8' }).trim();
      if (
        git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main') ||
        git('status', '--porcelain')
      )
        throw new Error('Deploy only the clean, CI-verified main commit');
      if (
        target === 'production' &&
        !options.includes('--confirm-astro-events-jp-production')
      )
        throw new Error('Explicit production confirmation required');
      const scripts = await api('GET', '/workers/scripts');
      if (!Array.isArray(scripts))
        throw new Error('Worker inventory unavailable');
      if (
        scripts.some((script) => script.id === resources[target].workerName)
      ) {
        const settings = await api(
          'GET',
          `/workers/scripts/${resources[target].workerName}/settings`,
        );
        if (
          !settings.bindings?.some(
            (binding) =>
              binding.type === 'd1' &&
              binding.name === 'DB' &&
              binding.id === database.uuid,
          )
        )
          throw new Error(
            'Existing Worker does not belong to this project DB; do not overwrite',
          );
      }
      // No migration or DB reset is part of deployment. Failed deploy leaves existing release intact.
      runWrangler(['deploy', '--env', target], {
        capture: true,
        authorizedRemote: true,
      });
      const subdomain = await api('GET', '/workers/subdomain');
      if (!/^[a-z0-9-]+$/.test(subdomain?.subdomain ?? ''))
        throw new Error('workers.dev subdomain unavailable');
      const health = await fetch(
        `https://${resources[target].workerName}.${subdomain.subdomain}.workers.dev/health`,
        { redirect: 'error', signal: AbortSignal.timeout(10000) },
      );
      const body = await health.json();
      if (
        !health.ok ||
        body.status !== 'ok' ||
        body.environment !== target ||
        body.collectionEnabled !== false
      )
        throw new Error(
          'Deployed health verification failed; inspect previous release before rollback',
        );
    } else {
      const version = options[0];
      if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(version ?? ''))
        throw new Error('Exact staging Worker version required');
      runWrangler(
        [
          'rollback',
          version,
          '--env',
          target,
          '--yes',
          '--message',
          'DEV01 staging recovery',
        ],
        { capture: true, authorizedRemote: true },
      );
    }
  }
  report.success = true;
  report.code = 'OK';
} catch {
  report.code = 'CLOUDFLARE_OPERATION_FAILED';
  process.exitCode = 1;
}
if (state.localDriveVerified)
  writeFileSync(
    `${state.root}/reports/cloudflare-${target}-${Date.now()}.json`,
    JSON.stringify(report, null, 2),
    { flag: 'wx' },
  );
console.log(JSON.stringify(report));
