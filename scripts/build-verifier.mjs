import { existsSync } from 'node:fs';
import { build } from 'esbuild';
import { assertNoLinks, preflight } from './path-policy.mjs';

preflight();
for (const target of ['dist', 'dist/verifier', 'dist/verifier/index.mjs'])
  if (existsSync(target)) assertNoLinks(target);
await build({
  entryPoints: ['src/verification/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/verifier/index.mjs',
});
console.log(
  'Workers verifier library bundled; feature remains OFF in deployed entrypoint.',
);
