import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { expect, it } from 'vitest';
import { preflight } from '../scripts/path-policy.mjs';
import { context, htmlFixture } from './collection-fixtures';

it('runs all parser formats inside workerd and benchmarks bounded small/medium/complex fixtures', async () => {
  const bundle = await build({
    entryPoints: ['tests/fixtures/collector-worker.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-11-11',
      host: '127.0.0.1',
      port: 0,
    }),
  );
  const library = await build({
    entryPoints: ['src/collection/parse.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
  });
  const api = await import(
    `data:text/javascript;base64,${Buffer.from(library.outputFiles[0].text).toString('base64')}`
  );
  try {
    const fixtures = {
      html: htmlFixture,
      rss: '<rss version="2.0"><channel><item><title>星空観望会</title><link>https://example.jp/star</link></item></channel></rss>',
      atom: '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>宇宙講演</title><id>one</id><link href="https://example.jp/space"/></entry></feed>',
      sitemap:
        '<urlset><url><loc>https://example.jp/events/star</loc></url></urlset>',
    };
    for (const [format, text] of Object.entries(fixtures)) {
      const response = await mf.dispatchFetch(
        `http://localhost/?format=${format}`,
        { method: 'POST', body: text },
      );
      expect(response.status).toBe(200);
      expect((await response.json()).candidates.length).toBeGreaterThan(0);
    }
    expect(
      await (await mf.dispatchFetch('http://localhost/guard')).json(),
    ).toEqual({ code: 'dns-protection-unavailable' });
    const results = [];
    for (const [label, count] of [
      ['small', 1],
      ['medium', 40],
      ['complex', 300],
    ]) {
      const text =
        '<ul>' +
        Array.from(
          { length: count },
          (_, i) =>
            `<li><h2><a href="/events/${i}">星空観望会 ${i}</a></h2><p>2026年12月1日 会場：公民館</p><img src="/poster-${i}.jpg" alt="ポスター"></li>`,
        ).join('') +
        '</ul>';
      const elapsed = [];
      let candidates = 0;
      for (let n = 0; n < 8; n++) {
        const started = performance.now();
        const parsed = await api.parseDocument(text, context());
        elapsed.push(performance.now() - started);
        candidates = parsed.candidates.length;
      }
      elapsed.sort((a, b) => a - b);
      results.push({
        label,
        bytes: new TextEncoder().encode(text).length,
        items: count,
        candidates,
        localMedianElapsedMs: elapsed[4],
        localMaxElapsedMs: elapsed.at(-1),
        cloudflareCpuTimeMs: null,
      });
      expect(candidates).toBeLessThanOrEqual(10);
    }
    const state = preflight();
    if (state.localDriveVerified)
      writeFileSync(
        `${state.root}/reports/dev03-parser-benchmark.json`,
        JSON.stringify(
          {
            local: true,
            remote: false,
            cloudflareCpuTimeMs: null,
            workerdFormats: Object.keys(fixtures),
            libraryBundleBytes: library.outputFiles[0].contents.length,
            workerFixtureBundleBytes: bundle.outputFiles[0].contents.length,
            results,
          },
          null,
          2,
        ),
      );
  } finally {
    await mf.dispose();
  }
}, 60000);
