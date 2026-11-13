// Synthetic positive and negative contract examples. Not real official event verification.
import { describe, expect, it } from 'vitest';
import { facilityEffects } from '../src/verification/facilities';
import { parseTemporal } from '../src/verification/temporal';
import type { Field, Notice } from '../src/verification/types';
import {
  CandidateEventValidator,
  candidateToEvent,
} from '../src/verification/validator';
import { verificationFixture } from './verification-fixtures';

const facility = {
  id: 'fixture-facility',
  name: '合成天文台',
  prefecture: 1,
  officialUrl: 'https://example.jp/events',
  operatingStatus: 'unknown' as const,
  closureStart: null,
  closureEnd: null,
  reopeningDate: null,
  statusSourceUrl: null,
  lastVerifiedAt: null,
};
function notice(candidateId: string, fingerprint: string): Notice {
  return {
    id: 'synthetic-notice',
    facilityId: facility.id,
    candidateId,
    sourceId: 'fixture-source',
    kind: 'closure',
    period: parseTemporal('2026年11月1日〜11月30日').value!,
    partial: false,
    routine: false,
    resolvedAt: null,
    verifiedAt: '2026-11-12T00:00:00.000Z',
    evidence: [],
    fingerprint,
  };
}
describe('all thirteen downstream post kinds have distinct verification requirements', () => {
  it.each([
    ['天体観望会', 'observation'],
    ['特別公開', 'open-day'],
    ['宇宙開発イベント', 'space'],
    ['公開講演', 'lecture'],
    ['特別展', 'exhibition'],
    ['ファンイベント', 'vtuber'],
    ['グッズ予約販売', 'merchandise'],
    ['臨時休館', 'closure'],
    ['再開館', 'reopening'],
    ['開催中止', 'cancellation'],
    ['開催を延期', 'postponement'],
    ['申込開始', 'applications-open'],
    ['申込締切', 'deadline'],
  ])(
    '%s → %s with evidence appropriate to the notice',
    async (kind, expected) => {
      const fields: Partial<Record<Field, string | null>> = { kind };
      if (expected === 'cancellation' || expected === 'postponement') {
        fields.status = kind;
        fields.location = null;
        fields.schedule = null;
      }
      if (expected === 'applications-open')
        fields.applicationStart = '申込開始2026年11月15日';
      if (expected === 'deadline')
        fields.applicationDeadline = '申込締切2026年11月20日';
      if (expected === 'vtuber')
        fields.vtuberRelation = '合成公式VTuber 特別出演';
      const f = await verificationFixture(fields);
      if (expected === 'closure' || expected === 'reopening') {
        f.ctx.facility = facility;
        f.ctx.facilityLinked = true;
        f.packet.facilityId = facility.id;
      }
      if (expected === 'vtuber') {
        f.packet.vtuberIds = ['synthetic'];
        f.ctx.vtubers = [{ id: 'synthetic', linked: true, status: 'Verified' }];
      }
      const v = new CandidateEventValidator(f.ctx, f.packet, () =>
          Date.parse(f.ctx.now),
        ),
        r = await v.validate(await candidateToEvent(f.ctx));
      expect(r.reasons).toEqual([]);
      expect(v.verify(r)?.verification.kind).toBe(expected);
    },
  );
  it('does not confuse a verified closure announcement with an event cancelled by its own notice', async () => {
    const f = await verificationFixture({
      kind: '臨時休館',
      status: '臨時休館',
      schedule: '休館期間2026年11月1日〜11月30日',
    });
    f.ctx.facility = facility;
    f.ctx.facilityLinked = true;
    f.packet.facilityId = facility.id;
    f.ctx.notices = [notice(f.ctx.candidate.id, f.ctx.candidate.fingerprint)];
    const v = new CandidateEventValidator(f.ctx, f.packet, () =>
        Date.parse(f.ctx.now),
      ),
      r = await v.validate(await candidateToEvent(f.ctx));
    expect(v.verify(r)?.verification.kind).toBe('closure');
    expect(r.impacts[0]?.cancellationConfirmed).toBe(false);
  });
});
describe('month precision never silently discards periods or facility overlaps', () => {
  it('keeps a mid-month closure uncertain for a month-only exhibition', () => {
    const n = notice('synthetic', 'a'.repeat(64));
    n.period = parseTemporal('2026年11月15日〜11月20日').value!;
    const event = {
      startMonth: '2026-11',
      startDatetime: null,
      endDatetime: null,
    };
    expect(facilityEffects(event, [n])[0]?.impact).toBe('uncertain');
    n.period = parseTemporal('2026年12月15日〜12月20日').value!;
    expect(facilityEffects(event, [n])).toEqual([]);
  });
  it.each(['2026年11月〜12月', '0000年11月'])(
    'holds unsupported or invalid month input %s',
    (raw) => {
      expect(parseTemporal(raw).state).toBe('ambiguous');
    },
  );
});
