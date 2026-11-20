import { D1Meter } from '../collection/meter';
import { CollectionOrchestrator } from '../collection/orchestrator';
import { type Transport, unavailableTransport } from '../collection/types';
import type { PostKind } from '../domain';
import { NationwideScheduler } from '../nationwide/scheduler';
import { WeekendStore } from '../nationwide/weekend-store';
import { NotificationStore } from '../notifications/store';
import { PostStore } from '../posts/store';
import { PostError } from '../posts/types';
import { bookingWindow } from '../tracking/booking';
import { VerificationStore } from '../verification/store';
import { type Checkpoint, Operations, type Outcome } from './engine';
import { type AccountObservation, iso, type Phase } from './policy';
import { dailyReport } from './report';
import { Retention } from './retention';

interface Intent {
  event_id: string;
  source_id: string;
  revision: number;
  fingerprint: string;
  decision_id: string;
  kind: PostKind;
  post_id: string | null;
  part_cursor: number;
}
export function operationsPipeline(
  database: D1Database,
  options: { clock?: () => number; fixtureTransport?: Transport } = {},
) {
  const meter = new D1Meter(database),
    db = meter.db;
  const clock = options.clock ?? Date.now;
  const transport = options.fixtureTransport ?? unavailableTransport;
  if (
    transport.assurance !== 'fixture' &&
    transport.assurance !== 'unavailable'
  )
    throw Error('OPS_FIXTURE_TRANSPORT_REQUIRED');
  const local = { localOnly: true, enabled: true, clock } as const;
  const verify = new VerificationStore(db, local);
  const post = new PostStore(db, local);
  const notice = new NotificationStore(db, {
    ...local,
    mode: 'simulation',
    chatId: '10001',
    userIds: ['10001'],
  });
  const roundup = new WeekendStore(db, { ...local, chatId: '10001' });
  const retention = new Retention(db);
  const survey = new NationwideScheduler(db, local);
  const collector = new CollectionOrchestrator(db, transport, true, {}, clock);
  const sql = (s: string, ...args: unknown[]) => db.prepare(s).bind(...args);

  async function recover(evidence: AccountObservation, at: string) {
    const q = await sql(
      `SELECT id,kind FROM (
      SELECT delivery_id AS id,'delivery' AS kind,lease_until FROM notification_deliveries WHERE state='sending' AND lease_until<=?
      UNION ALL SELECT part_id,'weekend',lease_until FROM weekend_outbox WHERE state='sending' AND lease_until<=?
      UNION ALL SELECT ack_id,'ack',lease_until FROM notification_callback_acks WHERE state='sending' AND lease_until<=?
      UNION ALL SELECT update_id,'update',lease_until FROM notification_updates WHERE state='sending' AND lease_until<=?
    ) ORDER BY lease_until,id LIMIT 1`,
      at,
      at,
      at,
      at,
    ).first<{ id: string; kind: string }>();
    if (!q) {
      const cutoff = iso(Date.parse(at) - 120000);
      const abandoned = await sql(
        `UPDATE crawl_runs SET state='failed',finished_at=?,errors=errors+1,
        safe_error_code='OPS_INTERRUPTED' WHERE run_id=(SELECT r.run_id FROM crawl_runs r
        WHERE r.state='running' AND r.started_at<=? AND NOT EXISTS(
          SELECT 1 FROM collection_jobs j WHERE j.job_id=r.cursor AND j.lease_until>?)
        ORDER BY r.started_at LIMIT 1) AND state='running'`,
        at,
        cutoff,
        at,
      ).run();
      return abandoned.meta.changes;
    }
    if (q.kind === 'delivery') await notice.recover(q.id, evidence);
    if (q.kind === 'weekend') await roundup.recover(q.id, evidence);
    if (q.kind === 'ack') await notice.recoverCallbackAck(q.id);
    if (q.kind === 'update') await notice.recoverUpdate(q.id);
    return 1;
  }

  async function track(cursor: string, now: number, urgent: boolean) {
    const id = await sql(
      `SELECT stable_event_id FROM events WHERE verification_status='Verified' AND stable_event_id>?
      ${urgent ? " AND status IN('cancelled','postponed')" : ''} ORDER BY stable_event_id LIMIT 1`,
      cursor,
    ).first<string>('stable_event_id');
    if (!id) return { cursor: '', state: 'idle' } as const;
    const c = await verify.capture(id);
    if (!c)
      return {
        cursor: id,
        state: 'blocked',
        code: 'current-verification-required',
      } as const;
    const kinds: PostKind[] = [c.event.verification.kind];
    if (c.event.status === 'scheduled') {
      for (const kind of ['deadline', 'applications-open'] as const)
        if (bookingWindow(c.event.verification.fields, kind, now))
          kinds.push(kind);
    }
    const result = await db.batch(
      [...new Set(kinds)].map((kind) =>
        sql(
          `INSERT INTO ops_post_intents(event_id,revision,kind,source_id,fingerprint,decision_id,state,priority)
        SELECT ?,?,?,?,?,?,'pending',? WHERE ${c.guard.sql} ON CONFLICT DO NOTHING`,
          id,
          c.revision,
          kind,
          c.event.sourceId,
          c.event.verification.fingerprint,
          c.decisionId,
          ['cancellation', 'postponement'].includes(kind)
            ? 3
            : kind === 'deadline'
              ? 2
              : 1,
          ...c.guard.values,
        ),
      ),
    );
    return {
      cursor: id,
      subject: id,
      fingerprint: c.event.verification.fingerprint,
      revision: c.revision,
      counts: {
        booking: result.slice(1).reduce((n, r) => n + r.meta.changes, 0),
        changes: ['cancellation', 'postponement'].includes(kinds[0]!)
          ? result[0]!.meta.changes
          : 0,
      },
    };
  }

  async function compose(
    isPost: boolean,
    evidence: AccountObservation,
    cursor: string,
    urgent: boolean,
  ): Promise<Outcome> {
    const state = isPost ? 'pending' : 'prepared';
    const i = await sql(
      `SELECT event_id,source_id,revision,fingerprint,decision_id,kind,post_id,part_cursor
      FROM ops_post_intents WHERE state=? ${urgent ? 'AND priority=3' : ''} ORDER BY priority DESC,event_id,revision,kind LIMIT 1`,
      state,
    ).first<Intent>();
    if (!i) return { cursor, state: 'idle' };
    const key = [i.event_id, i.revision, i.kind, i.decision_id, state];
    const save = (s: string, id: string | null, part: number) =>
      sql(
        `UPDATE ops_post_intents SET state=?,post_id=?,part_cursor=?
      WHERE event_id=? AND revision=? AND kind=? AND decision_id=? AND state=? AND part_cursor=?`,
        s,
        id,
        part,
        ...key,
        i.part_cursor,
      ).run();
    const details = {
      cursor,
      subject: i.event_id,
      revision: i.revision,
      fingerprint: i.fingerprint,
    };
    const c = await verify.capture(i.event_id);
    const booking = i.kind === 'deadline' || i.kind === 'applications-open';
    if (
      !c ||
      c.decisionId !== i.decision_id ||
      c.revision !== i.revision ||
      c.event.sourceId !== i.source_id ||
      c.event.verification.fingerprint !== i.fingerprint ||
      (booking &&
        (c.event.status !== 'scheduled' ||
          !bookingWindow(
            c.event.verification.fields,
            i.kind as 'deadline' | 'applications-open',
            clock(),
          )))
    ) {
      await save('suppressed', i.post_id, i.part_cursor);
      return { ...details, state: 'blocked', code: 'stale-intent' };
    }
    const expected = {
      sourceId: i.source_id,
      revision: i.revision,
      fingerprint: i.fingerprint,
    };
    try {
      if (isPost) {
        const created = await post.save(
          i.event_id,
          i.kind,
          evidence,
          undefined,
          expected,
        );
        await save('prepared', created.delivery.metadata.post.id, 0);
        return { ...details, counts: { posts: created.changed ? 1 : 0 } };
      }
      if (!i.post_id) throw Error('OPS_POST_REQUIRED');
      const chunk = await notice.enqueue(
        i.post_id,
        evidence,
        expected,
        i.part_cursor,
      );
      await save(
        chunk.complete ? 'done' : 'prepared',
        i.post_id,
        chunk.nextCursor,
      );
      return {
        ...details,
        counts: { parts: chunk.nextCursor - i.part_cursor },
      };
    } catch (error) {
      if (
        (error instanceof PostError &&
          [
            'not-currently-verified',
            'kind-mismatch',
            'essential-info-too-long',
            'time-expired',
            'unsupported-template',
          ].includes(error.code)) ||
        (error instanceof Error &&
          [
            'PUBLICATION_SUPPRESSED',
            'BOOKING_WINDOW_NOT_CURRENT',
            'DELIVERY_INTENT_EXISTS',
          ].includes(error.message))
      ) {
        await save('suppressed', i.post_id, i.part_cursor);
        return {
          ...details,
          state: 'blocked',
          code: 'post-or-delivery-review',
        };
      }
      throw error;
    }
  }

  async function step(
    phase: Phase,
    cp: Checkpoint,
    jobId: string,
    evidence: AccountObservation,
    signal: AbortSignal,
  ): Promise<Outcome> {
    const now = clock(),
      at = iso(now);
    const idle = { cursor: cp.cursor, state: 'idle' } as const;
    switch (phase) {
      case 'recover':
        return { ...idle, counts: { recovered: await recover(evidence, at) } };
      case 'regional':
      case 'category':
      case 'vtuber': {
        const planned = await survey.step(
          phase,
          evidence,
          true,
          jobId.replaceAll('.', '_'),
        );
        return {
          ...idle,
          counts: {
            selected: 'sourceId' in planned && planned.sourceId ? 1 : 0,
          },
          ...(planned.state === 'deferred'
            ? { code: planned.reason, retryAt: now + 60000 }
            : {}),
        };
      }
      case 'collect': {
        const j = await collector.store.next(at);
        if (!j) return idle;
        if (transport.assurance !== 'fixture')
          return { ...idle, state: 'blocked', code: 'ssrf-fail-closed' };
        const run = await collector.step({
          environment: 'staging',
          localOnly: true,
          accountUsage: evidence,
          signal,
        });
        const completed =
            run.state === 'completed' || run.state === 'unchanged',
          failed = run.state === 'failed';
        if (completed || failed) {
          await sql(
            `INSERT INTO ops_region_results
            SELECT ?,prefecture,?,?,?,? FROM sources WHERE source_id=? AND prefecture IS NOT NULL
            ON CONFLICT(job_id) DO UPDATE SET state=excluded.state,attempted_at=excluded.attempted_at,
            successes=max(ops_region_results.successes,excluded.successes),failures=ops_region_results.failures+excluded.failures`,
            j.job_id,
            run.state,
            at,
            completed ? 1 : 0,
            failed ? 1 : 0,
            j.source_id,
          ).run();
        }
        // Retry-After and fetch/parse checkpoints already reside in the Collector ledger.
        return {
          ...idle,
          subject: j.job_id,
          counts: { completed: completed ? 1 : 0, failed: failed ? 1 : 0 },
          ...('code' in run && run.code ? { code: run.code } : {}),
        };
      }
      case 'verify':
      case 'verify-vtuber': {
        const items = await verify.pending(
          cp.cursor,
          1,
          phase === 'verify' ? 'general' : 'vtuber',
        );
        const id = items[0]?.candidate_id;
        if (typeof id !== 'string') return { cursor: '', state: 'idle' };
        if (
          await sql(
            'SELECT 1 FROM ops_event_tombstones WHERE candidate_id=? AND fingerprint=?',
            id,
            items[0]?.fingerprint,
          ).first()
        )
          return { cursor: id, state: 'blocked', code: 'retired-fingerprint' };
        const prepared = await verify.preview(id);
        await verify.commit(prepared.loaded, prepared.result, evidence);
        return {
          cursor: id,
          subject: id,
          fingerprint: prepared.result.fingerprint,
          counts: { reviewed: 1 },
        };
      }
      case 'track':
      case 'urgent-track':
        return track(cp.cursor, now, phase === 'urgent-track');
      case 'posts':
      case 'urgent-post':
        return compose(true, evidence, cp.cursor, phase === 'urgent-post');
      case 'outbox':
      case 'urgent-outbox':
        return compose(false, evidence, cp.cursor, phase === 'urgent-outbox');
      case 'weekend': {
        const plan = await roundup.preview(0, 'nationwide', evidence);
        if (!plan.parts.length) return idle;
        await roundup.enqueue(0, 'nationwide', plan.digest, evidence);
        return { ...idle, counts: { parts: plan.parts.length } };
      }
      case 'retention':
      case 'prune-fingerprints':
      case 'prune-crawl':
      case 'prune-ops': {
        const kind =
          phase === 'retention'
            ? 'event'
            : phase === 'prune-fingerprints'
              ? 'fingerprint'
              : phase === 'prune-crawl'
                ? 'crawl'
                : 'operation';
        const plan = await retention.preview(kind, now);
        return {
          ...idle,
          counts: { deleted: await retention.apply(kind, now, plan.digest) },
        };
      }
      case 'report': {
        const to = jobId.slice(0, 24);
        const report = await dailyReport(
          db,
          iso(Date.parse(to) - 86400000),
          to,
          evidence,
        );
        await sql(
          'INSERT INTO ops_daily_reports VALUES(?,?,?) ON CONFLICT DO NOTHING',
          to,
          at,
          JSON.stringify(report),
        ).run();
        return idle;
      }
    }
  }
  return new Operations(meter, step, clock);
}
