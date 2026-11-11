import { spawnSync } from 'node:child_process';
import { preflight } from './path-policy.mjs';

const state = preflight();
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
if (state.localDriveVerified) {
  Object.assign(env, {
    TEMP: `${state.root}/temp`,
    TMP: `${state.root}/temp`,
    XDG_CACHE_HOME: `${state.root}/cache`,
    XDG_CONFIG_HOME: `${state.root}/tools/config`,
    WRANGLER_LOG_PATH: `${state.root}/logs/wrangler.log`,
  });
}
const result = spawnSync(
  process.execPath,
  ['node_modules/wrangler/bin/wrangler.js', ...process.argv.slice(2)],
  { stdio: 'inherit', env },
);
process.exit(result.status ?? 1);
