import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { preflight } from '../scripts/path-policy.mjs';
import { Operations } from '../src/operations/engine';
import { operationsPipeline } from '../src/operations/pipeline';
import { iso, PHASES, ZERO } from '../src/operations/policy';
import { dailyReport, errorPreview } from '../src/operations/report';
import { Retention } from '../src/operations/retention';
import {
  approvalFixture,
  fixtureTransport,
  NOW,
  sourceFixture,
} from './collection-fixtures';
import { notificationHarness } from './notification-harness.mjs';

vi.setConfig({ testTimeout: 30000 });
const start = Date.parse(NOW);
let h, now;
const sql = (s, ...params) => h.db.prepare(s).bind(...params);
const size = (t) => h.db.prepare('SELECT count(*) AS n FROM ' + t).first('n');
const snapshot = (overrides = {}) => ({
  ...ZERO,
  checkedAt: iso(now),
  plan: 'free',
  provenance: 'fixture',
  cronTriggers: 1,
  cpuP99Ms: 3,
  projectDatabaseBytes: 0,
  telemetryUnit: iso(now) < '2026-12-01' ? 'records' : 'bytes',
  ...overrides,
});
const generic = (step, elapsed) =>
  new Operations(h.db, step, () => now, elapsed);
const noop = async (_, cp) => cp;
beforeAll(async () => {
  h = await notificationHarness();
}, 30000);
afterAll(async () => h?.mf.dispose());
beforeEach(async () => {
  now = start;
  await h.db.batch(
    [
      'ops_daily_reports',
      'ops_region_results',
      'ops_post_intents',
      'ops_jobs',
      'ops_checkpoints',
      'ops_budget_day',
      'ops_account_observations',
      'ops_retention_receipts',
      'ops_event_tombstones',
      'ops_warnings',
      'weekend_active',
      'weekend_editions',
      'survey_plans',
      'survey_opportunities',
      'collection_jobs',
      'collection_host_gates',
      'crawl_runs',
      'vtuber_sources',
      'vtubers',
      'facility_sources',
      'facility_notices',
    ].map((t) => h.db.prepare('DELETE FROM ' + t)),
  );
  await sql(
    'UPDATE survey_checkpoint SET cursor=0,generation=0,nonce=NULL,last_at=NULL',
  ).run();
  await sql('UPDATE ops_lease SET epoch=0').run();
  await h.reset();
  await sql('DELETE FROM facilities').run();
});
async function source(s = sourceFixture()) {
  await new h.api.D1SourceRegistry(h.db).register(s);
  await sql(
    'INSERT INTO source_approvals VALUES(?,?,?)',
    s.id,
    JSON.stringify(approvalFixture(s)),
    NOW,
  ).run();
  return s;
}
async function only(phase, engine = generic(noop)) {
  await sql('DELETE FROM ops_jobs').run();
  await sql(
    "INSERT INTO ops_jobs(id,slot,phase,state,due_at) VALUES(?,?,?,'pending',?)",
    phase,
    iso(now),
    phase,
    iso(now),
  ).run();
  return engine.advance(snapshot());
}

it('schedules a JST day once across concurrent Cron and advances only one independent phase', async () => {
  now = start + 15 * 3600000;
  const calls = [];
  const engine = generic(async (p, cp) => {
    calls.push(p);
    return cp;
  });
  const attempts = await Promise.all([
    engine.tick(now, snapshot()),
    engine.tick(now, snapshot()),
  ]);
  expect(attempts.filter((x) => x.state === 'scheduled')).toHaveLength(1);
  expect(await size('ops_jobs')).toBe(PHASES.length);
  expect(await engine.tick(now, snapshot())).toMatchObject({
    state: 'duplicate',
  });
  await Promise.all([
    engine.advance(snapshot()),
    generic(async (p, cp) => {
      calls.push(p);
      return cp;
    }).advance(snapshot()),
  ]);
  expect(calls).toEqual(['recover']);
  expect(await size('ops_checkpoints')).toBe(1);
  expect(await size('ops_account_observations')).toBe(1);
  if (preflight().localDriveVerified)
    writeFileSync(
      '../reports/dev09-operations-meter.json',
      JSON.stringify(
        {
          synthetic: true,
          actualCloudflareCpu: null,
          ...engine.meter.snapshot(),
        },
        null,
        2,
      ),
    );
});

it('recovers an interrupted generation; a late owner cannot advance the cursor', async () => {
  const engine = generic(noop);
  await engine.tick(now, snapshot());
  await sql(
    "UPDATE ops_jobs SET state='running',attempts=1,generation=1,owner='lost',lease_until=? WHERE phase='recover'",
    iso(now - 1),
  ).run();
  expect(await engine.advance(snapshot())).toMatchObject({
    state: 'recovered',
    code: 'lease-expired',
  });
  await sql(
    "INSERT INTO ops_checkpoints VALUES('recover','<corrupt>','previous',1,?)",
    iso(now),
  ).run();
  const replacement = generic(async (_, cp) => {
    expect(cp.cursor).toBe('');
    return { cursor: 'cursor-resumed' };
  });
  expect(await replacement.advance(snapshot())).toMatchObject({
    state: 'done',
    phase: 'recover',
  });
  expect(
    await sql(
      "SELECT generation,owner,error FROM ops_jobs WHERE phase='recover'",
    ).first(),
  ).toEqual({ generation: 2, owner: null, error: 'cursor-reset' });
  expect(
    await sql("SELECT cursor FROM ops_checkpoints WHERE phase='recover'").first(
      'cursor',
    ),
  ).toBe('cursor-resumed');
});

