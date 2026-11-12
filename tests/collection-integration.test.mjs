import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { meterD1 } from '../scripts/d1-meter.mjs';
import { preflight } from '../scripts/path-policy.mjs';
import {
  approvalFixture,
  fixtureTransport,
  htmlFixture,
  NOW,
  sourceFixture,
  usage,
} from './collection-fixtures';

let mf, db, api;
beforeAll(async () => {
  const bundle = await build({
    entryPoints: ['src/collection/index.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
  });
  api = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
  );
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script:
        'export default {fetch(){return new Response("isolated fixture")}}',
      d1Databases: ['DB'],
      host: '127.0.0.1',
      port: 0,
    }),
  );
  db = await mf.getD1Database('DB');
  for (const file of readdirSync('migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const sql of readFileSync(`migrations/${file}`, 'utf8')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(sql).run();
  await db
    .prepare(
      "INSERT INTO deployment_identity VALUES(1,'staging','astro-events-jp-staging',2,'2026-11-12')",
    )
    .run();
}, 30000);
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  for (const table of [
    'source_approvals',
    'source_policy_reviews',
    'candidate_images',
    'candidate_versions',
    'event_candidates',
    'discovery_candidates',
    'collection_jobs',
    'collection_documents',
    'collection_run_metrics',
    'crawl_runs',
    'registry_history',
    'registry_metadata',
    'registry_urls',
    'sources',
    'collection_cursors',
    'collection_host_gates',
  ])
    await db.prepare(`DELETE FROM ${table}`).run();
});
async function setup(body = htmlFixture) {
  let now = Date.parse(NOW);
  const calls = [];
  const transport = fixtureTransport(
    (url, headers) =>
      url.pathname === '/robots.txt'
        ? new Response('', { status: 404 })
        : body instanceof Function
          ? body(url, headers)
          : new Response(body, {
              headers: { 'Content-Type': 'text/html', ETag: '"first"' },
            }),
    calls,
  );
  const engine = new api.CollectionOrchestrator(
    db,
    transport,
    true,
    {},
    () => now,
    async () => {},
  );
  const source = sourceFixture();
  // Register through the DEV02 registry, then record explicit synthetic approval.
  const compiled = await build({
    entryPoints: ['src/registry-api.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  const registryApi = await import(
    `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
  );
  await new registryApi.D1SourceRegistry(db).register({
    ...source,
    state: 'review',
  });
  await engine.store.approve(source, approvalFixture(source), NOW);
  await engine.store.enqueue(source, NOW);
  const step = () =>
    engine.step({
      environment: 'staging',
      localOnly: true,
      accountUsage: usage,
    });
  return {
    engine,
    source,
    calls,
    step,
    advance: (ms) => {
      now += ms;
    },
    now: () => new Date(now).toISOString(),
    registryApi,
  };
}
describe('isolated actual workerd D1 collector integration', () => {
  it('keeps all 47 regional opportunities when national and independent VTuber pools are present', async () => {
    const s = await setup();
    await db.prepare('DELETE FROM collection_jobs').run();
    const registry = new s.registryApi.D1SourceRegistry(db);
    for (let pref = 1; pref <= 47; pref++)
      await registry.register({
        ...s.source,
        id: `fair-${pref}`,
        prefecture: pref,
        officialUrl: `https://example.jp/fair/${pref}`,
      });
    await registry.register({
      ...s.source,
      id: 'national',
      prefecture: null,
      officialUrl: 'https://example.jp/national',
    });
    await registry.register({
      ...s.source,
      id: 'vtuber-pool',
      prefecture: null,
      category: 'vtuber',
      officialUrl: 'https://example.jp/vtuber',
    });
    await db
      .prepare("INSERT INTO collection_cursors VALUES('general',46,?1)")
      .bind(NOW)
      .run();
    const picked = await s.engine.enqueueFair(NOW, 1, 1);
    expect(picked).toEqual(['fair-47', 'vtuber-pool']);
  }, 30000);
  it('rechecks active state inside the atomic candidate batch after concurrent approval revocation', async () => {
    const s = await setup();
    await s.step();
    const job = await s.engine.store.next(NOW);
    const token = await s.engine.store.claim(job, NOW);
    await db.prepare("UPDATE sources SET state='review'").run();
    await expect(
      s.engine.store.finish(job, token, s.source, JSON.parse(job.payload)),
    ).rejects.toMatchObject({ code: 'checkpoint-conflict' });
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM event_candidates').first('n'),
    ).toBe(0);
    expect(
      await db.prepare('SELECT state FROM collection_jobs').first('state'),
    ).toBe('parsed');
  });
  it('revokes an earlier approval on policy review and prevents a parsed checkpoint from bypassing it', async () => {
    const s = await setup();
    await s.step();
    await s.engine.store.recordReview(s.source.id, {
      decision: 'review',
      reviewedAt: NOW,
      reason: 'Terms changed: await operator review',
    });
    expect(await s.step()).toMatchObject({ code: 'source-not-active' });
    expect(s.calls).toHaveLength(2);
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM event_candidates').first('n'),
    ).toBe(0);
    expect(await db.prepare('SELECT state FROM sources').first('state')).toBe(
      'review',
    );
    expect(
      await db
        .prepare('SELECT COUNT(*) AS n FROM source_policy_reviews')
        .first('n'),
    ).toBe(2);
  });
  it('checkpoints parsing and commits candidates/images/discovery atomically on the next bounded step', async () => {
    const { step, calls } = await setup();
    expect(await step()).toMatchObject({ state: 'parsed', candidates: 2 });
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM event_candidates').first('n'),
    ).toBe(0);
    expect(await step()).toMatchObject({
      state: 'completed',
      candidates: 2,
      requests: 0,
    });
    expect(calls).toHaveLength(2);
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM event_candidates').first('n'),
    ).toBe(2);
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM events').first('n'),
    ).toBe(0);
    expect(
      (
        await db
          .prepare('SELECT DISTINCT rights_status FROM candidate_images')
          .all()
      ).results,
    ).toEqual([{ rights_status: 'unknown' }]);
    expect(
      (
        await db
          .prepare('SELECT DISTINCT state FROM discovery_candidates')
          .all()
      ).results,
    ).toEqual([{ state: 'review' }]);
    expect(
      await db.prepare('SELECT state FROM collection_jobs').first('state'),
    ).toBe('completed');
    expect(
      (await db.prepare('PRAGMA foreign_key_check').all()).results,
    ).toEqual([]);
  });
  it('reuses ETags, bypasses parsing on 304 or identical 200, and preserves the last actual change', async () => {
    let status = 200,
      etag = null;
    const s = await setup((_url, headers) => {
      etag = headers.get('If-None-Match');
      return status === 304
        ? new Response(null, { status: 304 })
        : new Response(htmlFixture, {
            headers: { 'Content-Type': 'text/html', ETag: '"same"' },
          });
    });
    await s.step();
    await s.step();
    const changed = await db
      .prepare('SELECT changed_at FROM collection_documents')
      .first('changed_at');
    s.advance(3600001);
    status = 304;
    await s.engine.store.enqueue(s.source, s.now());
    expect(await s.step()).toMatchObject({ state: 'unchanged' });
    expect(etag).toBe('"same"');
    s.advance(3600001);
    status = 200;
    await s.engine.store.enqueue(s.source, s.now());
    expect(await s.step()).toMatchObject({ state: 'unchanged' });
    expect(
      await db
        .prepare('SELECT changed_at FROM collection_documents')
        .first('changed_at'),
    ).toBe(changed);
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM event_candidates').first('n'),
    ).toBe(2);
  });
  it('rolls back failed D1 writes and resumes parsed checkpoints without repeating the network request', async () => {
    const s = await setup();
    await s.step();
    await db
      .prepare(
        "CREATE TRIGGER fixture_fail_images BEFORE INSERT ON candidate_images BEGIN SELECT RAISE(ABORT,'fixture write failure'); END",
      )
      .run();
    expect(await s.step()).toMatchObject({ state: 'failed' });
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM event_candidates').first('n'),
    ).toBe(0);
    expect(
      await db.prepare('SELECT state FROM collection_jobs').first('state'),
    ).toBe('parsed');
    await db.prepare('DROP TRIGGER fixture_fail_images').run();
    s.advance(600001);
    expect(await s.step()).toMatchObject({ state: 'completed' });
    expect(s.calls).toHaveLength(2);
  });
  it('recovers an expired fetching claim, retaining the per-source interval and stable candidate IDs', async () => {
    const s = await setup();
    const job = await s.engine.store.next(NOW);
    const token = await s.engine.store.claim(job, NOW);
    await s.engine.store.attempted(job, token, NOW);
    s.advance(61000);
    expect(await s.step()).toMatchObject({ code: 'rate-limited' });
    expect(s.calls).toHaveLength(0);
    s.advance(3600001);
    expect(await s.step()).toMatchObject({ state: 'parsed' });
    await s.step();
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM event_candidates').first('n'),
    ).toBe(2);
  });
  it('claims one owner under contention and prevents an old owner from writing stale candidates', async () => {
    const s = await setup();
    const job = await s.engine.store.next(NOW);
    const token = await s.engine.store.claim(job, NOW);
    expect(await s.engine.store.claim(job, NOW)).toBeNull();
    await db
      .prepare("UPDATE collection_jobs SET owner='new-owner' WHERE job_id=?1")
      .bind(job.job_id)
      .run();
    await expect(
      s.engine.store.finish(job, token, s.source, {
        parsed: {
          candidates: [],
          discoveries: [],
          sitemaps: [],
          truncated: false,
        },
        url: s.source.officialUrl,
        digest: 'a'.repeat(64),
        etag: null,
        lastModified: null,
        at: NOW,
        requests: 0,
      }),
    ).rejects.toMatchObject({ code: 'checkpoint-conflict' });
    expect(
      await db.prepare('SELECT owner FROM collection_jobs').first('owner'),
    ).toBe('new-owner');
  });
  it('isolates failures, keeps source status/facility state intact and suppresses retries until due', async () => {
    const s = await setup(() => new Response('', { status: 404 }));
    expect(await s.step()).toMatchObject({ code: 'permanent-not-found' });
    expect(await db.prepare('SELECT state FROM sources').first('state')).toBe(
      'active',
    );
    expect(await s.step()).toMatchObject({ state: 'idle' });
    expect(
      await db
        .prepare('SELECT failure_count FROM sources')
        .first('failure_count'),
    ).toBe(1);
    expect(
      await db
        .prepare('SELECT succeeded_at FROM collection_documents')
        .first('succeeded_at'),
    ).toBeNull();
  });
  it('blocks missing account budgets, production identity, unverified approvals and keeps fair cursors persistent', async () => {
    const s = await setup();
    expect(
      await s.engine.step({
        environment: 'staging',
        localOnly: true,
        accountUsage: null,
      }),
    ).toMatchObject({ code: 'budget-exhausted' });
    expect(s.calls).toHaveLength(0);
    await expect(
      s.engine.store.approve(
        { ...s.source, officialStatus: 'Review Required' },
        approvalFixture(s.source),
        NOW,
      ),
    ).rejects.toThrow();
    await db
      .prepare(
        "UPDATE deployment_identity SET environment='production',database_name='astro-events-jp-production'",
      )
      .run();
    await expect(s.step()).rejects.toMatchObject({ code: 'source-not-active' });
    await db
      .prepare(
        "UPDATE deployment_identity SET environment='staging',database_name='astro-events-jp-staging'",
      )
      .run();
    await db.prepare('DELETE FROM collection_jobs').run();
    expect(await s.engine.enqueueFair(NOW, 1, 0)).toEqual([s.source.id]);
    expect(
      await db
        .prepare('SELECT prefecture FROM collection_cursors')
        .first('prefecture'),
    ).toBe(1);
  });
  it('bounds sitemap traversal and deduplicates cyclic references across a cycle', async () => {
    const s = await setup();
    await db.prepare('DELETE FROM collection_jobs').run();
    const source = { ...s.source, format: 'sitemap' };
    await new s.registryApi.D1SourceRegistry(db).save(source);
    const transport = fixtureTransport((url) =>
      url.pathname === '/robots.txt'
        ? new Response('', { status: 404 })
        : new Response(
            `<sitemapindex><sitemap><loc>${source.officialUrl}</loc></sitemap><sitemap><loc>https://example.jp/child.xml</loc></sitemap></sitemapindex>`,
            { headers: { 'Content-Type': 'application/xml' } },
          ),
    );
    const engine = new api.CollectionOrchestrator(
      db,
      transport,
      true,
      {},
      () => Date.parse(NOW),
      async () => {},
    );
    await engine.store.enqueue(source, NOW);
    for (let i = 0; i < 6; i++)
      await engine.step({
        environment: 'staging',
        localOnly: true,
        accountUsage: usage,
      });
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM collection_jobs').first('n'),
    ).toBe(2);
  });
  it('resumes beyond the first bounded page and resets the cursor when content changes', async () => {
    const body =
      '<ul>' +
      Array.from(
        { length: 25 },
        (_, i) => `<li><a href="/events/${i}">星空観望会 ${i}</a></li>`,
      ).join('') +
      '</ul>';
    const s = await setup(body);
    for (let page = 0; page < 3; page++) {
      expect(await s.step()).toMatchObject({ state: 'parsed' });
      await s.step();
      s.advance(3600001);
    }
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM event_candidates').first('n'),
    ).toBe(25);
    expect(
      await db.prepare('SELECT state FROM collection_jobs').first('state'),
    ).toBe('completed');
    expect(
      await db
        .prepare('SELECT complete FROM collection_documents')
        .first('complete'),
    ).toBe(1);
    const jobs = await db
      .prepare('SELECT payload FROM collection_run_metrics')
      .all();
    expect(
      jobs.results.every((row) => JSON.parse(row.payload).calls <= 20),
    ).toBe(true);
  });
  it('measures local D1 rows and elapsed stages without labeling wall time as Cloudflare CPU', async () => {
    const s = await setup();
    const meter = meterD1(db);
    const measured = new api.CollectionOrchestrator(
      meter.db,
      s.engine.transport,
      true,
      {},
      () => Date.parse(NOW),
      async () => {},
    );
    const start = performance.now();
    await measured.step({
      environment: 'staging',
      localOnly: true,
      accountUsage: usage,
    });
    await measured.step({
      environment: 'staging',
      localOnly: true,
      accountUsage: usage,
    });
    expect(meter.usage.rowsWritten).toBeGreaterThan(0);
    expect(meter.usage.rowsRead).toBeGreaterThan(0);
    const state = preflight();
    if (state.localDriveVerified)
      writeFileSync(
        `${state.root}/reports/dev03-d1-measurement.json`,
        JSON.stringify(
          {
            local: true,
            remote: false,
            cpuTimeMs: null,
            elapsedMs: performance.now() - start,
            ...meter.usage,
            candidates: 2,
            network: 'synthetic fixture only',
          },
          null,
          2,
        ),
      );
  });
  it('restarts a partial document cursor if the page changes, without losing later items', async () => {
    const list = Array.from(
      { length: 25 },
      (_, i) => `<li><a href="/events/${i}">星空観望会 ${i}</a></li>`,
    ).join('');
    let body = '<ul>' + list + '</ul>';
    const s = await setup(
      () => new Response(body, { headers: { 'Content-Type': 'text/html' } }),
    );
    await s.step();
    await s.step();
    body = '<ul><li><a href="/new">星空観望会 新着</a></li>' + list + '</ul>';
    for (let i = 0; i < 3; i++) {
      s.advance(3600001);
      await s.step();
      await s.step();
    }
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM event_candidates').first('n'),
    ).toBe(26);
  });
  it('retains candidate versions and returns changed candidates to DEV04 review', async () => {
    let body = '<li><a href="/events/1">星空観望会</a><p>会場：公民館</p></li>';
    const s = await setup(
      () => new Response(body, { headers: { 'Content-Type': 'text/html' } }),
    );
    await s.step();
    await s.step();
    await db
      .prepare("UPDATE event_candidates SET review_status='Verified'")
      .run();
    body = body.replace('公民館', '科学館');
    s.advance(3600001);
    await s.engine.store.enqueue(s.source, s.now());
    await s.step();
    await s.step();
    expect(
      await db
        .prepare('SELECT review_status FROM event_candidates')
        .first('review_status'),
    ).toBe('Review Required');
    expect(
      await db
        .prepare('SELECT COUNT(*) AS n FROM candidate_versions')
        .first('n'),
    ).toBe(2);
  });
  it('stops after three failed fetch claims and requires an explicit reviewed retry', async () => {
    const s = await setup(() => new Response('', { status: 404 }));
    for (let i = 0; i < 3; i++) {
      await s.step();
      s.advance(3600001);
    }
    expect(await s.step()).toMatchObject({ state: 'idle' });
    const job = await db
      .prepare('SELECT job_id FROM collection_jobs')
      .first('job_id');
    await s.engine.store.retryReviewedJob(
      job,
      'operator reviewed retry',
      s.now(),
    );
    expect(await s.step()).toMatchObject({
      state: 'failed',
      code: 'permanent-not-found',
    });
  });
});
