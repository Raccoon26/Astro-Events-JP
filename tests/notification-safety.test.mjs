import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { preflight } from '../scripts/path-policy.mjs';
import { notificationHarness } from './notification-harness.mjs';

let h;
beforeAll(async () => {
  h = await notificationHarness();
}, 30000);
beforeEach(async () => {
  await h.reset();
});
afterAll(async () => {
  await h?.mf.dispose();
});
const scenario = (name, fn, timeout = 30000) => it(name, fn, timeout);
async function setup() {
  const f = await h.seed();
  await h.enqueue(f);
  return { f, rows: await h.rows(), wire: new h.api.FakeNotificationWire() };
}
for (const action of ['posted', 'held', 'recheck'])
  scenario(
    'keeps the delayed Issue channel independent after ' + action,
    async () => {
      const { f, rows, wire } = await setup();
      expect((await f.store.candidates()).rows[0].postId).toBe(f.postId);
      await h.send(f, rows[0], wire);
      await h.send(f, rows[1], wire);
      const context = await h.db
        .prepare('SELECT payload FROM notification_context WHERE delivery_id=?')
        .bind(rows[1].delivery_id)
        .first('payload');
      const buttons = JSON.parse(context).reply_markup.inline_keyboard[0];
      const index = ['posted', 'held', 'recheck'].indexOf(action);
      const message = (await h.rows())[1];
      await f.store.callback(
        buttons[index].callback_data,
        action,
        {
          chatId: '10001',
          userId: '20001',
          messageId: message.external_id,
          updateId: '703',
        },
        h.usage,
      );
      expect((await f.store.candidates()).rows).toEqual([]);
      const result = await h.send(f, rows[2], wire);
      if (action === 'recheck') {
        expect(result).toBeNull();
        expect(wire.issues.size).toBe(0);
      } else {
        expect(result.state).toBe('sent');
        expect(wire.issues.size).toBe(1);
        const issueUpdate = (await f.store.updates()).find(
          (u) => u.delivery_id === rows[2].delivery_id,
        );
        expect(
          (await f.store.updateManagement(issueUpdate.update_id, wire, h.usage))
            .changed,
        ).toBe(true);
        expect([...wire.issues.values()][0].body).toContain(
          '게시 상태: ' + action,
        );
      }
      expect(wire.messages.size).toBe(2);
    },
  );

