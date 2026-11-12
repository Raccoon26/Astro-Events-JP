import { existsSync } from 'node:fs';
import { build } from 'esbuild';
import { assertNoLinks, preflight } from './path-policy.mjs';

preflight();
assertNoLinks('dist');
for (const target of ['dist/collector', 'dist/collector/index.mjs'])
  if (existsSync(target)) assertNoLinks(target);
await build({
  entryPoints: ['src/collection/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/collector/index.mjs',
  metafile: true,
});
console.log(
  'Browser/Workers collector library bundled; no deployment or production entrypoint change.',
);
