import { assertLocal } from '../nationwide/local';
import { prefectures } from '../prefectures';
import type { AccountObservation } from './policy';

export async function dailyReport(
  db: D1Database,
  from: string,
  to: string,
  evidence: AccountObservation | null,
) {
  await assertLocal(db);
  const iso = (s: string) =>
    Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
  if (!iso(from) || !iso(to) || Date.parse(to) - Date.parse(from) !== 86400000)
    throw Error('OPS_REPORT_DAY_REQUIRED');
  const queries = [
    `SELECT phase,state,count(*) AS total,max(finished_at) AS last,
      sum(COALESCE(json_extract(result_json,'$.counts.completed'),0)) AS completed,
      sum(COALESCE(json_extract(result_json,'$.counts.reviewed'),0)) AS reviewed,
      sum(COALESCE(json_extract(result_json,'$.counts.posts'),0)) AS posts,
      sum(COALESCE(json_extract(result_json,'$.counts.booking'),0)) AS booking,
      sum(COALESCE(json_extract(result_json,'$.counts.changes'),0)) AS changes,
      sum(COALESCE(json_extract(result_json,'$.counts.parts'),0)) AS parts
      FROM ops_jobs WHERE slot>=? AND slot<? GROUP BY phase,state`,
    `SELECT channel,state,count(*) AS total,min(next_attempt_at) AS next_retry
      FROM notification_deliveries INDEXED BY deliveries_due WHERE state IN('pending','sending','uncertain','failed','sent')
      GROUP BY channel,state`,
    `SELECT kind,sum(affected) AS deleted,count(*) AS batches FROM ops_retention_receipts
      WHERE at>=? AND at<? GROUP BY kind`,
    `SELECT slot,last_at,selected FROM survey_opportunities WHERE lane='regional' ORDER BY slot LIMIT 47`,
    `SELECT prefecture,max(attempted_at) AS last,sum(successes) AS completed,sum(failures) AS failures
       FROM ops_region_results WHERE attempted_at>=? AND attempted_at<? GROUP BY prefecture ORDER BY prefecture`,
    `SELECT s.prefecture,min(s.next_crawl_at) AS next_at,
      sum(CASE WHEN EXISTS(SELECT 1 FROM collection_jobs j WHERE j.source_id=s.source_id AND j.state NOT IN('completed','unchanged')) THEN 1 ELSE 0 END) AS sources_with_pending
      FROM sources s WHERE s.state='active' AND s.prefecture IS NOT NULL GROUP BY s.prefecture`,
    `SELECT state,count(*) AS total,sum(requests) AS requests,sum(sources_processed) AS completed,
      sum(deferred) AS deferred,sum(errors) AS errors,sum(rows_read) AS read_rows,sum(rows_written) AS written_rows
      FROM crawl_runs WHERE started_at>=? AND started_at<? GROUP BY state`,
    `SELECT category,count(*) AS total FROM events WHERE first_seen_at>=? AND first_seen_at<? AND verification_status='Verified' GROUP BY category`,
    `SELECT count(*) AS new_candidates FROM event_candidates WHERE first_seen_at>=? AND first_seen_at<?`,
    `SELECT purpose,count(*) AS total FROM event_tracking_revisions WHERE checked_at>=? AND checked_at<? GROUP BY purpose`,
    `SELECT code FROM ops_warnings WHERE utc_day IN(?,?) ORDER BY code LIMIT 24`,
  ];
  const bind = (statement: string, i: number) => {
    const s = db.prepare(statement);
    return [1, 3, 5].includes(i)
      ? s
      : i === 10
        ? s.bind(from.slice(0, 10), to.slice(0, 10))
        : s.bind(from, to);
  };
  const rows = (await db.batch<Record<string, unknown>>(queries.map(bind))).map(
    (r) => r.results,
  );
  const issueRows = (
    await db
      .prepare(`WITH page AS MATERIALIZED (
    SELECT event_id,issue_number,mode FROM notification_issue_links ORDER BY event_id LIMIT 26)
    SELECT p.event_id,p.issue_number,p.mode,
    CASE
      WHEN EXISTS(SELECT 1 FROM notification_deliveries d WHERE d.event_id=p.event_id AND d.state='uncertain')
        OR EXISTS(SELECT 1 FROM notification_issue_claims c WHERE c.event_id=p.event_id AND c.state='uncertain') THEN 'uncertain'
      WHEN EXISTS(SELECT 1 FROM notification_reviews r WHERE r.event_id=p.event_id AND r.resolved_at IS NULL)
        OR EXISTS(SELECT 1 FROM notification_publications q WHERE q.event_id=p.event_id AND q.status IN('held','recheck')) THEN 'hold-or-recheck'
      WHEN e.verification_status IS NULL OR e.verification_status<>'Verified' THEN 'verify'
      WHEN e.status='cancelled' THEN 'cancelled'
      WHEN e.status='postponed' THEN 'change-tracking'
      WHEN e.status='ended' AND julianday(e.confirmed_ended_at) IS NOT NULL AND e.confirmed_ended_at<?
        AND (e.end_datetime<? OR (e.end_datetime IS NULL AND e.end_date<?))
        AND (e.start_datetime IS NULL OR e.start_datetime<?)
        AND (e.start_date IS NULL OR e.start_date<?)
        AND NOT EXISTS(SELECT 1 FROM facility_notices n WHERE n.resolved_at IS NULL AND n.facility_id=e.facility_id)
        AND NOT EXISTS(SELECT 1 FROM notification_deliveries d WHERE d.event_id=p.event_id AND d.state IN('pending','sending'))
        THEN 'retention-review'
      WHEN e.status='ended' THEN 'ended'
      WHEN e.status='scheduled' THEN 'current'
      ELSE 'verify'
    END AS condition FROM page p LEFT JOIN events e ON e.stable_event_id=p.event_id ORDER BY p.event_id`)
      .bind(
        new Date(Date.parse(to) - 90 * 86400000).toISOString(),
        to,
        to.slice(0, 10),
        to,
        to.slice(0, 10),
      )
      .all()
  ).results;
  const [
    phases,
    deliveries,
    cleanup,
    opportunities,
    completed,
    pending,
    collection,
    verified,
    candidates,
    changes,
    warnings,
  ] = rows;
  const regions = prefectures.map((p) => {
    const last = opportunities?.find((x) => x.slot === p.code);
    const result = completed?.find((x) => x.prefecture === p.code);
    const waiting = pending?.find((x) => x.prefecture === p.code);
    return {
      code: p.code,
      name: p.name,
      lastOpportunity: last?.last_at ?? null,
      lastAttempt: result?.last ?? null,
      waitHours:
        typeof last?.last_at === 'string'
          ? Math.max(
              0,
              Math.floor((Date.parse(to) - Date.parse(last.last_at)) / 3600000),
            )
          : null,
      totalSelected: last?.selected ?? 0,
      dayCompleted: result?.completed ?? 0,
      dayFailures: result?.failures ?? 0,
      next: waiting?.next_at ?? null,
      sourcesWithPending: waiting?.sources_with_pending ?? 0,
    };
  });
  const longest = regions.reduce((n, r) => Math.max(n, r.waitHours ?? 0), 0);
  const successful =
    (phases ?? [])
      .flatMap((r) =>
        r.state === 'done' && typeof r.last === 'string' ? [r.last] : [],
      )
      .sort()
      .at(-1) ?? null;
  return {
    from,
    to,
    mode: 'local-operations',
    phases,
    lastSuccessfulStage: successful,
    deliveries,
    cleanup,
    regions,
    collection,
    verified,
    candidates,
    changes,
    warnings,
    issueReview: {
      rows: issueRows.slice(0, 25),
      truncated: issueRows.length > 25,
      mutations: 0,
    },
    longestKnownWaitHours: regions.some((r) => r.waitHours !== null)
      ? longest
      : null,
    account: evidence && {
      plan: evidence.plan,
      provenance: evidence.provenance,
      checkedAt: evidence.checkedAt,
      requests: evidence.requests,
      reads: evidence.reads,
      writes: evidence.writes,
      databaseBytes: evidence.databaseBytes,
      projectDatabaseBytes: evidence.projectDatabaseBytes,
      cronTriggers: evidence.cronTriggers,
      cpuP99Ms: evidence.cpuP99Ms,
      telemetry: evidence.telemetry,
      telemetryUnit: evidence.telemetryUnit,
    },
    sendsEnabled: false,
  };
}

/** Fixed, numeric summary suitable for a future separately authorized reporting transport. */
export function errorPreview(report: Awaited<ReturnType<typeof dailyReport>>) {
  const failed = (report.phases ?? [])
    .filter((r) => r.state === 'failed')
    .reduce((n, r) => n + Number(r.total), 0);
  const uncertain = (report.deliveries ?? [])
    .filter((r) => r.state === 'uncertain')
    .reduce((n, r) => n + Number(r.total), 0);
  const body = `Astro-Events-JP 운영 일일 점검\n${report.from} ～ ${report.to}\n실패 단계 ${failed}건\n확인 대기 전달 ${uncertain}건`;
  return {
    telegram: body,
    issue: {
      title: 'Astro-Events-JP 운영 점검 ' + report.from.slice(0, 10),
      body,
    },
    send: false,
    idempotencyKey: 'operations-daily:' + report.to,
  };
}
