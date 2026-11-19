import type { VerificationResult } from '../verification/types';
import {
  compareIdentity,
  eventIdentity,
  type Identity,
  identityText,
  isSuccessor,
  MATCH_LIMIT,
} from './identity';

interface Hit {
  event_id: string;
  candidate_id: string;
  revision: number;
  decision_id: string;
  identity_json: string | null;
  result_json: string | null;
}

export const trackingGate = `NOT EXISTS(SELECT 1 FROM event_identity_observations x WHERE x.candidate_id=c.candidate_id AND x.relation='alias')
 AND NOT EXISTS(SELECT 1 FROM event_identity_reviews r JOIN events target ON target.stable_event_id=r.related_event_id
  JOIN events self ON self.candidate_id=c.candidate_id WHERE r.candidate_id=c.candidate_id AND r.decision_id=self.verification_id
  AND (r.state IN('pending','held') OR (r.state='rejected' AND target.verification_id<>r.related_decision_id)))
 AND NOT EXISTS(SELECT 1 FROM event_identity_holds h JOIN events self ON self.candidate_id=c.candidate_id
  WHERE h.candidate_id=c.candidate_id AND h.decision_id=self.verification_id)`;

export async function trackingAvailable(db: D1Database) {
  return (
    (await db
      .prepare(
        "SELECT count(*) AS present FROM sqlite_master WHERE type='view' AND name='event_tracking_schema'",
      )
      .first<number>('present')) === 1
  );
}

export async function trackingPlan(
  db: D1Database,
  result: VerificationResult,
  hasEvent: boolean,
  validateCanonical: (id: string) => Promise<unknown>,
  validateSuccessor: (id: string) => Promise<unknown>,
) {
  const identity = await eventIdentity(result);
  const epoch = await db
    .prepare('SELECT version FROM event_tracking_epoch WHERE singleton=1')
    .first<number>('version');
  if (epoch === null) throw Error('TRACKING_EPOCH_MISSING');
  const existing = await db
    .prepare(
      'SELECT event_id,relation FROM event_identity_observations WHERE candidate_id=?',
    )
    .bind(result.candidateId)
    .first<{ event_id: string; relation: string }>();
  const base = {
    identity,
    epoch,
    alias: existing?.relation === 'alias' ? existing.event_id : null,
    boundId:
      existing?.relation === 'primary'
        ? existing.event_id
        : result.event.stableEventId,
    successor: null as Hit | null,
    reviews: [] as ReviewHit[],
    overflow: false,
  };
  if (base.alias || result.event.verificationStatus !== 'Verified') return base;
  const joins = `SELECT e.stable_event_id AS event_id,e.verification_id AS decision_id,e.candidate_id,e.revision,x.identity_json,NULL AS result_json
    FROM event_identity_observations x JOIN events e ON e.stable_event_id=x.event_id
    JOIN event_candidates c ON c.candidate_id=x.candidate_id
    JOIN verification_decisions vd ON vd.decision_id=x.decision_id AND vd.fingerprint=c.fingerprint
    JOIN sources s ON s.source_id=e.source_id
    WHERE x.relation='primary' AND e.verification_status='Verified' AND e.verification_id=x.decision_id
      AND s.state='active' AND e.stable_event_id<>?`;
  const day = identity.date;
  const nearby = (date: string | null, days: number) =>
    date
      ? new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10)
      : null;
  const statements = [
    db
      .prepare(joins + ' AND x.url_key=? ORDER BY x.candidate_id LIMIT ?')
      .bind(base.boundId, identity.urlKey, MATCH_LIMIT + 1),
    db
      .prepare(joins + ' AND x.provider_key=? ORDER BY x.candidate_id LIMIT ?')
      .bind(base.boundId, identity.providerKey, MATCH_LIMIT + 1),
    db
      .prepare(
        joins +
          ' AND x.organizer_key=? AND x.year=? AND x.start_date>=? AND x.start_date<=? ORDER BY x.start_date,x.candidate_id LIMIT ?',
      )
      .bind(
        base.boundId,
        identity.organizer,
        identity.year,
        nearby(day, -2),
        identity.endDate && day && identity.endDate >= day
          ? identity.endDate
          : nearby(day, 2),
        MATCH_LIMIT + 1,
      ),
    db
      .prepare(`SELECT e.stable_event_id AS event_id,e.verification_id AS decision_id,e.candidate_id,e.revision,NULL AS identity_json,d.result_json
     FROM events e JOIN verification_decisions d ON d.decision_id=e.verification_id
     WHERE e.official_url=? AND e.stable_event_id<>? AND e.verification_status='Verified'
       AND NOT EXISTS(SELECT 1 FROM event_identity_observations x WHERE x.candidate_id=e.candidate_id)
     ORDER BY e.stable_event_id LIMIT ?`)
      .bind(result.event.officialUrl, base.boundId, MATCH_LIMIT + 1),
  ];
  const matches = await db.batch<Hit>(statements);
  const unique = [
    ...new Map(
      matches
        .flatMap((group) => group.results.slice(0, MATCH_LIMIT))
        .map((hit) => [hit.event_id, hit]),
    ).values(),
  ];
  const overflow =
    unique.length > MATCH_LIMIT ||
    matches.some((group) => group.results.length > MATCH_LIMIT);
  const reviews: ReviewHit[] = [];
  const successors: Hit[] = [];
  const proof = identityText(result.packet?.canonicalEvent?.quote ?? null);
  for (const hit of unique.slice(0, MATCH_LIMIT)) {
    const other = hit.identity_json
      ? (JSON.parse(hit.identity_json) as Identity)
      : await eventIdentity(JSON.parse(hit.result_json!) as VerificationResult);
    const comparison = compareIdentity(identity, other);
    const moved =
      isSuccessor(identity, other) &&
      !!other.title &&
      proof.includes(other.title);
    if (moved) successors.push(hit);
    if (comparison.close || moved)
      reviews.push({
        eventId: hit.event_id,
        decisionId: hit.decision_id,
        ...comparison,
      });
  }
  reviews.sort(
    (a, b) =>
      Number(b.exact) - Number(a.exact) ||
      b.titleScore - a.titleScore ||
      (a.eventId < b.eventId ? -1 : 1),
  );
  const exact = reviews.filter((item) => item.exact);
  if (
    !hasEvent &&
    !overflow &&
    successors.length === 1 &&
    reviews.length === 1 &&
    (await validateSuccessor(successors[0]!.event_id))
  )
    return {
      ...base,
      boundId: successors[0]!.event_id,
      successor: successors[0]!,
    };
  // A second plausible canonical is handled as a review instead of arbitrarily taking the first.
  if (
    !hasEvent &&
    !overflow &&
    exact.length === 1 &&
    reviews.length === 1 &&
    (await validateCanonical(exact[0]!.eventId))
  )
    return { ...base, alias: exact[0]!.eventId };
  return { ...base, overflow, reviews };
}

interface ReviewHit extends ReturnType<typeof compareIdentity> {
  eventId: string;
  decisionId: string;
}
