import { withinBudget } from '../budget';
import type { Usage } from '../domain';
import { D1SourceRegistry, type Registration, selectFair } from '../registry';
import { SafeHttpCollector } from './http';
import { D1Meter } from './meter';
import { parseDocument } from './parse';
import { assertApproval } from './policy';
import { type Checkpoint, CollectionStore } from './store';
import {
  CollectionError,
  type HtmlRules,
  type Limits,
  limits,
  type Transport,
} from './types';

const empty = () => ({
  candidates: [],
  discoveries: [],
  sitemaps: [],
  truncated: false,
});
export class CollectionOrchestrator {
  readonly db: D1Database;
  readonly meter: D1Meter;
  private busy = false;
  readonly store: CollectionStore;
  readonly registry: D1SourceRegistry;
  readonly settings: Limits;
  constructor(
    db: D1Database,
    readonly transport: Transport,
    readonly fixtureMode = false,
    settings: Partial<Limits> = {},
    readonly clock = () => Date.now(),
    readonly sleep?: (ms: number) => Promise<void>,
  ) {
    this.meter = new D1Meter(db);
    this.db = this.meter.db;
    this.store = new CollectionStore(this.db);
    this.registry = new D1SourceRegistry(this.db);
    this.settings = limits(settings);
  }
  async enqueueFair(now: string, generalBudget = 1, vtuberBudget = 0) {
    if (
      generalBudget > 1 ||
      vtuberBudget > 1 ||
      generalBudget < 0 ||
      vtuberBudget < 0
    )
      throw new CollectionError('budget-exhausted');
    const cursor =
      (await this.db
        .prepare(
          "SELECT prefecture FROM collection_cursors WHERE cursor_id='general'",
        )
        .first<number>('prefecture')) ?? 0;
    const rows = await this.db
      .prepare(
        "SELECT payload FROM (SELECT m.payload,ROW_NUMBER() OVER(PARTITION BY s.prefecture,s.category='vtuber' ORDER BY s.last_crawled_at,CASE WHEN s.category='local' THEN 0 ELSE 1 END,s.priority DESC) AS position FROM sources s JOIN registry_metadata m ON m.kind='source' AND m.record_id=s.source_id WHERE s.state='active' AND s.next_crawl_at<=?1 AND NOT EXISTS(SELECT 1 FROM collection_jobs j WHERE j.source_id=s.source_id AND j.state NOT IN ('completed','unchanged'))) WHERE position=1 LIMIT 96",
      )
      .bind(now)
      .all<{ payload: string }>();
    const data = rows.results.map((r) => JSON.parse(r.payload) as Registration);
    const chosen = selectFair(data, now, cursor, generalBudget, vtuberBudget);
    for (const source of [...chosen.general, ...chosen.vtubers]) {
      const live = await this.registry.get(source.id);
      if (live) await this.store.enqueue(live, live.nextCrawlAt);
    }
    await this.db
      .prepare(
        "INSERT INTO collection_cursors VALUES('general',?1,?2) ON CONFLICT(cursor_id) DO UPDATE SET prefecture=excluded.prefecture,updated_at=excluded.updated_at",
      )
      .bind(chosen.cursor, now)
      .run();
    return [...chosen.general, ...chosen.vtubers].map((s) => s.id);
  }
  private async recordMetrics(
    runId: string,
    before: {
      calls: number;
      statements: number;
      rowsRead: number;
      rowsWritten: number;
    },
    started: number,
  ) {
    const current = this.meter.snapshot();
    const metrics = {
      calls: current.calls - before.calls,
      statements: current.statements - before.statements,
      rowsRead: current.rowsRead - before.rowsRead,
      rowsWritten: current.rowsWritten - before.rowsWritten,
      measured: current.measured,
      elapsedMs: performance.now() - started,
      cpuTimeMs: null,
      localOnly: true,
      excludesThisAccountingBatch: true,
    };
    await this.db.batch([
      this.db
        .prepare(
          'UPDATE crawl_runs SET rows_read=?1,rows_written=?2 WHERE run_id=?3',
        )
        .bind(metrics.rowsRead, metrics.rowsWritten, runId),
      this.db
        .prepare('INSERT INTO collection_run_metrics VALUES(?1,?2)')
        .bind(runId, JSON.stringify(metrics)),
    ]);
  }
  async step(options: {
    environment: 'staging';
    localOnly: true;
    accountUsage: Usage | null;
    signal?: AbortSignal;
    rules?: HtmlRules;
  }) {
    if (this.busy)
      return {
        state: 'deferred',
        code: 'checkpoint-conflict',
        cpuTimeMs: null,
      };
    this.busy = true;
    try {
      return await this.perform(options);
    } catch (error) {
      if (error instanceof CollectionError) throw error;
      throw new CollectionError('checkpoint-conflict');
    } finally {
      this.busy = false;
    }
  }
  private async perform(options: {
    environment: 'staging';
    localOnly: true;
    accountUsage: Usage | null;
    signal?: AbortSignal;
    rules?: HtmlRules;
  }) {
    const before = this.meter.snapshot(),
      started = performance.now();
    if (options.environment !== 'staging' || options.localOnly !== true)
      throw new CollectionError('source-not-active');
    if (
      !options.accountUsage ||
      !withinBudget(options.accountUsage, {
        requests: this.settings.maxRequests,
        reads: 500,
        writes: 500,
        databaseBytes: 1000000,
      })
    )
      return { state: 'deferred', code: 'budget-exhausted', cpuTimeMs: null };
    const identity = await this.db
      .prepare(
        'SELECT environment,database_name FROM deployment_identity WHERE singleton=1',
      )
      .first<{ environment: string; database_name: string }>();
    if (
      identity?.environment !== 'staging' ||
      identity.database_name !== 'astro-events-jp-staging'
    )
      throw new CollectionError('source-not-active');
    const now = new Date(this.clock()).toISOString();
    const job = await this.store.next(now);
    if (!job) return { state: 'idle', cpuTimeMs: null };
    const token = await this.store.claim(job, now);
    if (!token)
      return {
        state: 'deferred',
        code: 'checkpoint-conflict',
        cpuTimeMs: null,
      };
    const runId = crypto.randomUUID();
    let requests = 0;
    let activeHttp: SafeHttpCollector | undefined;
    try {
      await this.db
        .prepare(
          "INSERT INTO crawl_runs(run_id,started_at,state,cursor) VALUES(?1,?2,'running',?3)",
        )
        .bind(runId, now, job.job_id)
        .run();
      const original = await this.registry.get(job.source_id);
      if (!original) throw new CollectionError('source-not-active');
      const source = { ...original, format: job.format };
      const approval = await this.store.approval(source.id);
      if (!approval) throw new CollectionError('terms-unreviewed');
      assertApproval(original, approval, now, job.format);
      const signal = options.signal ?? new AbortController().signal;
      if (job.state === 'parsed' && job.payload) {
        const checkpoint = JSON.parse(job.payload) as Checkpoint;
        await this.store.finish(job, token, original, checkpoint);
        await this.db
          .prepare(
            "UPDATE crawl_runs SET state='completed',finished_at=?1,sources_processed=1 WHERE run_id=?2",
          )
          .bind(now, runId)
          .run();
        await this.recordMetrics(runId, before, started);
        return {
          state:
            checkpoint.parsed.nextOffset !== undefined
              ? 'pending'
              : 'completed',
          candidates: checkpoint.parsed.candidates.length,
          requests: 0,
          cpuTimeMs: null,
        };
      }
      const previous = await this.store.document(source.id, job.url);
      if (
        job.depth === 0 &&
        previous?.attempted_at &&
        Date.parse(now) - Date.parse(previous.attempted_at) <
          approval.minIntervalSeconds * 1000
      )
        throw new CollectionError(
          'rate-limited',
          new Date(
            Date.parse(previous.attempted_at) +
              approval.minIntervalSeconds * 1000,
          ).toISOString(),
        );
      const http = new SafeHttpCollector(
        this.transport,
        approval,
        this.settings,
        this.fixtureMode,
        this.clock,
        this.sleep,
      );
      activeHttp = http;
      const requestSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(30000),
      ]);
      const host = new URL(job.url).hostname;
      const reservedUntil = new Date(Date.parse(now) + 60000).toISOString();
      const reserved = await this.db
        .prepare(
          'INSERT INTO collection_host_gates VALUES(?1,?2) ON CONFLICT(host) DO UPDATE SET next_allowed_at=excluded.next_allowed_at WHERE collection_host_gates.next_allowed_at<=?3',
        )
        .bind(host, reservedUntil, now)
        .run();
      if (reserved.meta.changes !== 1)
        throw new CollectionError(
          'rate-limited',
          await this.db
            .prepare(
              'SELECT next_allowed_at FROM collection_host_gates WHERE host=?1',
            )
            .bind(host)
            .first<string>('next_allowed_at'),
        );
      await this.store.attempted(job, token, now);
      const page = await http.fetchDocument(source, requestSignal, job.url, {
        etag: previous?.complete && job.offset === 0 ? previous.etag : null,
        lastModified:
          previous?.complete && job.offset === 0
            ? previous.last_modified
            : null,
      });
      requests = http.requests;
      const checkpoint: Checkpoint = {
        parsed: empty(),
        url: page.url,
        digest: page.status === 304 ? (previous?.digest ?? '') : page.digest,
        etag: page.etag,
        lastModified: page.lastModified,
        at: now,
        requests,
      };
      if (
        page.status === 304 ||
        (previous?.complete &&
          job.offset === 0 &&
          previous.digest === page.digest)
      ) {
        if (!checkpoint.digest) throw new CollectionError('parse-error');
        await this.store.finish(job, token, original, checkpoint, true);
        await this.db
          .prepare(
            "UPDATE crawl_runs SET state='completed',finished_at=?1,sources_processed=1,requests=?2 WHERE run_id=?3",
          )
          .bind(now, requests, runId)
          .run();
        await this.recordMetrics(runId, before, started);
        return { state: 'unchanged', requests, cpuTimeMs: null };
      }
      checkpoint.parsed = await parseDocument(page.content, {
        source,
        url: page.url,
        at: now,
        approval,
        limits: this.settings,
        offset:
          job.offset && job.document_digest === page.digest ? job.offset : 0,
        ...(options.rules ? { rules: options.rules } : {}),
      });
      if (
        job.depth < this.settings.maxSitemapDepth &&
        checkpoint.parsed.sitemaps.length
      ) {
        const queued =
          (await this.db
            .prepare(
              'SELECT COUNT(*) AS n FROM collection_jobs WHERE source_id=?1 AND cycle=?2 AND depth>0',
            )
            .bind(source.id, job.cycle)
            .first<number>('n')) ?? 0;
        for (const child of checkpoint.parsed.sitemaps.slice(
          0,
          Math.max(0, this.settings.maxQueuedSitemaps - queued),
        ))
          await this.store.enqueue(
            original,
            job.cycle,
            child.url,
            'sitemap',
            job.depth + 1,
          );
      }
      await this.store.checkpoint(job, token, checkpoint);
      await this.db
        .prepare(
          "UPDATE crawl_runs SET state='deferred',finished_at=?1,requests=?2,safe_error_code='PARSED_CHECKPOINT' WHERE run_id=?3",
        )
        .bind(now, requests, runId)
        .run();
      await this.recordMetrics(runId, before, started);
      return {
        state: 'parsed',
        candidates: checkpoint.parsed.candidates.length,
        requests,
        cpuTimeMs: null,
      };
    } catch (error) {
      requests = activeHttp?.requests ?? requests;
      const safe =
        error instanceof CollectionError
          ? error
          : new CollectionError('checkpoint-conflict');
      await this.store.fail(job, token, safe, now);
      await this.db
        .prepare(
          "UPDATE crawl_runs SET state='failed',finished_at=?1,errors=1,requests=?2,safe_error_code=?3 WHERE run_id=?4",
        )
        .bind(now, requests, safe.code, runId)
        .run();
      await this.recordMetrics(runId, before, started);
      return { state: 'failed', code: safe.code, requests, cpuTimeMs: null };
    }
  }
}
