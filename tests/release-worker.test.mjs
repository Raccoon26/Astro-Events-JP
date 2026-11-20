import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { expect, it } from 'vitest';
import { preflight } from '../scripts/path-policy.mjs';
import { nativeTwitterAliases } from '../scripts/post-bundle-policy.mjs';
import { CollectionStore } from '../src/collection/store';
import { FakeNotificationWire } from '../src/notifications/fake';
import { NotificationStore } from '../src/notifications/store';
import { ZERO } from '../src/operations/policy';
import { Retention } from '../src/operations/retention';
import { PostStore } from '../src/posts/store';
import { D1SourceRegistry } from '../src/registry';
import { VerificationStore } from '../src/verification/store';
import { approvalFixture, sourceFixture, usage } from './collection-fixtures';
import { verificationFixture } from './verification-fixtures';

const NOW = Date.parse('2026-11-20T12:00:00.000Z'),
  hop = 10800000;
const cron = '0 */3 * * *';
const iso = (n) => new Date(n).toISOString();
const page =
  '<html><body><ul><li><h2><a href="/events/synthetic">合成観望会</a></h2><time>2026年11月22日</time><p>北海道合成町 合成天文台</p></li></ul></body></html>';
async function harness() {
  const built = await build({
    entryPoints: ['src/release/worker.ts'],
    write: false,
    bundle: true,
    platform: 'browser',
    format: 'esm',
    alias: nativeTwitterAliases(),
    external: ['cloudflare:workers'],
  });
  const w = (name, clock, overrides = {}) => ({
    name,
    modules: true,
    compatibilityDate: '2026-11-11',
    script: built.outputFiles[0].text,
    d1Databases: { RELEASE_JOB_DB: 'release-10-test-only' },
    bindings: {
      RELEASE_MODE: 'rehearsal',
      RELEASE_ENV: 'staging',
      COLLECTION_ENABLED: 'false',
      NOTIFICATIONS_ENABLED: 'false',
      RELEASE_FIXTURE_CLOCK: iso(clock),
      RELEASE_FIXTURE_PAGES: JSON.stringify({
        'https://example.jp/events': page,
      }),
      RELEASE_EVIDENCE: JSON.stringify({
        ...ZERO,
        plan: 'free',
        provenance: 'fixture',
        projectDatabaseBytes: 0,
        checkedAt: iso(clock),
        cpuP99Ms: 3,
        cronTriggers: 0,
        telemetryUnit: 'records',
      }),
      ...overrides,
    },
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      host: '127.0.0.1',
      port: 0,
      workers: [
        ...Array.from({ length: 6 }, (_, i) => w('slot' + i, NOW + hop * i)),
        w('disabled', NOW, { RELEASE_MODE: 'off' }),
        w('wrong-environment', NOW, { RELEASE_ENV: 'production' }),
        w('missing-budget', NOW, { RELEASE_EVIDENCE: '' }),
        w('live', NOW, { RELEASE_MODE: 'live' }),
        w('unapproved-auth', NOW, { RELEASE_MODE: 'reports-preflight' }),
      ],
    }),
  );
  const db = await mf.getD1Database('RELEASE_JOB_DB', 'slot0');
  const sql = (statement, ...params) => db.prepare(statement).bind(...params);
  const migrate = async (max = 12) => {
    for (const name of readdirSync('migrations')
      .filter((f) => f.endsWith('.sql') && Number(f.slice(0, 4)) <= max)
      .sort()) {
      const queries = readFileSync('migrations/' + name, 'utf8')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      await db.batch(queries.map((s) => db.prepare(s)));
    }
    await sql(
      "INSERT INTO deployment_identity VALUES(1,'staging','astro-events-jp-staging',2,?)",
      iso(NOW),
    ).run();
  };
  return { mf, db, sql, migrate, worker: (name) => mf.getWorker(name) };
}

it('fences off, missing or stale schema, hostile mode, production and missing budget in actual workerd', async () => {
  const h = await harness();
  try {
    await h.migrate(4);
    expect(await (await h.worker('disabled')).step()).toMatchObject({
      code: 'mode',
    });
    expect(await (await h.worker('wrong-environment')).step()).toMatchObject({
      code: 'environment',
    });
    expect(await (await h.worker('live')).step()).toMatchObject({
      code: 'mode',
    });
    expect(
      await (await h.worker('unapproved-auth')).verifyReportsAccess(),
    ).toMatchObject({ code: 'authorization' });
    const target = await h.worker('slot0');
    expect(await target.schedule(cron, NOW)).toMatchObject({ code: 'schema' });
    expect(
      (
        await target.fetch('https://ops.example/fixture/step', {
          method: 'POST',
        })
      ).status,
    ).toBe(404);
    expect(
      await h
        .sql("SELECT count(*) AS n FROM sqlite_master WHERE name='ops_jobs'")
        .first('n'),
    ).toBe(0);
  } finally {
    await h.mf.dispose();
  }
}, 60000);

