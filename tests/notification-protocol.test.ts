import { describe, expect, it, vi } from 'vitest';
import { FakeNotificationWire } from '../src/notifications/fake';
import {
  NotificationProtocol,
  retryAfter,
} from '../src/notifications/protocol';
import { REPORTS_REPO } from '../src/notifications/types';

const clock = () => Date.parse('2026-11-18T00:00:00Z');
describe('isolated synthetic API contracts, no real messages or Issues', () => {
  it('keeps timed-out mutations uncertain and stops waiting after the bounded deadline', async () => {
    vi.useFakeTimers();
    try {
      const promise = new NotificationProtocol({
        mode: 'isolated-fake',
        request: () => new Promise(() => {}),
      }).telegram('10001', { chat_id: '10001', text: 'test' });
      const assertion = expect(promise).rejects.toMatchObject({
        uncertain: true,
        code: 'RESPONSE_LOST_OR_INVALID',
      });
      await vi.advanceTimersByTimeAsync(5001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
  it('validates persisted fake-provider records before restoring synthetic receipts', () => {
    const w = new FakeNotificationWire();
    expect(() =>
      w.restore({
        project: 'Astro-Events-JP',
        mode: 'simulation',
        messages: [['not-id', {}]],
        issues: [],
      }),
    ).toThrow('FAKE_PROVIDER_INVALID');
    expect(() =>
      w.restore({
        project: 'Astro-Events-JP',
        mode: 'simulation',
        messages: [],
        issues: [
          [
            101,
            {
              number: 101,
              body: 'bad',
              html_url: 'https://github.com/public/repo/issues/101',
            },
          ],
        ],
      }),
    ).toThrow('FAKE_PROVIDER_INVALID');
    w.restore({
      project: 'Astro-Events-JP',
      mode: 'simulation',
      messages: [
        [101, { message_id: 101, text: 'synthetic', chat: { id: '10001' } }],
      ],
      issues: [],
    });
    expect(w.messages.size).toBe(1);
  });
  it('omits parse modes, validates response copy echo and disables previews', async () => {
    const wire = new FakeNotificationWire(),
      api = new NotificationProtocol(wire, clock),
      text = '月を見る👨‍👩‍👧‍👦\nhttps://example.jp #天文';
    const r = await api.telegram('10001', {
      chat_id: '10001',
      text,
      link_preview_options: { is_disabled: true },
    });
    expect(r.simulated).toBe(true);
    expect([...wire.messages.values()][0]?.text).toBe(text);
    expect(wire.requests[0]?.payload.parse_mode).toBeUndefined();
  });
  it.each([400, 401, 403, 404])(
    'classifies explicit %i rejection as not sent',
    async (status) => {
      const wire = new FakeNotificationWire();
      wire.faults.push(() => ({ status, body: {} }));
      await expect(
        new NotificationProtocol(wire).telegram('10001', {
          chat_id: '10001',
          text: 'test',
        }),
      ).rejects.toMatchObject({ uncertain: false, code: `HTTP_${status}` });
      expect(wire.messages.size).toBe(0);
    },
  );
  it.each([500, 502, 503, 504])(
    'keeps mutation %i uncertain instead of blind retry',
    async (status) => {
      const wire = new FakeNotificationWire();
      wire.faults.push(() => ({ status, body: {} }));
      await expect(
        new NotificationProtocol(wire).telegram('10001', {
          chat_id: '10001',
          text: 'test',
        }),
      ).rejects.toMatchObject({ uncertain: true });
      expect(wire.requests).toHaveLength(1);
    },
  );
  it('obeys numeric and HTTP-date Retry-After and never truncates a long delay', async () => {
    expect(retryAfter('120', clock())).toBe('2026-11-18T00:02:00.000Z');
    expect(retryAfter('Wed, 18 Nov 2026 00:03:00 GMT', clock())).toBe(
      '2026-11-18T00:03:00.000Z',
    );
    expect(retryAfter(1000000, clock())).toBeNull();
    const w = new FakeNotificationWire();
    w.faults.push(() => ({
      status: 429,
      body: { parameters: { retry_after: 90 } },
    }));
    await expect(
      new NotificationProtocol(w, clock).telegram('10001', {
        chat_id: '10001',
        text: 'test',
      }),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      uncertain: false,
      retryAt: '2026-11-18T00:01:30.000Z',
    });
  });
  it.each(['text', 'chat', 'id'])(
    'rejects corrupted Telegram response %s as uncertain',
    async (field) => {
      const w = new FakeNotificationWire();
      w.faults.push(() => ({
        status: 200,
        body: {
          ok: true,
          result: {
            text: field === 'text' ? 'wrong' : 'test',
            message_id: field === 'id' ? Number.MAX_SAFE_INTEGER + 1 : 101,
            chat: { id: field === 'chat' ? '9999' : '10001' },
          },
        },
      }));
      await expect(
        new NotificationProtocol(w).telegram('10001', {
          chat_id: '10001',
          text: 'test',
        }),
      ).rejects.toMatchObject({ uncertain: true });
    },
  );
  it('requires private repo, exact identity, Issues and explicit credential capability', async () => {
    for (const data of [
      { private: false },
      { full_name: 'Raccoon26/Astro-Events-JP' },
      { has_issues: false },
      { permissions: { push: true } },
    ]) {
      const w = new FakeNotificationWire();
      w.faults.push(() => ({
        status: 200,
        body: {
          full_name: REPORTS_REPO,
          private: true,
          has_issues: true,
          permissions: { issues_write: true },
          ...data,
        },
      }));
      await expect(
        new NotificationProtocol(w).privateRepository(),
      ).rejects.toThrow('PRIVATE_ISSUES_PERMISSION_UNVERIFIED');
      expect(w.issues.size).toBe(0);
    }
  });
  it('creates then updates one deterministic Issue and refuses incomplete reconciliation', async () => {
    const w = new FakeNotificationWire(),
      api = new NotificationProtocol(w),
      p = {
        repository: REPORTS_REPO,
        marker: '<!-- event:synthetic -->',
        title: '合成',
        body: '<!-- event:synthetic -->\ncopy',
      };
    const first = await api.github(p, null);
    await api.github(
      { ...p, body: p.body + '\nrevision' },
      Number(first.externalId),
    );
    expect(w.issues.size).toBe(1);
    w.faults.push(
      () => undefined,
      () => ({
        status: 200,
        body: [],
        headers: { link: '<https://api.github.com/next>; rel="next"' },
      }),
    );
    await expect(api.findIssue(p.marker)).rejects.toThrow(
      'ISSUE_RECONCILIATION_INCOMPLETE',
    );
  });
  it('redacts unknown transport errors and rejects live or wrong-target payloads', async () => {
    const w = new FakeNotificationWire();
    w.faults.push(() => {
      throw Error('sensitive-provider-response');
    });
    await expect(
      new NotificationProtocol(w).telegram('10001', {
        chat_id: '10001',
        text: 'test',
      }),
    ).rejects.toThrow('RESPONSE_LOST_OR_INVALID');
    expect(
      () =>
        new NotificationProtocol({
          mode: 'live',
        } as unknown as FakeNotificationWire),
    ).toThrow('LIVE_DELIVERY_DISABLED');
    await expect(
      new NotificationProtocol(new FakeNotificationWire()).telegram('10001', {
        chat_id: '9999',
        text: 'test',
      }),
    ).rejects.toThrow('TELEGRAM_PAYLOAD_INVALID');
  });
});
