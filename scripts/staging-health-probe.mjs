import { readFileSync, writeFileSync } from 'node:fs';
import { cloudflareClient, getCloudflareToken } from './cloudflare-client.mjs';
import {
  checkFreeAccount,
  parseAccountEvidence,
  readConfig,
  validateBindings,
} from './cloudflare-policy.mjs';
import { verifyStagingHealthRecovery } from './health-probe-policy.mjs';
import { preflight } from './path-policy.mjs';

const state = preflight();
if (
  !process.argv.includes('--apply') ||
  process.argv.some((a) => /production|--remote/.test(a))
)
  throw new Error('Explicit staging-only --apply required');
const resources = JSON.parse(readFileSync('cloudflare-resources.json', 'utf8'));
validateBindings(readConfig(), resources, true);
const evidence = parseAccountEvidence(process.env.CF_ACCOUNT_EVIDENCE);
checkFreeAccount(
  evidence,
  'staging',
  Date.now(),
  resources.staging.crons.length,
);
if (evidence.accountId !== resources.accountId)
  throw new Error('Account mismatch');
const api = cloudflareClient(getCloudflareToken(), resources.accountId),
  db = await api('GET', `/d1/database/${resources.staging.databaseId}`);
if (
  db.uuid !== resources.staging.databaseId ||
  db.name !== 'astro-events-jp-staging'
)
  throw new Error('Staging DB mismatch');
const query = (sql, params = []) =>
  api('POST', `/d1/database/${db.uuid}/query`, { sql, params });
const marker = (
  await query('SELECT * FROM deployment_identity WHERE singleton=?1', [1])
)[0]?.results?.[0];
if (
  marker?.environment !== 'staging' ||
  marker.database_name !== db.name ||
  marker.schema_version !== 2
)
  throw new Error('Staging marker mismatch');
const subdomain = await api('GET', '/workers/subdomain');
if (!/^[a-z0-9-]+$/.test(subdomain.subdomain))
  throw new Error('Worker URL unavailable');
const url = `https://astro-events-jp-staging.${subdomain.subdomain}.workers.dev/health`;
async function health() {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  const reader = response.body.getReader();
  let bytes = 0,
    text = '';
  const decoder = new TextDecoder();
  for (;;) {
    const item = await reader.read();
    if (item.done) break;
    bytes += item.value.length;
    if (bytes > 4096) {
      await reader.cancel();
      throw new Error('Health response too large');
    }
    text += decoder.decode(item.value, { stream: true });
  }
  text += decoder.decode();
  const body = JSON.parse(text);
  if (
    Object.keys(body).some(
      (key) =>
        ![
          'status',
          'code',
          'environment',
          'database',
          'collectionEnabled',
          'mode',
        ].includes(key),
    )
  )
    throw new Error('Unexpected public health fields');
  return { httpStatus: response.status, ...body };
}
const report = {
  at: new Date().toISOString(),
  ...(await verifyStagingHealthRecovery({ target: 'staging', query, health })),
};
if (state.localDriveVerified)
  writeFileSync(
    `${state.root}/reports/dev01r-health-recovery-${Date.now()}.json`,
    JSON.stringify(report, null, 2),
  );
console.log(JSON.stringify(report));
