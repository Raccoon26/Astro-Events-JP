import { existsSync } from 'node:fs';
import { assertNoLinks } from './path-policy.mjs';
import { runWrangler } from './wrangler-runner.mjs';

for (const location of ['dist', 'dist/release', 'wrangler.release.jsonc'])
  if (existsSync(location)) assertNoLinks(location);
runWrangler([
  'deploy',
  '--config',
  'wrangler.release.jsonc',
  '--dry-run',
  '--outdir',
  'dist/release',
]);
