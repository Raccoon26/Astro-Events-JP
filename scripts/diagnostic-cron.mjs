import { readFileSync, writeFileSync } from 'node:fs';
import { cloudflareClient, getCloudflareToken } from './cloudflare-client.mjs';
import {
  checkFreeAccount,
  parseAccountEvidence,
  readConfig,
  validateBindings,
} from './cloudflare-policy.mjs';
import { preflight } from './path-policy.mjs';

const state = preflight(),
  operation = process.argv[2];
if (
  !['install', 'restore'].includes(operation) ||
  !process.argv.includes('--apply')
)
  throw new Error('Explicit install/restore --apply required; staging only');
const resources = JSON.parse(readFileSync('cloudflare-resources.json', 'utf8'));
validateBindings(readConfig(), resources, true);
const evidence = parseAccountEvidence(process.env.CF_ACCOUNT_EVIDENCE);
checkFreeAccount(evidence, 'staging', Date.now(), 1);
if (evidence.accountId !== resources.accountId)
  throw new Error('Account mismatch');
const api = cloudflareClient(getCloudflareToken(), resources.accountId),
  prefix = '/workers/scripts/astro-events-jp-staging';
const settings = await api('GET', prefix + '/settings');
if (
  !settings.bindings?.some(
    (binding) =>
      binding.type === 'd1' &&
      binding.name === 'DB' &&
      binding.id === resources.staging.databaseId,
  )
)
  throw new Error('Staging Worker ownership mismatch');
for (const name of ['COLLECTION_ENABLED', 'NOTIFICATIONS_ENABLED'])
  if (
    !settings.bindings?.some(
      (binding) => binding.name === name && binding.text === 'false',
    )
  )
    throw new Error('Diagnostic disabled flag mismatch');
const before = await api('GET', prefix + '/schedules');
const cron = operation === 'install' ? '* * * * *' : '0 */3 * * *';
const report = {
  at: new Date().toISOString(),
  target: 'staging',
  operation,
  before: before.schedules,
  desired: [cron],
  deadline:
    operation === 'install'
      ? new Date(Date.now() + 20 * 60000).toISOString()
      : null,
  restoreCommand: 'node scripts/diagnostic-cron.mjs restore --apply',
  mode: 'read-only scheduled diagnostics; no collection/notification/deletion',
  success: false,
};
const file = `${state.root}/reports/dev01r-cron-${Date.now()}.json`;
if (state.localDriveVerified)
  writeFileSync(file, JSON.stringify(report, null, 2));
await api('PUT', prefix + '/schedules', [{ cron }]);
const confirmed = await api('GET', prefix + '/schedules');
if (confirmed.schedules?.length !== 1 || confirmed.schedules[0].cron !== cron)
  throw new Error('Cron update unverified; inspect receipt and restore');
report.success = true;
if (state.localDriveVerified)
  writeFileSync(file, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
