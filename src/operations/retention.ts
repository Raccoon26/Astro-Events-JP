import { digest } from '../collection/text';
import { assertLocal } from '../nationwide/local';
import { retentionCutoffs } from '../retention';

const family = ['event', 'fingerprint', 'crawl', 'operation'] as const;
type Family = (typeof family)[number];
const eligible = `e.status='ended' AND e.verification_status='Verified'
  AND julianday(e.confirmed_ended_at) IS NOT NULL AND e.confirmed_ended_at<?
  AND ((julianday(e.end_datetime) IS NOT NULL AND e.end_datetime<?)
       OR (e.end_datetime IS NULL AND coalesce(e.end_date,e.start_date) IS NOT NULL AND date(coalesce(e.end_date,e.start_date))<?))
  AND (e.start_datetime IS NULL OR (julianday(e.start_datetime) IS NOT NULL AND e.start_datetime<?))
  AND (e.start_date IS NULL OR date(e.start_date)<?) AND (e.end_date IS NULL OR date(e.end_date)<?)
  AND (e.start_month IS NULL OR e.start_month<substr(?,1,7)) AND (e.end_month IS NULL OR e.end_month<substr(?,1,7))
  AND (e.application_start IS NULL OR (julianday(e.application_start) IS NOT NULL AND e.application_start<?))
  AND (e.application_deadline IS NULL OR (julianday(e.application_deadline) IS NOT NULL AND e.application_deadline<?))
  AND NOT EXISTS(SELECT 1 FROM facility_notices n WHERE n.resolved_at IS NULL AND n.event_id=e.stable_event_id)
  AND NOT EXISTS(SELECT 1 FROM facility_notices n WHERE n.resolved_at IS NULL AND n.facility_id=e.facility_id)
  AND NOT EXISTS(SELECT 1 FROM facility_notices n WHERE n.event_id=e.stable_event_id)
  AND NOT EXISTS(SELECT 1 FROM notification_deliveries d WHERE d.event_id=e.stable_event_id OR d.post_id IN
    (SELECT post_id FROM generated_posts WHERE event_id=e.stable_event_id))
  AND NOT EXISTS(SELECT 1 FROM notification_groups g WHERE g.event_id=e.stable_event_id OR g.post_id IN
    (SELECT post_id FROM generated_posts WHERE event_id=e.stable_event_id))
  AND NOT EXISTS(SELECT 1 FROM notification_publications p WHERE p.event_id=e.stable_event_id)
  AND NOT EXISTS(SELECT 1 FROM notification_reviews r WHERE r.event_id=e.stable_event_id)
  AND NOT EXISTS(SELECT 1 FROM notification_issue_claims r WHERE r.event_id=e.stable_event_id)
  AND NOT EXISTS(SELECT 1 FROM notification_issue_links l WHERE l.event_id=e.stable_event_id)
  AND NOT EXISTS(SELECT 1 FROM publication_records p WHERE p.event_id=e.stable_event_id OR p.post_id IN
    (SELECT post_id FROM generated_posts WHERE event_id=e.stable_event_id))
  AND NOT EXISTS(SELECT 1 FROM weekend_members m WHERE m.event_id=e.stable_event_id)
  AND NOT EXISTS(SELECT 1 FROM event_identity_reviews r WHERE r.related_event_id=e.stable_event_id)
  AND NOT EXISTS(SELECT 1 FROM event_identity_holds h WHERE h.candidate_id=e.candidate_id)
  AND NOT EXISTS(SELECT 1 FROM event_candidates c WHERE c.candidate_id=e.candidate_id AND
    (c.review_status<>'Verified' OR NOT EXISTS(SELECT 1 FROM verification_decisions d
      WHERE d.decision_id=e.verification_id AND d.fingerprint=c.fingerprint AND d.generation=c.verification_generation)))
  AND (SELECT count(*) FROM (
    SELECT image_id FROM event_images WHERE event_id=e.stable_event_id LIMIT 6
  ))+(SELECT count(*) FROM generated_posts WHERE event_id=e.stable_event_id)
     +(SELECT count(*) FROM event_changes WHERE event_id=e.stable_event_id)
     +(SELECT count(*) FROM event_vtubers WHERE event_id=e.stable_event_id)
     +(SELECT count(*) FROM event_identity_observations WHERE event_id=e.stable_event_id)
     +(SELECT count(*) FROM event_tracking_revisions WHERE event_id=e.stable_event_id)
     +(SELECT count(*) FROM ops_post_intents WHERE event_id=e.stable_event_id)
     +(SELECT count(*) FROM event_booking_intents WHERE event_id=e.stable_event_id)<=6`;
const oldFingerprint = `f.expires_at<? AND julianday(f.expires_at) IS NOT NULL
    AND date(f.posted_at,'+2 years')<date(?)
    AND NOT EXISTS(SELECT 1 FROM events e WHERE e.stable_event_id=f.stable_event_id)
    AND NOT EXISTS(SELECT 1 FROM notification_deliveries d WHERE d.event_id=f.stable_event_id AND d.state IN('pending','sending','uncertain'))
    AND NOT EXISTS(SELECT 1 FROM publication_records p WHERE p.event_id=f.stable_event_id AND p.status IN('held','recheck'))`;
interface Entry {
  id: string;
  stamp: string;
  revision?: number;
}

