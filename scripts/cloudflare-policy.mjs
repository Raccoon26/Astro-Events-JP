import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
export const ENVIRONMENTS = ['staging', 'production'];
export const ORIGINAL_MIGRATION_SHA256 =
  '0394154cccc3b55d93cee6ddc649ac7d98e257b6f81874ccac19b6e33a389e21';
export function readConfig() {
  return JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
}
export function validateEnvironment(target) {
  if (!ENVIRONMENTS.includes(target))
    throw new Error('Explicit staging or production target required');
  return target;
}
export function validateBindings(config, resources, remote = false) {
  const ids = [];
  for (const target of ENVIRONMENTS) {
    const env = config.env?.[target];
    const vars = env?.vars;
    const db = env?.d1_databases;
    const resource = resources[target];
    if (
      env?.name !== `astro-events-jp-${target}` ||
      vars?.APP_ENV !== target ||
      vars.DEPLOYMENT_ENV !== target ||
      vars.DATABASE_ENVIRONMENT !== target ||
      vars.DATABASE_NAME !== env.name ||
      vars.COLLECTION_ENABLED !== 'false' ||
      vars.NOTIFICATIONS_ENABLED !== 'false' ||
      vars.REPORTS_REPOSITORY !== 'Raccoon26/Astro-Events-JP-Reports'
    )
      throw new Error('Environment configuration mismatch');
    if (
      db?.length !== 1 ||
      db[0].binding !== 'DB' ||
      db[0].database_name !== env.name ||
      db[0].migrations_dir !== 'migrations'
    )
      throw new Error('D1 binding mismatch');
    if (resource?.workerName !== env.name || resource.databaseName !== env.name)
      throw new Error('Resource manifest mismatch');
    if (
      !Array.isArray(env.triggers?.crons) ||
      env.triggers.crons.join('|') !== '0 */3 * * *|17 0 * * *'
    )
      throw new Error('Cron configuration mismatch');
    if (
      remote &&
      (!/^[a-f0-9]{32}$/.test(resources.accountId ?? '') ||
        !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(
          resource.databaseId ?? '',
        ) ||
        resource.databaseId.startsWith('00000000-') ||
        db[0].database_id !== resource.databaseId)
    )
      throw new Error('Remote resources are unprovisioned or mismatched');
    ids.push(db[0].database_id);
  }
  if (ids[0] === ids[1])
    throw new Error('Environments must not share a database');
  if (remote && config.account_id !== resources.accountId)
    throw new Error('Account mismatch');
  return true;
}
export function assertMigrationIntegrity() {
  if (
    createHash('sha256')
      .update(
        readFileSync('migrations/0001_foundation.sql', 'utf8').replace(
          /\r\n/g,
          '\n',
        ),
      )
      .digest('hex') !== ORIGINAL_MIGRATION_SHA256
  )
    throw new Error('DEV-00 migration changed');
}
export function guardStagingWrite(target) {
  if (validateEnvironment(target) !== 'staging')
    throw new Error('Test writes/restores are staging-only');
}
export function checkFreeAccount(snapshot, target, now = Date.now()) {
  validateEnvironment(target);
  if (
    !/^[a-f0-9]{32}$/.test(snapshot?.accountId ?? '') ||
    snapshot.plan !== 'free' ||
    !Number.isFinite(Date.parse(snapshot.checkedAt)) ||
    now - Date.parse(snapshot.checkedAt) > 15 * 60 * 1000 ||
    Date.parse(snapshot.checkedAt) > now
  )
    throw new Error('Fresh authenticated Free account evidence required');
  for (const [key, ceiling] of Object.entries({
    requests: 80000,
    reads: 4000000,
    writes: 80000,
    databaseBytes: 4000000000,
    cronTriggers: 5,
  })) {
    if (
      !Number.isFinite(snapshot[key]) ||
      snapshot[key] < 0 ||
      snapshot[key] >= ceiling
    )
      throw new Error('Account usage unknown or budget exhausted');
  }
  const existing = snapshot.projectCronTriggers?.[target] ?? 0;
  if (
    !Number.isInteger(existing) ||
    existing < 0 ||
    existing > 2 ||
    snapshot.cronTriggers - existing + 2 > 5
  )
    throw new Error('Insufficient account Cron slots');
}
export function parseAccountEvidence(value) {
  try {
    return JSON.parse(value || 'null');
  } catch {
    throw new Error('ACCOUNT_EVIDENCE_INVALID');
  }
}
export function isAdditiveMigration(sql) {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .every(
      (statement) =>
        !/^\s*(?:DROP|DELETE|UPDATE|ALTER|REPLACE|INSERT)\b/i.test(statement),
    );
}
export function validateWranglerOperation(args, authorizedRemote = false) {
  if (args.includes('--help') || args.includes('-h')) return;
  if (args[0] === 'auth') throw new Error('Credential printing is disabled');
  const remoteFlag = args.some((arg) => /^--remote(?:=|$)/.test(arg));
  const localFlag =
    args.includes('--local') &&
    !['false', '0'].includes(args[args.indexOf('--local') + 1]);
  const dryRun =
    args.includes('--dry-run') &&
    !['false', '0'].includes(args[args.indexOf('--dry-run') + 1]);
  if (args[0] === 'dev' && (remoteFlag || args.includes('--local=false')))
    throw new Error('Remote dev is disabled');
  if (remoteFlag && !authorizedRemote)
    throw new Error('Guarded remote command required');
  if (
    !authorizedRemote &&
    !(
      args[0] === 'dev' ||
      localFlag ||
      dryRun ||
      ['whoami', 'login', 'logout'].includes(args[0])
    )
  )
    throw new Error('Guarded remote command required');
}
