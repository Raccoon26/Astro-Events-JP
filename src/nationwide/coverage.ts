import { D1Meter } from '../collection/meter';
import { prefecture } from '../prefectures';
import { D1SourceRegistry } from '../registry';
import { VerificationStore } from '../verification/store';
import { assertLocal } from './local';
import { municipalityKey, surveyKind } from './policy';

/** Operator-only, paged evidence inventory. Status fields describe separate stages. */
export async function localCoverage(
  database: D1Database,
  code: number,
  cursor = '',
  now = Date.now(),
) {
  if (cursor.length > 200) throw Error('COVERAGE_CURSOR');
  const area = prefecture(code),
    meter = new D1Meter(database),
    db = meter.db;
  await assertLocal(db);
  const registry = new D1SourceRegistry(db),
    verifier = new VerificationStore(db, {
      localOnly: true,
      enabled: true,
      clock: () => now,
    });
  const sources = await registry.list({ prefecture: code, cursor, limit: 8 });
  const cutoff = new Date(now - 30 * 86400000).toISOString(),
    rows = [];
  for (const source of sources) {
    const [metadata, document, candidates, events] = await db.batch<
      Record<string, unknown>
    >([
      db
        .prepare(`SELECT a.reviewed_at, a.payload, (SELECT max(reviewed_at) FROM source_policy_reviews WHERE source_id=?)
        AS last_policy_review FROM sources s LEFT JOIN source_approvals a ON a.source_id=s.source_id WHERE s.source_id=?`)
        .bind(source.id, source.id),
      db
        .prepare(
          'SELECT attempted_at,succeeded_at,failures FROM collection_documents WHERE source_id=? AND url=?',
        )
        .bind(source.id, source.officialUrl),
      db
        .prepare(
          'SELECT review_status,last_seen_at FROM event_candidates INDEXED BY event_candidates_source WHERE source_id=? AND last_seen_at>=? ORDER BY last_seen_at DESC LIMIT 101',
        )
        .bind(source.id, cutoff),
      db
        .prepare(
          "SELECT stable_event_id FROM events INDEXED BY survey_events_recent WHERE source_id=? AND verification_status='Verified' ORDER BY first_seen_at DESC,stable_event_id DESC LIMIT 7",
        )
        .bind(source.id),
    ]);
    let currentVerified = 0;
    for (const e of events!.results.slice(0, 6))
      if (await verifier.capture(String(e.stable_event_id))) currentVerified++;
    rows.push({
      id: source.id,
      name: source.name,
      municipality: source.municipality,
      municipalityKey: municipalityKey(code, source.municipality),
      category: surveyKind(source),
      configuredFormat: source.format,
      parserPolicyApproved: source.parserApproved === true,
      officialStatus: source.officialStatus,
      lastOfficialReview: source.checkedAt,
      registryState: source.state,
      approvalReviewedAt: metadata!.results[0]?.reviewed_at ?? null,
      lastPolicyReview: metadata!.results[0]?.last_policy_review ?? null,
      lastAttempt: document!.results[0]?.attempted_at ?? null,
      lastSuccess: document!.results[0]?.succeeded_at ?? null,
      consecutiveFailures: document!.results[0]?.failures ?? 0,
      recentCandidateCount: Math.min(100, candidates!.results.length),
      recentUnresolved: candidates!.results
        .slice(0, 100)
        .filter((row) => row.review_status === 'Review Required').length,
      recentCandidateTruncated: candidates!.results.length > 100,
      currentVerified,
      verifiedSampleTruncated: events!.results.length > 6,
    });
  }
  const discovery = (
    await db
      .prepare(
        "SELECT candidate_id,canonical_url,state,reason FROM discovery_candidates WHERE prefecture=? AND state IN('review','unsupported') ORDER BY candidate_id LIMIT 26",
      )
      .bind(code)
      .all()
  ).results;
  return {
    area,
    rows,
    nextCursor: sources.length === 8 ? sources.at(-1)!.id : null,
    discovery: discovery.slice(0, 25),
    discoveryTruncated: discovery.length > 25,
    elapsedPolicy: 'local D1',
    rowsRead: meter.snapshot().rowsRead,
  };
}
