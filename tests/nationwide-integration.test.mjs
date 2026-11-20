import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { preflight } from '../scripts/path-policy.mjs';
import { candidate } from '../src/collection/parse-common';
import { CollectionStore } from '../src/collection/store';
import { localCoverage } from '../src/nationwide/coverage';
import { NationwideScheduler } from '../src/nationwide/scheduler';
import { WeekendStore } from '../src/nationwide/weekend-store';
import {
  approvalFixture,
  context,
  NOW,
  sourceFixture,
  usage,
} from './collection-fixtures';
import { notificationHarness } from './notification-harness.mjs';
import { verificationFixture } from './verification-fixtures';

vi.setConfig({ testTimeout: 30000 });
let h;
beforeAll(async () => {
  h = await notificationHarness();
}, 30000);
afterAll(async () => {
  await h?.mf.dispose();
});
beforeEach(async () => {
  await h.db.batch(
    [
      'weekend_active',
      'weekend_editions',
      'survey_plans',
      'survey_opportunities',
      'collection_jobs',
      'collection_host_gates',
      'vtuber_sources',
      'vtubers',
    ].map((t) => h.db.prepare('DELETE FROM ' + t)),
  );
  await h.db
    .prepare(
      'UPDATE survey_checkpoint SET cursor=0,generation=0,nonce=NULL,last_at=NULL',
    )
    .run();
  await h.reset();
});
const query = (sql, ...v) => h.db.prepare(sql).bind(...v);
const count = (t) => h.db.prepare('SELECT count(*) AS n FROM ' + t).first('n');
const planner = () =>
  new NationwideScheduler(h.db, { localOnly: true, clock: h.options.clock });
const weekendStore = (db = h.db) =>
  new WeekendStore(db, {
    localOnly: true,
    chatId: '10001',
    clock: h.options.clock,
  });

async function register(src, approve = true) {
  await new h.api.D1SourceRegistry(h.db).register(src);
  if (approve)
    await query(
      'INSERT INTO source_approvals VALUES(?,?,?)',
      src.id,
      JSON.stringify(approvalFixture(src)),
      NOW,
    ).run();
}

async function verify(id, day, title, options = {}) {
  const f = await verificationFixture({
    title,
    schedule: options.schedule ?? `開催日2026年11月${day}日`,
    status: options.status ?? '開催予定',
    fee: options.fee ?? null,
    reservation: options.reservation ?? null,
  });
  const col = context();
  col.source = {
    ...col.source,
    id: 'source-' + id,
    category: options.category ?? 'local',
    officialUrl: `https://example.jp/calendar/${id}`,
  };
  col.url = col.source.officialUrl;
  const c = await candidate(col, {
    title,
    url: options.url ?? col.url + '/event',
    description: f.ctx.candidate.description,
  });
  const packet = {
    ...f.packet,
    sourceId: c.sourceId,
    candidateId: c.id,
    fingerprint: c.fingerprint,
  };
  packet.documents[0].url = c.officialUrl;
  await register(col.source);
  await h.db.batch([
    query(
      'INSERT INTO collection_documents(source_id,url,digest,succeeded_at,changed_at,complete) VALUES(?,?,?,?,?,1)',
      c.sourceId,
      c.originalUrl,
      'a'.repeat(64),
      NOW,
      NOW,
    ),
    query(
      'INSERT INTO event_candidates(candidate_id,source_id,official_url,fingerprint,payload,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?)',
      c.id,
      c.sourceId,
      c.officialUrl,
      c.fingerprint,
      JSON.stringify(c),
      NOW,
      NOW,
    ),
  ]);
  const verifier = new h.api.VerificationStore(h.db, {
    localOnly: true,
    enabled: true,
    clock: h.options.clock,
  });
  const prepared = await verifier.preview(c.id, packet);
  await verifier.commit(prepared.loaded, prepared.result, usage);
  return {
    id: prepared.result.event.stableEventId,
    sourceId: c.sourceId,
    candidateId: c.id,
  };
}

it('CAS atomically enqueues and replays a regional plan in the existing Collector ledger', async () => {
  const s = planner(),
    preview = await s.step('regional', usage);
  await register({ ...sourceFixture(), prefecture: preview.slot });
  const pair = await Promise.all([
    s.step('regional', usage, true, 'round-one'),
    planner().step('regional', usage, true, 'round-one'),
  ]);
  expect(pair.some((v) => v.state === 'committed')).toBe(true);
  expect(await count('collection_jobs')).toBe(1);
  expect(
    (await planner().step('regional', usage, true, 'round-one')).state,
  ).toBe('replay');
  const collector = new CollectionStore(h.db);
  const job = await collector.next(NOW);
  const leases = await Promise.all([
    collector.claim(job, NOW),
    collector.claim(job, NOW),
  ]);
  expect(leases.filter(Boolean)).toHaveLength(1);
  expect((await planner().step('regional', usage)).slot).not.toBe(preview.slot);
  expect(
    (await planner().step('regional', null, true, 'free-empty')).reason,
  ).toBe('budget');
  expect(await count('survey_plans')).toBe(1);
  const st = preflight();
  if (st.localDriveVerified)
    writeFileSync(
      st.root + '/reports/dev08-scheduler-meter.json',
      JSON.stringify(
        { synthetic: true, cloudflareCpuTime: null, ...s.meter.snapshot() },
        null,
        2,
      ),
    );
});

