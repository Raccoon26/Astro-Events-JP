import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { preflight } from '../scripts/path-policy.mjs';
import { CollectionStore } from '../src/collection/store';
import { EXPIRED_EVENTS_SQL } from '../src/retention';
import { NOW, usage } from './collection-fixtures';
import { verificationFixture } from './verification-fixtures';

let mf, db, api;
const migrations = readdirSync('migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort();
beforeAll(async () => {
  const bundle = await build({
    entryPoints: ['src/verifier-management-api.ts'],
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
      compatibilityDate: '2026-11-11',
      script:
        'export default {fetch(){return new Response("isolated DEV04 test")}}',
      d1Databases: ['DB'],
      host: '127.0.0.1',
      port: 0,
    }),
  );
  db = await mf.getD1Database('DB');
  for (const file of migrations)
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
    'facility_notice_history',
    'facility_notices',
    'event_changes',
    'event_images',
    'events',
    'verification_decisions',
    'candidate_images',
    'candidate_versions',
    'event_candidates',
    'collection_documents',
    'source_approvals',
    'source_policy_reviews',
    'vtuber_sources',
    'facility_sources',
    'registry_history',
    'registry_urls',
    'registry_metadata',
    'facilities',
    'vtubers',
    'sources',
  ])
    await db.prepare(`DELETE FROM ${table}`).run();
});
async function setup(overrides = {}) {
  const f = await verificationFixture(overrides);
  await new api.D1SourceRegistry(db).register(f.ctx.source);
  await db
    .prepare('INSERT OR IGNORE INTO source_approvals VALUES(?1,?2,?3)')
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
      'INSERT OR IGNORE INTO collection_documents(source_id,url,digest,succeeded_at,changed_at,complete) VALUES(?1,?2,?3,?4,?4,1)',
    )
    .bind(c.sourceId, c.originalUrl, 'a'.repeat(64), NOW)
    .run();
  const store = new api.VerificationStore(db, {
    enabled: true,
    localOnly: true,
    clock: () => Date.parse(NOW),
  });
  return { ...f, store };
}
async function facility(f) {
  await db
    .prepare(
      'INSERT OR IGNORE INTO facilities(facility_id,facility_name,prefecture,official_url) VALUES(?1,?2,?3,?4)',
    )
    .bind('fixture-facility', '合成天文台', 1, 'https://example.jp/facility')
    .run();
  await db
    .prepare('INSERT OR IGNORE INTO facility_sources VALUES(?1,?2)')
    .bind('fixture-facility', f.ctx.source.id)
    .run();
  f.packet.facilityId = 'fixture-facility';
  return f;
}
describe('native local D1 verification persistence and output gate', () => {
  it('records open-ended closures without inventing cancellation and protects unresolved facility notices from retention', async () => {
    const event = await facility(await setup()),
      p = await event.store.preview(event.ctx.candidate.id, event.packet);
    await event.store.commit(p.loaded, p.result, usage);
    expect(
      await event.store.verified(p.result.event.stableEventId),
    ).not.toBeNull();
    const closure = await facility(
      await setup({
        title: '合成天文台 臨時休館',
        kind: '臨時休館',
        status: '臨時休館',
        schedule: '休館期間2026年11月1日から終了未定',
      }),
    );
    const n = await closure.store.preview(
        closure.ctx.candidate.id,
        closure.packet,
      ),
      applied = await closure.store.applyNotice(n.loaded, usage);
    expect(applied.changed).toBe(true);
    expect(applied.notice.period.endDate).toBeNull();
    expect(
      await db
        .prepare(
          "SELECT operating_status FROM facilities WHERE facility_id='fixture-facility'",
        )
        .first('operating_status'),
    ).toBe('closed');
    expect(await event.store.verified(p.result.event.stableEventId)).toBeNull();
    expect(
      await db
        .prepare('SELECT status FROM events WHERE stable_event_id=?1')
        .bind(p.result.event.stableEventId)
        .first('status'),
    ).toBe('scheduled');
    const reviewed = await event.store.preview(
      event.ctx.candidate.id,
      event.packet,
    );
    expect(reviewed.result.impacts[0].cancellationConfirmed).toBe(false);
    expect(reviewed.result.event.verificationStatus).toBe('Review Required');
    await db
      .prepare(
        "UPDATE events SET confirmed_ended_at='2025-01-01T00:00:00.000Z',start_datetime='2024-12-30T00:00:00.000Z',end_datetime='2024-12-31T00:00:00.000Z'",
      )
      .run();
    expect(
      (
        await db
          .prepare(EXPIRED_EVENTS_SQL)
          .bind('2026-01-01T00:00:00.000Z', NOW, 25)
          .all()
      ).results,
    ).toEqual([]);
    const repeat = await closure.store.preview(
      closure.ctx.candidate.id,
      closure.packet,
    );
    expect(
      (await closure.store.applyNotice(repeat.loaded, usage)).changed,
    ).toBe(false);
    expect(
      await db
        .prepare('SELECT COUNT(*) AS n FROM facility_notice_history')
        .first('n'),
    ).toBe(1);
  });
  it('does not mark future closures as closed today and excludes routine weekly notices while retaining exceptional openings', async () => {
    const f = await facility(
      await setup({
        title: '合成館 工事',
        kind: '改修工事',
        status: '改修工事のため休館',
        schedule: '休館期間2026年12月1日〜12月31日',
      }),
    );
    const p = await f.store.preview(f.ctx.candidate.id, f.packet);
    await f.store.applyNotice(p.loaded, usage);
    expect(
      await db
        .prepare(
          "SELECT operating_status FROM facilities WHERE facility_id='fixture-facility'",
        )
        .first('operating_status'),
    ).toBe('unknown');
    const routine = await facility(
        await setup({
          title: '合成館 定休日',
          kind: '通常休館日',
          status: '毎週月曜日休館',
          schedule: '2026年11月23日',
        }),
      ),
      r = await routine.store.preview(routine.ctx.candidate.id, routine.packet);
    expect(
      (await routine.store.applyNotice(r.loaded, usage)).routineExcluded,
    ).toBe(true);
    const special = await facility(
        await setup({
          title: '合成館 特別開館',
          kind: '特別開館',
          status: '毎週月曜日休館ですが特別開館',
          schedule: '2026年11月23日',
        }),
      ),
      s = await special.store.preview(special.ctx.candidate.id, special.packet);
    expect((await special.store.applyNotice(s.loaded, usage)).notice.kind).toBe(
      'special-opening',
    );
  });
  it('does not resolve a closure early for a future reopening, but records confirmed reopening and resolution history', async () => {
    const close = await facility(
        await setup({
          title: '合成館 臨時休館',
          kind: '臨時休館',
          status: '臨時休館',
          schedule: '2026年11月1日から終了未定',
        }),
      ),
      c = await close.store.preview(close.ctx.candidate.id, close.packet),
      closed = await close.store.applyNotice(c.loaded, usage);
    const future = await facility(
      await setup({
        title: '合成館 再開館予定',
        kind: '再開館',
        status: '再開館予定',
        schedule: '2026年11月15日',
      }),
    );
    future.packet.resolvesNoticeIds = [closed.notice.id];
    const fp = await future.store.preview(
      future.ctx.candidate.id,
      future.packet,
    );
    await future.store.applyNotice(fp.loaded, usage);
    expect(
      await db
        .prepare('SELECT resolved_at FROM facility_notices WHERE notice_id=?1')
        .bind(closed.notice.id)
        .first('resolved_at'),
    ).toBeNull();
    const opened = await facility(
      await setup({
        title: '合成館 再開館',
        kind: '再開館',
        status: '工事休館を終了し再開館しました',
        schedule: '2026年11月11日',
      }),
    );
    opened.packet.resolvesNoticeIds = [closed.notice.id];
    const op = await opened.store.preview(
      opened.ctx.candidate.id,
      opened.packet,
    );
    await opened.store.applyNotice(op.loaded, usage);
    expect(
      await db
        .prepare('SELECT resolved_at FROM facility_notices WHERE notice_id=?1')
        .bind(closed.notice.id)
        .first('resolved_at'),
    ).toBe(NOW);
    expect(
      await db
        .prepare(
          "SELECT operating_status FROM facilities WHERE facility_id='fixture-facility'",
        )
        .first('operating_status'),
    ).toBe('open');
    expect(await opened.store.noticeHistory(closed.notice.id)).toHaveLength(2);
  });
  it('commits candidate→Event/evidence/revision atomically and returns a genuinely gated VerifiedEvent', async () => {
    const f = await setup(),
      p = await f.store.preview(f.ctx.candidate.id, f.packet);
    expect(p.result.reasons).toEqual([]);
    expect((await f.store.commit(p.loaded, p.result, usage)).changed).toBe(
      true,
    );
    const read = await f.store.verified(p.result.event.stableEventId);
    expect(read?.verificationStatus).toBe('Verified');
    expect(read?.verification.fingerprint).toBe(f.ctx.candidate.fingerprint);
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM event_changes').first('n'),
    ).toBe(1);
    expect((await f.store.history(f.ctx.candidate.id))[0].generation).toBe(1);
  });
  it('replays the same reviewed decision without writes or duplicate revisions', async () => {
    const f = await setup(),
      p = await f.store.preview(f.ctx.candidate.id, f.packet);
    await f.store.commit(p.loaded, p.result, usage);
    const again = await f.store.preview(f.ctx.candidate.id, f.packet),
      before = f.store.meter.snapshot();
    expect(
      (await f.store.commit(again.loaded, again.result, usage)).changed,
    ).toBe(false);
    expect(f.store.meter.snapshot().rowsWritten - before.rowsWritten).toBe(0);
    expect(
      await db
        .prepare('SELECT COUNT(*) AS n FROM verification_decisions')
        .first('n'),
    ).toBe(1);
  });
  it('blocks stale candidate fingerprints and retained Verified rows when source policy or upstream documents change', async () => {
    const f = await setup(),
      p = await f.store.preview(f.ctx.candidate.id, f.packet);
    await f.store.commit(p.loaded, p.result, usage);
    const id = p.result.event.stableEventId;
    await db
      .prepare('UPDATE collection_documents SET digest=?1')
      .bind('b'.repeat(64))
      .run();
    expect(await f.store.verified(id)).toBeNull();
    await db
      .prepare('UPDATE collection_documents SET digest=?1')
      .bind('a'.repeat(64))
      .run();
    await db.prepare("UPDATE sources SET state='paused'").run();
    expect(await f.store.verified(id)).toBeNull();
    await db.prepare("UPDATE sources SET state='active'").run();
    await db
      .prepare('UPDATE event_candidates SET fingerprint=?1')
      .bind('c'.repeat(64))
      .run();
    expect(await f.store.verified(id)).toBeNull();
  });
  it('refuses a changed candidate at commit without leaving a partial Verified Event or decision', async () => {
    const f = await setup(),
      p = await f.store.preview(f.ctx.candidate.id, f.packet);
    await db
      .prepare('UPDATE event_candidates SET fingerprint=?1')
      .bind('b'.repeat(64))
      .run();
    await expect(f.store.commit(p.loaded, p.result, usage)).rejects.toThrow(
      'write-conflict',
    );
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM events').first('n'),
    ).toBe(0);
    expect(
      await db
        .prepare('SELECT COUNT(*) AS n FROM verification_decisions')
        .first('n'),
    ).toBe(0);
  });
  it('rolls back an injected D1 batch write failure and resumes safely', async () => {
    const f = await setup(),
      p = await f.store.preview(f.ctx.candidate.id, f.packet);
    const failing = {
      prepare: (sql) => db.prepare(sql),
      batch: (statements) =>
        db.batch([
          ...statements,
          db.prepare(
            'INSERT INTO deliberately_missing_verifier_table VALUES(1)',
          ),
        ]),
    };
    const bad = new api.VerificationStore(failing, {
      enabled: true,
      localOnly: true,
      clock: () => Date.parse(NOW),
    });
    await expect(bad.commit(p.loaded, p.result, usage)).rejects.toThrow();
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM events').first('n'),
    ).toBe(0);
    await f.store.commit(p.loaded, p.result, usage);
    expect(await f.store.verified(p.result.event.stableEventId)).not.toBeNull();
  });
  it('serializes competing commits and prevents forged enum-only or edited Event output', async () => {
    const f = await setup(),
      a = await f.store.preview(f.ctx.candidate.id, f.packet),
      b = await f.store.preview(f.ctx.candidate.id, f.packet);
    const results = await Promise.allSettled([
      f.store.commit(a.loaded, a.result, usage),
      f.store.commit(b.loaded, b.result, usage),
    ]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM events').first('n'),
    ).toBe(1);
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM event_changes').first('n'),
    ).toBe(1);
    await db
      .prepare("UPDATE events SET title='edited behind the verifier'")
      .run();
    expect(await f.store.verified(a.result.event.stableEventId)).toBeNull();
  });
  it('keeps feature-OFF and unknown/exhausted budgets fail-closed without writes', async () => {
    const f = await setup(),
      p = await f.store.preview(f.ctx.candidate.id, f.packet);
    const off = new api.VerificationStore(db, { localOnly: true });
    await expect(off.commit(p.loaded, p.result, usage)).rejects.toThrow(
      'feature-disabled',
    );
    expect(await off.verified(p.result.event.stableEventId)).toBeNull();
    await expect(f.store.commit(p.loaded, p.result, null)).rejects.toThrow(
      'budget-exhausted',
    );
    await expect(
      f.store.commit(p.loaded, p.result, { ...usage, writes: 80000 }),
    ).rejects.toThrow('budget-exhausted');
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM events').first('n'),
    ).toBe(0);
  });
});

