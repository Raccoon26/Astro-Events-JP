import { D1SourceRegistry, type Registration } from '../registry';
import { assertApproval } from './policy';
import { digest } from './text';
import {
  type Approval,
  CollectionError,
  type Format,
  type ParsedDocument,
} from './types';
export interface Job {
  job_id: string;
  source_id: string;
  url: string;
  format: Format;
  cycle: string;
  depth: number;
  state: string;
  retry_at: string;
  owner: string | null;
  lease_until: string | null;
  attempts: number;
  payload: string | null;
  offset: number;
  document_digest: string | null;
}
export interface DocumentState {
  etag: string | null;
  last_modified: string | null;
  digest: string | null;
  attempted_at: string | null;
  succeeded_at: string | null;
  changed_at: string | null;
  failures: number;
  complete: number;
}
export interface Checkpoint {
  parsed: ParsedDocument;
  url: string;
  digest: string;
  etag: string | null;
  lastModified: string | null;
  at: string;
  requests: number;
}
export class CollectionStore {
  constructor(readonly db: D1Database) {}
  async listForVerification(cursor = '', limit = 25) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new Error('Invalid candidate page size');
    return (
      await this.db
        .prepare(
          "SELECT candidate_id,payload FROM event_candidates WHERE review_status='Review Required' AND candidate_id>?1 ORDER BY candidate_id LIMIT ?2",
        )
        .bind(cursor, limit)
        .all<{ candidate_id: string; payload: string }>()
    ).results.map((row) => ({
      id: row.candidate_id,
      candidate: JSON.parse(row.payload),
    }));
  }
  async recordReview(
    sourceId: string,
    record: {
      decision: 'review' | 'unsupported';
      reviewedAt: string;
      [key: string]: unknown;
    },
  ) {
    const marker = await this.db
      .prepare('SELECT environment FROM deployment_identity WHERE singleton=1')
      .first('environment');
    if (marker !== 'staging') throw new CollectionError('source-not-active');
    if (
      !['review', 'unsupported'].includes(record.decision) ||
      !Number.isFinite(Date.parse(record.reviewedAt))
    )
      throw new CollectionError('terms-unreviewed');
    const json = JSON.stringify(record);
    if (json.length > 65536) throw new CollectionError('body-too-large');
    const registry = new D1SourceRegistry(this.db);
    const source = await registry.get(sourceId);
    if (!source) throw new CollectionError('source-not-active');
    await registry.register(
      {
        ...source,
        state: record.decision,
        reason:
          typeof record.reason === 'string'
            ? record.reason
            : 'Collection policy requires review',
      },
      false,
      [
        this.db
          .prepare(
            'INSERT INTO source_policy_reviews VALUES(?1,?2,?3,?4,?5) ON CONFLICT DO NOTHING',
          )
          .bind(
            await digest(sourceId + json),
            sourceId,
            record.decision,
            record.reviewedAt,
            json,
          ),
      ],
    );
  }
  async retryReviewedJob(jobId: string, reason: string, at: string) {
    if (!reason.trim()) throw new CollectionError('terms-unreviewed');
    await this.db
      .prepare(
        "UPDATE collection_jobs SET state=CASE WHEN payload IS NOT NULL THEN 'parsed' ELSE 'pending' END,attempts=0,retry_at=?1,owner=NULL,lease_until=NULL,safe_error_code='MANUAL_REVIEW_RETRY',updated_at=?1 WHERE job_id=?2 AND (owner IS NULL OR lease_until<=?1)",
      )
      .bind(at, jobId)
      .run();
  }
  async approval(sourceId: string) {
    const payload = await this.db
      .prepare('SELECT payload FROM source_approvals WHERE source_id=?1')
      .bind(sourceId)
      .first<string>('payload');
    return payload ? (JSON.parse(payload) as Approval) : null;
  }
  async approve(source: Registration, record: Approval, now: string) {
    const marker = await this.db
      .prepare('SELECT environment FROM deployment_identity WHERE singleton=1')
      .first('environment');
    if (marker !== 'staging') throw new CollectionError('source-not-active');
    assertApproval(
      {
        ...source,
        state: 'active',
        parserApproved: true,
        robotsStatus: 'allowed',
        termsStatus: 'allowed',
        robotsCheckedAt: record.reviewedAt,
        termsReviewedAt: record.reviewedAt,
      },
      record,
      now,
    );
    if (
      !Number.isFinite(Date.parse(record.testEvidence.checkedAt)) ||
      Date.parse(record.testEvidence.checkedAt) > Date.parse(now)
    )
      throw new CollectionError('terms-unreviewed');
    // Human review attestations are explicit. This method does not infer legal permission or run a trial against inactive sources.
    const active = {
      ...source,
      state: 'active' as const,
      parserApproved: true,
      robotsStatus: 'allowed',
      termsStatus: 'allowed',
      robotsCheckedAt: record.reviewedAt,
      termsReviewedAt: record.reviewedAt,
    };
    await new D1SourceRegistry(this.db).register(active, false, [
      this.db
        .prepare('INSERT INTO source_policy_reviews VALUES(?1,?2,?3,?4,?5)')
        .bind(
          crypto.randomUUID(),
          source.id,
          'active',
          record.reviewedAt,
          JSON.stringify(record),
        ),
      this.db
        .prepare(
          'INSERT INTO source_approvals VALUES(?1,?2,?3) ON CONFLICT(source_id) DO UPDATE SET payload=excluded.payload,reviewed_at=excluded.reviewed_at',
        )
        .bind(source.id, JSON.stringify(record), record.reviewedAt),
    ]);
  }
  async enqueue(
    source: Registration,
    cycle: string,
    url = source.officialUrl,
    format: Format = source.format,
    depth = 0,
  ) {
    const id = await digest(JSON.stringify([source.id, url, cycle]));
    await this.db
      .prepare(
        "INSERT INTO collection_jobs(job_id,source_id,url,format,cycle,depth,state,retry_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,'pending',?5,?5) ON CONFLICT DO NOTHING",
      )
      .bind(id, source.id, url, format, cycle, depth)
      .run();
    return id;
  }
  async next(now: string) {
    return this.db
      .prepare(
        "SELECT * FROM collection_jobs WHERE ((state IN ('pending','deferred','failed','parsed') AND retry_at<=?1 AND (owner IS NULL OR lease_until<=?1)) OR (state='fetching' AND lease_until<=?1)) AND (attempts<3 OR state='parsed') ORDER BY retry_at,job_id LIMIT 1",
      )
      .bind(now)
      .first<Job>();
  }
  async claim(job: Job, now: string) {
    const token = crypto.randomUUID();
    const lease = new Date(Date.parse(now) + 60000).toISOString();
    const result = await this.db
      .prepare(
        "UPDATE collection_jobs SET owner=?1,lease_until=?2,attempts=attempts+CASE WHEN state='parsed' THEN 0 ELSE 1 END,state=CASE WHEN state='parsed' THEN 'parsed' ELSE 'fetching' END,updated_at=?3 WHERE job_id=?4 AND (owner IS NULL OR lease_until<=?3) AND state NOT IN ('completed','unchanged') AND (attempts<3 OR state='parsed')",
      )
      .bind(token, lease, now, job.job_id)
      .run();
    return result.meta.changes === 1 ? token : null;
  }
  async document(sourceId: string, url: string) {
    return this.db
      .prepare(
        'SELECT * FROM collection_documents WHERE source_id=?1 AND url=?2',
      )
      .bind(sourceId, url)
      .first<DocumentState>();
  }
  async attempted(job: Job, token: string, at: string) {
    await this.db
      .prepare(
        'INSERT INTO collection_documents(source_id,url,attempted_at) SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM collection_jobs WHERE job_id=?4 AND owner=?5) ON CONFLICT(source_id,url) DO UPDATE SET attempted_at=excluded.attempted_at',
      )
      .bind(job.source_id, job.url, at, job.job_id, token)
      .run();
  }
  async checkpoint(job: Job, token: string, checkpoint: Checkpoint) {
    const payload = JSON.stringify(checkpoint);
    if (new TextEncoder().encode(payload).length > 65536)
      throw new CollectionError('body-too-large');
    const result = await this.db
      .prepare(
        "UPDATE collection_jobs SET state='parsed',payload=?1,owner=NULL,lease_until=NULL,safe_error_code=NULL,updated_at=?2 WHERE job_id=?3 AND owner=?4 AND state='fetching'",
      )
      .bind(payload, checkpoint.at, job.job_id, token)
      .run();
    if (result.meta.changes !== 1)
      throw new CollectionError('checkpoint-conflict');
  }
  async finish(
    job: Job,
    token: string,
    source: Registration,
    data: Checkpoint,
    unchanged = false,
  ) {
    const guard =
      "EXISTS(SELECT 1 FROM collection_jobs j JOIN sources s ON s.source_id=j.source_id WHERE j.job_id=? AND j.owner=? AND s.state='active')";
    const statements: D1PreparedStatement[] = [];
    const continuation = !unchanged && data.parsed.nextOffset !== undefined;
    for (const item of data.parsed.candidates) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO event_candidates(candidate_id,source_id,official_url,fingerprint,payload,first_seen_at,last_seen_at) SELECT ?1,?2,?3,?4,?5,?6,?6 WHERE ${guard} ON CONFLICT(candidate_id) DO UPDATE SET review_status=CASE WHEN event_candidates.fingerprint<>excluded.fingerprint THEN 'Review Required' ELSE event_candidates.review_status END,fingerprint=excluded.fingerprint,payload=excluded.payload,last_seen_at=excluded.last_seen_at`,
          )
          .bind(
            item.id,
            source.id,
            item.officialUrl,
            item.fingerprint,
            JSON.stringify(item),
            data.at,
            job.job_id,
            token,
          ),
      );
      statements.push(
        this.db
          .prepare(
            `INSERT INTO candidate_versions SELECT ?1,?2,?3,?4 WHERE ${guard} ON CONFLICT DO NOTHING`,
          )
          .bind(
            item.id,
            item.fingerprint,
            JSON.stringify(item),
            data.at,
            job.job_id,
            token,
          ),
      );
      for (const image of item.images)
        statements.push(
          this.db
            .prepare(
              `INSERT INTO candidate_images(candidate_id,image_url,image_source_url,image_type,last_checked_at) SELECT ?1,?2,?3,?4,?5 WHERE ${guard} ON CONFLICT(candidate_id,image_url) DO UPDATE SET last_checked_at=excluded.last_checked_at`,
            )
            .bind(
              item.id,
              image.url,
              image.sourceUrl,
              image.type,
              image.lastCheckedAt,
              job.job_id,
              token,
            ),
        );
    }
    for (const discovered of data.parsed.discoveries) {
      const id = await digest(discovered.url);
      statements.push(
        this.db
          .prepare(
            `INSERT INTO discovery_candidates(candidate_id,canonical_url,discovered_from,prefecture,category,reason,created_at) SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE ${guard} AND NOT EXISTS(SELECT 1 FROM registry_urls WHERE kind='source' AND url=?2) ON CONFLICT(canonical_url) DO NOTHING`,
          )
          .bind(
            id,
            discovered.url,
            discovered.from,
            source.prefecture,
            source.category,
            discovered.relation +
              (discovered.lastmod
                ? `; lastmod advisory: ${discovered.lastmod.slice(0, 80)}`
                : ''),
            data.at,
            job.job_id,
            token,
          ),
      );
    }
    statements.push(
      this.db
        .prepare(
          `INSERT INTO collection_documents(source_id,url,etag,last_modified,digest,attempted_at,succeeded_at,changed_at,failures,complete) SELECT ?1,?2,?3,?4,?5,?6,?6,?7,0,?8 WHERE ${guard} ON CONFLICT(source_id,url) DO UPDATE SET etag=excluded.etag,last_modified=excluded.last_modified,digest=excluded.digest,attempted_at=excluded.attempted_at,succeeded_at=excluded.succeeded_at,changed_at=COALESCE(excluded.changed_at,collection_documents.changed_at),failures=0,complete=excluded.complete`,
        )
        .bind(
          source.id,
          job.url,
          data.etag,
          data.lastModified,
          data.digest,
          data.at,
          unchanged ? null : data.at,
          continuation ? 0 : 1,
          job.job_id,
          token,
        ),
    );
    if (job.depth === 0)
      statements.push(
        this.db
          .prepare(
            `UPDATE sources SET last_crawled_at=?1,next_crawl_at=?2,etag=?3,last_modified=?4,content_digest=?5,failure_count=0 WHERE source_id=?6 AND ${guard}`,
          )
          .bind(
            data.at,
            new Date(
              Date.parse(data.at) + (source.minIntervalSeconds ?? 86400) * 1000,
            ).toISOString(),
            continuation ? null : data.etag,
            continuation ? null : data.lastModified,
            data.digest,
            source.id,
            job.job_id,
            token,
          ),
      );
    statements.push(
      this.db
        .prepare(
          "UPDATE collection_jobs SET state=?1,payload=NULL,owner=NULL,lease_until=NULL,safe_error_code=NULL,updated_at=?2,offset=?5,document_digest=?6,retry_at=?7,attempts=CASE WHEN ?1='pending' THEN 0 ELSE attempts END WHERE job_id=?3 AND owner=?4 AND EXISTS(SELECT 1 FROM sources s WHERE s.source_id=collection_jobs.source_id AND s.state='active')",
        )
        .bind(
          unchanged ? 'unchanged' : continuation ? 'pending' : 'completed',
          data.at,
          job.job_id,
          token,
          data.parsed.nextOffset ?? 0,
          data.digest,
          continuation
            ? new Date(
                Date.parse(data.at) +
                  (source.minIntervalSeconds ?? 86400) * 1000,
              ).toISOString()
            : data.at,
        ),
    );
    const results = await this.db.batch(statements);
    if (results.at(-1)?.meta.changes !== 1)
      throw new CollectionError('checkpoint-conflict');
  }
  async fail(job: Job, token: string, error: CollectionError, now: string) {
    const retry =
      error.retryAt ??
      new Date(
        Date.parse(now) +
          Math.min(86400000, 60000 * 2 ** Math.min(job.attempts, 10)),
      ).toISOString();
    await this.db.batch([
      this.db
        .prepare(
          'UPDATE sources SET failure_count=failure_count+1,next_crawl_at=?1 WHERE source_id=?2 AND EXISTS(SELECT 1 FROM collection_jobs WHERE job_id=?3 AND owner=?4)',
        )
        .bind(retry, job.source_id, job.job_id, token),
      this.db
        .prepare(
          'INSERT INTO collection_documents(source_id,url,attempted_at,failures) SELECT ?1,?2,?3,1 WHERE EXISTS(SELECT 1 FROM collection_jobs WHERE job_id=?4 AND owner=?5) ON CONFLICT(source_id,url) DO UPDATE SET attempted_at=excluded.attempted_at,failures=collection_documents.failures+1',
        )
        .bind(job.source_id, job.url, now, job.job_id, token),
      this.db
        .prepare(
          "UPDATE collection_jobs SET state=CASE WHEN payload IS NOT NULL THEN 'parsed' ELSE ?1 END,retry_at=?2,safe_error_code=?3,owner=NULL,lease_until=NULL,updated_at=?4 WHERE job_id=?5 AND owner=?6",
        )
        .bind(
          [
            'rate-limited',
            'budget-exhausted',
            'source-not-active',
            'terms-unreviewed',
            'policy-changed',
            'dns-protection-unavailable',
          ].includes(error.code)
            ? 'deferred'
            : 'failed',
          retry,
          error.code,
          now,
          job.job_id,
          token,
        ),
    ]);
  }
}
