import { readdirSync, readFileSync } from 'node:fs';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CollectionOrchestrator } from '../src/collection/orchestrator';
import { D1SourceRegistry } from '../src/registry';
import {
  approvalFixture,
  fixtureTransport,
  NOW,
  pageResponse,
  sourceFixture,
  usage,
} from './collection-fixtures';

let miniflare;
let db;
const source = sourceFixture();
const approval = () => approvalFixture(source);

beforeEach(async () => {
  miniflare = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch: () => new Response("local fixture") }',
      d1Databases: ['DB'],
      host: '127.0.0.1',
      port: 0,
    }),
  );
  db = await miniflare.getD1Database('DB');
  for (const name of readdirSync('migrations')
    .filter((name) => /^000[1-4]_/.test(name))
    .sort())
    for (const sql of readFileSync('migrations/' + name, 'utf8')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(sql).run();
  await db
    .prepare(
      "INSERT INTO deployment_identity VALUES(1,'staging','astro-events-jp-staging',2,?1)",
    )
    .bind(NOW)
    .run();
});

afterEach(async () => {
  await miniflare?.dispose();
});

function engine(transport, clock = () => Date.parse(NOW)) {
  return new CollectionOrchestrator(
    db,
    transport,
    true,
    {},
    clock,
    async () => {},
  );
}
const step = (worker) =>
  worker.step({
    environment: 'staging',
    localOnly: true,
    accountUsage: usage,
  });
async function authorize(worker) {
  await new D1SourceRegistry(db).register({ ...source, state: 'review' });
  await worker.store.approve(source, approval(), NOW);
  await worker.store.enqueue(source, NOW);
}
const candidates = () =>
  db.prepare('SELECT COUNT(*) AS n FROM event_candidates').first('n');
const noRobots = () => new Response(null, { status: 404 });

describe('actual isolated D1 collection fences', () => {
  it('does not send a page request after approval was withdrawn in the robots hop', async () => {
    const calls = [];
    const transport = fixtureTransport(async () => {
      await db
        .prepare("UPDATE sources SET state='review' WHERE source_id=?1")
        .bind(source.id)
        .run();
      return noRobots();
    }, calls);
    const worker = engine(transport);
    await authorize(worker);
    expect(await step(worker)).toMatchObject({
      state: 'failed',
      code: 'policy-changed',
      requests: 1,
    });
    expect(calls).toEqual(['https://example.jp/robots.txt']);
    expect(await candidates()).toBe(0);
  });
  it('discards stale staged content after reapproval and resumes with current authority', async () => {
    const calls = [];
    let now = Date.parse(NOW);
    const transport = fixtureTransport(
      (url) => (url.pathname === '/robots.txt' ? noRobots() : pageResponse()),
      calls,
    );
    const worker = engine(transport, () => now);
    await authorize(worker);
    expect(await step(worker)).toMatchObject({ state: 'parsed' });
    await worker.store.approve(
      source,
      { ...approval(), purpose: 'Synthetic changed policy' },
      NOW,
    );
    expect(await step(worker)).toMatchObject({
      state: 'deferred',
      code: 'policy-changed',
      requests: 0,
    });
    expect(await candidates()).toBe(0);
    expect(calls).toHaveLength(2);
    const checkpoint = await db
      .prepare('SELECT payload,offset,owner FROM collection_jobs')
      .first();
    expect(checkpoint).toEqual({ payload: null, offset: 0, owner: null });
    now += 3601000;
    expect(await step(worker)).toMatchObject({ state: 'parsed' });
    expect(await step(worker)).toMatchObject({ state: 'completed' });
    expect(await candidates()).toBe(2);
    expect(calls).toHaveLength(4);
  });
  it('lets only the successful claimant reach the wire while a second worker competes', async () => {
    const calls = [];
    const peer = Promise.withResolvers();
    const start = Promise.withResolvers();
    const transport = fixtureTransport(async (url) => {
      if (url.pathname === '/robots.txt') {
        start.resolve();
        await peer.promise;
        return noRobots();
      }
      return pageResponse();
    }, calls);
    const worker = engine(transport);
    const second = engine(transport);
    await authorize(worker);
    const owned = step(worker);
    await start.promise;
    try {
      expect(await step(second)).toMatchObject({ state: 'idle' });
      expect(calls).toHaveLength(1);
    } finally {
      peer.resolve();
    }
    expect(await owned).toMatchObject({ state: 'parsed' });
    expect(calls).toHaveLength(2);
  });
});