export class Retention {
  constructor(private readonly db: D1Database) {}
  private sql(statement: string, ...args: unknown[]) {
    return this.db.prepare(statement).bind(...args);
  }
  private bounds(now: number) {
    const c = retentionCutoffs(new Date(now));
    // Bound day-only proofs conservatively at UTC midnight after the JST calendar day.
    const day = c.now.slice(0, 10);
    return {
      ...c,
      event: [c.details, c.now, day, c.now, day, day, day, day, c.now, c.now],
    };
  }
  async preview(kind: Family, now: number, limit = 8) {
    if (
      !family.includes(kind) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 8
    )
      throw Error('OPS_RETENTION_LIMIT');
    await assertLocal(this.db);
    const c = this.bounds(now);
    const stm =
      kind === 'event'
        ? this.sql(
            `SELECT e.stable_event_id AS id,e.confirmed_ended_at AS stamp,e.revision
        FROM events e INDEXED BY ops_closed_events WHERE e.status='ended' AND e.confirmed_ended_at IS NOT NULL
        AND ${eligible} ORDER BY e.confirmed_ended_at,e.stable_event_id LIMIT ?`,
            ...c.event,
            limit,
          )
        : kind === 'fingerprint'
          ? this.sql(
              `SELECT f.fingerprint AS id,f.expires_at AS stamp FROM posted_fingerprints f
        WHERE ${oldFingerprint} ORDER BY f.expires_at,f.fingerprint LIMIT ?`,
              c.now,
              c.now,
              limit,
            )
          : kind === 'crawl'
            ? this.sql(
                `SELECT run_id AS id,finished_at AS stamp FROM crawl_runs
        WHERE finished_at IS NOT NULL AND finished_at<? AND state IN('completed','deferred','failed')
        ORDER BY finished_at,run_id LIMIT ?`,
                c.runs,
                limit,
              )
            : this.sql(
                `SELECT id,finished_at AS stamp FROM ops_jobs WHERE finished_at IS NOT NULL AND finished_at<?
        AND state IN('done','failed') AND NOT EXISTS(SELECT 1 FROM ops_checkpoints p WHERE p.job_id=ops_jobs.id)
        AND NOT EXISTS(SELECT 1 FROM ops_jobs sibling WHERE sibling.slot=ops_jobs.slot AND sibling.state IN('pending','retry','running'))
        ORDER BY finished_at,id LIMIT ?`,
                c.runs,
                limit,
              );
    const entries = (await stm.all<Entry>()).results;
    return {
      kind,
      entries,
      digest: await digest(JSON.stringify([kind, entries])),
      asOf: c.now,
    };
  }
  async apply(kind: Family, now: number, expected: string, limit = 8) {
    const c = this.bounds(now),
      plan = await this.preview(kind, now, limit);
    if (plan.digest !== expected) throw Error('OPS_RETENTION_STALE');
    if (!plan.entries.length) return 0;
    const nonce = crypto.randomUUID();
    const statements = [
      this.sql(
        'INSERT INTO ops_retention_receipts VALUES(?,?,?,?,0)',
        nonce,
        kind,
        c.now,
        JSON.stringify(plan),
      ),
    ];
    const writes: number[] = [];
    for (const row of plan.entries) {
      if (kind === 'event') {
        statements.push(
          this.sql(
            `INSERT INTO ops_event_tombstones SELECT e.stable_event_id,e.candidate_id,
          (SELECT fingerprint FROM event_candidates WHERE candidate_id=e.candidate_id),?
          FROM events e WHERE e.stable_event_id=? AND e.revision=? AND e.confirmed_ended_at=? AND ${eligible}
          ON CONFLICT(event_id) DO UPDATE SET candidate_id=excluded.candidate_id,fingerprint=excluded.fingerprint,retired_at=excluded.retired_at`,
            c.now,
            row.id,
            row.revision,
            row.stamp,
            ...c.event,
          ),
        );
        statements.push(
          this.sql(
            `DELETE FROM events AS e WHERE e.stable_event_id=? AND e.revision=?
          AND e.confirmed_ended_at=? AND ${eligible}`,
            row.id,
            row.revision,
            row.stamp,
            ...c.event,
          ),
        );
      } else if (kind === 'fingerprint') {
        statements.push(
          this.sql(
            `DELETE FROM posted_fingerprints AS f WHERE f.fingerprint=? AND f.expires_at=? AND ${oldFingerprint}`,
            row.id,
            row.stamp,
            c.now,
            c.now,
          ),
        );
      } else if (kind === 'crawl') {
        statements.push(
          this.sql(
            "DELETE FROM crawl_runs WHERE run_id=? AND finished_at=? AND finished_at<? AND state IN('completed','deferred','failed')",
            row.id,
            row.stamp,
            c.runs,
          ),
        );
      } else {
        statements.push(
          this.sql(
            `DELETE FROM ops_jobs WHERE id=? AND finished_at=? AND finished_at<? AND state IN('done','failed')
          AND NOT EXISTS(SELECT 1 FROM ops_checkpoints WHERE job_id=ops_jobs.id)
          AND NOT EXISTS(SELECT 1 FROM ops_jobs other WHERE other.slot=ops_jobs.slot AND other.state IN('pending','retry','running'))`,
            row.id,
            row.stamp,
            c.runs,
          ),
        );
      }
      writes.push(statements.length - 1);
      statements.push(
        this.sql(
          'UPDATE ops_retention_receipts SET affected=affected+changes() WHERE id=?',
          nonce,
        ),
      );
    }
    const results = await this.db.batch(statements);
    return writes.reduce((n, i) => n + (results[i]?.meta.changes ?? 0), 0);
  }
}
