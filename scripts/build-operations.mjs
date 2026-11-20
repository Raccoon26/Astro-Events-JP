import { existsSync } from 'node:fs';
import { build } from 'esbuild';
import { assertNoLinks, preflight } from './path-policy.mjs';
import { nativeTwitterAliases } from './post-bundle-policy.mjs';

preflight();
for (const file of ['dist', 'dist/operations', 'dist/operations/index.mjs'])
  if (existsSync(file)) assertNoLinks(file);
await build({
  entryPoints: ['src/operations/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  alias: nativeTwitterAliases(),
  outfile: 'dist/operations/index.mjs',
});
console.log(
  'Built isolated operations library. No runtime route, Cron or remote schema changed.',
);
