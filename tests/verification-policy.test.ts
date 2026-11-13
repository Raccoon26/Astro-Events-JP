import { describe, expect, it } from 'vitest';
import { digest } from '../src/collection/text';
import type { Evidence, Validation } from '../src/domain';
import {
  parseFees,
  parseReservation,
  parseStatus,
} from '../src/verification/conditions';
import { recommendedImages } from '../src/verification/images';
import { parseTemporal } from '../src/verification/temporal';
import {
  CandidateEventValidator,
  candidateToEvent,
} from '../src/verification/validator';
import { verificationFixture } from './verification-fixtures';

describe('Japanese dates retain precision and explicit field roles', () => {
  it.each([
    ['2026年11月23日', 'confirmed', 'date', '2026-11-23', null],
    [
      '2026/11/23 13:30',
      'confirmed',
      'datetime',
      '2026-11-23',
      '2026-11-23T13:30:00+09:00',
    ],
    [
      '2026年11月23日 開場13:00 / 開始13:30',
      'confirmed',
      'datetime',
      '2026-11-23',
      '2026-11-23T13:30:00+09:00',
    ],
    [
      '開催期間2026年11月1日〜11月30日',
      'confirmed',
      'date',
      '2026-11-01',
      null,
    ],
    ['2026年11月', 'confirmed', 'month', null, null],
    ['11月23日（日）', 'ambiguous', 'unknown', null, null],
    ['2026年11月23日（日）', 'ambiguous', 'unknown', null, null],
    ['2026年2月29日', 'ambiguous', 'unknown', null, null],
    ['2026年11月23日 / 2026年11月25日', 'ambiguous', 'unknown', null, null],
    ['開催日調整中', 'ambiguous', 'unknown', null, null],
    ['延期日未定', 'ambiguous', 'unknown', null, null],
    ['13:30〜15:00', 'ambiguous', 'unknown', null, null],
    ['2026年11月23日 開場13:00', 'ambiguous', 'date', '2026-11-23', null],
  ])(
    'parses %s without inventing a year or timestamp',
    (raw, state, precision, day, time) => {
      const j = parseTemporal(raw as string);
      expect(j.state).toBe(state);
      expect(j.value?.precision).toBe(precision);
      expect(j.value?.startDate).toBe(day);
      expect(j.value?.startDatetime).toBe(time);
    },
  );
  it('supports explicit overnight and rejects an unmarked reversed time', () => {
    expect(
      parseTemporal('2026年11月23日 23:00〜翌1:00').value?.endDatetime,
    ).toBe('2026-11-24T01:00:00+09:00');
    expect(parseTemporal('2026年11月23日 23:00〜1:00').state).toBe('ambiguous');
  });
  it('separates publication and application dates from an event schedule', () => {
    expect(parseTemporal('投稿日2026年11月1日').state).toBe('ambiguous');
    expect(parseTemporal('申込締切2026年11月20日').state).toBe('ambiguous');
    expect(
      parseTemporal('申込締切2026年11月20日', 'applicationDeadline').value
        ?.startDate,
    ).toBe('2026-11-20');
    expect(
      parseTemporal('募集開始2026年11月15日', 'applicationStart').value
        ?.startDatetime,
    ).toBeNull();
  });
  it('retains an open-ended closure and rejects invalid clock values', () => {
    const p = parseTemporal('2026年11月1日から終了未定');
    expect(p.state).toBe('confirmed');
    expect(p.value?.endDate).toBeNull();
    expect(parseTemporal('2026年11月23日 25:00').state).toBe('ambiguous');
  });
});
describe('participation, admission and reservation are separate facts', () => {
  it.each([
    ['参加無料', 'free', 'unknown'],
    ['入場無料', 'unknown', 'free'],
    ['参加費500円', 'paid', 'unknown'],
    ['大人500円 / 小学生200円', 'paid', 'unknown'],
  ])('keeps fee scope for %s', (raw, participation, entrance) => {
    expect(parseFees(raw).value).toMatchObject({ participation, entrance });
  });
  it('keeps all tiers and detects conflicting fee claims', () => {
    expect(parseFees('大人500円 / 小学生200円').value?.tiers).toHaveLength(2);
    expect(parseFees('参加無料 / 参加費500円').state).toBe('conflicting');
    expect(parseFees('料金未定').state).toBe('ambiguous');
    expect(parseFees('').state).toBe('unknown');
  });
  it.each([
    ['要事前予約', true, 'advance', null, null],
    ['予約不要', false, null, null, null],
    ['当日受付', null, 'walk-in', null, null],
    ['先着順', null, null, 'first-come', null],
    ['抽選 定員30名', null, null, 'lottery', 30],
  ])(
    'does not infer reservation from %s',
    (raw, required, method, selection, capacity) => {
      expect(parseReservation(raw as string).value).toMatchObject({
        required,
        method,
        selection,
        capacity,
      });
    },
  );
  it.each([
    ['申込受付中', 'open'],
    ['申込開始前', 'not-yet-open'],
    ['受付終了', 'closed'],
    ['満席', 'full'],
    ['キャンセル待ち', 'waitlist'],
  ])('retains application state %s', (raw, reception) =>
    expect(parseReservation(raw).value?.reception).toBe(reception),
  );
  it('rejects simultaneous incompatible reservation or reception rules', () => {
    expect(parseReservation('要事前予約 予約不要').state).toBe('conflicting');
    expect(parseReservation('先着順 抽選').state).toBe('conflicting');
    expect(parseReservation('申込受付中 申込開始前').state).toBe('conflicting');
  });
});
describe('direct official changes and conditional weather text differ', () => {
  it.each([
    '雨天中止',
    '雨天決行',
    '荒天時は延期',
    '延期の可能性',
    '延期する可能性があります',
    '受付終了',
    '中止ではありません',
  ])('does not cancel/postpone from %s', (raw) =>
    expect(['cancelled', 'postponed', 'ended']).not.toContain(
      parseStatus(raw).value?.status,
    ),
  );
  it.each([
    ['合成観望会は中止', 'cancelled'],
    ['開催を延期します。延期日未定', 'postponed'],
    ['本イベントは終了しました', 'ended'],
  ])('recognizes direct evidence %s', (raw, status) =>
    expect(parseStatus(raw).value?.status).toBe(status),
  );
});
describe('candidate-bound semantic verification gate', () => {
  async function evaluate(
    fields: Parameters<typeof verificationFixture>[0] = {},
  ) {
    const f = await verificationFixture(fields),
      v = new CandidateEventValidator(f.ctx, f.packet, () =>
        Date.parse(f.ctx.now),
      ),
      r = await v.validate(await candidateToEvent(f.ctx));
    return { ...f, v, r };
  }
  it('provides a sealed VerifiedEvent with field evidence and no fabricated optional facts', async () => {
    const { v, r } = await evaluate({ fee: null, reservation: null });
    expect(r.reasons).toEqual([]);
    expect(r.event.verificationStatus).toBe('Verified');
    expect(v.verify(r)?.verification.fields.schedule.evidence[0]).toMatchObject(
      { candidateFingerprint: r.fingerprint, ruleVersion: 'dev04-1' },
    );
    expect(r.event.participationFee).toBeNull();
    expect(r.event.reservationRequired).toBeNull();
  });
  it('retains date-only values without midnight and supports online venues', async () => {
    const { r } = await evaluate({
      schedule: '開催日2026年11月23日',
      location: 'オンライン開催',
    });
    expect(r.event.verificationStatus).toBe('Verified');
    expect(r.event.startDatetime).toBeNull();
    expect(r.event.startDate).toBe('2026-11-23');
    expect(r.event.prefecture).toBeNull();
  });
  it('keeps admission-only free separate from event participation and never ends an event at a deadline', async () => {
    const { r } = await evaluate({
      fee: '入場無料',
      applicationDeadline: '申込締切2026年11月1日',
      reservation: '受付終了',
    });
    expect(r.event.verificationStatus).toBe('Verified');
    expect(r.event.participationFee).toBeNull();
    expect(r.event.status).toBe('scheduled');
    expect(r.fields.applicationDeadline.value?.startDate).toBe('2026-11-01');
  });
  it('holds missing years, missing venue and conflicting fees for review', async () => {
    for (const fields of [
      { schedule: '11月23日（日）' },
      { location: null },
      { fee: '参加無料 / 参加費500円' },
    ])
      expect((await evaluate(fields)).r.event.verificationStatus).toBe(
        'Review Required',
      );
  });
  it('can verify a direct cancellation or postponed announcement without pretending its new date is known', async () => {
    const cancelled = await evaluate({
      status: '合成観望会は中止',
      schedule: null,
      location: null,
    });
    expect(cancelled.r.event.verificationStatus).toBe('Verified');
    expect(cancelled.r.kind).toBe('cancellation');
    const postponed = await evaluate({
      status: '開催を延期します。延期日未定',
      schedule: '延期日未定',
      location: null,
    });
    expect(postponed.r.reasons).toEqual([]);
    expect(postponed.r.event.verificationStatus).toBe('Verified');
    expect(postponed.r.event.startDatetime).toBeNull();
  });
  it('requires an explicit subject relationship rather than a URL or string match alone', async () => {
    const f = await verificationFixture();
    f.packet.relationship.confirmed = false;
    const v = new CandidateEventValidator(f.ctx, f.packet, () =>
      Date.parse(f.ctx.now),
    );
    expect(
      (await v.validate(await candidateToEvent(f.ctx))).event
        .verificationStatus,
    ).toBe('Review Required');
    const noReview = new CandidateEventValidator(f.ctx, null, () =>
      Date.parse(f.ctx.now),
    );
    expect(
      (await noReview.validate(await candidateToEvent(f.ctx))).event
        .verificationStatus,
    ).toBe('Review Required');
  });
  it('rejects fabricated enums, mutated validation, expired or changed source/candidate context', async () => {
    const { v, r, ctx } = await evaluate();
    expect(v.verify({ ...r })).toBeNull();
    r.event.title = 'changed';
    expect(v.verify(r)).toBeNull();
    const fresh = await evaluate();
    fresh.ctx.source.state = 'paused';
    expect(fresh.v.verify(fresh.r)).toBeNull();
    const changed = await evaluate();
    changed.ctx.candidate.fingerprint = 'b'.repeat(64);
    expect(changed.v.verify(changed.r)).toBeNull();
    expect(
      v.verify({
        event: { ...r.event, verificationStatus: 'Verified' },
        evidence: [] as Evidence[],
        reasons: [],
      } as Validation),
    ).toBeNull();
    expect(ctx.source.id).toBeTruthy();
  });
  it('blocks unsafe URLs and invalid document digests without executing remote instructions', async () => {
    const f = await verificationFixture();
    f.packet.documents[0]!.url = 'https://127.0.0.1/admin';
    const v = new CandidateEventValidator(f.ctx, f.packet, () =>
      Date.parse(f.ctx.now),
    );
    expect(
      (await v.validate(await candidateToEvent(f.ctx))).event
        .verificationStatus,
    ).toBe('Blocked');
    const bad = await verificationFixture();
    bad.packet.documents[0]!.digest = '0'.repeat(64);
    const invalid = new CandidateEventValidator(bad.ctx, bad.packet, () =>
      Date.parse(bad.ctx.now),
    );
    expect(
      (await invalid.validate(await candidateToEvent(bad.ctx))).event
        .verificationStatus,
    ).toBe('Blocked');
    expect(
      (globalThis as Record<string, unknown>).maliciousExecuted,
    ).toBeUndefined();
  });
  it('records conflicting official documents and stale excerpts', async () => {
    const f = await verificationFixture();
    const text = '参加費700円';
    f.packet.documents.push({
      id: 'other',
      url: 'https://example.jp/events/other',
      text,
      digest: await digest(text),
      checkedAt: f.ctx.now,
      version: 'other',
    });
    f.packet.assertions.push({
      field: 'fee',
      quote: text,
      documentId: 'other',
    });
    let v = new CandidateEventValidator(f.ctx, f.packet, () =>
      Date.parse(f.ctx.now),
    );
    expect(
      (await v.validate(await candidateToEvent(f.ctx))).fields.fee.state,
    ).toBe('conflicting');
    f.packet.documents[0]!.checkedAt = '2020-01-01T00:00:00Z';
    v = new CandidateEventValidator(f.ctx, f.packet, () =>
      Date.parse(f.ctx.now),
    );
    expect(
      (await v.validate(await candidateToEvent(f.ctx))).event
        .verificationStatus,
    ).toBe('Review Required');
  });
  it('does not promote an unverified VTuber or daily stream even with other confirmed fields', async () => {
    const f = await verificationFixture({
      vtuberRelation: '公式本人と主催者のイベント発表',
    });
    f.ctx.source.category = 'vtuber';
    f.packet.vtuberIds = ['kokona'];
    f.ctx.vtubers = [{ id: 'kokona', status: 'Review Required', linked: true }];
    const v = new CandidateEventValidator(f.ctx, f.packet, () =>
      Date.parse(f.ctx.now),
    );
    expect(
      (await v.validate(await candidateToEvent(f.ctx))).event
        .verificationStatus,
    ).toBe('Review Required');
  });
  it('separates unknown image rights from event truth and requires explicit reupload/credit evidence', async () => {
    const f = await verificationFixture();
    f.ctx.candidate.images = [
      {
        url: 'https://example.jp/poster.jpg',
        sourceUrl: f.ctx.candidate.officialUrl,
        type: 'poster',
        relation: 'synthetic event',
        rightsStatus: 'unknown',
        rightsEvidenceUrl: null,
        attribution: null,
        lastCheckedAt: f.ctx.now,
        available: null,
      },
    ];
    let v = new CandidateEventValidator(f.ctx, f.packet, () =>
        Date.parse(f.ctx.now),
      ),
      r = await v.validate(await candidateToEvent(f.ctx));
    expect(r.event.verificationStatus).toBe('Verified');
    expect(recommendedImages(r.images)).toEqual([]);
    const text = 'この画像はSNSへの転載を許可します。クレジット必須。';
    f.packet.documents.push({
      id: 'license',
      url: 'https://example.jp/license',
      checkedAt: f.ctx.now,
      text,
      digest: await digest(text),
      version: 'license1',
    });
    f.packet.images = [
      {
        imageUrl: 'https://example.jp/poster.jpg',
        documentId: 'license',
        quote: text,
        relationConfirmed: true,
        scope: 'image-reupload',
        attributionRequired: true,
        attribution: null,
        available: true,
        availabilityCheckedAt: f.ctx.now,
        availabilityWitness: {
          imageUrl: 'https://example.jp/poster.jpg',
          status: 200,
          method: 'manual-observation',
          checkedAt: f.ctx.now,
        },
      },
    ];
    v = new CandidateEventValidator(f.ctx, f.packet, () =>
      Date.parse(f.ctx.now),
    );
    r = await v.validate(await candidateToEvent(f.ctx));
    expect(r.images[0]?.imageRightsStatus).toBe('unknown');
    f.packet.images[0]!.attribution = '©合成施設';
    v = new CandidateEventValidator(f.ctx, f.packet, () =>
      Date.parse(f.ctx.now),
    );
    r = await v.validate(await candidateToEvent(f.ctx));
    expect(recommendedImages(r.images)).toHaveLength(1);
    f.packet.images[0]!.available = false;
    f.packet.images[0]!.availabilityWitness!.status = 404;
    v = new CandidateEventValidator(f.ctx, f.packet, () =>
      Date.parse(f.ctx.now),
    );
    r = await v.validate(await candidateToEvent(f.ctx));
    expect(r.event.verificationStatus).toBe('Verified');
    expect(recommendedImages(r.images)).toEqual([]);
  });
});
