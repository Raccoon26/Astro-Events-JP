import { spawnSync } from 'node:child_process';
import { validateWranglerOperation } from './cloudflare-policy.mjs';
import { preflight } from './path-policy.mjs';
export function runWrangler(
  args,
  { capture = false, authorizedRemote = false, input } = {},
) {
  const state = preflight();
  validateWranglerOperation(args, authorizedRemote);
  const env = {
    ...process.env,
    WRANGLER_SEND_METRICS: 'false',
    BROWSER: 'none',
    CI: 'true',
  };
  if (state.localDriveVerified)
    Object.assign(env, {
      TEMP: `${state.root}/temp`,
      TMP: `${state.root}/temp`,
      XDG_CACHE_HOME: `${state.root}/cache`,
      XDG_CONFIG_HOME: `${state.root}/tools/config`,
      WRANGLER_LOG_PATH: `${state.root}/logs/wrangler.log`,
    });
  const result = spawnSync(
    process.execPath,
    ['node_modules/wrangler/bin/wrangler.js', ...args],
    {
      env,
      encoding: 'utf8',
      timeout: 180000,
      ...(capture
        ? { input, maxBuffer: 8 * 1024 * 1024 }
        : { stdio: 'inherit' }),
    },
  );
  if (result.status !== 0)
    throw new Error(
      'WRANGLER_FAILED: operation stopped; no automatic retry or data reset',
    );
  return result.stdout;
}
