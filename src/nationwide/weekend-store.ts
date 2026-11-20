import { D1Meter } from '../collection/meter';
import { digest } from '../collection/text';
import type { Usage } from '../domain';
import { NotificationProtocol } from '../notifications/protocol';
import { DeliveryFault, type IsolatedWire } from '../notifications/types';
import { regionPrefectures } from '../prefectures';
import { VerificationStore } from '../verification/store';
import { assertLocal, budget } from './local';
import {
  buildWeekend,
  MAX_PARTS,
  type Member,
  renderWeekendPart,
  validScope,
  type WeekendScope,
  weekend,
  weekendDigest,
  weekendMember,
} from './weekend';

const SCAN = 16;
type Capture = NonNullable<Awaited<ReturnType<VerificationStore['capture']>>>;
interface Part {
  part_id: string;
  edition_id: string;
  ordinal: number;
  body: string;
  body_hash: string;
  target: string;
  state: string;
  owner: string | null;
  provider_started: number;
  lease_until: string | null;
}
interface Edition {
  edition_id: string;
  scope: WeekendScope;
  saturday: string;
  digest: string;
}
interface Hint {
  stable_event_id: string;
  start_date: string;
}

export class WeekendStore {
  readonly meter: D1Meter;
  private readonly db: D1Database;
  private readonly verifier: VerificationStore;
  private readonly clock: () => number;
  constructor(
    database: D1Database,
    private readonly options: {
      localOnly: true;
      chatId: string;
      clock?: () => number;
    },
  ) {
    if (
      options.localOnly !== true ||
      !/^-?[1-9]\d{0,18}$/u.test(options.chatId)
    )
      throw Error('WEEKEND_LOCAL_ONLY');
    this.meter = new D1Meter(database);
    this.db = this.meter.db;
    this.clock = options.clock ?? Date.now;
    this.verifier = new VerificationStore(this.db, {
      localOnly: true,
      enabled: true,
      clock: this.clock,
    });
  }
  private bind(sql: string, ...values: unknown[]) {
    return this.db.prepare(sql).bind(...values);
  }
  private async inspect(
    offset: 0 | 1,
    scope: WeekendScope,
    usage: Usage | null,
  ) {
    if (!validScope(scope) || !budget(usage, 12000, 100))
      throw Error('WEEKEND_SCOPE_OR_BUDGET');
    await assertLocal(this.db);
    const now = this.clock(),
      w = weekend(now, offset);
    const codes = scope.startsWith('region:')
      ? regionPrefectures(scope.slice(7)).map((p) => p.code)
      : [];
    const filter =
      scope === 'vtuber'
        ? "category='vtuber'"
        : scope === 'research'
          ? "category IN('space-development','research')"
          : scope === 'local'
            ? "category IN('local','astronomy')"
            : codes.length
              ? `category<>'vtuber' AND prefecture IN(${codes.map(() => '?').join(',')})`
              : "category<>'vtuber'";
    const status = "verification_status='Verified' AND status='scheduled'";
    const page = await this.db.batch<Hint>([
      this.bind(
        `SELECT stable_event_id,start_date FROM events INDEXED BY weekend_event_day WHERE ${status}
        AND start_date BETWEEN ? AND ? AND ${filter} ORDER BY start_date,stable_event_id LIMIT ?`,
        w.saturday,
        w.sunday,
        ...codes,
        SCAN,
      ),
      this.bind(
        `SELECT stable_event_id,start_date FROM events INDEXED BY weekend_event_period WHERE ${status}
        AND end_date>=? AND end_date IS NOT NULL AND start_date<? AND ${filter} ORDER BY end_date,start_date,stable_event_id LIMIT ?`,
        w.saturday,
        w.saturday,
        ...codes,
        SCAN,
      ),
    ]);
    const hints = [
      ...new Set(page.flatMap((p) => p.results.map((h) => h.stable_event_id))),
    ].slice(0, SCAN);
    const proofs = new Map<string, Capture>(),
      members: Member[] = [];
    for (const id of hints) {
      const capture = await this.verifier.capture(id);
      if (!capture) continue;
      const m = weekendMember(
        capture.event,
        capture.revision,
        capture.decisionId,
        capture.validUntil,
        scope,
        w,
        now,
      );
      if (m) {
        members.push(m);
        proofs.set(id, capture);
      }
    }
    const plan = buildWeekend(members, scope),
      key = await weekendDigest(w.saturday, scope, plan.parts);
    return {
      w,
      plan,
      key,
      proofs,
      considered: hints.length,
      more:
        page.some((p) => p.results.length === SCAN) ||
        page.reduce((n, p) => n + p.results.length, 0) > SCAN,
    };
  }
  async preview(offset: 0 | 1, scope: WeekendScope, usage: Usage | null) {
    const i = await this.inspect(offset, scope, usage);
    const issues = await this.issueReferences(
      i.plan.parts.flatMap((p) => p.members),
    );
    return {
      weekend: i.w,
      scope,
      digest: i.key,
      ...i.plan,
      considered: i.considered,
      truncated: i.more,
      issues,
      dryRun: true,
    };
  }
  private async issueReferences(members: Member[]) {
    if (!members.length) return [];
    const ids = members.map((m) => m.eventId);
    return (
      await this.bind(
        `SELECT event_id,repository,issue_number FROM notification_issue_links
      WHERE mode='simulation' AND event_id IN(${ids.map(() => '?').join(',')}) ORDER BY event_id LIMIT 6`,
        ...ids,
      ).all()
    ).results;
  }
  async enqueue(
    offset: 0 | 1,
    scope: WeekendScope,
    expectedDigest: string,
    usage: Usage | null,
  ) {
    const { w, plan, key, proofs } = await this.inspect(offset, scope, usage);
    if (!plan.parts.length || key !== expectedDigest)
      throw Error('WEEKEND_PREVIEW_CHANGED');
    const existing = await this.bind(
      'SELECT edition_id FROM weekend_editions WHERE digest=?',
      key,
    ).first<string>('edition_id');
    if (existing) return { editionId: existing, created: false };
    const nonce = crypto.randomUUID(),
      members = plan.parts.flatMap((p) => p.members);
    const id = 'weekend-' + key;
    const own =
      'EXISTS(SELECT 1 FROM weekend_editions WHERE edition_id=? AND owner=?)';
    // Any previous provider start freezes this scope for the weekend, even if a receipt was lost.
    const frozen = `NOT EXISTS(SELECT 1 FROM weekend_active a JOIN weekend_outbox o ON o.edition_id=a.edition_id
      WHERE a.saturday=? AND a.scope=? AND (o.state IN('sending','sent','uncertain') OR o.provider_started=1))`;
    const otherScope = `NOT EXISTS(SELECT 1 FROM weekend_active a JOIN weekend_members m ON m.edition_id=a.edition_id
      WHERE a.saturday=? AND a.scope<>? AND m.event_id IN(${members.map(() => '?').join(',')}))`;
    const statements = [
      this.bind(
        `INSERT INTO weekend_editions SELECT ?,?,?,?,?,? WHERE ${frozen} AND ${otherScope} ON CONFLICT DO NOTHING`,
        id,
        w.saturday,
        scope,
        key,
        nonce,
        new Date(this.clock()).toISOString(),
        w.saturday,
        scope,
        w.saturday,
        scope,
        ...members.map((m) => m.eventId),
      ),
      ...plan.parts.flatMap((part, i) =>
        part.members.map((m, j) => {
          const proof = proofs.get(m.eventId)!;
          return this.bind(
            `INSERT INTO weekend_members SELECT ?,?,?,?,?,?,?,?,? WHERE ${own} AND ${proof.guard.sql}`,
            id,
            m.eventId,
            m.revision,
            m.decisionId,
            m.fingerprint,
            m.validUntil,
            JSON.stringify(m),
            i,
            j,
            id,
            nonce,
            ...proof.guard.values,
          );
        }),
      ),
      ...(await Promise.all(
        plan.parts.map(async (p, i) =>
          this.bind(
            `INSERT INTO weekend_outbox(part_id,edition_id,ordinal,body,body_hash,target)
          SELECT ?,?,?,?,?,? WHERE ${own}`,
            id + ':' + i,
            id,
            i,
            p.body,
            await digest(p.body),
            this.options.chatId,
            id,
            nonce,
          ),
        ),
      )),
      this.bind(
        `INSERT INTO weekend_active(saturday,scope,edition_id)
        SELECT ?,?,CASE WHEN (SELECT COUNT(*) FROM weekend_members WHERE edition_id=?)=? THEN ? ELSE NULL END WHERE ${own}
        ON CONFLICT(saturday,scope) DO UPDATE SET edition_id=excluded.edition_id`,
        w.saturday,
        scope,
        id,
        members.length,
        id,
        id,
        nonce,
      ),
    ];
    const result = await this.db.batch(statements);
    if (result[0]?.meta.changes !== 1) {
      const replay = await this.bind(
        'SELECT edition_id FROM weekend_editions WHERE digest=?',
        key,
      ).first<string>('edition_id');
      if (replay) return { editionId: replay, created: false };
      throw Error('WEEKEND_OVERLAP_OR_FROZEN');
    }
    return { editionId: id, created: true };
  }

