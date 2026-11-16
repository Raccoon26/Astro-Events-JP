import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { nativeTwitterAliases } from '../scripts/post-bundle-policy.mjs';

describe('ES2022 Workers native built-ins retain the unmodified official algorithm', () => {
  it('passes all 44 official weighted/directional cases without loading ES5 polyfills or network', async () => {
    const input = parse(
      readFileSync('tests/fixtures/twitter-text/validate.yml', 'utf8'),
    ).tests;
    const cases = [
      ...input.WeightedTweetsWithDiscountedEmojiCounterTest.map((c) => ({
        ...c,
        legacy: false,
      })),
      ...input.WeightedTweetsCounterTest.map((c) => ({ ...c, legacy: true })),
      ...input.UnicodeDirectionalMarkerCounterTest.map((c) => ({
        ...c,
        legacy: false,
      })),
    ];
    const built = await build({
      stdin: {
        contents: `import parseTweet from 'twitter-text/dist/esm/parseTweet.js';import configs from 'twitter-text/dist/esm/configs.js';const cases=${JSON.stringify(cases)};export default {fetch(){globalThis.fetch=()=>{throw Error('outbound-disabled')};return Response.json({polyfilled:Object.hasOwn(globalThis,'__core-js_shared__'),results:cases.map(c=>parseTweet(c.text,c.legacy?configs.version2:configs.version3))})}}`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      minify: true,
      alias: nativeTwitterAliases(),
    });
    expect(built.outputFiles[0].text).not.toContain('node_modules/core-js/');
    const worker = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        compatibilityDate: '2026-11-11',
        script: built.outputFiles[0].text,
        host: '127.0.0.1',
        port: 0,
      }),
    );
    try {
      const r = await (await worker.dispatchFetch('http://localhost/')).json();
      expect(r.polyfilled).toBe(false);
      expect(r.results).toHaveLength(44);
      for (let i = 0; i < cases.length; i++)
        expect(r.results[i], cases[i].description).toMatchObject(
          cases[i].expected,
        );
    } finally {
      await worker.dispose();
    }
  }, 30000);
  it('limits aliases to the reviewed native compatibility imports', () => {
    const aliases = nativeTwitterAliases();
    expect(Object.keys(aliases)).toHaveLength(23);
    expect(
      Object.keys(aliases).every((key) => key.startsWith('core-js/modules/')),
    ).toBe(true);
    expect(new Set(Object.values(aliases)).size).toBe(1);
  });
});
