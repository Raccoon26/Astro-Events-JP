import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { preflight } from '../scripts/path-policy.mjs';
import { nativeTwitterAliases } from '../scripts/post-bundle-policy.mjs';
import { NOW, usage } from './collection-fixtures';
import { POST_NOW, postFixture } from './post-fixtures';
import { verificationFixture } from './verification-fixtures';

let mf, db, api;
const options = {
  enabled: true,
  localOnly: true,
  clock: () => Date.parse(NOW),
};
beforeAll(async () => {
  const built = await build({
    alias: nativeTwitterAliases(),
    entryPoints: ['src/post-management-api.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
  });
  api = await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  );
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-11-11',
      script:
        'export default {fetch(){return new Response("isolated synthetic DEV05 DB")}}',
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
      "INSERT INTO deployment_identity VALUES(1,'staging','astro-events-jp-staging',2,?1)",
    )
    .bind(NOW)
    .run();
}, 30000);
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  for (const table of [
    'generated_posts',
    'event_changes',
    'event_images',
    'events',
    'verification_decisions',
    'candidate_versions',
    'event_candidates',
    'collection_documents',
    'source_approvals',
    'registry_history',
    'registry_urls',
    'registry_metadata',
    'sources',
  ])
    await db.prepare(`DELETE FROM ${table}`).run();
});
async function setup() {
  const f = await verificationFixture();
  await new api.D1SourceRegistry(db).register(f.ctx.source);
  await db
    .prepare('INSERT INTO source_approvals VALUES(?1,?2,?3)')
    .bind(f.ctx.source.id, JSON.stringify(f.ctx.approval), NOW)
    .run();
  const c = f.ctx.candidate;
  await db
    .prepare(
      'INSERT INTO event_candidates(candidate_id,source_id,official_url,fingerprint,payload,first_seen_at,last_seen_at) VALUES(?1,?2,?3,?4,?5,?6,?6)',
    )
    .bind(
      c.id,
      c.sourceId,
      c.officialUrl,
      c.fingerprint,
      JSON.stringify(c),
      NOW,
    )
    .run();
  await db
    .prepare('INSERT INTO candidate_versions VALUES(?1,?2,?3,?4)')
    .bind(c.id, c.fingerprint, JSON.stringify(c), NOW)
    .run();
  await db
    .prepare(
      'INSERT INTO collection_documents(source_id,url,digest,succeeded_at,changed_at,complete) VALUES(?1,?2,?3,?4,?4,1)',
    )
    .bind(c.sourceId, c.originalUrl, 'a'.repeat(64), NOW)
    .run();
  const verifier = new api.VerificationStore(db, options),
    p = await verifier.preview(c.id, f.packet);
  await verifier.commit(p.loaded, p.result, usage);
  return {
    ...f,
    verifier,
    eventId: p.result.event.stableEventId,
    store: new api.PostStore(db, options),
  };
}
async function count() {
  return db.prepare('SELECT COUNT(*) AS n FROM generated_posts').first('n');
}
describe('native local D1 post generation and current Verified output, no remote DB', () => {
  it('previews without writes, stores atomically, replays with zero writes and separates copy/management', async () => {
    const f = await setup(),
      preview = await f.store.preview(f.eventId, 'observation');
    expect(await count()).toBe(0);
    const start = f.store.meter.snapshot(),
      saved = await f.store.save(f.eventId, 'observation', usage),
      end = f.store.meter.snapshot();
    expect(saved.changed).toBe(true);
    expect(saved.delivery.copyText).toBe(preview.copyText);
    expect(saved.delivery.metadata.verified).toBe(true);
    expect(saved.delivery.copyText).not.toContain(
      saved.delivery.metadata.decisionId,
    );
    expect((await f.store.get(saved.delivery.metadata.post.id)).copyText).toBe(
      preview.copyText,
    );
    const before = f.store.meter.snapshot();
    expect((await f.store.save(f.eventId, 'observation', usage)).changed).toBe(
      false,
    );
    expect(f.store.meter.snapshot().rowsWritten - before.rowsWritten).toBe(0);
    expect(await count()).toBe(1);
    const state = preflight();
    if (state.localDriveVerified)
      writeFileSync(
        state.root + '/reports/dev05-d1-measurement.json',
        JSON.stringify(
          {
            synthetic: true,
            remote: false,
            cloudflareCpuMs: null,
            save: {
              calls: end.calls - start.calls,
              statements: end.statements - start.statements,
              rowsRead: end.rowsRead - start.rowsRead,
              rowsWritten: end.rowsWritten - start.rowsWritten,
            },
            replayRowsWritten: 0,
            externalRequests: 0,
          },
          null,
          2,
        ),
      );
  });
  it('preserves original verification timestamp/expiry rather than silently renewing on read', async () => {
    const f = await setup(),
      a = await f.verifier.verified(f.eventId),
      later = new api.VerificationStore(db, {
        ...options,
        clock: () => Date.parse(NOW) + 60000,
      }),
      b = await later.verified(f.eventId);
    expect(b.verification.checkedAt).toBe(a.verification.checkedAt);
    expect(b.verification.expiresAt).toBe(a.verification.expiresAt);
  });
  it.each([
    "UPDATE sources SET state='review'",
    'DELETE FROM source_approvals',
    "UPDATE event_candidates SET fingerprint='changed'",
    "UPDATE collection_documents SET digest='changed'",
    "UPDATE verification_decisions SET rule_version='obsolete'",
    "UPDATE verification_decisions SET expires_at='2020-01-01T00:00:00.000Z'",
    "UPDATE events SET verification_status='Review Required'",
    "UPDATE events SET verification_status='Blocked'",
    "UPDATE events SET title='forged'",
    "UPDATE verification_decisions SET result_json='{}'",
  ])('blocks retained old text after %s', async (sql) => {
    const f = await setup(),
      p = await f.store.save(f.eventId, 'observation', usage);
    await db.prepare(sql).run();
    expect(await f.store.get(p.delivery.metadata.post.id)).toBeNull();
    await expect(f.store.preview(f.eventId, 'observation')).rejects.toThrow();
  });
  it('does not accept a caller-edited VerifiedEvent, enum or publication body', async () => {
    const f = await setup(),
      event = await f.verifier.verified(f.eventId),
      generator = new api.JapanesePostGenerator(f.store);
    expect((await generator.generate(event, 'observation')).eventId).toBe(
      f.eventId,
    );
    event.title = 'edited';
    await expect(generator.generate(event, 'observation')).rejects.toThrow(
      'not-currently-verified',
    );
    await expect(
      generator.generate(
        { stableEventId: f.eventId, verificationStatus: 'Verified' },
        'observation',
      ),
    ).rejects.toThrow();
  });
  it('rejects unknown/exhausted budgets and old caller preconditions without writing', async () => {
    const f = await setup();
    await expect(f.store.save(f.eventId, 'observation', null)).rejects.toThrow(
      'budget-exhausted',
    );
    await expect(
      f.store.save(f.eventId, 'observation', { ...usage, writes: 80000 }),
    ).rejects.toThrow('budget-exhausted');
    await expect(
      f.store.save(f.eventId, 'observation', usage, 'ja-v1', {
        sourceId: 'wrong',
        fingerprint: f.ctx.candidate.fingerprint,
        revision: 1,
      }),
    ).rejects.toThrow('write-conflict');
    expect(await count()).toBe(0);
  });
  it('keeps concurrent stores idempotent with a single unique row', async () => {
    const f = await setup(),
      other = new api.PostStore(db, options);
    const results = await Promise.all([
      f.store.save(f.eventId, 'observation', usage),
      other.save(f.eventId, 'observation', usage),
    ]);
    expect(results.filter((r) => r.changed)).toHaveLength(1);
    expect(await count()).toBe(1);
  });
  it('does not commit stale work if source authorization changes immediately before the CAS write', async () => {
    const f = await setup(),
      racing = {
        prepare: (sql) => db.prepare(sql),
        batch: async (statements) => {
          await db.prepare("UPDATE sources SET state='paused'").run();
          return db.batch(statements);
        },
      };
    await expect(
      new api.PostStore(racing, options).save(f.eventId, 'observation', usage),
    ).rejects.toThrow('write-conflict');
    expect(await count()).toBe(0);
  });
  it('refuses an environment switch inside the write and leaves production untouched', async () => {
    const f = await setup(),
      racing = {
        prepare: (sql) => db.prepare(sql),
        batch: async (statements) => {
          await db
            .prepare(
              "UPDATE deployment_identity SET environment='production',database_name='astro-events-jp-production'",
            )
            .run();
          return db.batch(statements);
        },
      };
    try {
      await expect(
        new api.PostStore(racing, options).save(
          f.eventId,
          'observation',
          usage,
        ),
      ).rejects.toThrow();
      expect(await count()).toBe(0);
    } finally {
      await db
        .prepare(
          "UPDATE deployment_identity SET environment='staging',database_name='astro-events-jp-staging'",
        )
        .run();
    }
  });
  it('rolls back an injected DB batch failure and resumes without a partial post', async () => {
    const f = await setup(),
      bad = {
        prepare: (sql) => db.prepare(sql),
        batch: (statements) =>
          db.batch([
            ...statements,
            db.prepare(
              'INSERT INTO deliberately_missing_posts_table VALUES(1)',
            ),
          ]),
      };
    await expect(
      new api.PostStore(bad, options).save(f.eventId, 'observation', usage),
    ).rejects.toThrow();
    expect(await count()).toBe(0);
    expect((await f.store.save(f.eventId, 'observation', usage)).changed).toBe(
      true,
    );
  });
  it('rejects tampered text/JSON/weights and never overwrites audit rows', async () => {
    const f = await setup(),
      p = await f.store.save(f.eventId, 'observation', usage),
      id = p.delivery.metadata.post.id;
    await db
      .prepare(
        "UPDATE generated_posts SET hashtags_json='{}',text='forged',weighted_length=1",
      )
      .run();
    expect(await f.store.get(id)).toBeNull();
    await expect(f.store.save(f.eventId, 'observation', usage)).rejects.toThrow(
      'stored-post-invalid',
    );
    expect(await count()).toBe(1);
  });
  it('versions templates, bounded history is metadata-only and list rows are hints', async () => {
    const f = await setup();
    await f.store.save(f.eventId, 'observation', usage);
    await f.store.save(f.eventId, 'observation', usage, 'ja-v1.1');
    const h = await f.store.history(f.eventId);
    expect(h).toHaveLength(2);
    expect(h[0].text).toBeUndefined();
    expect(await f.store.list()).toHaveLength(1);
    await expect(f.store.list('', 51)).rejects.toThrow();
    await expect(f.store.history(f.eventId, '', 51)).rejects.toThrow();
  });
  it('bounds legacy text reads and refuses overlarge rows without overwriting them', async () => {
    const f = await setup(),
      p = await f.store.save(f.eventId, 'observation', usage);
    await db
      .prepare('UPDATE generated_posts SET text=?1')
      .bind('x'.repeat(9000))
      .run();
    expect(await f.store.get(p.delivery.metadata.post.id)).toBeNull();
    await expect(
      f.store.save(f.eventId, 'observation', usage),
    ).rejects.toThrow();
    expect(await count()).toBe(1);
  });
  it('invalidates old posts across a new verified revision', async () => {
    const f = await setup(),
      old = await f.store.save(f.eventId, 'observation', usage);
    f.packet.reason += '; new explicit synthetic review';
    const p = await f.verifier.preview(f.ctx.candidate.id, f.packet);
    await f.verifier.commit(p.loaded, p.result, usage);
    const next = await f.store.save(f.eventId, 'observation', usage);
    expect(next.delivery.metadata.eventRevision).toBeGreaterThan(
      old.delivery.metadata.eventRevision,
    );
    expect(next.delivery.metadata.post.id).not.toBe(
      old.delivery.metadata.post.id,
    );
    expect(await f.store.get(old.delivery.metadata.post.id)).toBeNull();
  });
  it('rechecks a read-only preview and refuses a candidate changed during generation', async () => {
    const f = await setup();
    let reads = 0;
    const hooked = {
      prepare(sql) {
        const wrap = (stmt) => ({
          bind: (...values) => wrap(stmt.bind(...values)),
          all: async () => {
            if (sql.includes('SELECT d.result_json') && ++reads === 2)
              await db
                .prepare(
                  "UPDATE event_candidates SET fingerprint='during-preview'",
                )
                .run();
            return stmt.all();
          },
          run: () => stmt.run(),
        });
        return wrap(db.prepare(sql));
      },
      batch: (statements) => db.batch(statements),
    };
    await expect(
      new api.PostStore(hooked, options).preview(f.eventId, 'observation'),
    ).rejects.toThrow();
    expect(await count()).toBe(0);
  });
  it('keeps OFF, schema0004/0005-only and production environments fail-closed', async () => {
    const f = await setup();
    await expect(
      new api.PostStore(db).preview(f.eventId, 'observation'),
    ).rejects.toThrow('feature-disabled');
    await db.prepare('DROP VIEW post_generation_schema').run();
    try {
      await expect(f.store.preview(f.eventId, 'observation')).rejects.toThrow(
        'schema-unavailable',
      );
    } finally {
      await db
        .prepare('CREATE VIEW post_generation_schema AS SELECT 1 AS version')
        .run();
    }
    await db.prepare('DROP VIEW verification_schema').run();
    try {
      expect(await f.store.get('x')).toBeNull();
      await expect(f.store.preview(f.eventId, 'observation')).rejects.toThrow(
        'schema-unavailable',
      );
    } finally {
      await db
        .prepare('CREATE VIEW verification_schema AS SELECT 1 AS version')
        .run();
    }
  });
  it('binds untrusted cursor/ID strings without executing SQL', async () => {
    const f = await setup();
    expect(await f.store.history("';DROP TABLE events;--")).toEqual([]);
    expect(await f.store.get("';DROP TABLE events;--")).toBeNull();
    expect(await f.store.list("';DROP TABLE events;--")).toHaveLength(1);
  });
  it('runs official weighted text and all 13 pure templates in actual isolated workerd with outbound blocked', async () => {
    const built = await build({
      alias: nativeTwitterAliases(),
      stdin: {
        contents:
          "import {examples,postFixture,POST_NOW} from './tests/post-fixtures';import {renderPost} from './src/posts/render';export default {async fetch(){globalThis.fetch=()=>{throw Error('outbound-disabled')};const results=[];for(const sample of examples){const f=await postFixture(sample.kind);const p=await renderPost(f.event,1,sample.kind,POST_NOW);results.push({kind:p.kind,length:p.weightedLength});}return Response.json({results,externalRequests:0})}}",
        resolveDir: process.cwd(),
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
    });
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
      expect(r.externalRequests).toBe(0);
      expect(r.results).toHaveLength(13);
      expect(r.results.every((p) => p.length <= 280)).toBe(true);
    } finally {
      await worker.dispose();
    }
  }, 30000);
  it('pages 2001 synthetic event hints in bounded cursor batches, without treating enum-only rows as verified outputs', async () => {
    const f = await setup();
    let seedWrites = 0;
    const size = async () =>
      (await db.prepare('SELECT 1').run()).meta.size_after;
    const beforeSize = await size();
    for (let base = 0; base < 2000; base += 50) {
      const rows = await db.batch(
        Array.from({ length: 50 }, (_, i) =>
          db
            .prepare(
              "INSERT INTO events(stable_event_id,source_id,title,category,official_url,first_seen_at,verification_status) VALUES(?1,?2,'合成IDヒント','local','https://example.jp/events/synthetic',?3,'Verified')",
            )
            .bind(
              'hint-' + String(base + i).padStart(5, '0'),
              f.ctx.source.id,
              NOW,
            ),
        ),
      );
      seedWrites += rows.reduce((n, row) => n + row.meta.rows_written, 0);
    }
    const start = performance.now(),
      before = f.store.meter.snapshot();
    let cursor = '',
      count = 0,
      pages = 0;
    for (;;) {
      const page = await f.store.list(cursor, 50);
      if (!page.length) break;
      expect(page.length).toBeLessThanOrEqual(50);
      count += page.length;
      pages++;
      cursor = page.at(-1).eventId;
    }
    expect(count).toBe(2001);
    expect(pages).toBe(41);
    const after = f.store.meter.snapshot(),
      elapsedMs = performance.now() - start;
    await expect(f.store.preview('hint-00000', 'observation')).rejects.toThrow(
      'not-currently-verified',
    );
    const state = preflight();
    if (state.localDriveVerified)
      writeFileSync(
        state.root + '/reports/dev05-cursor-benchmark.json',
        JSON.stringify(
          {
            synthetic: true,
            remote: false,
            cloudflareCpuMs: null,
            count,
            pages,
            pageLimit: 50,
            elapsedMs,
            seedRowsWritten: seedWrites,
            d1: {
              reads: after.rowsRead - before.rowsRead,
              writes: after.rowsWritten - before.rowsWritten,
            },
            databaseBytesBefore: beforeSize,
            databaseBytesAfter: await size(),
            scope: 'ID hint cursor, not bulk Verified output',
          },
          null,
          2,
        ),
      );
  }, 30000);
  it('does not scan thousands of review rows to find current decision hints', async () => {
    const f = await setup();
    const seeded = await db
      .prepare(
        `WITH RECURSIVE rows(i) AS (VALUES(0) UNION ALL SELECT i+1 FROM rows WHERE i<4999)
         INSERT INTO events(stable_event_id,source_id,title,category,official_url,first_seen_at)
         SELECT printf('review-%05d', i),?1,'合成未検証','local','https://example.jp/events/synthetic',?2 FROM rows`,
      )
      .bind(f.ctx.source.id, NOW)
      .run();
    expect(seeded.meta.changes).toBe(5000);
    const before = f.store.meter.snapshot(),
      rows = await f.store.list('', 25),
      after = f.store.meter.snapshot();
    expect(rows.map((r) => r.eventId)).toEqual([f.eventId]);
    expect(after.rowsRead - before.rowsRead).toBeLessThan(20);
    const state = preflight();
    if (state.localDriveVerified)
      writeFileSync(
        state.root + '/reports/dev05-sparse-verified-cursor.json',
        JSON.stringify(
          {
            synthetic: true,
            remote: false,
            reviewRows: 5000,
            verifiedHints: 1,
            rowsRead: after.rowsRead - before.rowsRead,
            rowsWritten: after.rowsWritten - before.rowsWritten,
          },
          null,
          2,
        ),
      );
  }, 30000);
  it('fails closed if cursor indexes are absent rather than silently scanning', async () => {
    const f = await setup();
    await db.prepare('DROP INDEX events_verified_cursor').run();
    try {
      await expect(f.store.list()).rejects.toThrow('schema-unavailable');
    } finally {
      await db
        .prepare(
          "CREATE INDEX events_verified_cursor ON events(stable_event_id,revision) WHERE verification_status='Verified'",
        )
        .run();
    }
  });
  it('benchmarks 2000 pure generations separately from Cloudflare CPU and schema writes', async () => {
    const f = await postFixture(),
      start = performance.now(),
      lengths = [];
    const memBefore = process.memoryUsage().heapUsed;
    for (let base = 0; base < 2000; base += 25) {
      for (let i = base; i < base + 25; i++) {
        const event = { ...f.event, stableEventId: 'synthetic-' + i };
        lengths.push(
          (await api.renderPost(event, 1, 'observation', POST_NOW))
            .weightedLength,
        );
      }
    }
    expect(lengths).toHaveLength(2000);
    expect(lengths.every((n) => n <= 280)).toBe(true);
    const state = preflight(),
      report = {
        synthetic: true,
        remote: false,
        cloudflareCpuMs: null,
        operations: 2000,
        batchSize: 25,
        elapsedMs: performance.now() - start,
        heapDeltaBytes: process.memoryUsage().heapUsed - memBefore,
        d1Reads: 0,
        d1Writes: 0,
        externalRequests: 0,
      };
    if (state.localDriveVerified)
      writeFileSync(
        state.root + '/reports/dev05-local-render-benchmark.json',
        JSON.stringify(report, null, 2),
      );
  }, 30000);
});
