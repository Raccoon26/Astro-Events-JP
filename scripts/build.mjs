import { ENVIRONMENTS } from './cloudflare-policy.mjs';
import { runWrangler } from './wrangler-runner.mjs';

for (const target of ENVIRONMENTS)
  runWrangler([
    'deploy',
    '--dry-run',
    '--env',
    target,
    '--outdir',
    `dist/${target}`,
  ]);
