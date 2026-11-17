import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { expect, it } from 'vitest';
import { preflight } from '../scripts/path-policy.mjs';
import { nativeTwitterAliases } from '../scripts/post-bundle-policy.mjs';
import { postProfileBuild } from '../scripts/post-profile-build.mjs';

it('native optimized invocations retain the committed baseline posts and refuse production without DB access', async () => {
  const state = preflight();
  const temp = state.localDriveVerified
    ? `${state.root}/temp`
    : process.env.RUNNER_TEMP;
  if (!temp) throw Error('ISOLATED_TEMP_REQUIRED');
  // Native tests compare the optimized renderer to the immutable committed corpus.
  // The remote matrix additionally compiles the original Git baseline separately.
  const base = await postProfileBuild(
    "export {renderPost} from './src/posts/render';export const implementation='optimized';export const profileMarker='test-marker';",
  );
  const file = `${temp}/dev05r-test-baseline-${randomUUID()}.mjs`;
  fs.writeFileSync(file, base.outputFiles[0].text, { flag: 'wx' });
  let mf;
  try {
    const out = await build({
      entryPoints: ['src/posts/cpu-benchmark.ts'],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      minify: true,
      alias: { ...nativeTwitterAliases(), 'dev05r:renderer': file },
    });
    const vars = {
      APP_ENV: 'staging',
      DEPLOYMENT_ENV: 'staging',
      DATABASE_ENVIRONMENT: 'staging',
      DATABASE_NAME: 'astro-events-jp-staging',
      REPORTS_REPOSITORY: 'Raccoon26/Astro-Events-JP-Reports',
      COLLECTION_ENABLED: 'false',
      NOTIFICATIONS_ENABLED: 'false',
    };
    mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        compatibilityDate: '2026-11-11',
        script: out.outputFiles[0].text,
        bindings: vars,
        d1Databases: ['DB'],
        host: '127.0.0.1',
        port: 0,
      }),
    );
    const db = await mf.getD1Database('DB');
    expect(
      await (
        await mf.dispatchFetch('https://example.test/benchmark/cpu/ready')
      ).json(),
    ).toEqual({ implementation: 'optimized', profileMarker: 'test-marker' });
    await db
      .prepare(
        'CREATE TABLE deployment_identity(singleton INTEGER,environment TEXT,database_name TEXT,schema_version INTEGER)',
      )
      .run();
    await db
      .prepare(
        "INSERT INTO deployment_identity VALUES(1,'staging','astro-events-jp-staging',2)",
      )
      .run();
    const cases = JSON.parse(
      fs.readFileSync('src/posts/profile-corpus.json', 'utf8'),
    ).cases;
    for (const input of cases)
      for (const implementation of ['optimized']) {
        const response = await mf.dispatchFetch(
            `https://example.test/benchmark/cpu/${implementation}/${input.id}`,
          ),
          body = await response.json();
        expect(response.status).toBe(200);
        expect(body).toMatchObject({
          synthetic: true,
          externalRequests: 0,
          dbRowsRead: 1,
          dbRowsWritten: 0,
          post: input.expected,
        });
      }
    for (const url of [
      '/benchmark/cpu/optimized/no-such-input',
      '/benchmark/cpu/arbitrary/observation',
      '/benchmark/cpu/optimized/http://127.0.0.1',
    ])
      expect(
        (await mf.dispatchFetch('https://example.test' + url)).status,
      ).toBe(404);
    expect(
      (
        await mf.dispatchFetch(
          'https://example.test/benchmark/cpu/optimized/observation',
          { method: 'POST' },
        )
      ).status,
    ).toBe(404);
    await mf.setOptions(
      convertV4MiniflareOptions({
        modules: true,
        compatibilityDate: '2026-11-11',
        script: out.outputFiles[0].text,
        bindings: { ...vars, APP_ENV: 'production' },
        host: '127.0.0.1',
        port: 0,
      }),
    );
    // No DB binding exists, so an accidental access would fail instead of this 404.
    expect(
      (await mf.dispatchFetch('https://example.test/benchmark/cpu/ready'))
        .status,
    ).toBe(404);
    expect(
      (
        await mf.dispatchFetch(
          'https://example.test/benchmark/cpu/optimized/observation',
        )
      ).status,
    ).toBe(404);
  } finally {
    await mf?.dispose();
    fs.unlinkSync(file);
  }
}, 30000);