scenario(
  'D1 transaction failure rolls back every new group/control and resumes idempotently',
  async () => {
    const f = await h.seed();
    let fail = true;
    const db = {
      prepare: (sql) => h.db.prepare(sql),
      batch: (statements) => {
        if (fail) {
          fail = false;
          return h.db.batch([
            ...statements,
            h.db.prepare('INSERT INTO deliberately_missing_table VALUES(1)'),
          ]);
        }
        return h.db.batch(statements);
      },
    };
    const store = new h.api.NotificationStore(db, h.options);
    await expect(
      store.enqueue(f.postId, h.usage, f.expected),
    ).rejects.toThrow();
    expect(
      await h.db
        .prepare('SELECT count(*) AS n FROM notification_groups')
        .first('n'),
    ).toBe(0);
    expect(
      await h.db
        .prepare('SELECT count(*) AS n FROM notification_callbacks')
        .first('n'),
    ).toBe(0);
    await h.enqueue({ ...f, store });
    expect(await h.rows()).toHaveLength(3);
  },
);
scenario(
  'the final bound capsule rejects mutation between validation and group commit',
  async () => {
    const f = await h.seed();
    let armed = true;
    const db = {
      prepare: (sql) => h.db.prepare(sql),
      batch: async (statements) => {
        if (armed) {
          armed = false;
          await h.db.prepare('DELETE FROM source_approvals').run();
        }
        return h.db.batch(statements);
      },
    };
    await expect(
      new h.api.NotificationStore(db, h.options).enqueue(
        f.postId,
        h.usage,
        f.expected,
      ),
    ).rejects.toThrow();
    expect(
      await h.db
        .prepare('SELECT count(*) AS n FROM notification_groups')
        .first('n'),
    ).toBe(0);
  },
);
scenario(
  'historical positive Issue receipts clear only their uncertain cause after a source change',
  async () => {
    const { f, rows, wire } = await setup(),
      issue = rows[2];
    wire.faults.push(
      () => undefined,
      () => undefined,
      async (request) => {
        await wire.request(request);
        throw Error('lost create response');
      },
    );
    expect((await h.send(f, issue, wire)).state).toBe('uncertain');
    await h.db.prepare('DELETE FROM source_approvals').run();
    expect(
      (await f.store.reconcileIssue(issue.delivery_id, wire, h.usage)).state,
    ).toBe('sent');
    expect(wire.issues.size).toBe(1);
    await expect(f.store.preview(f.postId)).rejects.toThrow(
      'CURRENT_POST_REQUIRED',
    );
    expect(
      await h.db
        .prepare('SELECT state FROM notification_issue_claims')
        .first('state'),
    ).toBe('idle');
  },
);
scenario(
  'manual Telegram receipts replay without writes and never authorize an old post',
  async () => {
    const { f, rows, wire } = await setup();
    wire.faults.push(() => {
      throw Error('response lost');
    });
    await h.send(f, rows[0], wire);
    await h.db.prepare('DELETE FROM source_approvals').run();
    const reason = 'Operator checked the isolated synthetic message';
    await f.store.confirmTelegram(rows[0].delivery_id, '101', reason, h.usage);
    const before = f.store.meter.snapshot().rowsWritten;
    await f.store.confirmTelegram(rows[0].delivery_id, '101', reason, h.usage);
    expect(f.store.meter.snapshot().rowsWritten - before).toBe(0);
    await expect(
      f.store.confirmTelegram(rows[0].delivery_id, '102', reason, h.usage),
    ).rejects.toThrow('MANUAL_RECEIPT_CONFLICT');
    expect(await f.store.claim(rows[1].delivery_id, h.usage)).toBeNull();
  },
);
scenario(
  'project daily and per-channel delay reservations cannot be bypassed by new leases',
  async () => {
    const { f, rows, wire } = await setup();
    await h.send(f, rows[0], wire);
    await h.db
      .prepare('UPDATE notification_request_budgets SET requests=512')
      .run();
    const result = await h.send(f, rows[1], wire);
    expect(result).toMatchObject({
      state: 'failed',
      code: 'PROJECT_RATE_OR_BUDGET_LIMIT',
    });
    expect(wire.messages.size).toBe(1);
  },
);
scenario(
  'facade refuses forged reports, invalid delivery keys and unauthenticated callbacks',
  async () => {
    const f = await h.seed(),
      service = new h.api.OutboxNotificationService(f.store, h.usage);
    const delivery = {
      eventId: f.eventId,
      postId: f.postId,
      revision: String(f.expected.revision),
      channel: 'telegram',
      state: 'pending',
      idempotencyKey: 'forged',
    };
    await expect(
      service.deliver(
        { ...f.plan.report, publicationStatus: 'posted' },
        delivery,
      ),
    ).rejects.toThrow('REPORT_MISMATCH');
    await expect(service.deliver(f.plan.report, delivery)).rejects.toThrow(
      'DELIVERY_KEY_MISMATCH',
    );
    await expect(
      service.callback('n6:' + 'a'.repeat(32), 'posted'),
    ).rejects.toThrow('CALLBACK_UNAUTHORIZED');
  },
);
scenario(
  'a 2,000-row synthetic cursor scan is bounded and FK/UNIQUE constraints survive replay',
  async () => {
    const { f } = await setup();
    const template = await h.db
      .prepare('SELECT * FROM notification_deliveries LIMIT 1')
      .first();
    const context = await h.db
      .prepare('SELECT * FROM notification_context WHERE delivery_id=?')
      .bind(template.delivery_id)
      .first();
    for (let offset = 0; offset < 2000; offset += 50)
      await h.db.batch(
        Array.from({ length: 50 }, (_, i) => {
          const key =
            'synthetic-pagination-' + String(offset + i).padStart(5, '0');
          return h.db
            .prepare(
              "INSERT INTO notification_deliveries(delivery_id,idempotency_key,event_id,post_id,channel,revision,message_part,state,expires_at) VALUES(?,?,?,?,?,?,'management','pending',?)",
            )
            .bind(
              key,
              key,
              template.event_id,
              template.post_id,
              template.channel,
              template.revision,
              template.expires_at,
            );
        }),
      );
    for (let offset = 0; offset < 2000; offset += 50)
      await h.db.batch(
        Array.from({ length: 50 }, (_, i) => {
          const key =
            'synthetic-pagination-' + String(offset + i).padStart(5, '0');
          return h.db
            .prepare('INSERT INTO notification_context VALUES(?,?,?,?,?,?,?)')
            .bind(
              key,
              context.group_id,
              offset + i + 10,
              context.payload,
              context.payload_digest,
              context.target,
              context.updated_at,
            );
        }),
      );
    const measurement = f.store.meter.snapshot(),
      started = performance.now();
    let cursor = '',
      total = 0,
      pages = 0;
    do {
      const page = await f.store.list(cursor, 50);
      expect(page.length).toBeLessThanOrEqual(50);
      total += page.length;
      pages++;
      cursor = page.length === 50 ? page.at(-1).delivery_id : '';
    } while (cursor);
    expect(total).toBe(2003);
    expect(pages).toBe(41);
    const paths = preflight(),
      after = f.store.meter.snapshot();
    if (paths.localDriveVerified)
      writeFileSync(
        paths.root + '/reports/dev06-cursor-measurement.json',
        JSON.stringify(
          {
            synthetic: true,
            remote: false,
            rows: total,
            pages,
            localElapsedMs: performance.now() - started,
            cloudflareCpuMs: null,
            d1: {
              calls: after.calls - measurement.calls,
              rowsRead: after.rowsRead - measurement.rowsRead,
              rowsWritten: after.rowsWritten - measurement.rowsWritten,
            },
          },
          null,
          2,
        ),
      );
    expect(
      (await h.db.prepare('PRAGMA foreign_key_check').all()).results,
    ).toEqual([]);
    expect(await h.db.prepare('PRAGMA quick_check').first('quick_check')).toBe(
      'ok',
    );
  },
  90000,
);
