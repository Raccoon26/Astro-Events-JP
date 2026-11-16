import { withinBudget } from '../budget';
import { D1Meter } from '../collection/meter';
import { digest } from '../collection/text';
import type { PostGenerator } from '../contracts';
import type { PostKind, Usage, VerifiedEvent } from '../domain';
import { VerificationStore } from '../verification/store';
import type { DetailedVerifiedEvent } from '../verification/types';
import { validateLength } from './length';
import { renderPost, semanticEvent } from './render';
import {
  type PostDelivery,
  type PostDraft,
  PostError,
  TEMPLATE_VERSION,
} from './types';

interface Options {
  enabled?: boolean;
  localOnly?: boolean;
  clock?: () => number;
}
type Capture = NonNullable<Awaited<ReturnType<VerificationStore['capture']>>>;
interface Row {
  post_id: string;
  event_id: string;
  revision: number;
  kind: PostKind;
  text: string;
  weighted_length: number;
  hashtags_json: string;
  template_version: string;
  verification_decision_id: string | null;
  input_digest: string | null;
  content_digest: string | null;
  length_policy: string | null;
  valid_until: string | null;
  omissions_json: string | null;
  created_at: string;
}
export class PostStore {
  readonly meter: D1Meter;
  private readonly db: D1Database;
  private readonly verifier: VerificationStore;
  private readonly clock: () => number;
  constructor(
    db: D1Database,
    private readonly options: Options = {},
  ) {
    this.meter = new D1Meter(db);
    this.db = this.meter.db;
    this.clock = options.clock ?? Date.now;
    this.verifier = new VerificationStore(this.db, {
      enabled: options.enabled ?? false,
      localOnly: options.localOnly ?? false,
      clock: this.clock,
    });
  }
  async schema() {
    if (!this.options.enabled) throw new PostError('feature-disabled');
    try {
      const identity = await this.verifier.schema();
      if (
        !this.options.localOnly ||
        identity.environment !== 'staging' ||
        identity.database_name !== 'astro-events-jp-staging'
      )
        throw new PostError('environment-mismatch');
      if (
        (await this.db
          .prepare('SELECT version FROM post_generation_schema')
          .first('version')) !== 1
      )
        throw new PostError('schema-unavailable');
      return identity;
    } catch (e) {
      if (e instanceof PostError) throw e;
      throw new PostError('schema-unavailable');
    }
  }
  private async capture(eventId: string) {
    await this.schema();
    if (typeof eventId !== 'string' || eventId.length > 200)
      throw new PostError('unsafe-input');
    const snapshot = await this.verifier.capture(eventId);
    if (!snapshot) throw new PostError('not-currently-verified');
    return snapshot;
  }
  private async proof(c: Capture) {
    return digest(
      JSON.stringify([
        c.revision,
        c.decisionId,
        c.guard.sql,
        c.guard.values,
        semanticEvent(c.event),
      ]),
    );
  }
  private async draft(c: Capture, kind: PostKind, version: string) {
    return renderPost(c.event, c.revision, kind, this.clock(), version);
  }
  private delivery(c: Capture, p: PostDraft): PostDelivery {
    return {
      copyText: p.text,
      metadata: {
        post: p,
        eventId: p.eventId,
        sourceId: c.event.sourceId,
        eventRevision: c.revision,
        verified: true,
        checkedAt: c.event.verification.checkedAt,
        expiresAt: c.event.verification.expiresAt,
        fingerprint: c.event.verification.fingerprint,
        decisionId: c.decisionId,
        officialUrl: c.event.officialUrl,
        images: c.event.verification.images,
        impacts: c.event.verification.impacts,
        recommended: true,
        recheckRequired: false,
        fields: Object.fromEntries(
          Object.entries(c.event.verification.fields).map(([key, value]) => [
            key,
            value.state,
          ]),
        ),
      },
    };
  }
  private async recheck(c: Capture, p: PostDraft) {
    const fresh = await this.capture(p.eventId);
    if (
      (await this.proof(c)) !== (await this.proof(fresh)) ||
      Date.parse(p.validUntil) <= this.clock()
    )
      throw new PostError('write-conflict');
    return fresh;
  }
  async preview(eventId: string, kind: PostKind, version = TEMPLATE_VERSION) {
    const c = await this.capture(eventId),
      p = await this.draft(c, kind, version);
    return this.delivery(await this.recheck(c, p), p);
  }
  /** Existing PostGenerator contract: caller-supplied objects cannot authorize output. */
  async generate(event: VerifiedEvent, kind: PostKind) {
    const c = await this.capture(event.stableEventId);
    try {
      if (
        semanticEvent(event as DetailedVerifiedEvent) !== semanticEvent(c.event)
      )
        throw new PostError('not-currently-verified');
    } catch {
      throw new PostError('not-currently-verified');
    }
    const p = await this.draft(c, kind, TEMPLATE_VERSION);
    await this.recheck(c, p);
    return p;
  }
  private async row(id: string) {
    return this.db
      .prepare(
        'SELECT * FROM generated_posts WHERE post_id=?1 AND length(text)<=8192 AND length(hashtags_json)<=4096 AND (omissions_json IS NULL OR length(omissions_json)<=8192) AND (input_digest IS NULL OR length(input_digest)=64) AND (content_digest IS NULL OR length(content_digest)=64) AND length(template_version)<=40 AND (length_policy IS NULL OR length(length_policy)<=100)',
      )
      .bind(id)
      .first<Row>();
  }
  private async matches(row: Row, c: Capture, p: PostDraft) {
    return (
      row.post_id === p.id &&
      row.event_id === p.eventId &&
      row.revision === p.eventRevision &&
      row.kind === p.kind &&
      row.text === p.text &&
      row.weighted_length === p.weightedLength &&
      row.hashtags_json === JSON.stringify(p.hashtags) &&
      row.template_version === p.templateVersion &&
      row.verification_decision_id === c.decisionId &&
      row.input_digest === (await this.proof(c)) &&
      row.content_digest === (await digest(p.text)) &&
      row.length_policy === p.lengthPolicy &&
      row.valid_until === p.validUntil &&
      row.omissions_json === JSON.stringify(p.omitted)
    );
  }
  async save(
    eventId: string,
    kind: PostKind,
    accountUsage: Usage | null,
    version = TEMPLATE_VERSION,
    expected?: { sourceId: string; fingerprint: string; revision: number },
  ) {
    if (
      !accountUsage ||
      !withinBudget(accountUsage, {
        requests: 0,
        reads: 4000,
        writes: 20,
        databaseBytes: 8192,
      })
    )
      throw new PostError('budget-exhausted');
    const c = await this.capture(eventId),
      p = await this.draft(c, kind, version),
      prior = await this.row(p.id);
    if (
      expected &&
      (c.event.sourceId !== expected.sourceId ||
        c.event.verification.fingerprint !== expected.fingerprint ||
        c.revision !== expected.revision)
    )
      throw new PostError('write-conflict');
    if (prior) {
      if (!(await this.matches(prior, c, p)))
        throw new PostError('stored-post-invalid');
      await this.recheck(c, p);
      return { changed: false, delivery: this.delivery(c, p) };
    }
    await this.recheck(c, p);
    // One conditional statement: no half-written Verified output or child records.
    const result = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO generated_posts(post_id,event_id,revision,kind,text,weighted_length,hashtags_json,template_version,created_at,verification_decision_id,input_digest,content_digest,length_policy,valid_until,omissions_json) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${c.guard.sql} AND EXISTS(SELECT 1 FROM verification_decisions WHERE decision_id=? AND expires_at>? AND status='Verified') AND EXISTS(SELECT 1 FROM post_generation_schema WHERE version=1) ON CONFLICT(event_id,revision,kind,template_version) DO NOTHING`,
        )
        .bind(
          p.id,
          p.eventId,
          p.eventRevision,
          p.kind,
          p.text,
          p.weightedLength,
          JSON.stringify(p.hashtags),
          p.templateVersion,
          new Date(this.clock()).toISOString(),
          c.decisionId,
          await this.proof(c),
          await digest(p.text),
          p.lengthPolicy,
          p.validUntil,
          JSON.stringify(p.omitted),
          ...c.guard.values,
          c.decisionId,
          new Date(this.clock()).toISOString(),
        ),
    ]);
    const stored = await this.row(p.id);
    if (!stored || !(await this.matches(stored, c, p)))
      throw new PostError('write-conflict');
    await this.recheck(c, p);
    return {
      changed: result[0]?.meta.changes === 1,
      delivery: this.delivery(c, p),
    };
  }
  async get(id: string): Promise<PostDelivery | null> {
    try {
      if (typeof id !== 'string' || id.length > 200)
        throw new PostError('unsafe-input');
      await this.schema();
      const row = await this.row(id);
      if (!row || !row.input_digest) return null;
      const c = await this.capture(row.event_id),
        p = await this.draft(c, row.kind, row.template_version);
      if (!(await this.matches(row, c, p))) return null;
      return this.delivery(await this.recheck(c, p), p);
    } catch {
      return null;
    }
  }
  /** Hints are not copyable Verified outputs. Cursor advances even over stale rows. */
  async list(cursor = '', limit = 25) {
    await this.schema();
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      cursor.length > 200
    )
      throw new PostError('unsafe-input');
    return (
      await this.db
        .prepare(
          "SELECT stable_event_id AS eventId,revision FROM events WHERE stable_event_id>?1 AND verification_status='Verified' ORDER BY stable_event_id LIMIT ?2",
        )
        .bind(cursor, limit)
        .all<{ eventId: string; revision: number }>()
    ).results;
  }
  async history(eventId: string, cursor = '', limit = 25) {
    await this.schema();
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      cursor.length > 200 ||
      eventId.length > 200
    )
      throw new PostError('unsafe-input');
    // Text is deliberately absent; call get() to obtain a current copyable post.
    return (
      await this.db
        .prepare(
          'SELECT post_id,revision,kind,template_version,created_at,weighted_length FROM generated_posts WHERE event_id=?1 AND post_id>?2 ORDER BY post_id LIMIT ?3',
        )
        .bind(eventId, cursor, limit)
        .all()
    ).results;
  }
}
export class JapanesePostGenerator implements PostGenerator {
  constructor(private readonly store: PostStore) {}
  generate(event: VerifiedEvent, kind: PostKind) {
    return this.store.generate(event, kind);
  }
  validateLength(text: string) {
    return validateLength(text);
  }
}