it('isolates checkpointer errors and respects delayed retry before re-entering the failed phase', async () => {
  const step = vi.fn(async (_p, cp) => {
    if (step.mock.calls.length === 1) throw Error('unsafe detail\nfixture-key');
    return { ...cp, cursor: 'safe' };
  });
  const engine = generic(step);
  expect(await only('regional', engine)).toMatchObject({
    state: 'retry',
    code: 'stage-error',
  });
  expect(await engine.advance(snapshot())).toMatchObject({ state: 'idle' });
  expect(await size('ops_checkpoints')).toBe(0);
  now += 60000;
  expect(await engine.advance(snapshot())).toMatchObject({ state: 'done' });
  expect(await sql('SELECT cursor FROM ops_checkpoints').first('cursor')).toBe(
    'safe',
  );
  expect(
    JSON.stringify(await sql('SELECT * FROM ops_jobs').all()),
  ).not.toContain('fixture-key');
});

it('does not schedule with unknown usage or claim when CPU or wall admission refuses', async () => {
  let probes = 0;
  const engine = generic(noop, () => ++probes * 2000);
  expect(await engine.tick(now, null)).toMatchObject({
    state: 'deferred',
    code: 'metrics-unavailable',
  });
  expect(await size('ops_jobs')).toBe(0);
  await engine.tick(now, snapshot());
  expect(await engine.advance(snapshot({ cpuP99Ms: 10 }))).toMatchObject({
    state: 'deferred',
    code: 'cpu-budget',
  });
  expect(await engine.advance(snapshot())).toMatchObject({
    state: 'deferred',
    code: 'wall-admission',
  });
  expect(await size('ops_checkpoints')).toBe(0);
});

it('backs off on provider 429, preserves the approved plan and blocks a revoked source before a later fetch', async () => {
  const s = await source({ ...sourceFixture(), category: 'astronomy' }),
    called = [];
  const engine = operationsPipeline(h.db, {
    clock: () => now,
    fixtureTransport: fixtureTransport(
      () =>
        new Response(null, { status: 429, headers: { 'retry-after': '3600' } }),
      called,
    ),
  });
  expect(await only('category', engine)).toMatchObject({ state: 'done' });
  expect(await size('collection_jobs')).toBe(1);
  await only('collect', engine);
  expect(called).toHaveLength(1);
  expect(
    Date.parse(
      await sql('SELECT retry_at FROM collection_jobs').first('retry_at'),
    ),
  ).toBeGreaterThanOrEqual(now + 3600000);
  await only('collect', engine);
  expect(called).toHaveLength(1);
  now += 7200000;
  await sql("UPDATE sources SET state='paused' WHERE source_id=?", s.id).run();
  await only('collect', engine);
  expect(called).toHaveLength(1);
});

it('recovers provider-started Telegram and preserves uncertain state without any send', async () => {
  const f = await h.seed();
  await h.enqueue(f);
  const row = (await h.rows()).find((r) => r.part === 'copy');
  await sql(
    "UPDATE notification_deliveries SET state='sending',started_at=?,lease_until=?,lease_owner='old' WHERE delivery_id=?",
    iso(now - 1000),
    iso(now - 1),
    row.delivery_id,
  ).run();
  const engine = operationsPipeline(h.db, { clock: () => now });
  expect(await only('recover', engine)).toMatchObject({ state: 'done' });
  expect(
    await sql(
      'SELECT state FROM notification_deliveries WHERE delivery_id=?',
      row.delivery_id,
    ).first('state'),
  ).toBe('uncertain');
  expect(await only('recover', engine)).toMatchObject({ state: 'done' });
  expect(
    await sql(
      'SELECT state FROM notification_deliveries WHERE delivery_id=?',
      row.delivery_id,
    ).first('state'),
  ).toBe('uncertain');
});

it('uses verified event version for tracking, Japanese post, and idempotent simulation Outbox', async () => {
  const f = await h.seed();
  const engine = operationsPipeline(h.db, { clock: () => now });
  for (const phase of ['track', 'posts', 'outbox', 'outbox', 'outbox'])
    await only(phase, engine);
  expect(await size('generated_posts')).toBe(1);
  expect(await size('notification_groups')).toBe(1);
  const rows = await h.rows();
  expect(rows.some((r) => r.part === 'issue')).toBe(true);
  expect(rows.every((r) => r.state === 'pending')).toBe(true);
  await sql(
    "UPDATE ops_post_intents SET state='prepared',part_cursor=0 WHERE event_id=?",
    f.eventId,
  ).run();
  await sql('DELETE FROM source_approvals').run();
  expect(await only('outbox', engine)).toMatchObject({
    state: 'done',
    code: 'stale-intent',
  });
  expect(await h.rows()).toEqual(rows);
});

