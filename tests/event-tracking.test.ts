import { describe, expect, it } from 'vitest';
import { bookingStatus } from '../src/tracking/booking';
import { changesBetween } from '../src/tracking/changes';
import {
  compareIdentity,
  eventIdentity,
  identityText,
  identityUrl,
} from '../src/tracking/identity';
import type { Field } from '../src/verification/types';
import {
  CandidateEventValidator,
  candidateToEvent,
} from '../src/verification/validator';
import { verificationFixture } from './verification-fixtures';

async function facts(overrides: Partial<Record<Field, string | null>> = {}) {
  const f = await verificationFixture(overrides);
  return new CandidateEventValidator(f.ctx, f.packet).validate(
    await candidateToEvent(f.ctx),
  );
}

describe('synthetic identity matrix', () => {
  it('preserves query semantics and official path boundaries', () => {
    expect(
      identityUrl(
        'https://example.jp/a?event_id=7&session=2&utm_source=test#top',
      ),
    ).toBe('https://example.jp/a?event_id=7&session=2');
    expect(identityUrl('https://example.jp/a/')).not.toBe(
      identityUrl('https://example.jp/a'),
    );
    expect(identityText(' 星　空・Ａ ')).toBe('星空a');
  });
  it('normalizes Japanese typography without treating a fuzzy title as a proof', async () => {
    const a = await eventIdentity(await facts({ title: '第２回　合成観望会' }));
    const b = await eventIdentity(await facts({ title: '第2回 合成観望会' }));
    expect(compareIdentity(a, b)).toMatchObject({ exact: true, conflicts: [] });
    expect(
      compareIdentity(a, { ...b, urlKey: 'different', title: b.title + '春' }),
    ).toMatchObject({ exact: false, close: true });
  });
  it.each([
    ['year', 2027],
    ['edition', '3'],
    ['providerSession', 'afternoon'],
    ['session', '午前の部'],
    ['online', true],
    ['ancillary', true],
  ] as const)('separates conflicting %s', async (key, value) => {
    const raw = await eventIdentity(
      await facts({ title: '第2回 夜の部 合成観望会' }),
    );
    const identity = { ...raw, providerSession: 'evening' };
    expect(
      compareIdentity(identity, { ...identity, [key]: value }),
    ).toMatchObject({ exact: false, hard: true });
  });
  it('separates confirmed time slots and holds missing dates for review', async () => {
    const a = await eventIdentity(await facts());
    const b = await eventIdentity(
      await facts({ schedule: '開催日2026年11月23日 17:00〜19:00' }),
    );
    expect(compareIdentity(a, b)).toMatchObject({
      exact: false,
      close: false,
      hard: true,
    });
    expect(
      compareIdentity(a, { ...a, date: null, time: null, year: null }),
    ).toMatchObject({ exact: false, close: true });
  });
  it('keeps distinct venue and organiser facts in review diagnostics', async () => {
    const a = await eventIdentity(await facts());
    const b = { ...a, venue: '別の科学館', organizer: '別の主催者' };
    expect(compareIdentity(a, b)).toMatchObject({
      exact: false,
      conflicts: ['organizer', 'venue'],
    });
  });
});

describe('booking state machine and official changes', () => {
  const at = (iso: string) => Date.parse(iso);
  it('opens and closes in JST and only promises an imminent deadline with a confirmed time', async () => {
    const f = (
      await facts({
        reservation: '要事前予約（抽選）',
        applicationStart: '募集開始2026年11月15日 09:00',
        applicationDeadline: '申込締切2026年11月20日 17:00',
      })
    ).fields;
    expect(bookingStatus(f, at('2026-11-14T23:59:00Z'))).toMatchObject({
      state: 'scheduled',
      selection: 'lottery',
      registration: 'required',
    });
    expect(bookingStatus(f, at('2026-11-15T00:00:00Z'))).toMatchObject({
      state: 'open',
      deadlineKey: null,
    });
    expect(bookingStatus(f, at('2026-11-20T00:00:00Z'))).toMatchObject({
      state: 'imminent',
      deadlineKey: '2026-11-20T08:00:00.000Z',
    });
    expect(bookingStatus(f, at('2026-11-20T08:00:00Z'))).toMatchObject({
      state: 'closed',
      deadlineKey: null,
    });
  });
  it('preserves date-only precision and leaves reception unknown without affirmative facts', async () => {
    const a = (
      await facts({
        reservation: '先着順',
        applicationDeadline: '申込締切2026年11月20日',
      })
    ).fields;
    const onDate = bookingStatus(a, at('2026-11-20T14:59:00Z'));
    expect(onDate).toMatchObject({
      state: 'unknown',
      selection: 'first-come',
      registration: 'method-only',
      deadlineKey: null,
      deadline: { startDatetime: null },
    });
    expect(bookingStatus(a, at('2026-11-20T15:00:00Z')).state).toBe('closed');
  });
  it('records official early closure, extension, reopening and additional recruitment', async () => {
    const earlier = (
      await facts({
        reservation: '要事前予約',
        applicationDeadline: '2026年11月20日 12:00',
      })
    ).fields;
    const closed = (await facts({ reservation: '早期受付終了' })).fields;
    expect(bookingStatus(closed, at('2026-11-19T00:00:00Z'))).toMatchObject({
      state: 'closed',
      changes: ['closed-early'],
    });
    const reopened = (
      await facts({
        reservation: '追加募集中。受付を再開しました。',
        applicationDeadline: '2026年11月21日 12:00',
      })
    ).fields;
    expect(
      bookingStatus(reopened, at('2026-11-19T00:00:00Z'), earlier),
    ).toMatchObject({
      state: 'open',
      changes: [
        'additional-recruitment',
        'reopened',
        'deadline-extended',
        'conditions-changed',
        'deadline-changed',
      ],
    });
  });
  it('does not change event state on a closed registration, and records unknown fees without fabricating free admission', async () => {
    const a = await facts();
    const b = await facts({ reservation: '受付終了', fee: null });
    expect(b.event.status).toBe('scheduled');
    const change = changesBetween(a, b);
    expect(change.differences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'fee',
          official: false,
          after: expect.objectContaining({ state: 'unknown', value: null }),
        }),
        expect.objectContaining({
          field: 'reservation',
          official: true,
          after: expect.objectContaining({ evidence: expect.any(Array) }),
        }),
      ]),
    );
  });
  it('separates an official cancellation from postponement and does not make a conditional notice a cancellation', async () => {
    const first = await facts();
    for (const [notice, kind] of [
      ['開催中止が決定しました', 'cancellation'],
      ['開催を延期します', 'postponement'],
    ] as const) {
      const next = await facts({ status: notice });
      expect(next.kind).toBe(kind);
      expect(
        changesBetween(first, next).differences.find(
          (item) => item.field === 'status',
        ),
      ).toMatchObject({ official: true });
    }
    expect((await facts({ status: '雨天中止' })).event.status).toBe(
      'scheduled',
    );
  });
});
