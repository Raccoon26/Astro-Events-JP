import { writeFileSync } from 'node:fs';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { preflight } from '../scripts/path-policy.mjs';
import { candidate } from '../src/collection/parse-common';
import { digest } from '../src/collection/text';
import { approvalFixture, context, NOW } from './collection-fixtures';
import { notificationHarness } from './notification-harness.mjs';
import { verificationFixture } from './verification-fixtures';

let h;
// Local workerd RPC latency varies across cold workers and Windows hosts.
vi.setConfig({ testTimeout: 30000 });
beforeAll(async () => {
  h = await notificationHarness();
}, 30000);
afterAll(async () => {
  await h?.mf.dispose();
});
beforeEach(async () => {
  await h.db.batch(
    ['facility_notice_history', 'facility_notices', 'facility_sources'].map(
      (table) => h.db.prepare('DELETE FROM ' + table),
    ),
  );
  await h.reset();
  await h.db.prepare('DELETE FROM facilities').run();
});
const select = (sql, ...bindings) => h.db.prepare(sql).bind(...bindings);
const count = (table) =>
  h.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first('n');

async function stage(overrides = {}, options = {}) {
  const f = await verificationFixture(overrides);
  const col = context();
  if (options.channel) {
    col.source = {
      ...col.source,
      id: 'fixture-official-calendar',
      officialUrl: 'https://example.jp/calendar',
    };
    col.url = col.source.officialUrl;
    col.approval = approvalFixture(col.source);
  }
  const { source, approval } = col;
  if (
    !(await select(
      'SELECT source_id FROM sources WHERE source_id=?',
      source.id,
    ).first())
  )
    await new h.api.D1SourceRegistry(h.db).register(source);
  const c = await candidate(col, {
    url: options.url ?? f.ctx.candidate.officialUrl,
    title: f.ctx.candidate.title,
    description: f.ctx.candidate.description,
    itemId: options.slot ?? null,
  });
  const packet = {
    ...f.packet,
    sourceId: source.id,
    candidateId: c.id,
    fingerprint: c.fingerprint,
  };
  packet.documents[0].url = c.officialUrl;
  if (options.canonical) {
    const canonical = {
      url: 'https://example.jp/events/synthetic',
      documentId: 'main',
      ...(options.canonicalId
        ? { id: options.canonicalId, session: 'first-slot' }
        : {}),
      ...(options.previousTiming
        ? { previousTiming: options.previousTiming }
        : {}),
      quote: options.canonical,
    };
    packet.canonicalEvent = canonical;
    packet.documents[0].text += '\n' + canonical.quote;
    packet.documents[0].digest = await digest(packet.documents[0].text);
  }
  const writes = [
    select(
      'INSERT OR IGNORE INTO source_approvals VALUES(?,?,?)',
      source.id,
      JSON.stringify(approval),
      NOW,
    ),
    select(
      'INSERT OR IGNORE INTO collection_documents(source_id,url,digest,succeeded_at,changed_at,complete) VALUES(?,?,?,?,?,1)',
      source.id,
      c.originalUrl,
      'a'.repeat(64),
      NOW,
      NOW,
    ),
    select(
      'INSERT INTO event_candidates(candidate_id,source_id,official_url,fingerprint,payload,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?)',
      c.id,
      c.sourceId,
      c.officialUrl,
      c.fingerprint,
      JSON.stringify(c),
      NOW,
      NOW,
    ),
  ];
  if (options.facility) {
    writes.push(
      h.db.prepare(
        "INSERT OR IGNORE INTO facilities(facility_id,facility_name,prefecture,official_url) VALUES('fixture-facility','合成天文台',1,'https://example.jp/facility')",
      ),
      select(
        "INSERT OR IGNORE INTO facility_sources VALUES('fixture-facility',?)",
        source.id,
      ),
    );
    packet.facilityId = 'fixture-facility';
    if (options.resolve) packet.resolvesNoticeIds = options.resolve;
  }
  await h.db.batch(writes);
  const store = new h.api.VerificationStore(h.db, {
    enabled: true,
    localOnly: true,
    clock: h.options.clock,
  });
  const preview = await store.preview(c.id, packet);
  return {
    c,
    packet,
    store,
    preview,
    eventId: preview.result.event.stableEventId,
  };
}
function apply(item) {
  return item.store.commit(item.preview.loaded, item.preview.result, h.usage);
}
async function newPost(eventId, kind) {
  const posts = new h.api.PostStore(h.db, {
    enabled: true,
    localOnly: true,
    clock: h.options.clock,
  });
  const { delivery } = await posts.save(eventId, kind, h.usage);
  const { sourceId, fingerprint, eventRevision, post } = delivery.metadata;
  return {
    store: new h.api.NotificationStore(h.db, h.options),
    postId: post.id,
    expected: { sourceId, fingerprint, revision: eventRevision },
    delivery,
  };
}

