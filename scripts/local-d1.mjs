import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertMigrationIntegrity,
  validateEnvironment,
} from './cloudflare-policy.mjs';
import { preflight } from './path-policy.mjs';
import { runWrangler } from './wrangler-runner.mjs';

const state = preflight();
const target = validateEnvironment(process.argv[2]);
assertMigrationIntegrity();
const persist = state.localDriveVerified
  ? `${state.root}/cache/wrangler-state/${target}`
  : path.join(process.env.RUNNER_TEMP || state.root, '.astro-d1', target);
const common = ['--local', '--env', target, '--persist-to', persist];
const before = runWrangler(['d1', 'migrations', 'list', 'DB', ...common], {
  capture: true,
});
runWrangler(['d1', 'migrations', 'apply', 'DB', ...common], { capture: true });
function query(sql) {
  return JSON.parse(
    runWrangler(
      ['d1', 'execute', 'DB', ...common, '--command', sql, '--json'],
      { capture: true },
    ),
  );
}
let identity = query(
  'SELECT environment,database_name,schema_version FROM deployment_identity WHERE singleton=1',
)[0]?.results?.[0];
if (!identity) {
  query(
    `INSERT INTO deployment_identity VALUES(1,'${target}','astro-events-jp-${target}',2,strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
  );
  identity = query(
    'SELECT environment,database_name,schema_version FROM deployment_identity WHERE singleton=1',
  )[0]?.results?.[0];
}
if (
  identity?.environment !== target ||
  identity.database_name !== `astro-events-jp-${target}` ||
  identity.schema_version !== 2
)
  throw new Error('Local database environment mismatch');
const integrity = query('PRAGMA quick_check');
const foreignKeys = query('PRAGMA foreign_key_check');
if (
  integrity[0]?.results?.[0]?.quick_check !== 'ok' ||
  foreignKeys[0]?.results?.length !== 0
)
  throw new Error('Local D1 integrity failed');
const schema = query(
  "SELECT type,name FROM sqlite_master WHERE type IN ('table','index') ORDER BY name",
);
const report = {
  at: new Date().toISOString(),
  local: true,
  remote: false,
  target,
  identity,
  integrity: 'ok',
  foreignKeyErrors: 0,
  schema: schema[0]?.results,
  migrationListBefore: before,
};
if (state.localDriveVerified)
  writeFileSync(
    `${state.root}/reports/local-d1-${target}-${Date.now()}.json`,
    JSON.stringify(report, null, 2),
    { flag: 'wx' },
  );
console.log(
  `Local ${target} D1 migrations, identity, schema/index inventory and integrity passed. No remote Cloudflare verification.`,
);
