import { readFileSync, writeFileSync } from 'node:fs';
import { cloudflareClient, getCloudflareToken } from './cloudflare-client.mjs';
import {
  assertMigrationIntegrity,
  checkFreeAccount,
  parseAccountEvidence,
  readConfig,
  validateBindings,
} from './cloudflare-policy.mjs';
import { preflight } from './path-policy.mjs';
import { verifyStagingRecovery } from './recovery-policy.mjs';
import { runWrangler } from './wrangler-runner.mjs';

const state = preflight(),
  resources = JSON.parse(readFileSync('cloudflare-resources.json', 'utf8'));
if (
  !process.argv.includes('--apply') ||
  process.argv.some((a) => /production|--remote/.test(a))
)
  throw new Error('Explicit staging-only --apply required');
assertMigrationIntegrity();
validateBindings(readConfig(), resources, true);
const evidence = parseAccountEvidence(process.env.CF_ACCOUNT_EVIDENCE);
checkFreeAccount(
  evidence,
  'staging',
  Date.now(),
  resources.staging.crons.length,
);
if (evidence.accountId !== resources.accountId)
  throw new Error('ACCOUNT_MISMATCH');
const api = cloudflareClient(getCloudflareToken(), resources.accountId),
  database = await api('GET', `/d1/database/${resources.staging.databaseId}`);
if (
  database.uuid !== resources.staging.databaseId ||
  database.name !== resources.staging.databaseName
)
  throw new Error('DATABASE_MISMATCH');
const path = `${state.root}/reports/dev01r-staging-recovery-${Date.now()}.json`,
  steps = [];
const record = (result) => {
  steps.push({ at: new Date().toISOString(), ...result });
  if (state.localDriveVerified)
    writeFileSync(
      path,
      JSON.stringify({ remote: true, target: 'staging', steps }, null, 2),
    );
};
try {
  const result = await verifyStagingRecovery({
    target: 'staging',
    databaseId: database.uuid,
    databaseName: database.name,
    query: (sql, params = []) =>
      api('POST', `/d1/database/${database.uuid}/query`, { sql, params }),
    bookmark: async () =>
      JSON.parse(
        runWrangler(
          ['d1', 'time-travel', 'info', 'DB', '--env', 'staging', '--json'],
          { capture: true, authorizedRemote: true },
        ),
      ).bookmark,
    restore: async (bookmark) =>
      runWrangler(
        [
          'd1',
          'time-travel',
          'restore',
          'DB',
          '--env',
          'staging',
          '--bookmark',
          bookmark,
          '--json',
        ],
        { capture: true, authorizedRemote: true },
      ),
    record,
  });
  console.log(JSON.stringify(result));
} catch (error) {
  record({
    phase: 'failed',
    code: /^[A-Z_0-9]+$/.test(error.message)
      ? error.message
      : 'RECOVERY_FAILED',
  });
  throw new Error(
    'Staging recovery failed; inspect recorded bookmark; no automatic cleanup or retry',
  );
}
