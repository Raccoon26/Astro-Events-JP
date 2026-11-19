import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
const scenario = (name, fn) => it(name, fn, 30000);
async function prepared(all = false) {
  const f = await h.seed();
  await h.enqueue(f);
  const rows = await h.rows(),
    wire = new h.api.FakeNotificationWire();
  for (const row of rows.slice(0, all ? 3 : 2)) await h.send(f, row, wire);
  const management = await h.db
    .prepare(
      "SELECT c.payload,d.external_id FROM notification_context c JOIN notification_deliveries d ON c.delivery_id=d.delivery_id WHERE c.group_id=? AND d.channel='telegram' AND d.message_part='management' ORDER BY c.part_index LIMIT 1",
    )
    .bind(f.plan.groupId)
    .first();
  const buttons = JSON.parse(management.payload).reply_markup
    .inline_keyboard[0];
  return {
    f,
    rows,
    wire,
    buttons,
    identity: {
      chatId: '10001',
      userId: '20001',
      messageId: management.external_id,
      updateId: '101',
    },
  };
}
describe('isolated callback authorization, single-use CAS and publication records', () => {
  for (const action of ['posted', 'held', 'recheck'])
    scenario(
      `${action} is an authenticated user decision, not an X API receipt`,
      async () => {
        const p = await prepared(),
          button = p.buttons.find(
            (b) =>
              ({ posted: '게시완료', held: '보류', recheck: '재확인' })[
                action
              ] === b.text,
          );
        const first = await p.f.store.callback(
          button.callback_data,
          action,
          p.identity,
          h.usage,
        );
        expect(first.status).toBe(action);
        expect(first.idempotent).toBe(false);
        expect(
          (
            await p.f.store.callback(
              button.callback_data,
              action,
              p.identity,
              h.usage,
            )
          ).idempotent,
        ).toBe(true);
        expect(
          await h.db
            .prepare('SELECT COUNT(*) AS n FROM publication_records')
            .first('n'),
        ).toBe(1);
        expect(
          await h.db
            .prepare('SELECT x_url FROM publication_records')
            .first('x_url'),
        ).toBeNull();
        expect(
          await h.db
            .prepare('SELECT COUNT(*) AS n FROM posted_fingerprints')
            .first('n'),
        ).toBe(action === 'posted' ? 1 : 0);
        expect(
          await h.db
            .prepare('SELECT COUNT(*) AS n FROM notification_reviews')
            .first('n'),
        ).toBe(action === 'recheck' ? 1 : 0);
        expect(
          await p.f.store.claim(p.rows[0].delivery_id, h.usage),
        ).toBeNull();
        const issueClaim = await p.f.store.claim(
          p.rows[2].delivery_id,
          h.usage,
        );
        if (action === 'recheck') expect(issueClaim).toBeNull();
        else expect(issueClaim?.owner).toBeTruthy(); // Independent pending report, never another Telegram copy.
        await expect(
          p.f.store.enqueue(p.f.postId, h.usage, p.f.expected),
        ).rejects.toThrow('PUBLICATION_SUPPRESSED');
      },
    );
  for (const [field, value] of [
    ['chatId', '99999'],
    ['userId', '99999'],
    ['messageId', '99999'],
  ])
    scenario(
      `rejects a different ${field} without changing publication state`,
      async () => {
        const p = await prepared();
        await expect(
          p.f.store.callback(
            p.buttons[0].callback_data,
            'posted',
            { ...p.identity, [field]: value },
            h.usage,
          ),
        ).rejects.toThrow(/CALLBACK_UNAUTHORIZED|CALLBACK_MESSAGE_MISMATCH/);
        expect(
          await h.db
            .prepare('SELECT COUNT(*) AS n FROM publication_records')
            .first('n'),
        ).toBe(0);
      },
    );
  scenario(
    'rejects guessed, modified, expired and action-mismatched callbacks',
    async () => {
      const p = await prepared();
      for (const token of [
        'n6:' + 'a'.repeat(32),
        p.buttons[0].callback_data + '0',
        'not-json',
      ])
        await expect(
          p.f.store.callback(token, 'posted', p.identity, h.usage),
        ).rejects.toThrow();
      await expect(
        p.f.store.callback(
          p.buttons[0].callback_data,
          'held',
          p.identity,
          h.usage,
        ),
      ).rejects.toThrow('CALLBACK_EXPIRED_OR_INVALID');
      h.advance(86400001);
      await expect(
        p.f.store.callback(
          p.buttons[0].callback_data,
          'posted',
          p.identity,
          h.usage,
        ),
      ).rejects.toThrow('CALLBACK_EXPIRED_OR_INVALID');
    },
  );
  scenario(
    'competing Posted/Hold cannot overwrite the winning generation',
    async () => {
      const p = await prepared();
      const results = await Promise.allSettled([
        p.f.store.callback(
          p.buttons[0].callback_data,
          'posted',
          p.identity,
          h.usage,
        ),
        p.f.store.callback(
          p.buttons[1].callback_data,
          'held',
          p.identity,
          h.usage,
        ),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        await h.db
          .prepare('SELECT COUNT(*) AS n FROM publication_records')
          .first('n'),
      ).toBe(1);
      expect(
        await h.db
          .prepare('SELECT generation FROM notification_publications')
          .first('generation'),
      ).toBe(1);
    },
  );
  scenario(
    'withdrawn official approval blocks callback application and leaves the action unconsumed',
    async () => {
      const p = await prepared();
      await h.db.prepare('DELETE FROM source_approvals').run();
      await expect(
        p.f.store.callback(
          p.buttons[0].callback_data,
          'posted',
          p.identity,
          h.usage,
        ),
      ).rejects.toThrow('CURRENT_POST_REQUIRED');
      expect(
        await h.db
          .prepare(
            'SELECT COUNT(*) AS n FROM notification_callbacks WHERE consumed_at IS NOT NULL',
          )
          .first('n'),
      ).toBe(0);
    },
  );
  scenario(
    'updates management and the same private Issue but never edits copy text or starts a loop',
    async () => {
      const p = await prepared(true),
        before = new Map(p.wire.messages);
      const copyId = Number((await h.rows())[0].external_id),
        copy = structuredClone(before.get(copyId));
      await p.f.store.callback(
        p.buttons[0].callback_data,
        'posted',
        p.identity,
        h.usage,
      );
      const updates = await p.f.store.updates();
      expect(updates).toHaveLength(2);
      for (const update of updates)
        expect(
          (await p.f.store.updateManagement(update.update_id, p.wire, h.usage))
            .changed,
        ).toBe(true);
      expect(p.wire.messages.get(copyId)).toEqual(copy);
      expect(
        [...p.wire.messages.values()].some((m) =>
          m.text.includes('게시 상태: posted'),
        ),
      ).toBe(true);
      expect(p.wire.issues.size).toBe(1);
      expect([...p.wire.issues.values()][0].body).toContain(
        '게시 상태: posted',
      );
      expect(
        await h.db
          .prepare('SELECT COUNT(*) AS n FROM notification_groups')
          .first('n'),
      ).toBe(1);
    },
  );
  scenario(
    'webhook authenticates before mutation, queues an independent callback acknowledgement and replays safely',
    async () => {
      const p = await prepared(),
        secret = 'syntheticWebhookSecret'.repeat(2),
        body = {
          update_id: 123,
          callback_query: {
            id: 'synthetic-query',
            data: p.buttons[2].callback_data,
            from: { id: 20001 },
            message: {
              message_id: Number(p.identity.messageId),
              chat: { id: 10001 },
            },
          },
        };
      const request = (header, raw = JSON.stringify(body)) =>
        new Request('https://local.invalid/callback', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(header ? { 'x-telegram-bot-api-secret-token': header } : {}),
          },
          body: raw,
        });
      expect(
        (await h.api.webhook(request(null), p.f.store, secret, h.usage)).status,
      ).toBe(401);
      expect(
        (await h.api.webhook(request('wrong'), p.f.store, secret, h.usage))
          .status,
      ).toBe(401);
      expect(
        (await h.api.webhook(request(secret), p.f.store, secret, h.usage))
          .status,
      ).toBe(200);
      expect(
        (await h.api.webhook(request(secret), p.f.store, secret, h.usage))
          .status,
      ).toBe(200);
      const ack = await h.db
        .prepare('SELECT ack_id,state FROM notification_callback_acks')
        .first();
      expect(ack.state).toBe('pending');
      expect(
        p.wire.requests.some((r) => r.operation === 'answerCallbackQuery'),
      ).toBe(false);
      expect(
        (await p.f.store.processCallbackAck(ack.ack_id, p.wire, h.usage)).state,
      ).toBe('sent');
      expect(
        p.wire.requests.filter((r) => r.operation === 'answerCallbackQuery'),
      ).toHaveLength(1);
      expect(
        (await p.f.store.processCallbackAck(ack.ack_id, p.wire, h.usage))
          .changed,
      ).toBe(false);
    },
  );
  scenario(
    'authenticated malformed/oversized JSON never changes publication state',
    async () => {
      const p = await prepared(),
        secret = 'syntheticWebhookSecret'.repeat(2);
      for (const raw of [
        '{',
        'x'.repeat(32769),
        JSON.stringify({
          update_id: 123,
          callback_query: {
            data: p.buttons[0].callback_data,
            from: { id: 20001 },
            message: {
              message_id: Number(p.identity.messageId),
              chat: { id: 10001 },
            },
          },
        }),
      ]) {
        const r = await h.api.webhook(
          new Request('https://local.invalid/callback', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-telegram-bot-api-secret-token': secret,
            },
            body: raw,
          }),
          p.f.store,
          secret,
          h.usage,
        );
        expect(r.status).toBe(400);
      }
      expect(
        await h.db
          .prepare('SELECT COUNT(*) AS n FROM publication_records')
          .first('n'),
      ).toBe(0);
    },
  );
  scenario(
    'keeps a response-lost management edit uncertain and does not retry it automatically',
    async () => {
      const p = await prepared();
      await p.f.store.callback(
        p.buttons[1].callback_data,
        'held',
        p.identity,
        h.usage,
      );
      const u = (await p.f.store.updates())[0];
      p.wire.faults.push(() => {
        throw Error('response lost');
      });
      expect(
        (await p.f.store.updateManagement(u.update_id, p.wire, h.usage)).state,
      ).toBe('uncertain');
      expect(
        (await p.f.store.updateManagement(u.update_id, p.wire, h.usage))
          .changed,
      ).toBe(false);
      await p.f.store.confirmStatusReceipt(
        u.update_id,
        'Operator checked the synthetic management edit',
      );
      await p.f.store.confirmStatusReceipt(
        u.update_id,
        'Operator checked the synthetic management edit',
      );
      expect((await p.f.store.updates())[0].state).toBe('sent');
    },
  );
});