// Isolated native D1 only. No production fixture import or external request.
describe('DEV04 integration boundaries and local measurements', () => {
  it('rejects an identity switch between preflight and transaction', async () => {
    const f = await setup(),
      p = await f.store.preview(f.ctx.candidate.id, f.packet);
    const switched = {
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
    const store = new api.VerificationStore(switched, {
      enabled: true,
      localOnly: true,
      clock: () => Date.parse(NOW),
    });
    try {
      await expect(store.commit(p.loaded, p.result, usage)).rejects.toThrow(
        'write-conflict',
      );
      expect(
        await db.prepare('SELECT COUNT(*) AS n FROM events').first('n'),
      ).toBe(0);
    } finally {
      await db
        .prepare(
          "UPDATE deployment_identity SET environment='staging',database_name='astro-events-jp-staging'",
        )
        .run();
    }
  });
  it('queues source policy changes and rejects old document observations on re-review', async () => {
    const f = await setup(),
      p = await f.store.preview(f.ctx.candidate.id, f.packet);
    await f.store.commit(p.loaded, p.result, usage);
    expect(await f.store.pending()).toHaveLength(0);
    await db
      .prepare(
        "UPDATE collection_documents SET changed_at='2026-11-12T00:00:01.000Z'",
      )
      .run();
    expect(await f.store.pending()).toHaveLength(1);
    expect(
      (await f.store.preview(f.ctx.candidate.id, f.packet)).result.reasons,
    ).toContain('candidate-not-observed-in-current-document');
    expect(await f.store.verified(p.result.event.stableEventId)).toBeNull();
    await db
      .prepare('UPDATE collection_documents SET changed_at=?1')
      .bind(NOW)
      .run();
    await db.prepare("UPDATE sources SET state='paused'").run();
    expect(await f.store.pending()).toHaveLength(1);
  });
  it('preserves image evidence and availability independently from Event truth', async () => {
    const f = await setup();
    f.ctx.candidate.images = [
      {
        url: 'https://example.jp/poster.png',
        sourceUrl: f.ctx.candidate.officialUrl,
        type: 'poster',
        rightsStatus: 'unknown',
        alt: 'synthetic',
      },
    ];
    await db
      .prepare('UPDATE event_candidates SET payload=?1')
      .bind(JSON.stringify(f.ctx.candidate))
      .run();
    const p = await f.store.preview(f.ctx.candidate.id, f.packet);
    await f.store.commit(p.loaded, p.result, usage);
    const image = await db
      .prepare(
        'SELECT image_rights_status,availability_status FROM event_images',
      )
      .first();
    expect(image).toEqual({
      image_rights_status: 'unknown',
      availability_status: 'unknown',
    });
    expect(await f.store.verified(p.result.event.stableEventId)).not.toBeNull();
  });
  it('keeps bounded cursors over 2000 synthetic candidates and records local D1/elapsed metrics', async () => {
    const f = await setup(),
      start = performance.now();
    const size = async () =>
      (await db.prepare('SELECT 1').run()).meta.size_after;
    const before = await size();
    let seedRowsWritten = 0;
    for (let base = 0; base < 2000; base += 50) {
      const writes = await db.batch(
        Array.from({ length: 50 }, (_, i) => {
          const c = {
            ...f.ctx.candidate,
            id: 'bulk-' + String(base + i).padStart(5, '0'),
          };
          return db
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
            );
        }),
      );
      seedRowsWritten += writes.reduce(
        (sum, r) => sum + r.meta.rows_written,
        0,
      );
    }
    const meter = new api.VerificationStore(db),
      collection = new CollectionStore(meter.db);
    let cursor = '',
      count = 0,
      pages = 0;
    for (;;) {
      const page = await collection.listForVerification(cursor, 50);
      if (!page.length) break;
      expect(page.length).toBeLessThanOrEqual(50);
      pages++;
      for (const row of page) {
        const ctx = { ...f.ctx, candidate: row.candidate };
        const packet = { ...f.packet, candidateId: row.id };
        const validator = new api.CandidateEventValidator(ctx, packet, () =>
          Date.parse(NOW),
        );
        const r = await validator.validate(await api.candidateToEvent(ctx));
        expect(r.event.verificationStatus).toBe('Verified');
        count++;
        cursor = row.id;
      }
    }
    expect(count).toBe(2001);
    expect(pages).toBe(41);
    await expect(collection.listForVerification('', 51)).rejects.toThrow();
    const report = {
      synthetic: true,
      remote: false,
      cloudflareCpuMs: null,
      candidates: count,
      seedRowsWritten,
      pages,
      pageLimit: 50,
      elapsedMs: performance.now() - start,
      d1: meter.meter.snapshot(),
      databaseBytesBefore: before,
      databaseBytesAfter: await size(),
      externalRequests: 0,
    };
    const state = preflight();
    if (state.localDriveVerified)
      writeFileSync(
        state.root + '/reports/dev04-local-benchmark.json',
        JSON.stringify(report, null, 2),
      );
    console.log('DEV04 local benchmark ' + JSON.stringify(report));
  }, 120000);
  it('executes the verifier in the actual isolated workerd runtime without network', async () => {
    const built = await build({
      stdin: {
        contents:
          "import {verificationFixture} from './tests/verification-fixtures'; import {CandidateEventValidator,candidateToEvent} from './src/verification/validator'; export default {async fetch(req){globalThis.fetch=()=>{throw Error('outbound-disabled')};const f=await verificationFixture();const v=new CandidateEventValidator(f.ctx,f.packet,()=>Date.parse(f.ctx.now));const r=await v.validate(await candidateToEvent(f.ctx)); return Response.json({status:r.event.verificationStatus,date:r.event.startDatetime,verified:!!v.verify(r),externalRequests:0,reasons:r.reasons})}}",
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
      const response = await worker.dispatchFetch('http://localhost/fixture');
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload).toMatchObject({
        status: 'Verified',
        verified: true,
        externalRequests: 0,
      });
    } finally {
      await worker.dispose();
    }
  }, 30000);
});

describe('schema compatibility, revisions and facility conflict regression', () => {
  it('keeps old-schema/OFF reads fail-closed without changing the schema2 health marker', async () => {
    const f = await setup();
    await db.prepare('DROP VIEW verification_schema').run();
    try {
      await expect(
        f.store.preview(f.ctx.candidate.id, f.packet),
      ).rejects.toThrow('schema-unavailable');
      expect(await f.store.verified('missing')).toBeNull();
      expect(
        await db
          .prepare('SELECT schema_version FROM deployment_identity')
          .first('schema_version'),
      ).toBe(2);
    } finally {
      await db
        .prepare('CREATE VIEW verification_schema AS SELECT 1 AS version')
        .run();
    }
  });
  it('records a direct official cancellation revision and metered atomic commit without deleting history', async () => {
    const f = await setup(),
      p = await f.store.preview(f.ctx.candidate.id, f.packet);
    await f.store.commit(p.loaded, p.result, usage);
    const c = { ...f.ctx.candidate, fingerprint: 'b'.repeat(64) };
    await db
      .prepare('UPDATE event_candidates SET fingerprint=?1,payload=?2')
      .bind(c.fingerprint, JSON.stringify(c))
      .run();
    const packet = structuredClone(f.packet);
    packet.fingerprint = c.fingerprint;
    packet.documents[0].text = packet.documents[0].text.replace(
      '開催予定',
      '開催中止',
    );
    // SHA256 of the bounded reviewed excerpt; no remote page request.
    packet.documents[0].digest = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(packet.documents[0].text),
        ),
      ),
    )
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    packet.assertions.find((a) => a.field === 'status').quote = '開催中止';
    const next = await f.store.preview(c.id, packet),
      before = f.store.meter.snapshot();
    expect(next.result.event.verificationStatus).toBe('Verified');
    expect(next.result.event.status).toBe('cancelled');
    await f.store.commit(next.loaded, next.result, usage);
    const after = f.store.meter.snapshot();
    expect(after.rowsWritten).toBeGreaterThan(before.rowsWritten);
    const history = await f.store.history(c.id);
    expect(history).toHaveLength(2);
    expect(history[0].fingerprint).not.toBe(history[1].fingerprint);
    expect(
      (await f.store.verified(next.result.event.stableEventId)).verification
        .kind,
    ).toBe('cancellation');
    const state = preflight();
    if (state.localDriveVerified)
      writeFileSync(
        state.root + '/reports/dev04-commit-measurement.json',
        JSON.stringify(
          {
            local: true,
            remote: false,
            synthetic: true,
            cpuTimeMs: null,
            calls: after.calls - before.calls,
            statements: after.statements - before.statements,
            rowsRead: after.rowsRead - before.rowsRead,
            rowsWritten: after.rowsWritten - before.rowsWritten,
          },
          null,
          2,
        ),
      );
    expect(
      (await db.prepare('PRAGMA foreign_key_check').all()).results,
    ).toEqual([]);
    expect(await db.prepare('PRAGMA quick_check').first('quick_check')).toBe(
      'ok',
    );
  });
  it('rejects conflicting facility schedule evidence without any notice or operational writes', async () => {
    const f = await facility(
      await setup({ kind: '臨時休館', status: '臨時休館' }),
    );
    const other = '開催日2026年12月24日';
    f.packet.documents[0].text += '\n' + other;
    f.packet.documents[0].digest = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(f.packet.documents[0].text),
        ),
      ),
    )
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    f.packet.assertions.push({
      field: 'schedule',
      documentId: 'main',
      quote: other,
    });
    const p = await f.store.preview(f.ctx.candidate.id, f.packet);
    expect(p.result.event.verificationStatus).toBe('Review Required');
    await expect(f.store.applyNotice(p.loaded, usage)).rejects.toThrow(
      'invalid-input',
    );
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM facility_notices').first('n'),
    ).toBe(0);
  });
});