async function event(id, s, end, endedAt = end, facilityId = null) {
  await sql(
    `INSERT INTO events(stable_event_id,source_id,title,category,official_url,
    start_datetime,end_datetime,confirmed_ended_at,status,verification_status,first_seen_at,facility_id)
    VALUES(?,?,?,'local','https://example.jp/event','2000-01-01T00:00:00.000Z',?,?,'ended','Verified',?,?)`,
    id,
    s.id,
    id,
    end,
    endedAt,
    end,
    facilityId,
  ).run();
}
it('enforces 90-day details, 2-year fingerprints and 30-day logs; leaves future, open facility and uncertain links', async () => {
  const s = await source(),
    old = '2026-01-01T00:00:00.000Z';
  await sql(
    "INSERT INTO facilities(facility_id,facility_name,prefecture,official_url) VALUES('facility','Fixture',1,'https://example.jp/f')",
  ).run();
  await event('eligible', s, old);
  await event('future', s, '2026-12-01T00:00:00.000Z', old);
  await event('recent', s, '2026-11-01T00:00:00.000Z');
  await event('closed', s, old, old, 'facility');
  await event('sent-unknown', s, old);
  await sql(
    "INSERT INTO facility_notices(notice_id,facility_id,kind,source_url) VALUES('open','facility','closure','https://example.jp/f')",
  ).run();
  await sql(
    `INSERT INTO notification_deliveries(delivery_id,idempotency_key,event_id,channel,revision,message_part,state,expires_at)
     VALUES('receipt','receipt','sent-unknown','telegram',1,'post','uncertain',?)`,
    old,
  ).run();
  for (const [id, posted] of [
    ['fingerprint-young', '2026-01-01T00:00:00.000Z'],
    ['fingerprint-old', '2020-01-01T00:00:00.000Z'],
  ])
    await sql(
      "INSERT INTO posted_fingerprints(fingerprint,stable_event_id,revision,kind,posted_at,expires_at) VALUES(?, 'retired',1,'observation',?,?)",
      id,
      posted,
      old,
    ).run();
  await sql(
    "INSERT INTO crawl_runs(run_id,started_at,finished_at,state) VALUES('old',?,?,'completed'),('unfinished',?,NULL,'running')",
    old,
    old,
    old,
  ).run();
  const retention = new Retention(h.db);
  for (const [family, id] of [
    ['event', 'eligible'],
    ['fingerprint', 'fingerprint-old'],
    ['crawl', 'old'],
  ]) {
    const plan = await retention.preview(family, now);
    expect(plan.entries.map((x) => x.id)).toEqual([id]);
    expect(await retention.apply(family, now, plan.digest)).toBe(1);
  }
  expect(await size('events')).toBe(4);
  expect(await size('posted_fingerprints')).toBe(1);
  expect(await size('crawl_runs')).toBe(1);
  expect(await size('facilities')).toBe(1);
  expect(await size('ops_event_tombstones')).toBe(1);
  expect((await sql('PRAGMA foreign_key_check').all()).results).toEqual([]);
  expect(await sql('PRAGMA quick_check').first('quick_check')).toBe('ok');
});

it('bounds cleanup and rejects plans invalidated by a revision change or batch rollback', async () => {
  const s = await source(),
    old = '2026-01-01T00:00:00.000Z';
  for (let i = 0; i < 12; i++)
    await event('event-' + String(i).padStart(2, '0'), s, old);
  const retention = new Retention(h.db);
  const plan = await retention.preview('event', now);
  expect(plan.entries).toHaveLength(8);
  await sql(
    "UPDATE events SET revision=2 WHERE stable_event_id='event-00'",
  ).run();
  await expect(retention.apply('event', now, plan.digest)).rejects.toThrow(
    'OPS_RETENTION_STALE',
  );
  const amended = await retention.preview('event', now);
  const failMidway = new Retention({
    prepare: h.db.prepare.bind(h.db),
    batch: (items) =>
      h.db.batch([
        ...items.slice(0, 3),
        sql(
          'INSERT INTO ops_retention_receipts VALUES(NULL,NULL,NULL,NULL,NULL)',
        ),
        ...items.slice(3),
      ]),
  });
  await expect(
    failMidway.apply('event', now, amended.digest),
  ).rejects.toThrow();
  expect(await size('events')).toBe(12);
  expect(await size('ops_retention_receipts')).toBe(0);
  expect(await retention.apply('event', now, amended.digest)).toBe(8);
  expect(await size('events')).toBe(4);
});

it('reports all areas and recoverable status from D1 with no log input or API send', async () => {
  const report = await dailyReport(h.db, iso(now - 86400000), iso(now), null);
  expect(report.regions).toHaveLength(47);
  expect(report.longestKnownWaitHours).toBeNull();
  expect(report.account).toBeNull();
  expect(errorPreview(report)).toMatchObject({
    send: false,
    idempotencyKey: 'operations-daily:' + iso(now),
  });
});
