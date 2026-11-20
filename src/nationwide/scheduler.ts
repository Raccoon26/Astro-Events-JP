import coverage from '../../data/coverage.json';
import { D1Meter } from '../collection/meter';
import { assertApproval } from '../collection/policy';
import { digest } from '../collection/text';
import type { Approval } from '../collection/types';
import type { Usage } from '../domain';
import { hydrate, type RegistryRow } from '../registry';
import { assertLocal, budget } from './local';
import {
  CATEGORY_SLOTS,
  candidateOrder,
  GENERAL,
  HOUR,
  LANES,
  type Lane,
  municipalityKey,
  PAGE,
  ready,
  regionOrder,
  surveyKind,
} from './policy';

interface Opportunity {
  slot: number;
  last_at: string;
  municipality: string | null;
  cursor_due: string;
  cursor_source: string;
  recent_finds: number;
}
interface Due extends RegistryRow {
  approval: string | null;
  failure_count: number;
  change_at: string | null;
  host_retry: string | null;
  recent: number;
  linked_vtuber: number;
}
const pending =
  "NOT EXISTS(SELECT 1 FROM collection_jobs j WHERE j.source_id=s.source_id AND j.state NOT IN('completed','unchanged'))";

export class NationwideScheduler {
  readonly meter: D1Meter;
  private readonly db: D1Database;
  constructor(
    database: D1Database,
    private readonly options: { localOnly: true; clock?: () => number },
  ) {
    this.meter = new D1Meter(database);
    this.db = this.meter.db;
  }

