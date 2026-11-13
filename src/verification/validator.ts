import { safeUrl } from '../collection/policy';
import { comparisonText, digest } from '../collection/text';
import type { EventValidator } from '../contracts';
import type { Event, Evidence, PostKind, Validation } from '../domain';
import { parseFees, parseReservation, parseStatus } from './conditions';
import { bounded, checkPacket, officialGate, sourceSnapshot } from './evidence';
import { facilityEffects } from './facilities';
import { parseKind, parseLocation, parseNamed } from './fields';
import { verifyImages } from './images';
import { judgement, parseTemporal } from './temporal';
import {
  type DetailedVerifiedEvent,
  type Field,
  type Judgement,
  type ReviewPacket,
  VERIFICATION_RULE,
  type VerificationContext,
  VerificationError,
  type VerificationResult,
} from './types';

export async function candidateToEvent(
  ctx: VerificationContext,
): Promise<Event> {
  const c = ctx.candidate;
  return {
    stableEventId: `evt-${(await digest(JSON.stringify([c.sourceId, c.id]))).slice(0, 32)}`,
    sourceId: c.sourceId,
    facilityId: null,
    title: c.title,
    category: ctx.source.category,
    organizer: null,
    prefecture: null,
    municipality: null,
    venue: null,
    startDatetime: null,
    endDatetime: null,
    datePrecision: 'unknown',
    startDate: null,
    endDate: null,
    startMonth: null,
    endMonth: null,
    timezone: 'Asia/Tokyo',
    applicationStart: null,
    applicationDeadline: null,
    reservationRequired: null,
    participationFee: null,
    officialUrl: c.officialUrl,
    status: 'unknown',
    verificationStatus: 'Review Required',
    firstSeenAt: ctx.firstSeenAt ?? c.collectedAt,
    lastVerifiedAt: null,
    editionYear: null,
    edition: null,
  };
}
function comparable(value: unknown): string {
  return JSON.stringify(value, (key, val) =>
    key === 'raw'
      ? undefined
      : typeof val === 'string'
        ? val.normalize('NFKC')
        : val,
  );
}
export class CandidateEventValidator implements EventValidator {
  private readonly seals = new WeakMap<
    Validation,
    { value: string; context: string }
  >();
  constructor(
    readonly context: VerificationContext,
    readonly packet: ReviewPacket | null = null,
    readonly clock: () => number = () => Date.now(),
  ) {}
  async validate(input: Event): Promise<VerificationResult> {
    const ctx = this.context,
      c = ctx.candidate;
    bounded(c, 65536);
    bounded(ctx.source, 16384);
    const event = await candidateToEvent(ctx);
    if (
      input.stableEventId !== event.stableEventId ||
      input.sourceId !== c.sourceId ||
      c.sourceId !== ctx.source.id
    )
      throw new VerificationError('stale-candidate');
    const reasons = officialGate(ctx);
    let blocked = false,
      evidence: Evidence[] = [],
      packet = this.packet;
    try {
      safeUrl(c.officialUrl, ctx.source.allowedHosts);
      safeUrl(c.originalUrl, ctx.source.allowedHosts);
      if (
        !/^[a-f0-9]{64}$/.test(c.fingerprint) ||
        !Number.isFinite(Date.parse(c.collectedAt))
      )
        throw new VerificationError('invalid-input');
      if (packet) evidence = await checkPacket(packet, ctx);
    } catch (error) {
      if (
        error instanceof VerificationError &&
        error.code === 'stale-candidate'
      )
        reasons.push('stale-evidence-or-candidate');
      else {
        reasons.push('unsafe-or-invalid-evidence');
        blocked = true;
      }
      packet = null;
    }
    if (!packet) reasons.push('explicit-official-relationship-review-required');
    else if (!packet.relationship.confirmed)
      reasons.push('official-relationship-unconfirmed');
    const combine = <T>(
      field: Field,
      parse: (raw: string) => Judgement<T>,
      proposal: string = '',
    ): Judgement<T> => {
      const claims = packet?.assertions.filter((a) => a.field === field) ?? [];
      if (!claims.length)
        return proposal
          ? {
              ...parse(proposal),
              state: 'unknown',
              evidence: [],
              reasons: ['unattested-extraction-proposal'],
            }
          : judgement<T>('', null);
      const parsed = claims.map((a) => parse(a.quote));
      const present = parsed.filter(
        (v) => v.state === 'confirmed' && v.value !== null,
      );
      const first = parsed[0] ?? judgement<T>('', null);
      const state =
        parsed.some((v) => v.state === 'conflicting') ||
        new Set(present.map((v) => comparable(v.value))).size > 1
          ? 'conflicting'
          : parsed.some((v) => v.state === 'ambiguous' || v.state === 'unknown')
            ? 'ambiguous'
            : 'confirmed';
      return {
        ...first,
        state,
        raw: claims.map((a) => a.quote),
        reasons: [
          ...new Set(parsed.flatMap((p) => p.reasons)),
          ...(state === 'conflicting' ? ['official-field-conflict'] : []),
        ],
        evidence: evidence
          .filter((e) => e.field === field)
          .map((e) => ({ ...e, judgement: state })),
      };
    };
    const fields: VerificationResult['fields'] = {
      title: combine('title', (v) => parseNamed(v, 'title'), c.title),
      kind: combine('kind', parseKind, c.title),
      organizer: combine('organizer', (v) => parseNamed(v, 'organizer')),
      location: combine('location', parseLocation, c.venueRaw.join(' / ')),
      schedule: combine('schedule', parseTemporal, c.dateRaw.join(' / ')),
      applicationStart: combine('applicationStart', (v) =>
        parseTemporal(v, 'applicationStart'),
      ),
      applicationDeadline: combine('applicationDeadline', (v) =>
        parseTemporal(v, 'applicationDeadline'),
      ),
      fee: combine('fee', parseFees),
      reservation: combine('reservation', parseReservation),
      status: combine('status', parseStatus),
      vtuberRelation: combine('vtuberRelation', (v) =>
        judgement(v, v.trim() || null),
      ),
    };
    const confirmed = <T>(j: Judgement<T>): T | null =>
      j.state === 'confirmed' && j.evidence.length > 0 ? j.value : null;
    const title = confirmed(fields.title),
      statedKind = confirmed(fields.kind),
      organizer = confirmed(fields.organizer),
      location = confirmed(fields.location),
      schedule = confirmed(fields.schedule),
      status = confirmed(fields.status),
      fees = confirmed(fields.fee),
      reservation = confirmed(fields.reservation),
      applicationStart = confirmed(fields.applicationStart),
      deadline = confirmed(fields.applicationDeadline);
    const kind =
      status?.status === 'cancelled'
        ? 'cancellation'
        : status?.status === 'postponed'
          ? 'postponement'
          : statedKind;
    if (!title || comparisonText(title) !== comparisonText(c.title))
      reasons.push('event-title-relationship-missing-or-mismatched');
    if (!kind) reasons.push('event-kind-unconfirmed');
    if (!organizer) reasons.push('organizer-unconfirmed');
    event.title = title ?? c.title;
    event.organizer = organizer;
    event.facilityId = packet?.facilityId ?? null;
    if (
      event.facilityId &&
      (!ctx.facilityLinked || ctx.facility?.id !== event.facilityId)
    ) {
      reasons.push('facility-source-relationship-unconfirmed');
      event.facilityId = null;
    }
    const noticeKind = kind === 'cancellation' || kind === 'postponement';
    const primaryDateField: VerificationResult['primaryDateField'] =
      kind === 'applications-open'
        ? 'applicationStart'
        : kind === 'deadline'
          ? 'applicationDeadline'
          : kind === 'merchandise' && !schedule
            ? applicationStart
              ? 'applicationStart'
              : deadline
                ? 'applicationDeadline'
                : null
            : 'schedule';
    const primaryDate =
      primaryDateField === 'applicationStart'
        ? applicationStart
        : primaryDateField === 'applicationDeadline'
          ? deadline
          : schedule;
    if (noticeKind) {
      if (
        status?.status !== (kind === 'cancellation' ? 'cancelled' : 'postponed')
      )
        reasons.push('direct-official-status-unconfirmed');
    } else {
      if (!primaryDate) reasons.push('event-schedule-unconfirmed');
      if (!location) reasons.push('event-location-or-region-unconfirmed');
      if (primaryDate?.precision === 'month' && kind !== 'exhibition')
        reasons.push('exact-event-day-unconfirmed');
    }
    if ((kind === 'closure' || kind === 'reopening') && !event.facilityId)
      reasons.push('facility-notice-target-unconfirmed');
    if (location) {
      event.prefecture = location.prefecture;
      event.municipality = location.municipality;
      event.venue = location.online ? 'オンライン' : location.venue;
    }
    if (schedule) {
      event.datePrecision = schedule.precision;
      event.startDate = schedule.startDate;
      event.endDate = schedule.endDate;
      event.startMonth = schedule.startMonth;
      event.endMonth = schedule.endMonth;
      event.startDatetime = schedule.startDatetime
        ? new Date(schedule.startDatetime).toISOString()
        : null;
      event.endDatetime = schedule.endDatetime
        ? new Date(schedule.endDatetime).toISOString()
        : null;
      event.editionYear =
        Number((schedule.startDate ?? schedule.startMonth)?.slice(0, 4)) ||
        null;
    }
    event.status =
      status?.status === 'unknown' && status.conditional.length && schedule
        ? 'scheduled'
        : (status?.status ?? (schedule ? 'scheduled' : 'unknown'));
    if (kind === 'postponement' && !schedule) {
      event.startDatetime = null;
      event.endDatetime = null;
    }
    event.applicationStart = applicationStart?.startDatetime
      ? new Date(applicationStart.startDatetime).toISOString()
      : null;
    event.applicationDeadline = deadline?.startDatetime
      ? new Date(deadline.startDatetime).toISOString()
      : null;
    if (applicationStart && deadline) {
      const a = applicationStart.startDatetime ?? applicationStart.startDate,
        b = deadline.startDatetime ?? deadline.startDate;
      if (
        a &&
        b &&
        (a.slice(0, 10) > b.slice(0, 10) ||
          (applicationStart.startDatetime &&
            deadline.startDatetime &&
            Date.parse(a) > Date.parse(b)))
      )
        reasons.push('application-window-reversed');
    }
    // The deadline being in the past never changes event.status.
    event.reservationRequired = reservation?.required ?? null;
    event.participationFee =
      fees && fees.participation !== 'unknown'
        ? fields.fee.raw.join(' / ')
        : null;
    for (const [field, j] of Object.entries(fields))
      if (
        (j.state === 'ambiguous' || j.state === 'conflicting') &&
        !(
          kind === 'postponement' &&
          field === 'schedule' &&
          j.state === 'ambiguous' &&
          j.reasons.includes('date-undecided')
        )
      )
        reasons.push(`${field}:${j.state}`);
    if (ctx.source.category === 'vtuber') {
      if (
        !packet?.vtuberIds.length ||
        !confirmed(fields.vtuberRelation) ||
        packet.vtuberIds.some(
          (id) =>
            !ctx.vtubers.some(
              (v) => v.id === id && v.linked && v.status === 'Verified',
            ),
        )
      )
        reasons.push('vtuber-official-relationship-unconfirmed');
      if (
        /雑談|定期配信|通常配信/u.test(c.title) &&
        !/特別|記念|周年|誕生|イベント/u.test(c.title)
      )
        reasons.push('ordinary-stream-out-of-scope');
    }
    const impacts = event.facilityId ? facilityEffects(event, ctx.notices) : [];
    if (impacts.length && !noticeKind)
      reasons.push('facility-impact-review-required');
    if (ctx.notices.length >= 50)
      reasons.push('facility-notice-page-incomplete');
    const checkedAt = ctx.now;
    const expiresAt = new Date(
      Math.min(
        Date.parse(checkedAt) + 7 * 86400000,
        Date.parse(ctx.approval?.expiresAt ?? checkedAt),
        packet
          ? Date.parse(packet.reviewedAt) + 7 * 86400000
          : Date.parse(checkedAt),
      ),
    ).toISOString();
    event.verificationStatus = blocked
      ? 'Blocked'
      : reasons.length
        ? 'Review Required'
        : 'Verified';
    event.lastVerifiedAt = checkedAt;
    const result: VerificationResult = {
      primaryDateField,
      event,
      evidence: Object.values(fields).flatMap((f) => f.evidence),
      reasons: [...new Set(reasons)],
      candidateId: c.id,
      fingerprint: c.fingerprint,
      candidateDigest: await digest(JSON.stringify(c)),
      packetDigest: await digest(JSON.stringify(packet)),
      sourceDigest: await digest(JSON.stringify(sourceSnapshot(ctx))),
      approvalDigest: await digest(JSON.stringify(ctx.approval)),
      ruleVersion: VERIFICATION_RULE,
      checkedAt,
      expiresAt,
      kind,
      fields,
      images: await verifyImages(ctx, packet),
      impacts,
      facilityEpoch: ctx.facilityEpoch,
      facilityId: event.facilityId,
      packet,
    };
    bounded(result, 65536);
    this.seals.set(result, {
      value: JSON.stringify(result),
      context: JSON.stringify([
        sourceSnapshot(ctx),
        ctx.candidate,
        ctx.approval,
        ctx.facilityEpoch,
      ]),
    });
    return result;
  }
  verify(validation: Validation): DetailedVerifiedEvent | null {
    const seal = this.seals.get(validation),
      result = validation as VerificationResult;
    const current = {
      ...this.context,
      now: new Date(this.clock()).toISOString(),
    };
    if (
      !seal ||
      seal.value !== JSON.stringify(result) ||
      seal.context !==
        JSON.stringify([
          sourceSnapshot(current),
          current.candidate,
          current.approval,
          current.facilityEpoch,
        ]) ||
      result.event.verificationStatus !== 'Verified' ||
      result.ruleVersion !== VERIFICATION_RULE ||
      !result.kind ||
      Date.parse(result.expiresAt) <= this.clock() ||
      officialGate(current).length
    )
      return null;
    return {
      ...structuredClone(result.event),
      verificationStatus: 'Verified',
      verification: {
        primaryDateField: result.primaryDateField,
        candidateId: result.candidateId,
        fingerprint: result.fingerprint,
        ruleVersion: result.ruleVersion,
        checkedAt: result.checkedAt,
        expiresAt: result.expiresAt,
        kind: result.kind as PostKind,
        fields: structuredClone(result.fields),
        images: structuredClone(result.images),
        impacts: structuredClone(result.impacts),
      },
    };
  }
}
