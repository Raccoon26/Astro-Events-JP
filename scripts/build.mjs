import { spawnSync } from 'node:child_process';
import { preflight } from './path-policy.mjs';

preflight();
const result = spawnSync(
  process.execPath,
  ['scripts/wrangler.mjs', 'deploy', '--dry-run', '--outdir', 'dist'],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