it('honours approval state, host backoff and applicant identity without borrowing the regional cursor', async () => {
  const s = planner(),
    key = (await s.step('regional', usage)).slot;
  const review = { ...sourceFixture(), state: 'review', prefecture: key };
  await register(review, false);
  const ignored = await s.step('regional', usage);
  expect(ignored.sourceId).toBeNull();
  const vt = {
    ...sourceFixture(),
    id: 'vt-approved-synthetic',
    officialUrl: 'https://example.jp/vt',
    category: 'vtuber',
  };
  await register(vt);
  expect((await s.step('vtuber', usage)).blocked).toHaveProperty(
    'vtuber-identity-review',
  );
  await h.db.batch([
    h.db.prepare(
      "INSERT INTO vtubers(vtuber_id,name,verification_status,enabled) VALUES('fixture-v-id','合成人物','Verified',1)",
    ),
    query("INSERT INTO vtuber_sources VALUES('fixture-v-id',?)", vt.id),
    h.db.prepare(
      "INSERT INTO collection_host_gates VALUES('example.jp','2026-11-12T01:00:00.000Z')",
    ),
  ]);
  expect((await s.step('vtuber', usage)).blocked).toHaveProperty(
    'host-backoff',
  );
  h.advance(3600000);
  expect((await s.step('vtuber', usage, true, 'vt-only')).sourceId).toBe(vt.id);
  expect((await planner().step('regional', usage)).slot).toBe(key);
});

it('reports official identity, format, review and actual collection outcomes separately', async () => {
  await register(
    {
      ...sourceFixture(),
      state: 'unsupported',
      municipality: '柏崎市',
      prefecture: 15,
    },
    false,
  );
  const report = await localCoverage(h.db, 15, '', Date.parse(NOW));
  expect(report.rows[0]).toMatchObject({
    officialStatus: 'Verified',
    registryState: 'unsupported',
    configuredFormat: 'html',
    approvalReviewedAt: null,
    lastSuccess: null,
    currentVerified: 0,
    municipalityKey: '15:柏崎市',
  });
});

it('includes exact weekend dates and overlapping periods, excludes cancellations, and keeps distinct sessions', async () => {
  const first = await verify('sat', 14, '月面観察会');
  const second = await verify('sun', 15, '木星観察教室', {
    schedule: '開催日2026年11月15日 18:30',
  });
  const period = await verify('period', 13, '宇宙写真展示', {
    schedule: '開催期間2026年11月13日〜2026年11月15日',
  });
  const cancelled = await verify('cancelled', 14, '公式中止回', {
    status: '開催中止が決定しました',
  });
  const delayed = await verify('delayed', 15, '公式延期回', {
    status: '開催を延期します',
  });
  const p = await weekendStore().preview(0, 'nationwide', usage);
  const members = p.parts.flatMap((x) => x.members);
  expect(members.map((x) => x.eventId)).toEqual(
    expect.arrayContaining([first.id, second.id, period.id]),
  );
  expect(members.map((x) => x.eventId)).not.toContain(cancelled.id);
  expect(members.map((x) => x.eventId)).not.toContain(delayed.id);
  expect(members.find((x) => x.eventId === first.id)).toMatchObject({
    days: '土',
    date: '2026年11月14日',
  });
  expect(members.find((x) => x.eventId === second.id)).toMatchObject({
    days: '日',
    date: '2026年11月15日 18:30',
  });
  expect(members.find((x) => x.eventId === period.id)).toMatchObject({
    days: '土日',
    duration: true,
  });
  expect((await weekendStore().preview(1, 'nationwide', usage)).parts).toEqual(
    [],
  );
});
it('keeps two verified time slots with the same title and official page', async () => {
  const url = 'https://example.jp/official/two-sessions';
  const a = await verify('am-slot', 14, '合成月面観察会', {
    url,
    schedule: '開催日2026年11月14日 09:30',
  });
  const b = await verify('pm-slot', 14, '合成月面観察会', {
    url,
    schedule: '開催日2026年11月14日 15:30',
  });
  const plan = await weekendStore().preview(0, 'nationwide', usage);
  const all = plan.parts.flatMap((p) => p.members);
  expect(all.map((m) => m.eventId)).toEqual(
    expect.arrayContaining([a.id, b.id]),
  );
  expect(all.map((m) => m.date)).toEqual(
    expect.arrayContaining(['2026年11月14日 09:30', '2026年11月14日 15:30']),
  );
});