it('rehearses Registry through publication and recovery while keeping Site, Reports and Telegram offline', async () => {
  const h = await harness();
  try {
    const q = h.sql;
    await h.migrate();
    const s = {
      ...sourceFixture(),
      category: 'astronomy',
      state: 'review',
      nextCrawlAt: iso(NOW),
    };
    const blocked = {
      ...s,
      id: 'unapproved-source',
      officialUrl: 'https://example.jp/unapproved',
    };
    const registry = new D1SourceRegistry(h.db);
    await registry.register(s);
    await registry.register(blocked);
    const a = approvalFixture(s);
    await new CollectionStore(h.db).approve(
      s,
      {
        ...a,
        reviewedAt: iso(NOW),
        expiresAt: iso(NOW + 6 * 86400000),
        testEvidence: { ...a.testEvidence, checkedAt: iso(NOW) },
      },
      iso(NOW),
    );
    const first = await h.worker('slot0');
    expect(await first.step()).toMatchObject({ code: 'isolation' });
    await q(
      "INSERT INTO release_isolation(singleton,purpose,schema_version) VALUES(1,'synthetic-rehearsal',1)",
    ).run();
    expect(await (await h.worker('missing-budget')).step()).toMatchObject({
      code: 'budget',
    });
    const metrics = [];
    const drain = async (i) => {
      const worker = await h.worker('slot' + i),
        clock = NOW + i * hop;
      await worker.scheduled({ cron, scheduledTime: new Date(clock) });
      expect(await worker.schedule(cron, clock)).toMatchObject({
        result: { state: 'duplicate' },
      });
      for (let n = 0; n < 24; n++) {
        const before = performance.now(),
          r = await worker.step();
        expect(r.state).toBe('rehearsal');
        metrics.push({
          slot: i,
          phase: r.result.phase ?? null,
          state: r.result.state,
          ms: performance.now() - before,
          ...r.meter,
        });
        if (r.result.state === 'idle') break;
        if (n === 23) throw Error('Rehearsal exhausted bounded steps');
      }
    };
    await drain(0);
    expect(
      await q(
        'SELECT state FROM collection_jobs WHERE source_id=?',
        s.id,
      ).first('state'),
    ).toBe('parsed');
    expect(
      await q(
        'SELECT count(*) AS n FROM collection_jobs WHERE source_id=?',
        blocked.id,
      ).first('n'),
    ).toBe(0);
    expect(
      await q(
        "SELECT count(*) AS n FROM survey_opportunities WHERE lane='vtuber'",
      ).first('n'),
    ).toBe(1);
    await drain(1);
    const found = await q(
      'SELECT * FROM event_candidates WHERE source_id=?',
      s.id,
    ).first();
    expect(found).toMatchObject({
      review_status: 'Review Required',
      official_url: 'https://example.jp/events/synthetic',
    });
    const reviewedAt = iso(NOW + hop);
    const f = await verificationFixture({
      schedule: '開催日2026年11月22日 13:30〜15:00',
      applicationDeadline: '申込締切2026年11月21日 18:00',
      reservation: '要事前予約。申込受付中',
    });
    const packet = {
      ...f.packet,
      sourceId: s.id,
      candidateId: found.candidate_id,
      fingerprint: found.fingerprint,
      reviewedAt,
      documents: f.packet.documents.map((d) => ({
        ...d,
        url: found.official_url,
        checkedAt: reviewedAt,
      })),
    };
    const verify = new VerificationStore(h.db, {
      localOnly: true,
      enabled: true,
      clock: () => NOW + hop,
    });
    const proof = await verify.preview(found.candidate_id, packet);
    expect(proof.result.event.verificationStatus).toBe('Verified');
    await verify.commit(proof.loaded, proof.result, usage);
    const eventId = proof.result.event.stableEventId;
    expect(
      await q(
        'SELECT event_id FROM event_identity_observations WHERE candidate_id=?',
        found.candidate_id,
      ).first('event_id'),
    ).toBe(eventId);
    await drain(2);
    await q(
      `UPDATE weekend_outbox SET state='sending',provider_started=1,owner='expired-rehearsal-owner',lease_until=?
      WHERE state='pending'`,
      iso(NOW + hop * 2 - 1),
    ).run();
    await drain(3);
    await drain(4);
    await drain(5);
    expect(
      await q(
        'SELECT count(*) AS n FROM weekend_members WHERE event_id=?',
        eventId,
      ).first('n'),
    ).toBe(1);
    expect(
      await q('SELECT state FROM weekend_outbox LIMIT 1').first('state'),
    ).toBe('uncertain');
    expect(
      await q(
        "SELECT count(*) AS n FROM generated_posts WHERE event_id=? AND kind='deadline'",
        eventId,
      ).first('n'),
    ).toBe(1);
    let checkAt = NOW + hop * 5;
    const post = await q(
      "SELECT post_id,text,weighted_length FROM generated_posts WHERE event_id=? AND kind='observation'",
      eventId,
    ).first();
    expect(post.text).toContain('2026年11月22日 13:30〜15:00');
    expect(post.text).toContain('参加費 500円');
    expect(post.weighted_length).toBeLessThanOrEqual(280);
    const notice = new NotificationStore(h.db, {
      enabled: true,
      localOnly: true,
      mode: 'simulation',
      chatId: '10001',
      userIds: ['10001'],
      clock: () => checkAt,
    });
    const plan = await notice.preview(post.post_id);
    await expect(
      notice.enqueue(post.post_id, usage, {
        sourceId: s.id,
        fingerprint: found.fingerprint,
        revision: plan.delivery.metadata.eventRevision,
        decisionId: 'different-decision',
      }),
    ).rejects.toThrow('EXPECTED_VERSION_MISMATCH');
    const rows = (
      await q(
        `SELECT d.delivery_id,d.channel,d.message_part,c.payload,c.part_index FROM notification_deliveries d
      JOIN notification_context c ON c.delivery_id=d.delivery_id WHERE c.group_id=? ORDER BY c.part_index`,
        plan.groupId,
      ).all()
    ).results;
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(
      JSON.parse(rows.find((r) => r.message_part === 'post').payload).text,
    ).toBe(post.text);
    const provider = new FakeNotificationWire();
    for (const row of rows) {
      const claim = await notice.claim(row.delivery_id, usage);
      expect(claim).not.toBeNull();
      await notice.dispatch(row.delivery_id, claim.owner, provider, usage);
      expect(
        await q(
          'SELECT state FROM notification_deliveries WHERE delivery_id=?',
          row.delivery_id,
        ).first('state'),
      ).toBe('sent');
      checkAt += 3000;
    }
    expect(provider.issues.size).toBe(1);
    const issueLink = await q(
      'SELECT issue_number FROM notification_issue_links WHERE event_id=?',
      eventId,
    ).first();
    expect(provider.issues.has(issueLink.issue_number)).toBe(true);
    const admin = rows
      .filter(
        (r) => r.channel === 'telegram' && r.message_part === 'management',
      )
      .find((r) => JSON.parse(r.payload).reply_markup);
    const controls = JSON.parse(
      admin.payload,
    ).reply_markup.inline_keyboard.flat();
    const messageId = await q(
      'SELECT external_id FROM notification_deliveries WHERE delivery_id=?',
      admin.delivery_id,
    ).first('external_id');
    const who = {
      chatId: '10001',
      userId: '10001',
      messageId,
      updateId: '90001',
    };
    await expect(
      notice.callback(
        controls[0].callback_data,
        'posted',
        { ...who, userId: '99999' },
        usage,
      ),
    ).rejects.toThrow('CALLBACK_UNAUTHORIZED');
    expect(
      await notice.callback(controls[0].callback_data, 'posted', who, usage),
    ).toMatchObject({ status: 'posted' });
    expect(
      await notice.callback(controls[0].callback_data, 'posted', who, usage),
    ).toMatchObject({ idempotent: true });
    await q('DELETE FROM source_approvals WHERE source_id=?', s.id).run();
    const posts = new PostStore(h.db, {
      enabled: true,
      localOnly: true,
      clock: () => checkAt,
    });
    expect(await posts.current(post.post_id)).toBeNull();
    await expect(
      notice.callback(
        controls[1].callback_data,
        'held',
        { ...who, updateId: '90002' },
        usage,
      ),
    ).rejects.toThrow();
    const retention = new Retention(h.db),
      expiry = checkAt + 120 * 86400000;
    expect((await retention.preview('event', expiry)).entries).toEqual([]);
    expect((await q('PRAGMA foreign_key_check').all()).results).toEqual([]);
    expect(await q('PRAGMA quick_check').first('quick_check')).toBe('ok');
    expect(Math.max(...metrics.map((m) => m.calls))).toBeLessThanOrEqual(50);
    expect(Math.max(...metrics.map((m) => m.statements))).toBeLessThanOrEqual(
      50,
    );
    if (preflight().localDriveVerified)
      writeFileSync(
        '../reports/dev10-rehearsal.json',
        JSON.stringify(
          {
            synthetic: true,
            officialCloudflareCpuMs: null,
            actualExternalRequests: 0,
            simulatedIssues: provider.issues.size,
            simulatedMessages: provider.messages.size,
            metrics,
          },
          null,
          2,
        ),
      );
  } finally {
    await h.mf.dispose();
  }
}, 75000);
