import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { accountSnapshot } from './account-snapshot.mjs';
import { cloudflareClient, getCloudflareToken } from './cloudflare-client.mjs';
import {
  assertMigrationIntegrity,
  checkFreeAccount,
  readConfig,
  validateBindings,
  validateEnvironment,
} from './cloudflare-policy.mjs';
import { preflight } from './path-policy.mjs';

preflight();
const target = validateEnvironment(process.argv[2]),
  mode = process.argv[3];
if (
  !['validate', 'deploy', 'diagnose'].includes(mode) ||
  (mode === 'diagnose' && target !== 'staging')
)
  throw new Error('Explicit validate/deploy required');
const resources = JSON.parse(readFileSync('cloudflare-resources.json', 'utf8'));
assertMigrationIntegrity();
validateBindings(readConfig(), resources, true);
const token = getCloudflareToken(),
  proof = JSON.parse(
    readFileSync('data/cloudflare-plan-evidence.json', 'utf8'),
  );
const snapshot = await accountSnapshot({
  token,
  accountId: resources.accountId,
  planEvidence: proof,
});
checkFreeAccount(snapshot, target, Date.now(), resources[target].crons.length);
const api = cloudflareClient(token, resources.accountId),
  db = await api('GET', `/d1/database/${resources[target].databaseId}`);
if (
  db.name !== resources[target].databaseName ||
  db.uuid !== resources[target].databaseId
)
  throw new Error('CI_DATABASE_MISMATCH');
const row = (
  await api('POST', `/d1/database/${db.uuid}/query`, {
    sql: 'SELECT environment,database_name,schema_version FROM deployment_identity WHERE singleton=?1',
    params: [1],
  })
)[0]?.results?.[0];
if (
  row?.environment !== target ||
  row.database_name !== db.name ||
  row.schema_version !== 2
)
  throw new Error('CI_DATABASE_MARKER_MISMATCH');
console.log(
  JSON.stringify({
    target,
    mode,
    authenticated: true,
    plan: snapshot.plan,
    accountRequestsReported: snapshot.requests,
    d1RowsReadReported: snapshot.reads,
    d1RowsWrittenReported: snapshot.writes,
    accountStorageBytes: snapshot.databaseBytes,
    accountCronTriggers: snapshot.cronTriggers,
    collectionEnabled: false,
    notificationsEnabled: false,
    analyticsCaveat: snapshot.analyticsCaveat,
  }),
);
if (mode === 'deploy' || mode === 'diagnose') {
  const result = spawnSync(
    process.execPath,
    [
      ...(mode === 'diagnose'
        ? ['scripts/staging-diagnostics.mjs', target]
        : ['scripts/cloudflare.mjs', 'deploy', target]),
      ...(target === 'production'
        ? ['--confirm-astro-events-jp-production']
        : []),
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, CF_ACCOUNT_EVIDENCE: JSON.stringify(snapshot) },
    },
  );
  if (result.status !== 0) throw new Error('CI_DEPLOYMENT_FAILED');
}
