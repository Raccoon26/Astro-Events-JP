import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { preflight } from '../scripts/path-policy.mjs';
import { notificationHarness } from './notification-harness.mjs';

let h;
beforeAll(async () => {
  h = await notificationHarness();
}, 30000);
afterAll(async () => {
  await h?.mf.dispose();
});
beforeEach(async () => {
  await h.reset();
});
async function ready() {
  const f = await h.seed();
  await h.enqueue(f);
  const rows = await h.rows();
  return { f, rows, wire: new h.api.FakeNotificationWire() };
}
async function count(table) {
  return h.db.prepare('SELECT COUNT(*) AS n FROM ' + table).first('n');
}
describe('native isolated D1 notification checkpoints and fake APIs, never live', () => {
  it('enqueues in bounded resumable pages, replays without writes, and sends each part once', async () => {
    const { f, rows, wire } = await ready();
    expect(f.plan.report.changes.join(' ')).toContain('initial-verification');
    expect(f.plan.issue.body).toContain('initial-verification');
    const before = f.store.meter.snapshot();
    await h.enqueue(f);
    expect(f.store.meter.snapshot().rowsWritten - before.rowsWritten).toBe(0);
    expect(rows.map((r) => r.part)).toEqual(['copy', 'management', 'issue']);
    expect(await f.store.claim(rows[1].delivery_id, h.usage)).toBeNull();
    for (const row of rows)
      expect((await h.send(f, row, wire)).state).toBe('sent');
    expect([...wire.messages.values()][0].text).toBe(f.plan.delivery.copyText);
    expect(wire.issues.size).toBe(1);
    for (const row of rows)
      expect(await f.store.claim(row.delivery_id, h.usage)).toBeNull();
    expect(
      wire.requests.filter((r) => r.operation === 'sendMessage'),
    ).toHaveLength(2);
    const state = preflight();
    if (state.localDriveVerified)
      writeFileSync(
        state.root + '/reports/dev06-d1-measurement.json',
        JSON.stringify(
          {
            synthetic: true,
            remote: false,
            cloudflareCpuMs: null,
            externalNotificationRequests: 0,
            simulatedApiCalls: wire.requests.length,
            total: f.store.meter.snapshot(),
          },
          null,
          2,
        ),
      );
  }, 30000);
  it('resumes a partial enqueue without duplicate copy or control tokens', async () => {
    const f = await h.seed(),
      first = await f.store.enqueue(f.postId, h.usage, f.expected);
    expect(first.complete).toBe(false);
    expect(await count('notification_deliveries')).toBe(2);
    await f.store.enqueue(f.postId, h.usage, f.expected, first.nextCursor);
    expect(await count('notification_deliveries')).toBe(3);
    expect(await count('notification_callbacks')).toBe(3);
  });
  it('claims one lease under concurrency and rejects a forged owner', async () => {
    const { f, rows, wire } = await ready();
    const claims = await Promise.all([
      f.store.claim(rows[0].delivery_id, h.usage),
      f.store.claim(rows[0].delivery_id, h.usage),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(
      f.store.dispatch(rows[0].delivery_id, 'wrong-owner', wire, h.usage),
    ).rejects.toThrow('LEASE_CONFLICT');
    expect(wire.requests).toHaveLength(0);
  });
  it('never invokes a fake provider twice for duplicate dispatch of the same lease', async () => {
    const { f, rows, wire } = await ready(),
      claim = await f.store.claim(rows[0].delivery_id, h.usage);
    const results = await Promise.allSettled([
      f.store.dispatch(rows[0].delivery_id, claim.owner, wire, h.usage),
      f.store.dispatch(rows[0].delivery_id, claim.owner, wire, h.usage),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(wire.requests).toHaveLength(1);
  });
  it('recovers an unstarted expired lease, but an interrupted started send becomes uncertain', async () => {
    const { f, rows, wire } = await ready(),
      row = rows[0];
    await f.store.claim(row.delivery_id, h.usage);
    h.advance(31000);
    expect((await f.store.recover(row.delivery_id, h.usage)).state).toBe(
      'pending',
    );
    await f.store.claim(row.delivery_id, h.usage);
    await h.db
      .prepare(
        'UPDATE notification_deliveries SET started_at=? WHERE delivery_id=?',
      )
      .bind(new Date(h.now).toISOString(), row.delivery_id)
      .run();
    h.advance(31000);
    expect((await f.store.recover(row.delivery_id, h.usage)).state).toBe(
      'uncertain',
    );
    expect(await f.store.claim(row.delivery_id, h.usage)).toBeNull();
    expect(wire.requests).toHaveLength(0);
  });
  it('preserves successful copy when management fails and only retries the management part', async () => {
    const { f, rows, wire } = await ready();
    await h.send(f, rows[0], wire);
    wire.faults.push(() => ({
      status: 429,
      body: { parameters: { retry_after: 60 } },
    }));
    expect((await h.send(f, rows[1], wire)).state).toBe('failed');
    expect(await f.store.claim(rows[1].delivery_id, h.usage)).toBeNull();
    h.advance(61000);
    expect((await h.send(f, rows[1], wire)).state).toBe('sent');
    expect(
      wire.requests.filter((r) => r.payload.text === f.plan.delivery.copyText),
    ).toHaveLength(1);
  }, 30000);
  it('isolates GitHub failure after Telegram success, without repeating Telegram', async () => {
    const { f, rows, wire } = await ready();
    await h.send(f, rows[0], wire);
    await h.send(f, rows[1], wire);
    wire.faults.push(() => ({ status: 403, body: {} }));
    expect((await h.send(f, rows[2], wire)).state).toBe('failed');
    expect(wire.messages.size).toBe(2);
    expect(wire.issues.size).toBe(0);
    expect(await f.store.claim(rows[2].delivery_id, h.usage)).toBeNull();
  }, 30000);
  it('reconciles a positive Issue receipt after response loss without a second create', async () => {
    const { f, rows, wire } = await ready(),
      row = rows[2];
    wire.faults.push(
      () => undefined,
      () => undefined,
      (r) => {
        wire.issues.set(501, {
          number: 501,
          title: r.payload.title,
          body: r.payload.body,
          html_url:
            'https://github.com/Raccoon26/Astro-Events-JP-Reports/issues/501',
        });
        throw Error('response lost');
      },
    );
    expect((await h.send(f, row, wire)).state).toBe('uncertain');
    expect(await f.store.claim(row.delivery_id, h.usage)).toBeNull();
    expect(
      (await f.store.reconcileIssue(row.delivery_id, wire, h.usage)).state,
    ).toBe('sent');
    expect(wire.issues.size).toBe(1);
    expect(
      wire.requests.filter((r) => r.operation === 'createIssue'),
    ).toHaveLength(1);
  });
  it('does not turn a negative or incomplete Issue search into permission to create again', async () => {
    const { f, rows, wire } = await ready();
    wire.faults.push(
      () => undefined,
      () => undefined,
      () => {
        throw Error('lost');
      },
    );
    await h.send(f, rows[2], wire);
    expect(
      (await f.store.reconcileIssue(rows[2].delivery_id, wire, h.usage)).state,
    ).toBe('uncertain');
    expect(
      wire.requests.filter((r) => r.operation === 'createIssue'),
    ).toHaveLength(1);
  });
  it('keeps Telegram response loss uncertain and requires explicit human receipt without re-sending', async () => {
    const { f, rows, wire } = await ready();
    wire.faults.push(() => {
      throw Error('lost');
    });
    await h.send(f, rows[0], wire);
    expect(await f.store.claim(rows[0].delivery_id, h.usage)).toBeNull();
    await expect(
      f.store.confirmTelegram(rows[0].delivery_id, '101', '', h.usage),
    ).rejects.toThrow('MANUAL_RECEIPT_REQUIRED');
    expect(
      (
        await f.store.confirmTelegram(
          rows[0].delivery_id,
          '101',
          'synthetic human confirmation',
          h.usage,
        )
      ).independentVerification,
    ).toBe(false);
    expect(await count('notification_manual_receipts')).toBe(1);
    expect(wire.requests).toHaveLength(1);
  });
  it.each(['approval', 'fingerprint', 'document', 'post'])(
    'blocks stale %s immediately before provider dispatch',
    async (change) => {
      const { f, rows, wire } = await ready(),
        claim = await f.store.claim(rows[0].delivery_id, h.usage);
      if (change === 'approval')
        await h.db.prepare('DELETE FROM source_approvals').run();
      if (change === 'fingerprint')
        await h.db
          .prepare('UPDATE event_candidates SET fingerprint=?')
          .bind('b'.repeat(64))
          .run();
      if (change === 'document')
        await h.db
          .prepare('UPDATE collection_documents SET digest=?')
          .bind('c'.repeat(64))
          .run();
      if (change === 'post')
        await h.db
          .prepare('UPDATE generated_posts SET text=?')
          .bind('forged text')
          .run();
      expect(
        (
          await f.store.dispatch(
            rows[0].delivery_id,
            claim.owner,
            wire,
            h.usage,
          )
        ).state,
      ).toBe('failed');
      expect(wire.requests).toHaveLength(0);
    },
  );
  it('rejects stored copy tampering even if its unauthenticated payload hash is also changed', async () => {
    const { f, rows, wire } = await ready();
    const row = await f.store.row(rows[0].delivery_id),
      payload = JSON.parse(row.payload);
    payload.text = 'forged copy';
    const text = JSON.stringify(payload),
      hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
        ),
      )
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('');
    await h.db
      .prepare(
        'UPDATE notification_context SET payload=?,payload_digest=? WHERE delivery_id=?',
      )
      .bind(text, hash, row.delivery_id)
      .run();
    expect((await h.send(f, row, wire)).code).toBe('PAYLOAD_CHANGED');
    expect(wire.requests).toHaveLength(0);
  });
  it('detects an official change during a simulated provider call and stops remaining parts', async () => {
    const { f, rows, wire } = await ready();
    wire.faults.push(async () => {
      await h.db.prepare('DELETE FROM source_approvals').run();
      return undefined;
    });
    expect((await h.send(f, rows[0], wire)).state).toBe('uncertain');
    expect(await f.store.claim(rows[1].delivery_id, h.usage)).toBeNull();
    expect(wire.requests).toHaveLength(1);
  });
  it('fails closed on unknown/free-exhausted budgets, disabled features, production and old schema', async () => {
    const f = await h.seed();
    await expect(f.store.enqueue(f.postId, null, f.expected)).rejects.toThrow(
      'BUDGET_UNAVAILABLE',
    );
    await expect(
      f.store.enqueue(f.postId, { ...h.usage, requests: 100000 }, f.expected),
    ).rejects.toThrow('BUDGET_UNAVAILABLE');
    await expect(
      new h.api.NotificationStore(h.db, {
        ...h.options,
        enabled: false,
      }).preview(f.postId),
    ).rejects.toThrow('FEATURE_DISABLED');
    await expect(
      new h.api.NotificationStore(h.db, {
        ...h.options,
        localOnly: false,
      }).preview(f.postId),
    ).rejects.toThrow('LIVE_DELIVERY_DISABLED');
    await h.db
      .prepare(
        "UPDATE deployment_identity SET environment='production',database_name='astro-events-jp-production'",
      )
      .run();
    await expect(f.store.preview(f.postId)).rejects.toThrow(
      'SCHEMA_OR_ENVIRONMENT_UNAVAILABLE',
    );
    await h.db
      .prepare(
        "UPDATE deployment_identity SET environment='staging',database_name='astro-events-jp-staging'",
      )
      .run();
  });
  it('checks expected source/version, cursor and bounded audit reads', async () => {
    const f = await h.seed();
    await expect(
      f.store.enqueue(f.postId, h.usage, { ...f.expected, revision: 999 }),
    ).rejects.toThrow('EXPECTED_VERSION_MISMATCH');
    await expect(f.store.list('', 51)).rejects.toThrow('INVALID_CURSOR');
    await expect(
      f.store.enqueue(f.postId, h.usage, f.expected, -1),
    ).rejects.toThrow('INVALID_CURSOR');
    expect(await count('notification_deliveries')).toBe(0);
  });
});
