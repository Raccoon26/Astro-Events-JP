import { existsSync } from 'node:fs';
import { build } from 'esbuild';
import { assertNoLinks, preflight } from './path-policy.mjs';
import { nativeTwitterAliases } from './post-bundle-policy.mjs';

preflight();
for (const file of [
  'dist',
  'dist/notifications',
  'dist/notifications/index.mjs',
])
  if (existsSync(file)) assertNoLinks(file);
await build({
  entryPoints: ['src/notifications/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  alias: nativeTwitterAliases(),
  outfile: 'dist/notifications/index.mjs',
});
console.log(
  'Notifications library built; live senders/webhook routes are not installed in the deployed Worker.',
);
