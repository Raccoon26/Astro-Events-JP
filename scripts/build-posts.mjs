import { existsSync } from 'node:fs';
import { build } from 'esbuild';
import { assertNoLinks, preflight } from './path-policy.mjs';
import { nativeTwitterAliases } from './post-bundle-policy.mjs';

preflight();
for (const target of ['dist', 'dist/posts', 'dist/posts/index.mjs'])
  if (existsSync(target)) assertNoLinks(target);
await build({
  entryPoints: ['src/posts/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  alias: nativeTwitterAliases(),
  outfile: 'dist/posts/index.mjs',
});
console.log(
  'Workers post library bundled; deployed Health/Cron entrypoint does not import it.',
);
