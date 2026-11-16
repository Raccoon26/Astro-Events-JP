import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { build } from 'esbuild';
import { nativeTwitterAliases } from './post-bundle-policy.mjs';

export const CPU_BASELINE = '157aaab6eb284f3e65df85d5207ee6efcf8a60b8';
export async function postProfileBuild(contents, baseline = false) {
  return build({
    stdin: {
      contents,
      resolveDir: process.cwd(),
      sourcefile: 'post-profile-entry.ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    alias: nativeTwitterAliases(),
    plugins: baseline
      ? [
          {
            name: 'immutable-dev05-baseline',
            setup(b) {
              b.onLoad(
                { filter: /[\\/]src[\\/]posts[\\/].*\.(ts|json)$/ },
                ({ path: file }) => {
                  const relative = path
                    .relative(process.cwd(), file)
                    .replaceAll('\\', '/');
                  if (['src/posts/profile-corpus.json'].includes(relative))
                    return;
                  return {
                    contents: execFileSync(
                      'git',
                      ['show', `${CPU_BASELINE}:${relative}`],
                      { encoding: 'utf8' },
                    ),
                    loader: file.endsWith('.json') ? 'json' : 'ts',
                    resolveDir: path.dirname(file),
                  };
                },
              );
            },
          },
        ]
      : [],
  });
}
