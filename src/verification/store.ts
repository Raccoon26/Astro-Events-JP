import { withinBudget } from '../budget';
import { D1Meter } from '../collection/meter';
import { digest } from '../collection/text';
import type { Approval, EventCandidate } from '../collection/types';
import type { Event, Facility, Usage } from '../domain';
import { hydrate, type RegistryRow } from '../registry';
import { bounded } from './evidence';
import { verifyFacilityNotice } from './facilities';
import {
  type DetailedVerifiedEvent,
  type Notice,
  type ReviewPacket,
  VERIFICATION_RULE,
  type VerificationContext,
  VerificationError,
  type VerificationResult,
} from './types';
import { CandidateEventValidator, candidateToEvent } from './validator';

const sourceToken =
  'json_array(s.official_url,s.allowed_hosts_json,s.category,s.prefecture,s.municipality,s.format,s.state,s.robots_checked_at,s.terms_reviewed_at,s.min_interval_seconds,m.payload,a.payload)';
const facilityToken =
  'json_array(f.facility_id,f.operating_status,f.closure_start,f.closure_end,f.reopening_date,f.status_source_url,f.last_verified_at,f.verification_epoch,f.facility_name,f.prefecture,f.official_url,EXISTS(SELECT 1 FROM facility_sources fs WHERE fs.facility_id=f.facility_id AND fs.source_id=s.source_id))';
const noticeToken =
  "COALESCE((SELECT json_group_array(json_object('id',notice_id,'payload',verification_payload)) FROM (SELECT notice_id,verification_payload FROM facility_notices WHERE facility_id=f.facility_id AND resolved_at IS NULL AND routine_closure=0 ORDER BY notice_id LIMIT 51)),'[]')";
const documentToken =
  "COALESCE((SELECT json_group_array(json_object('url',url,'digest',digest,'changedAt',changed_at)) FROM (SELECT url,digest,changed_at FROM collection_documents WHERE source_id=s.source_id AND url IN(json_extract(c.payload,'$.originalUrl'),c.official_url) ORDER BY url)),'[]')";
const vtuberToken =
  "COALESCE((SELECT json_group_array(json_object('id',vtuber_id,'status',verification_status,'linked',1)) FROM (SELECT v.vtuber_id,v.verification_status FROM vtubers v JOIN vtuber_sources vs ON vs.vtuber_id=v.vtuber_id WHERE vs.source_id=s.source_id ORDER BY v.vtuber_id LIMIT 9)),'[]')";
const eventColumns = [
  'stable_event_id',
  'source_id',
  'facility_id',
  'title',
  'category',
  'organizer',
  'prefecture',
  'municipality',
  'venue',
  'start_datetime',
  'end_datetime',
  'timezone',
  'date_precision',
  'application_start',
  'application_deadline',
  'reservation_required',
  'participation_fee',
  'official_url',
  'status',
  'verification_status',
  'first_seen_at',
  'last_verified_at',
  'edition_year',
  'edition',
  'candidate_id',
  'verification_id',
  'start_date',
  'end_date',
  'start_month',
  'end_month',
  'revision',
] as const;
const eventToken = `COALESCE((SELECT json_array(${eventColumns.map((c) => `e.${c}`).join(',')}) FROM events e WHERE e.candidate_id=c.candidate_id),'null')`;
const joins =
  "FROM event_candidates c JOIN sources s ON s.source_id=c.source_id LEFT JOIN registry_metadata m ON m.kind='source' AND m.record_id=s.source_id LEFT JOIN source_approvals a ON a.source_id=s.source_id LEFT JOIN facilities f ON f.facility_id=?";