  private async part(partId: string) {
    return this.bind(
      'SELECT * FROM weekend_outbox WHERE part_id=?',
      partId,
    ).first<Part>();
  }
  private async validate(part: Part) {
    const edition = await this.bind(
      `SELECT e.* FROM weekend_editions e JOIN weekend_active a ON a.edition_id=e.edition_id WHERE e.edition_id=?`,
      part.edition_id,
    ).first<Edition>();
    if (
      !edition ||
      part.target !== this.options.chatId ||
      !validScope(edition.scope) ||
      part.ordinal < 0 ||
      part.ordinal >= MAX_PARTS
    )
      throw Error('WEEKEND_STALE');
    const now = this.clock(),
      w0 = weekend(now, 0),
      w = edition.saturday === w0.saturday ? w0 : weekend(now, 1);
    if (w.saturday !== edition.saturday || now >= w.end)
      throw Error('WEEKEND_STALE');
    const rows = (
      await this.bind(
        'SELECT * FROM weekend_members WHERE edition_id=? ORDER BY part,position LIMIT 7',
        edition.edition_id,
      ).all<{
        event_id: string;
        revision: number;
        decision_id: string;
        fingerprint: string;
        item: string;
        part: number;
        position: number;
      }>()
    ).results;
    if (!rows.length || rows.length > 6) throw Error('WEEKEND_STALE');
    const captures = new Map<string, Capture>(),
      parts: Member[][] = [];
    for (const r of rows) {
      const c = await this.verifier.capture(r.event_id);
      if (
        !c ||
        c.revision !== r.revision ||
        c.decisionId !== r.decision_id ||
        c.event.verification.fingerprint !== r.fingerprint
      )
        throw Error('WEEKEND_STALE');
      const m = weekendMember(
        c.event,
        c.revision,
        c.decisionId,
        c.validUntil,
        edition.scope,
        w,
        now,
      );
      if (!m || JSON.stringify(m) !== r.item) throw Error('WEEKEND_STALE');
      const group = (parts[r.part] ??= []);
      if (group.length !== r.position) throw Error('WEEKEND_STALE');
      group.push(m);
      captures.set(m.eventId, c);
    }
    const plan = Array.from(parts, (group) =>
        group ? renderWeekendPart(group, edition.scope) : null,
      ),
      p = plan[part.ordinal];
    if (
      !p ||
      plan.some((value) => !value) ||
      p.body !== part.body ||
      (await digest(part.body)) !== part.body_hash ||
      (await weekendDigest(
        w.saturday,
        edition.scope,
        plan.filter((value) => value !== null),
      )) !== edition.digest
    )
      throw Error('WEEKEND_STALE');
    return p.members.map((m) => captures.get(m.eventId)!.guard);
  }

