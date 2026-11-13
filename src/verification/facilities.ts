import { digest } from '../collection/text';
import type { FacilityImpact, FacilityMonitor } from '../contracts';
import type { Event, Facility } from '../domain';
import { checkPacket, officialGate } from './evidence';
import { parseTemporal } from './temporal';
import {
  type FacilityEffect,
  type Notice,
  type ReviewPacket,
  type VerificationContext,
  VerificationError,
} from './types';

function jstDate(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? new Date(time + 9 * 3600000).toISOString().slice(0, 10)
    : null;
}
function monthEnd(value: string | null | undefined) {
  if (!value || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10);
}
export function facilityEffects(
  event: Pick<
    Event,
    | 'startDate'
    | 'endDate'
    | 'startDatetime'
    | 'endDatetime'
    | 'startMonth'
    | 'endMonth'
  >,
  notices: Notice[],
): FacilityEffect[] {
  const start =
    event.startDate ?? jstDate(event.startDatetime) ?? event.startMonth ?? null;
  const end =
    event.endDate ??
    jstDate(event.endDatetime) ??
    monthEnd(event.endMonth ?? event.startMonth) ??
    start;
  return notices
    .filter(
      (n) =>
        !n.routine &&
        !n.resolvedAt &&
        [
          'closure',
          'renovation',
          'maintenance',
          'operating-change',
          'venue-change',
        ].includes(n.kind),
    )
    .flatMap((n) => {
      const a =
          n.period.startDate ??
          (n.period.startMonth ? n.period.startMonth + '-01' : null),
        b = n.period.endDate ?? monthEnd(n.period.endMonth);
      if (start && b && start > b) return [];
      if (end && a && end < a) return [];
      return [
        {
          noticeId: n.id,
          impact:
            !start ||
            !a ||
            n.partial ||
            Boolean(event.startMonth) ||
            n.period.precision === 'month' ||
            start.length !== 10 ||
            a.length !== 10
              ? ('uncertain' as const)
              : ('overlap' as const),
          cancellationConfirmed: false as const,
          reason: n.partial
            ? 'partial-facility-impact-needs-review'
            : 'facility-notice-is-not-event-cancellation',
        },
      ];
    });
}
export async function verifyFacilityNotice(
  ctx: VerificationContext,
  packet: ReviewPacket,
): Promise<Notice | null> {
  if (
    officialGate(ctx).length ||
    !ctx.facility ||
    !ctx.facilityLinked ||
    packet.facilityId !== ctx.facility.id
  )
    throw new VerificationError('unsafe-evidence');
  const evidence = await checkPacket(packet, ctx);
  if (!packet.relationship.confirmed)
    throw new VerificationError('unsafe-evidence');
  const text = packet.assertions
    .filter((a) => ['status', 'kind', 'schedule'].includes(a.field))
    .map((a) => a.quote)
    .join(' ');
  if (/通常休館日|毎週.{0,4}曜日休館/u.test(text) && !/特別開館/u.test(text))
    return null;
  const kind: Notice['kind'] = /特別開館/u.test(text)
    ? 'special-opening'
    : /夜間開館/u.test(text)
      ? 'night-opening'
      : /再開館|リニューアルオープン/u.test(text)
        ? 'reopening'
        : /改修工事|リニューアル工事/u.test(text)
          ? 'renovation'
          : /臨時休館|休館期間延長|休館/u.test(text)
            ? 'closure'
            : /設備点検/u.test(text)
              ? 'maintenance'
              : /場所変更|会場変更/u.test(text)
                ? 'venue-change'
                : 'operating-change';
  if (kind === 'operating-change' && !/臨時|運営変更|営業時間変更/u.test(text))
    throw new VerificationError('invalid-input');
  const schedules = packet.assertions
    .filter((a) => a.field === 'schedule')
    .map((a) => parseTemporal(a.quote));
  const period = schedules[0] ?? parseTemporal('');
  if (
    schedules.some((p) => p.state !== 'confirmed') ||
    new Set(schedules.map((p) => JSON.stringify({ ...p.value, raw: null })))
      .size !== 1
  )
    throw new VerificationError('invalid-input');
  if (
    /再開館|リニューアルオープン/u.test(text) &&
    /臨時休館|改修工事|休館期間/u.test(text)
  )
    throw new VerificationError('invalid-input');
  if (
    period.state !== 'confirmed' ||
    !period.value ||
    period.value.precision === 'unknown'
  )
    throw new VerificationError('invalid-input');
  const resolves = packet.resolvesNoticeIds ?? [];
  if (
    resolves.length &&
    (kind !== 'reopening' ||
      /一部|部分/u.test(text) ||
      !ctx.notices.every(
        (n) => !resolves.includes(n.id) || n.facilityId === ctx.facility?.id,
      ) ||
      resolves.some((id) => !ctx.notices.some((n) => n.id === id)))
  )
    throw new VerificationError('invalid-input');
  return {
    id: `notice-${(await digest(JSON.stringify([ctx.facility.id, ctx.candidate.id]))).slice(0, 32)}`,
    resolves,
    facilityId: ctx.facility.id,
    candidateId: ctx.candidate.id,
    sourceId: ctx.source.id,
    kind,
    period: period.value,
    partial: /一部|部分|展示室のみ/u.test(text),
    routine: false,
    resolvedAt: null,
    verifiedAt: ctx.now,
    evidence,
    fingerprint: ctx.candidate.fingerprint,
  };
}
export class D1FacilityMonitor implements FacilityMonitor {
  constructor(readonly db: D1Database) {}
  async inspect(facility: Facility): Promise<
    FacilityImpact & {
      impacts: { eventId: string; effects: FacilityEffect[] }[];
      truncated: boolean;
    }
  > {
    const results = await this.db.batch<Record<string, unknown>>([
      this.db
        .prepare(
          'SELECT notice_id,verification_payload FROM facility_notices WHERE facility_id=?1 AND resolved_at IS NULL AND routine_closure=0 ORDER BY notice_id LIMIT 51',
        )
        .bind(facility.id),
      this.db
        .prepare(
          'SELECT stable_event_id,source_id,facility_id,title,category,organizer,prefecture,municipality,venue,start_datetime,end_datetime,date_precision,start_date,end_date,start_month,end_month,timezone,official_url,status,verification_status,first_seen_at FROM events WHERE facility_id=?1 ORDER BY stable_event_id LIMIT 51',
        )
        .bind(facility.id),
    ]);
    const notices =
      results[0]?.results
        .map((row) =>
          row.verification_payload
            ? (JSON.parse(String(row.verification_payload)) as Notice)
            : null,
        )
        .filter((v): v is Notice => v !== null) ?? [];
    const legacy = (results[0]?.results ?? [])
      .filter((row) => !row.verification_payload)
      .map((row) => ({
        noticeId: String(row.notice_id),
        impact: 'uncertain' as const,
        cancellationConfirmed: false as const,
        reason: 'legacy-facility-notice-requires-review',
      }));
    const events = results[1]?.results ?? [];
    const impacts = events
      .slice(0, 50)
      .map((row) => ({
        eventId: String(row.stable_event_id),
        effects: [
          ...facilityEffects(
            {
              startDatetime: row.start_datetime as string | null,
              endDatetime: row.end_datetime as string | null,
              startDate: row.start_date as string | null,
              endDate: row.end_date as string | null,
              startMonth: row.start_month as string | null,
              endMonth: row.end_month as string | null,
            },
            notices,
          ),
          ...legacy,
        ],
      }))
      .filter((e) => e.effects.length);
    return {
      facility,
      affectedEvents: impacts.map((e) => e.eventId),
      evidence: notices.flatMap((n) => n.evidence),
      cancellationConfirmed: false,
      impacts,
      truncated: (results[0]?.results.length ?? 0) > 50 || events.length > 50,
    };
  }
}