describe('native local D1 integration for stable verified events', () => {
  it('aliases tracking-parameter URLs across sources, preserving the original official URL and one publishable event', async () => {
    const first = await h.seed();
    const other = await stage(
      {},
      {
        channel: true,
        url: 'https://example.jp/events/synthetic?utm_source=rss',
      },
    );
    expect((await apply(other)).canonicalEventId).toBe(first.eventId);
    expect(await count('events')).toBe(1);
    expect(await other.store.verified(other.eventId)).toBeNull();
    expect(
      (await other.store.duplicateReviews(other.c.id)).observation,
    ).toMatchObject({
      event_id: first.eventId,
      relation: 'alias',
      official_url: other.c.officialUrl,
    });
    await expect(apply(other)).rejects.toThrow('write-conflict');
    const replay = await other.store.preview(other.c.id, other.packet);
    expect(
      (await other.store.commit(replay.loaded, replay.result, h.usage)).changed,
    ).toBe(false);
  });
  it('recognizes an official link from another URL and bounds review for fuzzy or conflicting candidates', async () => {
    const original = await h.seed();
    const linked = await stage(
      {},
      {
        channel: true,
        url: 'https://example.jp/calendar/item',
        canonical: '公式詳細 https://example.jp/events/synthetic',
      },
    );
    expect((await apply(linked)).canonicalEventId).toBe(original.eventId);
    const fuzzy = await stage(
      { title: '合成観望会 春' },
      { url: 'https://example.jp/events/another' },
    );
    const applied = await apply(fuzzy);
    const review = (await fuzzy.store.duplicateReviews(fuzzy.c.id)).reviews[0];
    expect(JSON.parse(review.details)).toMatchObject({
      exact: false,
      signals: expect.arrayContaining(['title-similarity', 'date-overlap']),
    });
    expect(await fuzzy.store.verified(fuzzy.eventId)).toBeNull();
    const decision = {
      candidateId: fuzzy.c.id,
      eventId: fuzzy.eventId,
      relatedEventId: original.eventId,
      decisionId: applied.decisionId,
      relatedDecisionId: review.related_decision_id,
      action: 'held',
      reason: 'Synthetic operator saw incomplete official relationship',
    };
    expect((await fuzzy.store.decideDuplicate(decision)).changed).toBe(false);
    expect(await count('event_identity_actions')).toBe(0);
    expect(
      (await fuzzy.store.decideDuplicate(decision, true, h.usage)).changed,
    ).toBe(true);
    expect(
      (await fuzzy.store.decideDuplicate(decision, true, h.usage)).changed,
    ).toBe(false);
    await expect(
      fuzzy.store.decideDuplicate(
        { ...decision, action: 'approved' },
        true,
        h.usage,
      ),
    ).rejects.toThrow('invalid-input');
    expect(
      (
        await fuzzy.store.decideDuplicate(
          {
            ...decision,
            action: 'rejected',
            reason: 'Official organizers confirm independent events',
          },
          true,
          h.usage,
        )
      ).changed,
    ).toBe(true);
    expect(await fuzzy.store.verified(fuzzy.eventId)).not.toBeNull();
  });
  it('serializes competing new observations so a retried commit records a single canonical Event', async () => {
    const first = await stage({}, { slot: 'cross-channel-a' });
    const second = await stage(
      {},
      {
        channel: true,
        url: 'https://example.jp/events/synthetic?utm_source=calendar',
      },
    );
    const outcomes = await Promise.allSettled([apply(first), apply(second)]);
    expect(outcomes.some((r) => r.status === 'fulfilled')).toBe(true);
    for (const [index, outcome] of outcomes.entries()) {
      if (outcome.status === 'rejected') {
        expect(outcome.reason.message).toBe('write-conflict');
        expect(
          (await apply(index === 0 ? first : second)).canonicalEventId,
        ).toBeTruthy();
      }
    }
    expect(await count('events')).toBe(1);
    expect(await count('verification_decisions')).toBe(2);
  });
  it('keeps distinct timed sessions on the same page and can approve a date-only canonical match after review', async () => {
    const original = await h.seed();
    const afternoon = await stage(
      { schedule: '開催日2026年11月23日 17:00〜19:00' },
      { slot: 'session-2' },
    );
    expect((await apply(afternoon)).canonicalEventId).toBeUndefined();
    expect(await afternoon.store.verified(afternoon.eventId)).not.toBeNull();
    const short = await stage(
      { schedule: '開催日2026年11月23日' },
      { slot: 'day-summary' },
    );
    const applied = await apply(short);
    const candidates = (await short.store.duplicateReviews(short.c.id)).reviews;
    const match = candidates.find(
      (row) => row.related_event_id === original.eventId,
    );
    const second = candidates.find(
      (row) => row.related_event_id === afternoon.eventId,
    );
    const decision = {
      candidateId: short.c.id,
      eventId: short.eventId,
      relatedEventId: original.eventId,
      decisionId: applied.decisionId,
      relatedDecisionId: match.related_decision_id,
      action: 'approved',
      reason: 'Attested day summary refers to the first synthetic session',
    };
    await expect(
      short.store.decideDuplicate(decision, true, h.usage),
    ).rejects.toThrow('write-conflict');
    expect(
      (
        await short.store.decideDuplicate(
          {
            ...decision,
            relatedEventId: afternoon.eventId,
            relatedDecisionId: second.related_decision_id,
            action: 'rejected',
            reason: 'Official day summary does not cover the second session',
          },
          true,
          h.usage,
        )
      ).changed,
    ).toBe(true);
    expect(
      (await short.store.decideDuplicate(decision, true, h.usage)).changed,
    ).toBe(true);
    expect(await short.store.verified(short.eventId)).toBeNull();
    expect(
      (await short.store.duplicateReviews(short.c.id)).observation.event_id,
    ).toBe(original.eventId);
    expect(await short.store.verified(afternoon.eventId)).not.toBeNull();
  });
  it('does not let a changed source version or an invalid attestation move a canonical head', async () => {
    await h.seed();
    const unsafe = await stage(
      { schedule: '開催日2026年11月25日 13:30〜15:00' },
      {
        slot: 'possible',
        previousTiming: '2026年11月23日 13:30',
        canonical:
          '公式 https://example.jp/events/synthetic 合成観望会 2026年11月23日 13:30を変更する可能性',
      },
    );
    expect(unsafe.preview.result.event.verificationStatus).toBe('Blocked');
    expect((await apply(unsafe)).canonicalEventId).toBeUndefined();
  });
  it('serializes officially moved timing as a new revision, preserves the previous Issue, and blocks old posts/buttons', async () => {
    const original = await h.seed();
    await h.enqueue(original);
    const originalRows = await h.rows(),
      wire = new h.api.FakeNotificationWire();
    for (const entry of originalRows)
      expect((await h.send(original, entry, wire)).state).toBe('sent');
    const row = await select(
      'SELECT payload FROM notification_context WHERE group_id=? AND part_index=1',
      original.plan.groupId,
    ).first();
    const button = JSON.parse(row.payload).reply_markup.inline_keyboard[0][0]
      .callback_data;
    const oldManagement = (await h.rows()).find(
      (item) => item.part === 'management',
    );
    const next = await stage(
      { schedule: '開催日2026年11月24日 14:30〜16:00' },
      {
        slot: 'official-change',
        channel: true,
        url: 'https://example.jp/calendar/updated',
        previousTiming: '2026年11月23日 13:30',
        canonical:
          '公式 https://example.jp/events/synthetic 合成観望会 2026年11月23日 13:30 の開催日時を変更しました',
      },
    );
    const applied = await apply(next);
    expect(applied.canonicalEventId).toBe(original.eventId);
    expect(await count('events')).toBe(1);
    expect(await original.posts.get(original.postId)).toBeNull();
    const history = await next.store.trackingHistory(original.eventId);
    expect(history.map((r) => r.purpose)).toEqual([
      'initial',
      'official-change',
    ]);
    expect(JSON.parse(history[1].changes).fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'schedule', official: true }),
      ]),
    );
    await expect(
      original.store.callback(
        button,
        'posted',
        {
          chatId: '10001',
          userId: '20001',
          messageId: oldManagement.external_id,
          updateId: '123456',
        },
        h.usage,
      ),
    ).rejects.toThrow();
    const revised = await newPost(original.eventId, 'observation');
    const plan = await revised.store.preview(revised.postId);
    expect(revised.expected.revision).toBe(2);
    expect(plan.management.join('\n')).toContain(
      '2026年11月23日 13:30〜15:00 → 2026年11月24日 14:30〜16:00',
    );
    expect(await revised.store.preview(revised.postId)).toEqual(plan);
    await h.enqueue(revised);
    for (const entry of (await h.rows()).filter((r) => r.state === 'pending'))
      expect((await h.send(revised, entry, wire)).state).toBe('sent');
    expect(wire.issues.size).toBe(1);
    expect(
      wire.requests.filter((req) => req.operation === 'createIssue'),
    ).toHaveLength(1);
    expect(revised.delivery.copyText).not.toBe(original.plan.delivery.copyText);
  }, 30000);
  it('resumes unchanged deadline scheduling without repeat messages and stops after the confirmed deadline', async () => {
    const notice = await stage({
      kind: '申込締切',
      reservation: '申込受付中',
      applicationStart: '募集開始2026年11月11日 09:00',
      applicationDeadline: '申込締切2026年11月12日 13:00',
    });
    await apply(notice);
    const deadline = await newPost(notice.eventId, 'deadline');
    await h.enqueue(deadline);
    await h.enqueue(deadline);
    expect(await count('event_booking_intents')).toBe(1);
    expect(await count('notification_deliveries')).toBe(3);
    h.advance(4 * 3600000);
    expect(
      await deadline.store.claim((await h.rows())[0].delivery_id, h.usage),
    ).toBeNull();
  });
  it('derives independent opening and deadline deliveries from a single already posted, current event', async () => {
    const f = await stage({
      applicationStart: '募集開始2026年11月12日 09:01',
      applicationDeadline: '申込締切2026年11月12日 13:00',
    });
    await apply(f);
    const original = await newPost(f.eventId, 'observation');
    await expect(newPost(f.eventId, 'applications-open')).rejects.toThrow(
      'time-expired',
    );
    const wire = new h.api.FakeNotificationWire();
    async function sendAndAct(item, action, updateId) {
      await h.enqueue(item);
      const { groupId } = await item.store.preview(item.postId);
      for (const row of (await h.rows()).filter(
        (entry) => entry.state === 'pending',
      ))
        expect((await h.send(item, row, wire)).state).toBe('sent');
      const management = await select(
        `SELECT c.payload,d.external_id FROM notification_context c JOIN notification_deliveries d ON d.delivery_id=c.delivery_id
          WHERE c.group_id=? AND c.part_index=1`,
        groupId,
      ).first();
      const control = JSON.parse(management.payload).reply_markup
        .inline_keyboard[0][action === 'posted' ? 0 : 1];
      expect(
        (
          await item.store.callback(
            control.callback_data,
            action,
            {
              chatId: '10001',
              userId: '20001',
              messageId: management.external_id,
              updateId,
            },
            h.usage,
          )
        ).status,
      ).toBe(action);
    }
    await sendAndAct(original, 'posted', '66501');
    h.advance(60000);
    const opening = await newPost(f.eventId, 'applications-open');
    expect(opening.delivery.copyText).toContain(
      '申込開始：2026年11月12日 09:01',
    );
    await sendAndAct(opening, 'held', '66502');
    const deadline = await newPost(f.eventId, 'deadline');
    expect(deadline.delivery.copyText).toContain(
      '申込締切：2026年11月12日 13:00',
    );
    await sendAndAct(deadline, 'posted', '66503');
    expect(await count('events')).toBe(1);
    expect(await count('posted_fingerprints')).toBe(2);
    expect(await count('event_booking_intents')).toBe(2);
    expect(wire.issues.size).toBe(1);
    expect(
      wire.requests.filter((request) => request.operation === 'createIssue'),
    ).toHaveLength(1);
  }, 30000);
  it('records a clear withdrawal against an existing closure and leaves possible impacts separate from event cancellation', async () => {
    const event = await stage({}, { facility: true });
    await apply(event);
    const closure = await stage(
      {
        title: '臨時休館のお知らせ',
        kind: '臨時休館',
        schedule: '休館期間2026年11月1日〜2026年11月26日',
        status: '臨時休館',
      },
      { facility: true, url: 'https://example.jp/events/closure' },
    );
    const saved = await closure.store.applyNotice(
      closure.preview.loaded,
      h.usage,
    );
    const withdraw = await stage(
      {
        title: '臨時休館のお知らせを撤回しました',
        kind: '臨時休館',
        schedule: null,
        status:
          '臨時休館のお知らせを撤回しました。 https://example.jp/events/closure',
      },
      {
        facility: true,
        url: 'https://example.jp/events/withdrawal',
        resolve: [saved.notice.id],
      },
    );
    await withdraw.store.applyNotice(withdraw.preview.loaded, h.usage);
    expect(
      await select(
        'SELECT resolved_at FROM facility_notices WHERE notice_id=?',
        saved.notice.id,
      ).first('resolved_at'),
    ).toBeTruthy();
    expect(
      await select(
        'SELECT status FROM events WHERE stable_event_id=?',
        event.eventId,
      ).first('status'),
    ).toBe('scheduled');
  });
  it('rolls back verification and tracking on D1 failure, then reports isolated measurements and readable management', async () => {
    const start = performance.now();
    const f = await stage({ fee: '参加無料' });
    const wrapped = {
      prepare: (sql) => h.db.prepare(sql),
      batch(statements) {
        return h.db.batch([
          ...statements,
          h.db.prepare('INSERT INTO broken_dev07_probe VALUES (1)'),
        ]);
      },
    };
    const faulty = new h.api.VerificationStore(wrapped, {
      enabled: true,
      localOnly: true,
      clock: h.options.clock,
    });
    await expect(
      faulty.commit(f.preview.loaded, f.preview.result, h.usage),
    ).rejects.toThrow();
    expect(await count('event_tracking_revisions')).toBe(0);
    expect(await count('events')).toBe(0);
    await apply(f);
    const post = await newPost(f.eventId, 'observation');
    const plan = await post.store.preview(post.postId);
    const management = plan.management.join('\n');
    expect(management).toContain('도도부현: 北海道');
    expect(management).toContain('예약: 사전 신청 필수');
    expect(management).toContain('참가비: 무료');
    expect(management).toContain('입장료: 미확인');
    expect(management).not.toContain('{"required"');
    expect(plan.delivery.copyText).toBe(post.delivery.copyText);
    await h.enqueue(post);
    const path = preflight();
    if (path.localDriveVerified)
      writeFileSync(
        path.root + '/reports/dev07-d1-measurement.json',
        JSON.stringify(
          {
            synthetic: true,
            remote: false,
            cloudflareCpuMs: null,
            externalRequests: 0,
            elapsedMs: performance.now() - start,
            verifier: f.store.meter.snapshot(),
            notification: post.store.meter.snapshot(),
          },
          null,
          2,
        ),
      );
  }, 30000);
});