  async list(editionId: string) {
    await assertLocal(this.db);
    return (
      await this.bind(
        'SELECT part_id,ordinal,state,external_id,error FROM weekend_outbox WHERE edition_id=? ORDER BY ordinal LIMIT 3',
        editionId,
      ).all()
    ).results;
  }

  /** No live wire can be constructed here. Persist a started marker before any fake provider call. */
  async dispatch(partId: string, wire: IsolatedWire, usage: Usage | null) {
    if (wire.mode !== 'isolated-fake' || !budget(usage, 18000, 100, 1))
      throw Error('WEEKEND_BUDGET_OR_MODE');
    await assertLocal(this.db);
    const part = await this.part(partId);
    if (!part || !['pending', 'failed'].includes(part.state))
      return { state: 'unchanged' as const };
    let guards;
    try {
      guards = await this.validate(part);
    } catch {
      await this.bind(
        "UPDATE weekend_outbox SET state='stale',error='WEEKEND_CHANGED' WHERE part_id=? AND state IN('pending','failed')",
        partId,
      ).run();
      return { state: 'stale' as const };
    }
    const now = this.clock(),
      at = new Date(now).toISOString(),
      owner = crypto.randomUUID();
    const condition = guards.map((g) => `(${g.sql})`).join(' AND ');
    const params = guards.flatMap((g) => g.values);
    const validMembership = `NOT EXISTS(SELECT 1 FROM weekend_members m JOIN events e ON e.stable_event_id=m.event_id
      WHERE m.edition_id=? AND (e.revision<>m.revision OR e.verification_id IS NOT m.decision_id OR e.status<>'scheduled' OR m.valid_until<=?))`;
    const claimed = await this.bind(
      `UPDATE weekend_outbox SET state='sending',owner=?,lease_until=?,attempts=attempts+1
      WHERE part_id=? AND state IN('pending','failed') AND provider_started=0 AND attempts<3 AND (next_attempt IS NULL OR next_attempt<=?)
      AND EXISTS(SELECT 1 FROM weekend_active WHERE edition_id=?) AND ${validMembership} AND ${condition} RETURNING part_id`,
      owner,
      new Date(now + 30000).toISOString(),
      partId,
      at,
      part.edition_id,
      part.edition_id,
      at,
      ...params,
    ).first();
    if (!claimed) return { state: 'unchanged' as const };
    const started = await this.bind(
      `UPDATE weekend_outbox SET provider_started=1 WHERE part_id=? AND owner=? AND state='sending' AND lease_until>?
      AND ${validMembership} AND ${condition} RETURNING part_id`,
      partId,
      owner,
      at,
      part.edition_id,
      at,
      ...params,
    ).first();
    if (!started) return { state: 'unchanged' as const };
    try {
      const receipt = await new NotificationProtocol(wire, this.clock).telegram(
        part.target,
        {
          chat_id: part.target,
          text: part.body,
          link_preview_options: { is_disabled: true },
        },
      );
      const completed = await this.bind(
        "UPDATE weekend_outbox SET state='sent',owner=NULL,lease_until=NULL,external_id=? WHERE part_id=? AND owner=? AND state='sending' RETURNING part_id",
        receipt.externalId,
        partId,
        owner,
      ).first();
      if (!completed) throw Error('WEEKEND_RECEIPT_CONFLICT');
      return { state: 'sent' as const, externalId: receipt.externalId };
    } catch (error) {
      const retry =
        error instanceof DeliveryFault && !error.uncertain
          ? error.retryAt
          : null;
      const terminal =
        error instanceof DeliveryFault && !error.uncertain
          ? 'failed'
          : 'uncertain';
      await this.bind(
        `UPDATE weekend_outbox SET state=?,owner=NULL,lease_until=NULL,provider_started=?,next_attempt=?,error=?
        WHERE part_id=? AND owner=? AND state='sending'`,
        terminal,
        retry ? 0 : 1,
        retry,
        terminal === 'uncertain' ? 'RECEIPT_UNKNOWN' : 'PROVIDER_REJECTED',
        partId,
        owner,
      ).run();
      return { state: terminal };
    }
  }
  async recover(partId: string, usage: Usage | null) {
    if (!budget(usage, 30, 12)) throw Error('WEEKEND_BUDGET_OR_MODE');
    await assertLocal(this.db);
    const row = await this.bind(
      `UPDATE weekend_outbox SET state=CASE WHEN provider_started=1 THEN 'uncertain' ELSE 'pending' END,
      owner=NULL,lease_until=NULL,error=CASE WHEN provider_started=1 THEN 'RECEIPT_UNKNOWN' ELSE NULL END
      WHERE part_id=? AND state='sending' AND lease_until<=? RETURNING state`,
      partId,
      new Date(this.clock()).toISOString(),
    ).first('state');
    return { state: row ?? 'unchanged' };
  }
}