interface Row extends RegistryRow {
  candidate_payload: string;
  candidate_fingerprint: string;
  candidate_generation: number;
  candidate_first_seen: string;
  source_token: string;
  facility_token: string;
  notice_token: string;
  document_token: string;
  vtuber_token: string;
  event_token: string;
  approval_payload: string | null;
  facility_payload: string | null;
  facility_linked: number;
}
export interface LoadedVerification {
  identity: {
    environment: string;
    database_name: string;
    schema_version: number;
  };
  context: VerificationContext;
  row: Row;
  packet: ReviewPacket | null;
}
export interface VerificationOptions {
  enabled?: boolean;
  localOnly?: boolean;
  clock?: () => number;
}
function eventValues(
  event: Event,
  candidateId: string,
  decisionId: string,
  generation: number,
): unknown[] {
  return [
    event.stableEventId,
    event.sourceId,
    event.facilityId,
    event.title,
    event.category,
    event.organizer,
    event.prefecture,
    event.municipality,
    event.venue,
    event.startDatetime,
    event.endDatetime,
    event.timezone,
    event.datePrecision ?? 'unknown',
    event.applicationStart,
    event.applicationDeadline,
    event.reservationRequired === null
      ? null
      : event.reservationRequired
        ? 1
        : 0,
    event.participationFee,
    event.officialUrl,
    event.status,
    event.verificationStatus,
    event.firstSeenAt,
    event.lastVerifiedAt,
    event.editionYear,
    event.edition,
    candidateId,
    decisionId,
    event.startDate ?? null,
    event.endDate ?? null,
    event.startMonth ?? null,
    event.endMonth ?? null,
    generation,
  ];
}
export class VerificationStore {
  readonly meter: D1Meter;
  readonly db: D1Database;
  readonly clock: () => number;
  constructor(
    db: D1Database,
    readonly options: VerificationOptions = {},
  ) {
    this.meter = new D1Meter(db);
    this.db = this.meter.db;
    this.clock = options.clock ?? (() => Date.now());
  }
  async schema() {
    try {
      if (
        (await this.db
          .prepare('SELECT version FROM verification_schema')
          .first<number>('version')) !== 1
      )
        throw new Error();
      const identity = await this.db
        .prepare(
          'SELECT environment,database_name,schema_version FROM deployment_identity WHERE singleton=1',
        )
        .first<{
          environment: string;
          database_name: string;
          schema_version: number;
        }>();
      if (
        !identity ||
        !['staging', 'production'].includes(identity.environment) ||
        identity.database_name !== `astro-events-jp-${identity.environment}` ||
        identity.schema_version !== 2
      )
        throw new VerificationError('environment-mismatch');
      return identity;
    } catch (error) {
      if (error instanceof VerificationError) throw error;
      throw new VerificationError('schema-unavailable');
    }
  }
  async load(
    candidateId: string,
    packet: ReviewPacket | null = null,
  ): Promise<LoadedVerification> {
    const identity = await this.schema();
    if (!candidateId || candidateId.length > 200)
      throw new VerificationError('invalid-input');
    if (packet) bounded(packet, 24576);
    const row = await this.db
      .prepare(
        `SELECT s.*,m.payload,c.payload AS candidate_payload,c.fingerprint AS candidate_fingerprint,c.verification_generation AS candidate_generation,c.first_seen_at AS candidate_first_seen,${sourceToken} AS source_token,${facilityToken} AS facility_token,${noticeToken} AS notice_token,${documentToken} AS document_token,${vtuberToken} AS vtuber_token,${eventToken} AS event_token,a.payload AS approval_payload,CASE WHEN f.facility_id IS NULL THEN NULL ELSE json_object('id',f.facility_id,'name',f.facility_name,'prefecture',f.prefecture,'officialUrl',f.official_url,'operatingStatus',f.operating_status,'closureStart',f.closure_start,'closureEnd',f.closure_end,'reopeningDate',f.reopening_date,'statusSourceUrl',f.status_source_url,'lastVerifiedAt',f.last_verified_at) END AS facility_payload,EXISTS(SELECT 1 FROM facility_sources fs WHERE fs.facility_id=f.facility_id AND fs.source_id=s.source_id) AS facility_linked ${joins} WHERE c.candidate_id=?`,
      )
      .bind(packet?.facilityId ?? null, candidateId)
      .first<Row>();
    if (!row) throw new VerificationError('stale-candidate');
    const candidate = JSON.parse(row.candidate_payload) as EventCandidate;
    bounded(candidate, 65536);
    if (
      candidate.id !== candidateId ||
      candidate.fingerprint !== row.candidate_fingerprint ||
      candidate.sourceId !== row.source_id
    )
      throw new VerificationError('stale-candidate');
    const facility = row.facility_payload
      ? (JSON.parse(row.facility_payload) as Facility)
      : null;
    const notices = (
      JSON.parse(row.notice_token) as { id: string; payload: string | null }[]
    ).map((n) =>
      n.payload
        ? (JSON.parse(n.payload) as Notice)
        : {
            id: n.id,
            facilityId: facility?.id ?? '',
            candidateId: 'legacy',
            sourceId: row.source_id,
            kind: 'closure' as const,
            period: {
              precision: 'unknown' as const,
              startDate: null,
              endDate: null,
              startMonth: null,
              endMonth: null,
              startDatetime: null,
              endDatetime: null,
              doorsTime: null,
              raw: 'unverified legacy notice',
            },
            partial: true,
            routine: false,
            resolvedAt: null,
            verifiedAt: '',
            evidence: [],
            fingerprint: '',
          },
    );
    const context: VerificationContext = {
      firstSeenAt: row.candidate_first_seen,
      candidate,
      source: hydrate(row),
      approval: row.approval_payload
        ? (JSON.parse(row.approval_payload) as Approval)
        : null,
      now: new Date(this.clock()).toISOString(),
      facility,
      facilityLinked: row.facility_linked === 1,
      facilityEpoch: Number(JSON.parse(row.facility_token)[7] ?? 0),
      notices,
      documents: JSON.parse(row.document_token),
      vtubers: (
        JSON.parse(row.vtuber_token) as {
          id: string;
          status: string;
          linked: number;
        }[]
      ).map((v) => ({ ...v, linked: v.linked === 1 })),
    };
    if (context.vtubers.length > 8)
      throw new VerificationError('invalid-input');
    return { context, row, packet, identity };
  }
  async preview(candidateId: string, packet: ReviewPacket | null = null) {
    const loaded = await this.load(candidateId, packet),
      validator = new CandidateEventValidator(
        loaded.context,
        packet,
        this.clock,
      ),
      result = await validator.validate(await candidateToEvent(loaded.context));
    return { loaded, result };
  }
  private guard(loaded: LoadedVerification, eventId: string | null = null) {
    const r = loaded.row;
    const sql = `EXISTS(SELECT 1 ${joins} WHERE c.candidate_id=? AND c.fingerprint=? AND c.payload=? AND c.verification_generation=? AND ${sourceToken}=? AND ${facilityToken}=? AND ${noticeToken}=? AND ${documentToken}=? AND ${vtuberToken}=? AND ${eventToken}=? AND EXISTS(SELECT 1 FROM deployment_identity WHERE singleton=1 AND environment=? AND database_name=? AND schema_version=?) AND EXISTS(SELECT 1 FROM verification_schema WHERE version=1) AND (? IS NULL OR NOT EXISTS(SELECT 1 FROM events collision WHERE collision.stable_event_id=? AND (collision.candidate_id IS NULL OR collision.candidate_id<>c.candidate_id))))`;
    const values: unknown[] = [
      loaded.packet?.facilityId ?? null,
      loaded.context.candidate.id,
      r.candidate_fingerprint,
      r.candidate_payload,
      r.candidate_generation,
      r.source_token,
      r.facility_token,
      r.notice_token,
      r.document_token,
      r.vtuber_token,
      r.event_token,
      loaded.identity.environment,
      loaded.identity.database_name,
      loaded.identity.schema_version,
      eventId,
      eventId,
    ];
    return { sql, values };
  }
  private async signature(result: VerificationResult) {
    return digest(
      JSON.stringify([
        result.candidateDigest,
        result.packetDigest,
        result.sourceDigest,
        result.approvalDigest,
        result.ruleVersion,
        { ...result.event, lastVerifiedAt: null },
        result.fields,
        result.images,
        result.impacts,
        result.reasons,
      ]),
    );
  }
  async commit(
    loaded: LoadedVerification,
    result: VerificationResult,
    accountUsage: Usage | null,
  ) {
    if (!this.options.enabled) throw new VerificationError('feature-disabled');
    if (
      !this.options.localOnly ||
      (await this.schema()).environment !== 'staging'
    )
      throw new VerificationError('environment-mismatch');
    if (
      !accountUsage ||
      !withinBudget(accountUsage, {
        requests: 0,
        reads: 3000,
        writes: 200,
        databaseBytes: 100000,
      })
    )
      throw new VerificationError('budget-exhausted');
    // Recompute from the bound candidate and explicit review. A caller-supplied enum/result is never trusted.
    const validator = new CandidateEventValidator(
      { ...loaded.context, now: new Date(this.clock()).toISOString() },
      loaded.packet,
      this.clock,
    );
    const trusted = await validator.validate(
      await candidateToEvent(loaded.context),
    );
    if ((await this.signature(trusted)) !== (await this.signature(result)))
      throw new VerificationError('stale-candidate');
    const signature = await this.signature(trusted),
      guard = this.guard(loaded, trusted.event.stableEventId);
    const current = await this.db
      .prepare(
        'SELECT d.decision_id,d.signature FROM events e JOIN verification_decisions d ON d.decision_id=e.verification_id WHERE e.candidate_id=?1',
      )
      .bind(trusted.candidateId)
      .first<{ decision_id: string; signature: string }>();
    if (current?.signature === signature) {
      const fresh = await this.db
        .prepare(`SELECT 1 AS ok WHERE ${guard.sql}`)
        .bind(...guard.values)
        .first('ok');
      if (fresh !== 1) throw new VerificationError('write-conflict');
      return { decisionId: current.decision_id, changed: false };
    }
    const generation = loaded.row.candidate_generation + 1;
    const id = await digest(
      JSON.stringify([trusted.candidateId, generation, signature]),
    );
    const json = JSON.stringify(trusted),
      nonce = crypto.randomUUID();
    bounded(trusted, 65536);
    // One transaction, all statements share the same CAS guard. The generation update is last.
    const statement = (sql: string, values: unknown[]) =>
      this.db.prepare(sql).bind(...values, ...guard.values);
    const statements = [
      statement(
        `INSERT INTO verification_decisions(decision_id,candidate_id,fingerprint,generation,signature,commit_nonce,rule_version,checked_at,expires_at,status,packet_digest,source_digest,approval_digest,snapshot_json,result_json) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard.sql}`,
        [
          id,
          trusted.candidateId,
          trusted.fingerprint,
          generation,
          signature,
          nonce,
          VERIFICATION_RULE,
          trusted.checkedAt,
          trusted.expiresAt,
          trusted.event.verificationStatus,
          trusted.packetDigest,
          trusted.sourceDigest,
          trusted.approvalDigest,
          JSON.stringify({
            source: loaded.row.source_token,
            facility: loaded.row.facility_token,
            notice: loaded.row.notice_token,
            document: loaded.row.document_token,
            vtuber: loaded.row.vtuber_token,
          }),
          json,
        ],
      ),
      statement(
        `INSERT INTO events(${eventColumns.join(',')},verification_evidence_json) SELECT ${eventColumns.map(() => '?').join(',')},? WHERE EXISTS(SELECT 1 FROM verification_decisions WHERE decision_id=? AND commit_nonce=?) AND ${guard.sql} ON CONFLICT(stable_event_id) DO UPDATE SET ${eventColumns
          .filter((c) => c !== 'stable_event_id')
          .map((c) => `${c}=excluded.${c}`)
          .join(
            ',',
          )},verification_evidence_json=excluded.verification_evidence_json`,
        [
          ...eventValues(trusted.event, trusted.candidateId, id, generation),
          JSON.stringify(trusted.evidence),
          id,
          nonce,
        ],
      ),
    ];
    // Event mutation changes eventToken, so dependent statements use this transaction's newly inserted decision as their guard.
    const committed = `EXISTS(SELECT 1 FROM events e JOIN verification_decisions d ON d.decision_id=e.verification_id WHERE e.stable_event_id=? AND d.decision_id=? AND d.generation=? AND d.commit_nonce=?)`;
    const child = (sql: string, values: unknown[]) =>
      this.db
        .prepare(sql)
        .bind(...values, trusted.event.stableEventId, id, generation, nonce);
    statements.push(
      child(
        `INSERT INTO event_changes(change_id,event_id,revision,detected_at,source_url,change_type,before_json,after_json,official_confirmation) SELECT ?,?,?,?,?,?,(SELECT json_extract(result_json,'$.event') FROM verification_decisions WHERE candidate_id=? AND generation=?),?,? WHERE ${committed}`,
        [
          await digest(id + 'revision'),
          trusted.event.stableEventId,
          generation,
          trusted.checkedAt,
          trusted.event.officialUrl,
          generation === 1
            ? 'initial-verification'
            : trusted.kind === 'cancellation' || trusted.kind === 'postponement'
              ? 'official-status-change'
              : 'reverification',
          trusted.candidateId,
          generation - 1,
          JSON.stringify(trusted.event),
          trusted.event.verificationStatus === 'Verified' ? 1 : 0,
        ],
      ),
    );
    statements.push(
      child(`DELETE FROM event_images WHERE event_id=? AND ${committed}`, [
        trusted.event.stableEventId,
      ]),
    );
    for (const image of trusted.images)
      statements.push(
        child(
          `INSERT INTO event_images(image_id,event_id,image_url,image_source_url,image_type,image_rights_status,image_attribution,rights_evidence_url,image_last_checked_at,available,availability_status,related) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${committed}`,
          [
            await digest(trusted.event.stableEventId + image.imageUrl),
            trusted.event.stableEventId,
            image.imageUrl,
            image.imageSourceUrl,
            image.imageType,
            image.imageRightsStatus,
            image.imageAttribution,
            image.rightsEvidenceUrl,
            image.imageLastCheckedAt,
            image.available === true ? 1 : 0,
            image.available === null || image.available === undefined
              ? 'unknown'
              : image.available
                ? 'available'
                : 'missing',
            image.related ? 1 : 0,
          ],
        ),
      );
    statements.push(
      child(
        `UPDATE event_candidates SET verification_generation=?,review_status=? WHERE candidate_id=? AND verification_generation=? AND ${committed}`,
        [
          generation,
          trusted.event.verificationStatus,
          trusted.candidateId,
          loaded.row.candidate_generation,
        ],
      ),
    );
    const results = await this.db.batch(statements);
    if (
      results[0]?.meta.changes !== 1 ||
      results[1]?.meta.changes !== 1 ||
      results.at(-1)?.meta.changes !== 1
    )
      throw new VerificationError('write-conflict');
    return { decisionId: id, changed: true };
  }
  async verified(eventId: string): Promise<DetailedVerifiedEvent | null> {
    if (!this.options.enabled) return null;
    try {
      await this.schema();
      const saved = await this.db
        .prepare(
          "SELECT d.result_json,d.generation,d.decision_id,e.candidate_id FROM events e JOIN verification_decisions d ON d.decision_id=e.verification_id WHERE e.stable_event_id=?1 AND e.verification_status='Verified' AND d.status='Verified' AND d.rule_version=?2 AND d.expires_at>?3",
        )
        .bind(eventId, VERIFICATION_RULE, new Date(this.clock()).toISOString())
        .first<{
          result_json: string;
          generation: number;
          decision_id: string;
          candidate_id: string;
        }>();
      if (!saved) return null;
      const old = JSON.parse(saved.result_json) as VerificationResult;
      bounded(old, 65536);
      const loaded = await this.load(saved.candidate_id, old.packet);
      if (
        loaded.row.candidate_generation !== saved.generation ||
        old.fingerprint !== loaded.context.candidate.fingerprint
      )
        return null;
      const validator = new CandidateEventValidator(
          loaded.context,
          old.packet,
          this.clock,
        ),
        fresh = await validator.validate(
          await candidateToEvent(loaded.context),
        );
      if (
        fresh.event.verificationStatus !== 'Verified' ||
        (await this.signature(fresh)) !== (await this.signature(old))
      )
        return null;
      const expected = eventValues(
        old.event,
        old.candidateId,
        saved.decision_id,
        saved.generation,
      );
      if (JSON.stringify(expected) !== loaded.row.event_token) return null;
      const guard = this.guard(loaded, eventId);
      if (
        (await this.db
          .prepare(`SELECT 1 AS ok WHERE ${guard.sql}`)
          .bind(...guard.values)
          .first('ok')) !== 1
      )
        return null;
      return validator.verify(fresh);
    } catch {
      return null;
    }
  }
  async pending(
    cursor = '',
    limit = 25,
    group: 'general' | 'vtuber' = 'general',
  ) {
    await this.schema();
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      cursor.length > 200
    )
      throw new VerificationError('invalid-input');
    return (
      await this.db
        .prepare(
          `SELECT c.candidate_id,c.source_id,c.fingerprint,c.review_status,c.verification_generation,s.category,s.prefecture FROM event_candidates c JOIN sources s ON s.source_id=c.source_id LEFT JOIN events e ON e.candidate_id=c.candidate_id LEFT JOIN verification_decisions d ON d.decision_id=e.verification_id LEFT JOIN registry_metadata m ON m.kind='source' AND m.record_id=s.source_id LEFT JOIN source_approvals a ON a.source_id=s.source_id LEFT JOIN facilities f ON f.facility_id=json_extract(d.result_json,'$.facilityId') WHERE c.candidate_id>?1 AND (s.category='vtuber')=?2 AND (c.review_status='Review Required' OR d.expires_at<=?3 OR d.rule_version<>?4 OR s.state<>'active' OR d.fingerprint<>c.fingerprint OR json_extract(d.snapshot_json,'$.source')<>${sourceToken} OR json_extract(d.snapshot_json,'$.document')<>${documentToken} OR json_extract(d.snapshot_json,'$.facility')<>${facilityToken} OR json_extract(d.snapshot_json,'$.notice')<>${noticeToken} OR json_extract(d.snapshot_json,'$.vtuber')<>${vtuberToken}) ORDER BY c.candidate_id LIMIT ?5`,
        )
        .bind(
          cursor,
          group === 'vtuber' ? 1 : 0,
          new Date(this.clock()).toISOString(),
          VERIFICATION_RULE,
          limit,
        )
        .all<Record<string, unknown>>()
    ).results;
  }
  async history(candidateId: string, after = 0, limit = 25) {
    await this.schema();
    if (
      !Number.isInteger(after) ||
      after < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      throw new VerificationError('invalid-input');
    return (
      await this.db
        .prepare(
          'SELECT decision_id,fingerprint,generation,status,checked_at,expires_at,result_json FROM verification_decisions WHERE candidate_id=?1 AND generation>?2 ORDER BY generation LIMIT ?3',
        )
        .bind(candidateId, after, limit)
        .all<Record<string, unknown>>()
    ).results;
  }
  async stats() {
    await this.schema();
    return {
      scope: 'persisted decisions, not a current VerifiedEvent guarantee',
      states: (
        await this.db
          .prepare(
            'SELECT verification_status,COUNT(*) AS count FROM events WHERE candidate_id IS NOT NULL GROUP BY verification_status',
          )
          .all()
      ).results,
    };
  }
  async applyNotice(loaded: LoadedVerification, accountUsage: Usage | null) {
    if (!this.options.enabled) throw new VerificationError('feature-disabled');
    if (
      !this.options.localOnly ||
      (await this.schema()).environment !== 'staging'
    )
      throw new VerificationError('environment-mismatch');
    if (
      !accountUsage ||
      !withinBudget(accountUsage, {
        requests: 0,
        reads: 2000,
        writes: 150,
        databaseBytes: 65536,
      })
    )
      throw new VerificationError('budget-exhausted');
    if (!loaded.packet) throw new VerificationError('invalid-input');
    const now = new Date(this.clock()).toISOString(),
      ctx = { ...loaded.context, now };
    const notice = await verifyFacilityNotice(ctx, loaded.packet);
    if (!notice) return { routineExcluded: true, changed: false };
    const nowDate = new Date(this.clock() + 9 * 3600000)
      .toISOString()
      .slice(0, 10);
    const active = notice.period.startDatetime
      ? Date.parse(notice.period.startDatetime) <= this.clock()
      : Boolean(notice.period.startDate && notice.period.startDate <= nowDate);
    const expired = notice.period.endDatetime
      ? Date.parse(notice.period.endDatetime) < this.clock()
      : Boolean(notice.period.endDate && notice.period.endDate < nowDate);
    const signature = await digest(
      JSON.stringify([
        loaded.packet,
        loaded.row.source_token,
        loaded.row.document_token,
        notice.fingerprint,
        active,
        expired,
        VERIFICATION_RULE,
      ]),
    );
    const previous = await this.db
      .prepare(
        'SELECT facility_id,candidate_id,revision,review_digest,verification_payload FROM facility_notices WHERE notice_id=?1',
      )
      .bind(notice.id)
      .first<{
        facility_id: string;
        candidate_id: string;
        revision: number;
        review_digest: string | null;
        verification_payload: string | null;
      }>();
    if (
      previous &&
      (previous.facility_id !== notice.facilityId ||
        previous.candidate_id !== notice.candidateId)
    )
      throw new VerificationError('write-conflict');
    const guard = this.guard(loaded);
    guard.sql +=
      ' AND NOT EXISTS(SELECT 1 FROM facility_notices WHERE notice_id=? AND (facility_id<>? OR candidate_id IS NULL OR candidate_id<>?))';
    guard.values.push(notice.id, notice.facilityId, notice.candidateId);
    if (previous?.review_digest === signature) {
      if (
        (await this.db
          .prepare(`SELECT 1 AS ok WHERE ${guard.sql}`)
          .bind(...guard.values)
          .first('ok')) !== 1
      )
        throw new VerificationError('write-conflict');
      return { changed: false, notice };
    }
    const revision = (previous?.revision ?? 0) + 1,
      nonce = crypto.randomUUID(),
      payload = JSON.stringify(notice);
    const owned =
      'EXISTS(SELECT 1 FROM facility_notices own WHERE own.notice_id=? AND own.review_nonce=?)';
    const child = (sql: string, params: unknown[]) =>
      this.db.prepare(sql).bind(...params, notice.id, nonce);
    const statements = [
      this.db
        .prepare(
          `INSERT INTO facility_notices(notice_id,facility_id,kind,source_url,starts_at,ends_at,routine_closure,last_verified_at,source_id,candidate_id,fingerprint,verification_payload,revision,review_digest,review_nonce,resolved_at) SELECT ?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,NULL WHERE ${guard.sql} ON CONFLICT(notice_id) DO UPDATE SET kind=excluded.kind,source_url=excluded.source_url,starts_at=excluded.starts_at,ends_at=excluded.ends_at,last_verified_at=excluded.last_verified_at,fingerprint=excluded.fingerprint,verification_payload=excluded.verification_payload,revision=excluded.revision,review_digest=excluded.review_digest,review_nonce=excluded.review_nonce,resolved_at=NULL`,
        )
        .bind(
          notice.id,
          notice.facilityId,
          notice.kind,
          notice.evidence[0]?.sourceUrl ?? ctx.candidate.officialUrl,
          notice.period.startDatetime
            ? new Date(notice.period.startDatetime).toISOString()
            : notice.period.startDate,
          notice.period.endDatetime
            ? new Date(notice.period.endDatetime).toISOString()
            : notice.period.endDate,
          notice.verifiedAt,
          notice.sourceId,
          notice.candidateId,
          notice.fingerprint,
          payload,
          revision,
          signature,
          nonce,
          ...guard.values,
        ),
      child(
        `INSERT INTO facility_notice_history(notice_id,revision,recorded_at,before_json,after_json,review_digest) SELECT ?,?,?,?,?,? WHERE ${owned}`,
        [
          notice.id,
          revision,
          now,
          previous?.verification_payload ?? null,
          payload,
          signature,
        ],
      ),
    ];
    for (const target of active && !expired ? (notice.resolves ?? []) : []) {
      statements.push(
        child(
          `INSERT INTO facility_notice_history(notice_id,revision,recorded_at,before_json,after_json,review_digest) SELECT notice_id,revision+1,?,verification_payload,json_set(verification_payload,'$.resolvedAt',?),? FROM facility_notices WHERE notice_id=? AND facility_id=? AND resolved_at IS NULL AND ${owned}`,
          [now, now, signature + ':' + target, target, notice.facilityId],
        ),
      );
      statements.push(
        child(
          `UPDATE facility_notices SET resolved_at=?,revision=revision+1,verification_payload=json_set(verification_payload,'$.resolvedAt',?) WHERE notice_id=? AND facility_id=? AND resolved_at IS NULL AND ${owned}`,
          [now, now, target, notice.facilityId],
        ),
      );
    }
    const operational =
      notice.partial || !active
        ? null
        : expired
          ? 'unknown'
          : notice.kind === 'reopening'
            ? 'open'
            : notice.kind === 'renovation'
              ? 'renovation'
              : ['closure', 'maintenance'].includes(notice.kind)
                ? 'closed'
                : null;
    statements.push(
      child(
        `UPDATE facilities SET verification_epoch=verification_epoch+1,operating_status=CASE WHEN ? IS NULL THEN operating_status WHEN ?='open' AND EXISTS(SELECT 1 FROM facility_notices n WHERE n.facility_id=facilities.facility_id AND n.resolved_at IS NULL AND n.kind IN('closure','renovation','maintenance')) THEN operating_status ELSE ? END,last_verified_at=?,status_source_url=?,closure_start=CASE WHEN ? IN('closure','renovation','maintenance') AND ?=0 THEN ? ELSE closure_start END,closure_end=CASE WHEN ? IN('closure','renovation','maintenance') AND ?=0 THEN ? ELSE closure_end END,reopening_date=CASE WHEN ?='reopening' THEN ? ELSE reopening_date END WHERE facility_id=? AND verification_epoch=? AND ${owned}`,
        [
          operational,
          operational,
          operational,
          now,
          notice.evidence[0]?.sourceUrl ?? ctx.candidate.officialUrl,
          notice.kind,
          notice.partial ? 1 : 0,
          notice.period.startDatetime
            ? new Date(notice.period.startDatetime).toISOString()
            : notice.period.startDate,
          notice.kind,
          notice.partial ? 1 : 0,
          notice.period.endDatetime
            ? new Date(notice.period.endDatetime).toISOString()
            : notice.period.endDate,
          notice.kind,
          notice.period.startDatetime
            ? new Date(notice.period.startDatetime).toISOString()
            : notice.period.startDate,
          notice.facilityId,
          ctx.facilityEpoch,
        ],
      ),
    );
    const results = await this.db.batch(statements);
    if (results[0]?.meta.changes !== 1 || results.at(-1)?.meta.changes !== 1)
      throw new VerificationError('write-conflict');
    return { changed: true, notice };
  }
  async notices(facilityId: string, cursor = '', limit = 25) {
    await this.schema();
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      cursor.length > 200
    )
      throw new VerificationError('invalid-input');
    return (
      await this.db
        .prepare(
          'SELECT notice_id,kind,source_url,starts_at,ends_at,resolved_at,revision,verification_payload FROM facility_notices WHERE facility_id=?1 AND notice_id>?2 ORDER BY notice_id LIMIT ?3',
        )
        .bind(facilityId, cursor, limit)
        .all<Record<string, unknown>>()
    ).results;
  }
  async noticeHistory(noticeId: string, after = 0, limit = 25) {
    await this.schema();
    if (
      !Number.isInteger(after) ||
      after < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      throw new VerificationError('invalid-input');
    return (
      await this.db
        .prepare(
          'SELECT * FROM facility_notice_history WHERE notice_id=?1 AND revision>?2 ORDER BY revision LIMIT ?3',
        )
        .bind(noticeId, after, limit)
        .all<Record<string, unknown>>()
    ).results;
  }
}