it('preserves Telegram A, tracks each part independently, blocks uncertain replays, and reuses Issue references', async () => {
  const f = await verify(
    'night',
    14,
    '大型望遠鏡の観測会 あいうえおあいうえおあいうえお',
    { fee: '参加費500円', reservation: '要事前予約' },
  );
  await verify(
    'next',
    15,
    '合成宇宙科学特別観察ツアー あいうえおあいうえおあいうえお',
    { fee: '参加費900円', reservation: '要事前予約' },
  );
  const s = weekendStore(),
    preview = await s.preview(0, 'nationwide', usage);
  expect(preview.parts).toHaveLength(2);
  const marker = 'synthetic-weekend-link';
  await query(
    "INSERT INTO notification_issue_links VALUES(?,'Raccoon26/Astro-Events-JP-Reports',401,?,'simulation',?)",
    f.id,
    marker,
    NOW,
  ).run();
  expect((await s.preview(0, 'nationwide', usage)).issues).toEqual([
    expect.objectContaining({ event_id: f.id, issue_number: 401 }),
  ]);
  const { editionId } = await s.enqueue(0, 'nationwide', preview.digest, usage);
  expect(
    (await s.enqueue(0, 'nationwide', preview.digest, usage)).created,
  ).toBe(false);
  const other = await s.preview(0, 'local', usage);
  await expect(s.enqueue(0, 'local', other.digest, usage)).rejects.toThrow(
    'WEEKEND_OVERLAP_OR_FROZEN',
  );
  const rows = await s.list(editionId),
    wire = new h.api.FakeNotificationWire();
  expect((await s.dispatch(rows[0].part_id, wire, usage)).state).toBe('sent');
  wire.faults.push(() => {
    throw Error('simulated response loss');
  });
  expect((await s.dispatch(rows[1].part_id, wire, usage)).state).toBe(
    'uncertain',
  );
  expect((await s.dispatch(rows[0].part_id, wire, usage)).state).toBe(
    'unchanged',
  );
  expect((await s.dispatch(rows[1].part_id, wire, usage)).state).toBe(
    'unchanged',
  );
  expect(wire.requests).toHaveLength(2);
  expect(wire.requests[0].payload.text).toBe(preview.parts[0].body);
  expect(wire.requests.every((r) => r.provider === 'telegram')).toBe(true);
  expect(wire.issues.size).toBe(0);
  const st = preflight();
  if (st.localDriveVerified)
    writeFileSync(
      st.root + '/reports/dev08-weekend-meter.json',
      JSON.stringify(
        {
          synthetic: true,
          cloudflareCpuTime: null,
          externalRequests: 0,
          parts: preview.parts.length,
          ...s.meter.snapshot(),
        },
        null,
        2,
      ),
    );
});

it('blocks a revoked approval or modified revision after enqueue and allows no provider call', async () => {
  const f = await verify('stale', 14, '合成観測講座');
  const s = weekendStore(),
    p = await s.preview(0, 'nationwide', usage);
  const e = await s.enqueue(0, 'nationwide', p.digest, usage);
  await query(
    'UPDATE events SET revision=revision+1 WHERE stable_event_id=?',
    f.id,
  ).run();
  await query(
    'DELETE FROM source_approvals WHERE source_id=?',
    f.sourceId,
  ).run();
  const wire = new h.api.FakeNotificationWire();
  expect(
    (await s.dispatch((await s.list(e.editionId))[0].part_id, wire, usage))
      .state,
  ).toBe('stale');
  expect(wire.requests).toHaveLength(0);
});

it('rolls back the weekend snapshot on a failed batch and resumes without leaving partial membership', async () => {
  await verify('atomic', 14, '合成観測の手引き');
  const wrapped = {
    prepare: (sql) => h.db.prepare(sql),
    batch: (stmts) =>
      stmts.length > 2
        ? h.db.batch([
            ...stmts,
            h.db.prepare('INSERT INTO dev08_missing_table VALUES(1)'),
          ])
        : h.db.batch(stmts),
  };
  const saved = weekendStore(),
    p = await saved.preview(0, 'nationwide', usage);
  await expect(
    weekendStore(wrapped).enqueue(0, 'nationwide', p.digest, usage),
  ).rejects.toThrow();
  expect(await count('weekend_members')).toBe(0);
  expect(await count('weekend_editions')).toBe(0);
  expect((await saved.enqueue(0, 'nationwide', p.digest, usage)).created).toBe(
    true,
  );
});
