import { readFileSync, writeFileSync } from 'node:fs';
import { cloudflareClient, getCloudflareToken } from './cloudflare-client.mjs';
import {
  checkFreeAccount,
  ENVIRONMENTS,
  parseAccountEvidence,
  readConfig,
  validateBindings,
} from './cloudflare-policy.mjs';
import { preflight } from './path-policy.mjs';

preflight();
const config = readConfig();
const resources = JSON.parse(readFileSync('cloudflare-resources.json', 'utf8'));
validateBindings(config, resources);
const evidence = parseAccountEvidence(process.env.CF_ACCOUNT_EVIDENCE);
for (const target of ENVIRONMENTS)
  checkFreeAccount(
    evidence,
    target,
    Date.now(),
    resources[target].crons?.length ?? 2,
  );
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
if (
  !/^[a-f0-9]{32}$/.test(accountId ?? '') ||
  evidence.accountId !== accountId ||
  evidence.source !== 'cloudflare-dashboard' ||
  evidence.utcDay !== new Date().toISOString().slice(0, 10)
)
  throw new Error(
    'Verified Free account and current account-wide usage required',
  );
if (resources.accountId && resources.accountId !== accountId)
  throw new Error('Existing project account mismatch');
const api = cloudflareClient(getCloudflareToken(), accountId);
const databases = await api('GET', '/d1/database');
const scripts = await api('GET', '/workers/scripts');
if (!Array.isArray(databases) || !Array.isArray(scripts))
  throw new Error('Invalid inventory');
const missing = ENVIRONMENTS.filter((target) => !resources[target].databaseId);
const existingProjectCrons = ENVIRONMENTS.reduce(
  (total, target) => total + (evidence.projectCronTriggers?.[target] ?? 0),
  0,
);
if (
  databases.length + missing.length > 10 ||
  evidence.cronTriggers +
    ENVIRONMENTS.reduce(
      (total, target) => total + (resources[target].crons?.length ?? 2),
      0,
    ) -
    existingProjectCrons >
    5
)
  throw new Error(
    'Insufficient Free resource slots; no resource will be changed',
  );
for (const target of ENVIRONMENTS) {
  const db = databases.find((db) => db.name === resources[target].databaseName);
  if (
    resources[target].databaseId &&
    (!db || db.uuid !== resources[target].databaseId)
  )
    throw new Error(
      'Recorded project database is missing or changed; inspect before continuing',
    );
  if (db && db.uuid !== resources[target].databaseId)
    throw new Error(
      'Existing database name collision; do not adopt automatically',
    );
  if (
    scripts.some((script) => script.id === resources[target].workerName) &&
    !resources[target].databaseId
  )
    throw new Error('Existing Worker name collision; do not modify');
}
resources.accountId = accountId;
config.account_id = accountId;
for (const target of ENVIRONMENTS) {
  if (!resources[target].databaseId) {
    const created = await api('POST', '/d1/database', {
      name: resources[target].databaseName,
    });
    if (
      created.name !== resources[target].databaseName ||
      !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(created.uuid)
    )
      throw new Error(
        'Unexpected provision response; stop and inspect account',
      );
    resources[target].databaseId = created.uuid;
  }
  config.env[target].d1_databases[0].database_id = resources[target].databaseId;
  // Persist successful creation immediately so a partial failure can resume without deleting/recreating a DB.
  writeFileSync(
    'cloudflare-resources.json',
    JSON.stringify(resources, null, 2) + '\n',
  );
  writeFileSync('wrangler.jsonc', JSON.stringify(config, null, 2) + '\n');
  const confirmed = await api(
    'GET',
    `/d1/database/${resources[target].databaseId}`,
  );
  if (
    confirmed.uuid !== resources[target].databaseId ||
    confirmed.name !== resources[target].databaseName
  )
    throw new Error(
      'Created resource verification failed; recorded ID retained for inspection',
    );
}
validateBindings(config, resources, true);
console.log(
  'Project D1 resources provisioned and separated. No Worker deployment, migration, collection or third-party resource modification performed.',
);