  /** One bounded lane tick, then existing CollectionStore owns collection lease/retry. */
  async step(lane: Lane, usage: Usage | null, apply = false, runId?: string) {
    if (this.options.localOnly !== true || !LANES.includes(lane))
      throw new Error('DEV08_LOCAL_ONLY');
    if (!budget(usage, 1500, 25, 8))
      return { state: 'deferred' as const, reason: 'budget', lane };
    if (apply && (!runId || !/^[a-z0-9:_-]{1,100}$/i.test(runId)))
      throw new Error('SURVEY_RUN_ID_REQUIRED');
    await assertLocal(this.db);
    const now = this.options.clock?.() ?? Date.now(),
      at = new Date(now).toISOString();
    const db = this.db,
      bind = (sql: string, ...values: unknown[]) =>
        db.prepare(sql).bind(...values);
    if (runId) {
      const replay = await bind(
        'SELECT * FROM survey_plans WHERE run_id=?',
        runId,
      ).first<{ lane: Lane }>();
      if (replay) {
        if (replay.lane !== lane) throw new Error('SURVEY_RUN_LANE_MISMATCH');
        return { state: 'replay' as const, lane, record: replay };
      }
    }
    const checkpoint = await bind(
      'SELECT cursor,generation,last_at FROM survey_checkpoint WHERE lane=?',
      lane,
    ).first<{ cursor: number; generation: number; last_at: string | null }>();
    if (!checkpoint || (checkpoint.last_at && checkpoint.last_at > at))
      throw new Error('SURVEY_CLOCK_OR_SCHEMA');
    const state = (
      await bind(
        'SELECT slot,last_at,municipality,cursor_due,cursor_source,recent_finds FROM survey_opportunities WHERE lane=? ORDER BY slot LIMIT 47',
        lane,
      ).all<Opportunity>()
    ).results;
    const past = new Map(state.map((row) => [row.slot, row]));
    const slot =
      lane === 'regional'
        ? regionOrder(
            coverage.prefectures.map((p) => ({
              code: p.code,
              registered: p.sources,
              official: p.verified,
              municipalities: p.municipalities.length,
              recentFinds: past.get(p.code)?.recent_finds ?? 0,
              lastOpportunity: past.has(p.code)
                ? Date.parse(past.get(p.code)!.last_at)
                : null,
            })),
            checkpoint.cursor,
            now,
          )[0]!.code
        : lane === 'category'
          ? checkpoint.cursor % CATEGORY_SLOTS.length
          : 0;
    const group = CATEGORY_SLOTS[slot];
    const index =
      lane === 'regional'
        ? 'survey_due_region'
        : lane === 'vtuber' || (group && GENERAL.some((v) => v === group))
          ? 'survey_due_category'
          : 'survey_due_general';
    const prefix =
      lane === 'regional'
        ? "prefecture=? AND category<>'vtuber'"
        : index === 'survey_due_category'
          ? 'category=?'
          : "category<>'vtuber'";
    const params =
      lane === 'regional'
        ? [slot]
        : lane === 'vtuber'
          ? ['vtuber']
          : index === 'survey_due_category'
            ? [group]
            : [];
    const old = past.get(slot),
      cursorDue = old?.cursor_due ?? '',
      cursorSource = old?.cursor_source ?? '';
    const rows = (
      await bind(
        `WITH page AS MATERIALIZED (
      SELECT * FROM sources INDEXED BY ${index} WHERE state='active' AND ${prefix}
      AND (next_crawl_at,source_id)>(?,?) AND next_crawl_at<=? ORDER BY next_crawl_at,source_id LIMIT ?)
      SELECT s.*,m.payload,a.payload AS approval,
      EXISTS(SELECT 1 FROM vtuber_sources vs JOIN vtubers v ON v.vtuber_id=vs.vtuber_id WHERE vs.source_id=s.source_id
        AND v.enabled=1 AND v.verification_status='Verified') AS linked_vtuber,
      (SELECT max(h.next_allowed_at) FROM collection_host_gates h JOIN json_each(s.allowed_hosts_json) host ON h.host=host.value) AS host_retry,
      (SELECT e.last_verified_at FROM events e INDEXED BY survey_events_recent
        JOIN verification_decisions vd ON vd.decision_id=e.verification_id
        JOIN event_candidates c ON c.candidate_id=e.candidate_id AND c.fingerprint=vd.fingerprint
        WHERE e.source_id=s.source_id AND e.first_seen_at>=? AND e.verification_status='Verified'
        AND vd.status='Verified' AND vd.expires_at>? AND e.status IN('cancelled','postponed')
        ORDER BY e.first_seen_at DESC,e.stable_event_id DESC LIMIT 1) AS change_at,
      (SELECT count(*) FROM (SELECT 1 FROM event_candidates c
        WHERE c.source_id=s.source_id AND c.last_seen_at>=? LIMIT 8)) AS recent
      FROM page s LEFT JOIN registry_metadata m ON m.kind='source' AND m.record_id=s.source_id
      LEFT JOIN source_approvals a ON a.source_id=s.source_id ORDER BY s.next_crawl_at,s.source_id`,
        ...params,
        cursorDue,
        cursorSource,
        at,
        PAGE,
        new Date(now - 7 * 24 * HOUR).toISOString(),
        at,
        new Date(now - 7 * 24 * HOUR).toISOString(),
      ).all<Due>()
    ).results;
    const blocked: Record<string, number> = {};
    const reject = (reason: string) => {
      blocked[reason] = (blocked[reason] ?? 0) + 1;
      return [];
    };
    const eligible = rows.flatMap((row) => {
      try {
        const source = hydrate(row),
          approval = JSON.parse(row.approval ?? 'null') as Approval | null;
        if (!approval || !ready(source, now))
          return reject('approval-or-interval');
        if (source.category === 'vtuber' && row.linked_vtuber !== 1)
          return reject('vtuber-identity-review');
        assertApproval(source, approval, at);
        if (
          source.lastCrawledAt &&
          Date.parse(source.lastCrawledAt) +
            approval.minIntervalSeconds * 1000 >
            now
        )
          return reject('approval-interval');
        if (row.host_retry && row.host_retry > at)
          return reject('host-backoff');
        if (
          lane === 'category' &&
          (group === 'practice' || group === 'lecture') &&
          surveyKind(source) !== group
        )
          return reject('other-category');
        return [
          {
            id: source.id,
            category: source.category,
            kind: source.kind,
            municipality: municipalityKey(
              source.prefecture,
              source.municipality,
            ),
            lastCrawledAt: source.lastCrawledAt,
            deadline: source.deadlineAt ?? null,
            officialChange:
              !!row.change_at && Date.parse(row.change_at) >= now - 72 * HOUR,
            failures: row.failure_count,
            source,
            row,
          },
        ];
      } catch {
        return reject('policy-review');
      }
    });
    let pick: (typeof eligible)[number] | undefined;
    for (const row of candidateOrder(
      eligible,
      now,
      old?.municipality ?? null,
    )) {
      // Recheck deduplication in the same write transaction below.
      const original = eligible.find((v) => v.id === row.id)!;
      const clear = await bind(
        `SELECT 1 AS ready FROM sources s WHERE s.source_id=? AND ${pending}`,
        row.id,
      ).first('ready');
      if (clear) {
        pick = original;
        break;
      }
      reject('job-already-present');
    }
    const next =
      lane === 'regional' ? slot : lane === 'category' ? slot + 1 : 0;
    const tail = rows.length === PAGE ? rows.at(-1) : undefined;
    const reason = pick
      ? pick.officialChange
        ? 'confirmed-status-change'
        : pick.deadline &&
            Date.parse(pick.deadline) > now &&
            Date.parse(pick.deadline) - now <= 24 * HOUR
          ? 'deadline-priority'
          : lane === 'regional'
            ? 'regional-aging-and-coverage'
            : lane === 'vtuber'
              ? 'independent-vtuber-budget'
              : 'category-rotation'
      : tail
        ? 'more-due-on-next-page'
        : 'no-approved-due-source-in-slot';
    const result = {
      state: 'planned' as const,
      lane,
      slot,
      reason,
      blocked,
      nextCursor: next,
      inspected: rows.length,
      sourceId: pick?.id ?? null,
      municipality: pick?.municipality ?? null,
      remainingPage: !!tail,
      recentDiscoveries: pick?.row.recent ?? null,
    };
    if (!apply) return result;
    const nonce = crypto.randomUUID();
    const written = 'EXISTS(SELECT 1 FROM survey_plans WHERE run_id=?)';
    const id = pick
      ? await digest(
          JSON.stringify([
            pick.id,
            pick.source.officialUrl,
            pick.source.nextCrawlAt,
          ]),
        )
      : null;
    const reserve = pick
      ? ` AND EXISTS(SELECT 1 FROM sources s JOIN source_approvals a ON a.source_id=s.source_id
      JOIN registry_metadata m ON m.record_id=s.source_id AND m.kind='source'
      WHERE s.source_id=? AND s.state='active' AND s.next_crawl_at=? AND s.official_url=? AND a.payload=?
      AND s.allowed_hosts_json=? AND s.robots_checked_at IS ? AND s.terms_reviewed_at IS ?
      AND s.last_crawled_at IS ? AND s.min_interval_seconds=? AND s.category=? AND s.prefecture IS ? AND s.format=? AND m.payload=?
      AND NOT EXISTS(SELECT 1 FROM collection_host_gates h JOIN json_each(s.allowed_hosts_json) host ON h.host=host.value WHERE h.next_allowed_at>?)
      AND (s.category<>'vtuber' OR EXISTS(SELECT 1 FROM vtuber_sources vs JOIN vtubers v ON v.vtuber_id=vs.vtuber_id
      WHERE vs.source_id=s.source_id AND v.enabled=1 AND v.verification_status='Verified')) AND ${pending})
      AND NOT EXISTS(SELECT 1 FROM collection_jobs WHERE job_id=?)`
      : '';
    const reservation = pick
      ? [
          pick.id,
          pick.source.nextCrawlAt,
          pick.source.officialUrl,
          pick.row.approval,
          pick.row.allowed_hosts_json,
          pick.row.robots_checked_at,
          pick.row.terms_reviewed_at,
          pick.row.last_crawled_at,
          pick.row.min_interval_seconds,
          pick.row.category,
          pick.row.prefecture,
          pick.row.format,
          pick.row.payload,
          at,
          id,
        ]
      : [];
    const own =
      'EXISTS(SELECT 1 FROM survey_checkpoint WHERE lane=? AND nonce=?)';
    const statements = [
      bind(
        `UPDATE survey_checkpoint SET generation=generation+1,cursor=?,last_at=?,nonce=?
        WHERE lane=? AND generation=? AND NOT ${written}${reserve}`,
        next,
        at,
        nonce,
        lane,
        checkpoint.generation,
        runId,
        ...reservation,
      ),
      ...(pick
        ? [
            bind(
              `INSERT INTO collection_jobs(job_id,source_id,url,format,cycle,depth,state,retry_at,updated_at)
          SELECT ?,?,?,?,?,0,'pending',?,? WHERE ${own}`,
              id,
              pick.id,
              pick.source.officialUrl,
              pick.source.format,
              pick.source.nextCrawlAt,
              at,
              at,
              lane,
              nonce,
            ),
          ]
        : []),
      bind(
        `INSERT INTO survey_plans SELECT ?,?,?,?,?,?,?,? WHERE ${own}`,
        runId,
        lane,
        slot,
        pick?.id ?? null,
        id,
        at,
        reason,
        rows.length,
        lane,
        nonce,
      ),
      bind(
        `INSERT INTO survey_opportunities(lane,slot,selected,last_at,municipality,cursor_source,cursor_due,recent_finds)
        SELECT ?,?,?,?,?,?,?,? WHERE ${own} ON CONFLICT(lane,slot) DO UPDATE SET selected=survey_opportunities.selected+excluded.selected,
        last_at=excluded.last_at,municipality=COALESCE(excluded.municipality,survey_opportunities.municipality),
        cursor_source=excluded.cursor_source,cursor_due=excluded.cursor_due,recent_finds=CASE WHEN excluded.selected=1 THEN excluded.recent_finds ELSE survey_opportunities.recent_finds END`,
        lane,
        slot,
        pick ? 1 : 0,
        at,
        pick?.municipality ?? null,
        tail?.source_id ?? '',
        tail?.next_crawl_at ?? '',
        pick?.row.recent ?? 0,
        lane,
        nonce,
      ),
    ];
    const done = await db.batch(statements);
    return done[0]?.meta.changes === 1
      ? { ...result, state: 'committed' as const, jobId: id }
      : { state: 'deferred' as const, lane, reason: 'checkpoint-conflict' };
  }
}
