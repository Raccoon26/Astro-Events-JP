import { D1Meter } from '../collection/meter';
import { assertLocal } from '../nationwide/local';
import {
  type AccountObservation,
  assess,
  COSTS,
  critical,
  DAILY_PHASES,
  iso,
  PHASES,
  type Phase,
  type Reserved,
  recordedObservation,
  STRUCTURAL,
  slot,
  ZERO,
} from './policy';

interface Job {
  id: string;
  phase: Phase;
  attempts: number;
  generation: number;
  due_at: string;
}
export type Checkpoint = {
  cursor: string;
  subject?: string;
  fingerprint?: string;
  revision?: number;
};
export type Outcome = Checkpoint & {
  state?: 'idle' | 'done' | 'blocked';
  counts?: Record<string, number>;
  retryAt?: number;
  code?: string;
};
type Step = (
  phase: Phase,
  current: Checkpoint,
  jobId: string,
  evidence: AccountObservation,
  signal: AbortSignal,
) => Promise<Outcome>;
const LIMIT = 3;
const safe = (value: unknown) =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{0,200}$/.test(value);
const code = (value: unknown) =>
  typeof value === 'string' && /^[a-z0-9_-]{1,48}$/i.test(value);
const measure = () => performance.now();

export class Operations {
  readonly meter: D1Meter;
  private readonly db: D1Database;
  constructor(
    database: D1Database | D1Meter,
    private readonly step: Step,
    private readonly clock = Date.now,
    private readonly elapsed = measure,
  ) {
    this.meter = database instanceof D1Meter ? database : new D1Meter(database);
    this.db = this.meter.db;
  }
  private sql(statement: string, ...values: unknown[]) {
    return this.db.prepare(statement).bind(...values);
  }
  async schema() {
    await assertLocal(this.db);
    if (
      (await this.sql('SELECT version FROM automation_schema').first(
        'version',
      )) !== 1
    )
      throw Error('OPS_LOCAL_SCHEMA_REQUIRED');
  }
  private async used(day: string) {
    return (
      (await this.sql(
        'SELECT requests,reads,writes,bytes AS databaseBytes,telemetry FROM ops_budget_day WHERE utc_day=?',
        day,
      ).first<Reserved>()) ?? ZERO
    );
  }
  private reservation(
    day: string,
    cost: Reserved,
    guard: string,
    ...bindings: unknown[]
  ) {
    return this.sql(
      `INSERT INTO ops_budget_day SELECT ?,?,?,?,?,? WHERE ${guard}
      ON CONFLICT(utc_day) DO UPDATE SET requests=requests+excluded.requests,reads=reads+excluded.reads,
      writes=writes+excluded.writes,bytes=bytes+excluded.bytes,telemetry=telemetry+excluded.telemetry`,
      day,
      cost.requests,
      cost.reads,
      cost.writes,
      cost.databaseBytes,
      cost.telemetry,
      ...bindings,
    );
  }
  /** Staging diagnostic Cron remains unchanged. Local driver calls this once per JST slot. */
  async tick(scheduledTime: number, evidence: AccountObservation | null) {
    const w = slot(scheduledTime),
      now = this.clock();
    if (scheduledTime > now || now - scheduledTime >= 10800000)
      throw Error('OPS_EXPIRED_SLOT');
    await this.schema();
    const marker = w.utc + ':recover';
    if (await this.sql('SELECT id FROM ops_jobs WHERE id=?', marker).first())
      return { state: 'duplicate', ...w };
    const epoch = await this.sql('SELECT epoch FROM ops_lease').first<number>(
      'epoch',
    );
    const gate = assess(
      evidence,
      await this.used(iso(now).slice(0, 10)),
      STRUCTURAL,
      now,
      true,
    );
    if (!gate.allowed || !evidence)
      return { state: 'deferred', code: gate.code, ...w };
    const at = iso(now);
    const own = 'EXISTS(SELECT 1 FROM ops_jobs WHERE id=? AND owner=?)';
    const nonce = crypto.randomUUID();
    // The insertion and budget ceiling use the same serialization epoch as a worker claim.
    const stages = PHASES.filter(
      (p) => w.daily || !DAILY_PHASES.some((d) => d === p),
    );
    const results = await this.db.batch([
      this.sql(
        `INSERT INTO ops_jobs(id,slot,phase,state,due_at,owner,protection)
        SELECT ?,?,'recover','pending',?,?,1 WHERE (SELECT epoch FROM ops_lease)=? ON CONFLICT DO NOTHING`,
        marker,
        w.utc,
        at,
        nonce,
        epoch,
      ),
      this.reservation(gate.utcDay, STRUCTURAL, own, marker, nonce),
      ...stages.slice(1).map((p, index) =>
        this.sql(
          `INSERT INTO ops_jobs(id,slot,phase,state,due_at,ordinal,protection)
        SELECT ?,?,?,'pending',?,?,? WHERE ${own}`,
          w.utc + ':' + p,
          w.utc,
          p,
          at,
          index + 1,
          critical(p) ? 1 : 0,
          marker,
          nonce,
        ),
      ),
      this.sql(
        `INSERT INTO ops_account_observations SELECT ?,?,?,? WHERE ${own} ON CONFLICT DO NOTHING`,
        evidence.checkedAt,
        gate.utcDay,
        evidence.provenance,
        JSON.stringify(recordedObservation(evidence)),
        marker,
        nonce,
      ),
      this.sql(
        `UPDATE ops_lease SET epoch=epoch+1 WHERE ${own}`,
        marker,
        nonce,
      ),
      this.sql(
        'UPDATE ops_jobs SET owner=NULL WHERE id=? AND owner=?',
        marker,
        nonce,
      ),
    ]);
    return {
      state: results[0]?.meta.changes === 1 ? 'scheduled' : 'conflict',
      ...w,
    };
  }
  /** Exactly one phase per call. A budget/elapsed refusal takes no lease or cursor. */
  async advance(evidence: AccountObservation | null) {
    const started = this.elapsed(),
      now = this.clock(),
      at = iso(now);
    await this.schema();
    const day = at.slice(0, 10),
      epoch = await this.sql('SELECT epoch FROM ops_lease').first<number>(
        'epoch',
      );
    const prior = await this.used(day);
    const base = assess(evidence, prior, STRUCTURAL, now, true);
    if (!base.allowed || !evidence)
      return { state: 'deferred', code: base.code };
    const stale = await this.sql(
      "SELECT id FROM ops_jobs WHERE state='running' AND lease_until<=? ORDER BY lease_until LIMIT 1",
      at,
    ).first<string>('id');
    if (stale) {
      const updated = await this.sql(
        `UPDATE ops_jobs SET state=CASE WHEN attempts>=? THEN 'failed' ELSE 'retry' END,
        error='lease-expired',owner=NULL,lease_until=NULL,due_at=?,
        finished_at=CASE WHEN attempts>=? THEN ? ELSE NULL END
        WHERE id=? AND state='running' AND lease_until<=?`,
        LIMIT,
        at,
        LIMIT,
        at,
        stale,
        at,
      ).run();
      return {
        state: updated.meta.changes ? 'recovered' : 'conflict',
        code: 'lease-expired',
      };
    }
    const candidates = (
      await this.db.batch<Job>(
        [1, 0].map((protection) =>
          this.sql(
            `SELECT id,phase,attempts,generation,due_at FROM ops_jobs INDEXED BY ops_job_due
      WHERE state IN('pending','retry') AND protection=? AND due_at<=?
      ORDER BY due_at,slot,ordinal LIMIT 16`,
            protection,
            at,
          ),
        ),
      )
    ).flatMap((r) => r.results);
    if (!candidates.length) return { state: 'idle' };
    const selected = candidates.find(
      (r) =>
        PHASES.includes(r.phase) &&
        assess(evidence, prior, COSTS[r.phase], now, critical(r.phase)).allowed,
    );
    if (!selected || this.elapsed() - started >= 1500) {
      const reason = selected
        ? 'wall-admission'
        : assess(
            evidence,
            prior,
            COSTS[candidates[0]!.phase] ?? STRUCTURAL,
            now,
          ).code;
      await this.sql(
        'INSERT INTO ops_warnings VALUES(?,?,?) ON CONFLICT DO NOTHING',
        day,
        reason,
        at,
      ).run();
      return { state: 'deferred', code: reason };
    }
    const j = selected,
      owner = crypto.randomUUID(),
      generation = j.generation + 1;
    const own =
      "EXISTS(SELECT 1 FROM ops_jobs WHERE id=? AND owner=? AND generation=? AND state='running')";
    const ownerBindings = [j.id, owner, generation] as const;
    const claim = await this.db.batch([
      this.sql(
        `UPDATE ops_jobs SET state='running',owner=?,lease_until=?,generation=generation+1,attempts=attempts+1
        WHERE id=? AND generation=? AND state IN('pending','retry') AND due_at<=?
        AND NOT EXISTS(SELECT 1 FROM ops_jobs WHERE state='running')
        AND (SELECT epoch FROM ops_lease)=? RETURNING id`,
        owner,
        iso(now + 30000),
        j.id,
        j.generation,
        at,
        epoch,
      ),
      this.reservation(day, COSTS[j.phase], own, ...ownerBindings),
      this.sql(
        `UPDATE ops_lease SET epoch=epoch+1 WHERE ${own}`,
        ...ownerBindings,
      ),
    ]);
    if (claim[0]?.results.length !== 1) return { state: 'conflict' };
    const row = await this.sql(
      'SELECT cursor FROM ops_checkpoints WHERE phase=?',
      j.phase,
    ).first<string>('cursor');
    const cursor = safe(row) ? row! : '';
    let result: Outcome;
    try {
      result = await this.step(
        j.phase,
        { cursor },
        j.id,
        evidence,
        AbortSignal.timeout(8000),
      );
      if (
        !safe(result.cursor) ||
        (result.subject !== undefined && !safe(result.subject)) ||
        (result.fingerprint !== undefined &&
          !/^[a-f0-9]{64}$/.test(result.fingerprint)) ||
        (result.revision !== undefined &&
          (!Number.isSafeInteger(result.revision) || result.revision < 1)) ||
        Object.entries(result.counts ?? {}).some(
          ([k, v]) => !code(k) || !Number.isSafeInteger(v) || v < 0,
        ) ||
        (result.code !== undefined && !code(result.code))
      )
        throw Error('OPS_UNSAFE_RESULT');
    } catch {
      result = { cursor, code: 'stage-error', retryAt: now + 60000 };
    }
    const finish = iso(this.clock());
    const retry = Number.isFinite(result.retryAt);
    const state = retry
      ? j.attempts + 1 >= LIMIT
        ? 'failed'
        : 'retry'
      : 'done';
    const due = retry
      ? iso(Math.max(now + 60000, Math.min(result.retryAt!, 8640000000000000)))
      : at;
    const done = await this.db.batch([
      this.sql(
        `INSERT INTO ops_checkpoints SELECT ?,?,?,?,? WHERE ? AND ${own} AND EXISTS(
        SELECT 1 FROM ops_jobs WHERE id=? AND lease_until>?)
        ON CONFLICT(phase) DO UPDATE SET cursor=excluded.cursor,job_id=excluded.job_id,
        generation=excluded.generation,updated_at=excluded.updated_at`,
        j.phase,
        result.cursor,
        j.id,
        generation,
        finish,
        state === 'done' ? 1 : 0,
        ...ownerBindings,
        j.id,
        finish,
      ),
      this.sql(
        `UPDATE ops_jobs SET state=?,owner=NULL,lease_until=NULL,error=?,due_at=?,finished_at=?,result_json=?
        WHERE id=? AND owner=? AND generation=? AND state='running' AND lease_until>?`,
        state,
        result.code ?? (row && !safe(row) ? 'cursor-reset' : null),
        due,
        state === 'retry' ? null : finish,
        JSON.stringify({
          state: result.state,
          counts: result.counts,
          subject: result.subject,
          fingerprint: result.fingerprint,
          revision: result.revision,
        }),
        ...ownerBindings,
        finish,
      ),
    ]);
    return {
      state: done[1]?.meta.changes === 1 ? state : 'conflict',
      phase: j.phase,
      code: result.code ?? null,
    };
  }
}
