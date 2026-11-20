import { withinBudget } from '../budget';
import { D1Meter } from '../collection/meter';
import { digest } from '../collection/text';
import type { Event, PublicationStatus, Usage } from '../domain';
import { PostStore } from '../posts/store';
import type { PostDelivery } from '../posts/types';
import { bookingWindow } from '../tracking/booking';
import type { TrackedChange } from '../tracking/changes';
import { trackingAvailable } from '../tracking/store';
import { formatChange, MANAGEMENT_VERSION } from './management';
import {
  assertCopy,
  bounded,
  link,
  makeReport,
  renderMessages,
  text,
} from './messages';
import { NotificationProtocol } from './protocol';
import { fingerprintExpiry } from './publication';
import {
  type Action,
  type Button,
  DeliveryFault,
  type Identity,
  type IsolatedWire,
  NotificationError,
  type NotificationOptions,
  type OutboxRow,
  type Plan,
  REPORT_VERSION,
  REPORTS_REPO,
} from './types';

const DAY = 86400000;
const id = (value: unknown) => {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 200 ||
    /[\u0000-\u0020]/u.test(value)
  )
    throw new NotificationError('INVALID_ID');
  return value;
};
const nowIso = (now: number) => new Date(now).toISOString();
const rowSql = `SELECT d.delivery_id,d.idempotency_key AS idempotencyKey,d.event_id,d.event_id AS eventId,d.post_id,d.post_id AS postId,d.channel,CAST(d.revision AS TEXT) AS revision,d.revision AS revision_number,d.state,d.lease_owner,d.lease_until,d.started_at,d.attempts,d.external_id,d.retryable,d.next_attempt_at,d.safe_error_code,c.group_id,c.payload,c.payload_digest,c.target,c.part_index,CASE WHEN d.channel='github-issue' THEN 'issue' WHEN d.message_part='post' THEN 'copy' ELSE 'management' END AS part FROM notification_deliveries d JOIN notification_context c ON c.delivery_id=d.delivery_id`;
interface Group {
  group_id: string;
  event_id: string;
  post_id: string;
  revision: number;
  decision_id: string;
  fingerprint: string;
  payload_digest: string;
  valid_until: string;
  mode: string;
  controls_json: string;
  report_version: string;
  kind: string;
}
function bookingKind(kind: string): kind is 'applications-open' | 'deadline' {
  return kind === 'applications-open' || kind === 'deadline';
}
function publicationSlot(
  eventId: string,
  revision: number,
  kind: string,
  version: string,
  groupId: string,
) {
  const separate = version === MANAGEMENT_VERSION && bookingKind(kind);
  const table = separate
    ? 'event_delivery_intents'
    : 'notification_publications';
  const where = separate
    ? 'group_id=?'
    : "event_id=? AND revision=? AND mode='simulation'";
  return {
    separate,
    table,
    where,
    bindings: separate ? [groupId] : [eventId, revision],
    eventGate: separate
      ? " AND NOT EXISTS(SELECT 1 FROM notification_publications WHERE event_id=? AND revision=? AND mode='simulation' AND status IN('held','recheck'))"
      : '',
    eventBindings: separate ? [eventId, revision] : [],
    status: `COALESCE((SELECT status FROM ${table} WHERE ${where}),'pending')`,
  };
}
export class NotificationStore {
  readonly meter: D1Meter;
  private readonly db: D1Database;
  private readonly posts: PostStore;
  readonly clock: () => number;
  constructor(
    database: D1Database,
    readonly options: NotificationOptions,
  ) {
    this.meter = new D1Meter(database);
    this.db = this.meter.db;
    this.clock = options.clock ?? Date.now;
    this.posts = new PostStore(this.db, {
      enabled: true,
      localOnly: true,
      clock: this.clock,
    });
    if (
      !/^-?[1-9]\d{0,18}$/.test(options.chatId) ||
      !options.userIds.length ||
      options.userIds.length > 8 ||
      options.userIds.some((x) => !/^[1-9]\d{0,18}$/.test(x))
    )
      throw new NotificationError('INVALID_TARGET');
  }
  async schema() {
    if (!this.options.enabled) throw new NotificationError('FEATURE_DISABLED');
    if (!this.options.localOnly || this.options.mode !== 'simulation')
      throw new NotificationError('LIVE_DELIVERY_DISABLED');
    try {
      await this.posts.schema();
      if (
        (await this.db
          .prepare('SELECT version FROM notification_schema')
          .first('version')) !== 1
      )
        throw Error();
    } catch {
      throw new NotificationError('SCHEMA_OR_ENVIRONMENT_UNAVAILABLE');
    }
  }
  private budget(usage: Usage | null, requests = 0) {
    if (
      !usage ||
      !withinBudget(usage, {
        requests,
        reads: 8000,
        writes: 128,
        databaseBytes: 65536,
      })
    )
      throw new NotificationError('BUDGET_UNAVAILABLE');
  }
  private detailExpiry(event: Event) {
    const dates = [
      event.startDatetime,
      event.endDatetime,
      event.startDate,
      event.endDate,
    ].flatMap((v) =>
      v && Number.isFinite(Date.parse(v)) ? [Date.parse(v)] : [],
    );
    for (const value of [event.startMonth, event.endMonth])
      if (value && /^\d{4}-\d{2}$/.test(value)) {
        const [y, m] = value.split('-').map(Number);
        dates.push(Date.UTC(y!, m!, 1));
      }
    return nowIso(Math.max(this.clock(), ...dates) + 91 * DAY); // conservative date/month boundary; never a manufactured event time
  }
  private async reserveRequests(
    channel: 'telegram' | 'github',
    requests: number,
    owner: string,
  ) {
    const now = nowIso(this.clock()),
      day = now.slice(0, 10),
      global = 'simulation:' + day,
      local = global + ':' + channel;
    await this.db.batch(
      [global, local].map((key) =>
        this.db
          .prepare(
            'INSERT INTO notification_request_budgets VALUES(?,0,?) ON CONFLICT DO NOTHING',
          )
          .bind(key, now),
      ),
    );
    const reserved = await this.db.batch([
      this.db
        .prepare(
          'INSERT INTO notification_request_reservations(reservation_id,utc_day,requests,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM notification_request_budgets WHERE budget_key=? AND requests+?<=512) AND EXISTS(SELECT 1 FROM notification_request_budgets WHERE budget_key=? AND next_allowed_at<=?) ON CONFLICT DO NOTHING RETURNING reservation_id',
        )
        .bind(owner, day, requests, now, global, requests, local, now),
      this.db
        .prepare(
          "UPDATE notification_request_budgets SET requests=requests+? WHERE budget_key=? AND EXISTS(SELECT 1 FROM notification_request_reservations WHERE reservation_id=? AND state='pending')",
        )
        .bind(requests, global, owner),
      this.db
        .prepare(
          "UPDATE notification_request_budgets SET requests=requests+?,next_allowed_at=? WHERE budget_key=? AND EXISTS(SELECT 1 FROM notification_request_reservations WHERE reservation_id=? AND state='pending')",
        )
        .bind(requests, nowIso(this.clock() + 1000), local, owner),
      this.db
        .prepare(
          "UPDATE notification_request_reservations SET state='consumed' WHERE reservation_id=? AND state='pending'",
        )
        .bind(owner),
    ]);
    if (!reserved[0]?.results.length)
      throw new DeliveryFault(
        'PROJECT_RATE_OR_BUDGET_LIMIT',
        false,
        nowIso(this.clock() + 60000),
      );
  }
  private async capture(postId: string) {
    await this.schema();
    id(postId);
    const captured = await this.posts.current(postId);
    if (!captured) throw new NotificationError('CURRENT_POST_REQUIRED');
    const { delivery, guard } = captured;
    const snapshot = {
      event: captured.event,
      revision: captured.revision,
      decisionId: captured.decisionId,
    };
    if (
      !snapshot ||
      snapshot.revision !== delivery.metadata.eventRevision ||
      snapshot.decisionId !== delivery.metadata.decisionId ||
      snapshot.event.verification.fingerprint !== delivery.metadata.fingerprint
    )
      throw new NotificationError('CURRENT_POST_REQUIRED');
    assertCopy(delivery);
    const changes = (
      await this.db
        .prepare(
          'SELECT revision,detected_at,source_url,change_type FROM event_changes WHERE event_id=? AND revision<=? AND official_confirmation=1 ORDER BY revision DESC LIMIT 5',
        )
        .bind(snapshot.event.stableEventId, snapshot.revision)
        .all<{
          revision: number;
          detected_at: string;
          source_url: string;
          change_type: string;
        }>()
    ).results.map(
      (change) =>
        `revision ${change.revision}: ${text(change.change_type, 120)} / ${text(change.detected_at, 40)} / ${link(change.source_url)}`,
    );
    const tracked = await trackingAvailable(this.db);
    const revision = tracked
      ? await this.db
          .prepare(
            'SELECT purpose,changes FROM event_tracking_revisions WHERE event_id=? AND revision=? AND decision_id=?',
          )
          .bind(
            snapshot.event.stableEventId,
            snapshot.revision,
            snapshot.decisionId,
          )
          .first<{ purpose: string; changes: string }>()
      : null;
    const currentChanges =
      revision?.purpose === 'official-change'
        ? (JSON.parse(revision.changes) as { fields: TrackedChange[] }).fields
            .filter((item) => item.official)
            .slice(0, 5)
            .map(formatChange)
        : [];
    const group = await this.resolveGroup(postId, tracked);
    const slot = publicationSlot(
      delivery.metadata.eventId,
      snapshot.revision,
      delivery.metadata.post.kind,
      group.version,
      group.groupId,
    );
    return {
      delivery,
      snapshot,
      guard,
      changes,
      currentChanges: currentChanges.length ? currentChanges : changes,
      tracked,
      group,
      slot,
      purpose: revision?.purpose ?? 'initial',
      validUntil: captured.validUntil,
    };
  }
  private async resolveGroup(postId: string, tracked: boolean) {
    const existing = await this.db
      .prepare(
        "SELECT group_id,report_version FROM notification_groups WHERE post_id=? AND mode='simulation' ORDER BY created_at,group_id LIMIT 1",
      )
      .bind(postId)
      .first<{ group_id: string; report_version: string }>();
    const version =
      existing?.report_version ??
      (tracked ? MANAGEMENT_VERSION : REPORT_VERSION);
    const groupId =
      existing?.group_id ??
      'notice-' + (await digest(bounded([postId, version, 'simulation'])));
    return { version, groupId };
  }
  private async publication(slot: ReturnType<typeof publicationSlot>) {
    return (
      (await this.db
        .prepare(
          `SELECT status,generation,action_id FROM ${slot.table} WHERE ${slot.where}`,
        )
        .bind(...slot.bindings)
        .first<{
          status: PublicationStatus;
          generation: number;
          action_id: string | null;
        }>()) ?? { status: 'pending' as const, generation: 0, action_id: null }
    );
  }
  private async planning(postId: string) {
    const capture = await this.capture(postId),
      { delivery, snapshot, guard } = capture,
      m = delivery.metadata;
    const {
      slot,
      group: { version, groupId },
    } = capture;
    const publication = await this.publication(slot);
    const rendered = await renderMessages(
      snapshot.event,
      delivery,
      publication.status,
      'pending',
      version === MANAGEMENT_VERSION ? capture.currentChanges : capture.changes,
      version,
    );
    const token = await digest(bounded(delivery));
    if (
      Date.parse(capture.validUntil) <= this.clock() ||
      Date.parse(m.expiresAt) <= this.clock() ||
      Date.parse(m.post.validUntil) <= this.clock() ||
      (await this.db
        .prepare(
          `SELECT 1 AS ok WHERE ${guard.sql} AND ${slot.status}=?${slot.eventGate}`,
        )
        .bind(
          ...guard.values,
          ...slot.bindings,
          publication.status,
          ...slot.eventBindings,
        )
        .first('ok')) !== 1
    )
      throw new NotificationError('CURRENT_POST_REQUIRED');
    const plan: Plan = {
      groupId,
      delivery,
      report: makeReport(
        snapshot.event,
        delivery,
        publication.status,
        capture.changes,
      ),
      digest: token,
      ...rendered,
      priority: ['cancellation', 'postponement'].includes(m.post.kind)
        ? 100
        : ['closure', 'deadline'].includes(m.post.kind)
          ? 70
          : capture.purpose === 'official-change'
            ? 55
            : 20,
    };
    return { plan, capture, version };
  }
  async preview(postId: string): Promise<Plan> {
    return (await this.planning(postId)).plan;
  }
  private async assertGuard(
    c: Awaited<ReturnType<NotificationStore['capture']>>,
    publication: 'pending' | null = 'pending',
  ) {
    const { slot } = c;
    if (
      Date.parse(c.validUntil) <= this.clock() ||
      (await this.db
        .prepare(
          `SELECT 1 AS ok WHERE ${c.guard.sql}${publication ? ` AND ${slot.status}=?` : ''}${slot.eventGate}`,
        )
        .bind(
          ...c.guard.values,
          ...(publication ? [...slot.bindings, publication] : []),
          ...slot.eventBindings,
        )
        .first('ok')) !== 1
    )
      throw new NotificationError('STALE_GROUP');
  }
  private async group(groupId: string) {
    return this.db
      .prepare(
        'SELECT g.*,p.kind FROM notification_groups g JOIN generated_posts p ON p.post_id=g.post_id WHERE g.group_id=?',
      )
      .bind(id(groupId))
      .first<Group>();
  }
  private async storedPayload(
    row: OutboxRow,
    group: Group,
    c: Awaited<ReturnType<NotificationStore['capture']>>,
  ) {
    if (
      (await digest(row.payload)) !== row.payload_digest ||
      row.event_id !== group.event_id ||
      row.post_id !== group.post_id ||
      row.revision_number !== group.revision
    )
      throw new NotificationError('PAYLOAD_CHANGED');
    const rendered = await renderMessages(
      c.snapshot.event,
      c.delivery,
      'pending',
      'pending',
      group.report_version === MANAGEMENT_VERSION
        ? c.currentChanges
        : c.changes,
      group.report_version,
    );
    let expected: Record<string, unknown>;
    if (row.part === 'copy')
      expected = {
        chat_id: this.options.chatId,
        text: c.delivery.copyText,
        link_preview_options: { is_disabled: true },
      };
    else if (row.part === 'management') {
      const index = row.part_index - 1,
        content = rendered.management[index];
      if (content === undefined) throw new NotificationError('PAYLOAD_CHANGED');
      expected = {
        chat_id: this.options.chatId,
        text: content,
        link_preview_options: { is_disabled: true },
        ...(index === 0
          ? {
              reply_markup: {
                inline_keyboard: [JSON.parse(group.controls_json)],
              },
            }
          : {}),
      };
    } else
      expected = {
        repository: REPORTS_REPO,
        ...rendered.issue,
        marker: rendered.marker,
      };
    if (
      bounded(expected, 60000) !== row.payload ||
      row.target !== (row.part === 'issue' ? REPORTS_REPO : this.options.chatId)
    )
      throw new NotificationError('PAYLOAD_CHANGED');
    return expected;
  }
  private async currentGroup(group: Group, checkPublication = true) {
    if (
      group.mode !== 'simulation' ||
      Date.parse(group.valid_until) <= this.clock()
    )
      throw new NotificationError('STALE_GROUP');
    const c = await this.capture(group.post_id),
      m = c.delivery.metadata;
    if (checkPublication && c.slot.separate && bookingKind(m.post.kind)) {
      if (
        !bookingWindow(
          c.snapshot.event.verification.fields,
          m.post.kind,
          this.clock(),
        )
      )
        throw new NotificationError('STALE_BOOKING_WINDOW');
    }
    if (
      c.group.groupId !== group.group_id ||
      c.group.version !== group.report_version ||
      m.eventRevision !== group.revision ||
      m.decisionId !== group.decision_id ||
      m.fingerprint !== group.fingerprint ||
      (await digest(bounded(c.delivery))) !== group.payload_digest
    )
      throw new NotificationError('STALE_GROUP');
    if (
      checkPublication &&
      (await this.publication(c.slot)).status !== 'pending'
    )
      throw new NotificationError('PUBLICATION_SUPPRESSED');
    await this.assertGuard(c, checkPublication ? 'pending' : null);
    return c;
  }
  async enqueue(
    postId: string,
    usage: Usage | null,
    expected: {
      sourceId: string;
      fingerprint: string;
      revision: number;
      decisionId?: string;
    },
    cursor = 0,
  ) {
    this.budget(usage);
    const { plan, capture: c, version } = await this.planning(postId),
      m = plan.delivery.metadata;
    if (
      expected.sourceId !== m.sourceId ||
      expected.fingerprint !== m.fingerprint ||
      expected.revision !== m.eventRevision ||
      (expected.decisionId !== undefined &&
        expected.decisionId !== m.decisionId)
    )
      throw new NotificationError('EXPECTED_VERSION_MISMATCH');
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > 10)
      throw new NotificationError('INVALID_CURSOR');
    if (plan.report.publicationStatus !== 'pending')
      throw new NotificationError('PUBLICATION_SUPPRESSED');
    let group = await this.group(plan.groupId);
    const created = nowIso(this.clock());
    if (!group) {
      const kind = m.post.kind;
      const window = bookingKind(kind)
        ? (bookingWindow(
            c.snapshot.event.verification.fields,
            kind,
            this.clock(),
          )?.key ?? null)
        : null;
      if (c.slot.separate && !window)
        throw new NotificationError('BOOKING_WINDOW_NOT_CURRENT');
      const content = await digest(plan.delivery.copyText);
      const guards = c.tracked
        ? ` AND NOT EXISTS(SELECT 1 FROM event_delivery_intents
        WHERE event_id=? AND kind=? AND mode='simulation' AND (revision=? OR content_digest=?))
        AND NOT EXISTS(SELECT 1 FROM notification_groups prior JOIN generated_posts p ON p.post_id=prior.post_id
          WHERE prior.event_id=? AND prior.revision<=? AND prior.mode='simulation'
          AND prior.report_version<>'dev07-1'
          AND p.kind=? AND (prior.revision=? OR p.text=? OR ?='recheck'))
        AND (?<>'recheck' OR NOT EXISTS(SELECT 1 FROM event_delivery_intents
          WHERE event_id=? AND kind=? AND mode='simulation' AND revision<?))
        AND (? IS NULL OR NOT EXISTS(SELECT 1 FROM event_booking_intents WHERE event_id=? AND purpose=? AND window_key=?))`
        : '';
      const intentBindings = c.tracked
        ? [
            m.eventId,
            kind,
            m.eventRevision,
            content,
            m.eventId,
            m.eventRevision,
            kind,
            m.eventRevision,
            plan.delivery.copyText,
            c.purpose,
            c.purpose,
            m.eventId,
            kind,
            m.eventRevision,
            window,
            m.eventId,
            kind,
            window,
          ]
        : [];
      const controls: Button[] = [],
        tokens: { hash: string; action: Action }[] = [];
      for (const [label, action] of [
        ['게시완료', 'posted'],
        ['보류', 'held'],
        ['재확인', 'recheck'],
      ] as const) {
        const token =
          'n6:' +
          Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) =>
            x.toString(16).padStart(2, '0'),
          ).join('');
        controls.push({ text: label, callback_data: token });
        tokens.push({ hash: await digest(token), action });
      }
      const controlsJson = JSON.stringify(controls);
      const until = nowIso(
        Math.min(
          Date.parse(m.post.validUntil),
          Date.parse(m.expiresAt),
          Date.parse(c.validUntil),
          this.clock() + DAY,
        ),
      );
      await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO notification_groups(group_id,event_id,post_id,revision,decision_id,fingerprint,payload_digest,origin,report_version,mode,created_at,valid_until,controls_json,priority) SELECT ?,?,?,?,?,?,?,'verified-post',?,'simulation',?,?,?,? WHERE ${c.guard.sql}${guards}${c.slot.eventGate} ON CONFLICT DO NOTHING`,
          )
          .bind(
            plan.groupId,
            m.eventId,
            postId,
            m.eventRevision,
            m.decisionId,
            m.fingerprint,
            plan.digest,
            version,
            created,
            until,
            controlsJson,
            plan.priority,
            ...c.guard.values,
            ...intentBindings,
            ...c.slot.eventBindings,
          ),
        ...(c.tracked
          ? [
              this.db
                .prepare(
                  `INSERT INTO event_delivery_intents(event_id,revision,kind,mode,group_id,content_digest)
            SELECT event_id,revision,?,mode,group_id,? FROM notification_groups WHERE group_id=? ON CONFLICT DO NOTHING`,
                )
                .bind(kind, content, plan.groupId),
            ]
          : []),
        ...(c.tracked && window
          ? [
              this.db
                .prepare(
                  `INSERT INTO event_booking_intents(event_id,revision,purpose,window_key,created_at)
            SELECT event_id,revision,?,?,? FROM notification_groups WHERE group_id=? ON CONFLICT DO NOTHING`,
                )
                .bind(kind, window, created, plan.groupId),
            ]
          : []),
        ...(!c.slot.separate
          ? [
              this.db
                .prepare(
                  'INSERT INTO notification_publications(event_id,revision,status,updated_at) SELECT event_id,revision,?,? FROM notification_groups WHERE group_id=? ON CONFLICT DO NOTHING',
                )
                .bind('pending', created, plan.groupId),
            ]
          : []),
        this.db
          .prepare(`WITH tokens(hash,action) AS (VALUES ${tokens.map(() => '(?,?)').join(',')})
          INSERT INTO notification_callbacks(token_hash,group_id,action,expected_generation,expires_at)
          SELECT tokens.hash,g.group_id,tokens.action,0,g.valid_until FROM notification_groups g CROSS JOIN tokens
          WHERE g.group_id=? AND g.controls_json=? ON CONFLICT DO NOTHING`)
          .bind(
            ...tokens.flatMap((t) => [t.hash, t.action]),
            plan.groupId,
            controlsJson,
          ),
      ]);
      group = await this.group(plan.groupId);
      if (!group) throw new NotificationError('WRITE_CONFLICT');
    }
    if (
      group.payload_digest !== plan.digest ||
      group.mode !== 'simulation' ||
      Date.parse(group.valid_until) <= this.clock()
    )
      throw new NotificationError('STALE_GROUP');
    const controls = JSON.parse(group.controls_json) as Button[];
    const parts: {
      part: 'copy' | 'management' | 'issue';
      payload: Record<string, unknown>;
      target: string;
    }[] = [
      {
        part: 'copy',
        target: this.options.chatId,
        payload: {
          chat_id: this.options.chatId,
          text: plan.delivery.copyText,
          link_preview_options: { is_disabled: true },
        },
      },
      ...plan.management.map((text, i) => ({
        part: 'management' as const,
        target: this.options.chatId,
        payload: {
          chat_id: this.options.chatId,
          text,
          link_preview_options: { is_disabled: true },
          ...(i === 0 ? { reply_markup: { inline_keyboard: [controls] } } : {}),
        },
      })),
      {
        part: 'issue',
        target: REPORTS_REPO,
        payload: {
          repository: REPORTS_REPO,
          ...plan.issue,
          marker: plan.marker,
        },
      },
    ];
    const pending = parts.slice(cursor, cursor + 2),
      statements: D1PreparedStatement[] = [];
    for (const [offset, p] of pending.entries()) {
      const index = cursor + offset,
        key = await digest(bounded([group.group_id, p.target, index])),
        deliveryId = 'delivery-' + key,
        payload = bounded(p.payload, 60000),
        hash = await digest(payload);
      statements.push(
        this.db
          .prepare(
            `INSERT INTO notification_deliveries(delivery_id,idempotency_key,event_id,post_id,channel,revision,message_part,state,next_attempt_at,expires_at) SELECT ?,?,?,?,?,?,?,'pending',?,? WHERE ${c.guard.sql} AND EXISTS(SELECT 1 FROM notification_groups WHERE group_id=? AND payload_digest=?) ON CONFLICT DO NOTHING`,
          )
          .bind(
            deliveryId,
            key,
            m.eventId,
            postId,
            p.part === 'issue' ? 'github-issue' : 'telegram',
            m.eventRevision,
            p.part === 'copy' ? 'post' : 'management',
            created,
            this.detailExpiry(c.snapshot.event),
            ...c.guard.values,
            group.group_id,
            plan.digest,
          ),
      );
      statements.push(
        this.db
          .prepare(
            'INSERT INTO notification_context(delivery_id,group_id,part_index,payload,payload_digest,target,updated_at) SELECT delivery_id,?,?,?,?,?,? FROM notification_deliveries WHERE delivery_id=? ON CONFLICT DO NOTHING',
          )
          .bind(
            group.group_id,
            index,
            payload,
            hash,
            p.target,
            created,
            deliveryId,
          ),
      );
    }
    if (statements.length) await this.db.batch(statements);
    await this.assertGuard(c);
    return {
      groupId: group.group_id,
      complete: cursor + pending.length >= parts.length,
      nextCursor: cursor + pending.length,
      total: parts.length,
      simulated: true,
    };
  }
  private async row(deliveryId: string) {
    await this.schema();
    return this.db
      .prepare(rowSql + ' WHERE d.delivery_id=? AND length(c.payload)<=60000')
      .bind(id(deliveryId))
      .first<OutboxRow>();
  }
  async receipt(deliveryId: string) {
    const row = await this.row(deliveryId);
    return row
      ? {
          idempotencyKey: row.idempotencyKey,
          eventId: row.eventId,
          postId: row.postId,
          channel: row.channel,
          revision: row.revision,
          state: row.state,
        }
      : null;
  }
  async list(cursor = '', limit = 25, state?: string) {
    await this.schema();
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      cursor.length > 200 ||
      (state &&
        !['pending', 'sending', 'sent', 'uncertain', 'failed'].includes(state))
    )
      throw new NotificationError('INVALID_CURSOR');
    const rows = (
      await this.db
        .prepare(
          `SELECT d.delivery_id,d.channel,d.message_part,d.revision,d.state,d.attempts,d.next_attempt_at,d.external_id,d.safe_error_code,c.group_id FROM notification_deliveries d JOIN notification_context c ON c.delivery_id=d.delivery_id WHERE d.delivery_id>? ${state ? 'AND d.state=?' : ''} ORDER BY d.delivery_id LIMIT ?`,
        )
        .bind(cursor, ...(state ? [state] : []), limit)
        .all()
    ).results;
    return rows;
  }
  async candidates(cursor = '') {
    await this.schema();
    if (cursor.length > 200) throw new NotificationError('INVALID_CURSOR');
    const row = await this.db
      .prepare(
        'SELECT post_id FROM generated_posts WHERE post_id>? ORDER BY post_id LIMIT 1',
      )
      .bind(cursor)
      .first<{ post_id: string }>();
    if (!row) return { rows: [], nextCursor: '' };
    const current = await this.posts.current(row.post_id),
      m = current?.delivery.metadata;
    const tracked = m ? await trackingAvailable(this.db) : false;
    const group = m ? await this.resolveGroup(row.post_id, tracked) : null;
    const publication =
      m && group
        ? await this.publication(
            publicationSlot(
              m.eventId,
              m.eventRevision,
              m.post.kind,
              group.version,
              group.groupId,
            ),
          )
        : null;
    return {
      rows:
        m && publication?.status === 'pending'
          ? [
              {
                postId: row.post_id,
                eventId: m.eventId,
                revision: m.eventRevision,
                kind: m.post.kind,
                expiresAt: current!.validUntil,
              },
            ]
          : [],
      nextCursor: row.post_id,
    };
  }
  private async currentForRow(row: OutboxRow, group: Group) {
    const c = await this.currentGroup(group, row.part !== 'issue');
    if (row.part === 'issue') {
      // A delayed first report can still record a user's posted/held decision.
      // Recheck blocks new report content until re-verification.
      c.guard = {
        sql: `(${c.guard.sql}) AND ${c.slot.status}<>'recheck'${c.slot.eventGate}`,
        values: [
          ...c.guard.values,
          ...c.slot.bindings,
          ...c.slot.eventBindings,
        ],
      };
      await this.assertGuard(c, null);
    } else {
      c.guard = {
        sql: `(${c.guard.sql}) AND ${c.slot.status}='pending'${c.slot.eventGate}`,
        values: [
          ...c.guard.values,
          ...c.slot.bindings,
          ...c.slot.eventBindings,
        ],
      };
    }
    return c;
  }
  async claim(deliveryId: string, usage: Usage | null) {
    this.budget(usage, 3);
    const row = await this.row(deliveryId);
    if (!row) return null;
    const group = await this.group(row.group_id);
    if (!group) throw new NotificationError('STALE_GROUP');
    let c: Awaited<ReturnType<NotificationStore['capture']>>;
    try {
      c = await this.currentForRow(row, group);
    } catch {
      await this.db
        .prepare(
          "UPDATE notification_deliveries SET state='failed',retryable=0,safe_error_code='CURRENT_GATE_REJECTED' WHERE delivery_id=? AND state IN ('pending','failed')",
        )
        .bind(deliveryId)
        .run();
      return null;
    }
    const owner = crypto.randomUUID(),
      now = nowIso(this.clock());
    const result = await this.db
      .prepare(
        `UPDATE notification_deliveries SET state='sending',lease_owner=?,lease_until=?,started_at=NULL,attempts=attempts+1,safe_error_code=NULL WHERE delivery_id=? AND (state='pending' OR state='failed' AND retryable=1) AND attempts<3 AND (next_attempt_at IS NULL OR next_attempt_at<=?) AND ${c.guard.sql} ${row.part === 'management' ? "AND EXISTS(SELECT 1 FROM notification_context dep JOIN notification_deliveries copy ON copy.delivery_id=dep.delivery_id WHERE dep.group_id=? AND copy.message_part='post' AND copy.channel='telegram' AND copy.state='sent')" : ''} RETURNING delivery_id`,
      )
      .bind(
        owner,
        nowIso(this.clock() + 30000),
        deliveryId,
        now,
        ...c.guard.values,
        ...(row.part === 'management' ? [row.group_id] : []),
      )
      .first();
    return result ? { deliveryId, owner, simulated: true } : null;
  }
  private async issueLock(eventId: string, owner: string, cause: string) {
    await this.db
      .prepare(
        "INSERT INTO notification_issue_claims(event_id,state,updated_at) VALUES(?,'idle',?) ON CONFLICT DO NOTHING",
      )
      .bind(eventId, nowIso(this.clock()))
      .run();
    const locked = await this.db
      .prepare(
        "UPDATE notification_issue_claims SET state='sending',owner=?,lease_until=?,updated_at=?,cause_id=? WHERE event_id=? AND state='idle' RETURNING event_id",
      )
      .bind(
        owner,
        nowIso(this.clock() + 30000),
        nowIso(this.clock()),
        cause,
        eventId,
      )
      .first();
    if (!locked)
      throw new DeliveryFault(
        'ISSUE_CHANNEL_BUSY_OR_UNCERTAIN',
        false,
        nowIso(this.clock() + 60000),
      );
  }
  private async finish(
    row: OutboxRow,
    owner: string,
    state: string,
    code: string | null,
    externalId: string | null,
    retryAt: string | null,
  ) {
    const extra: D1PreparedStatement[] = [];
    if (row.part === 'management' && state === 'sent')
      extra.push(
        this.db
          .prepare(
            "UPDATE notification_callbacks SET delivery_id=? WHERE group_id=? AND delivery_id IS NULL AND EXISTS(SELECT 1 FROM notification_context c JOIN notification_deliveries d ON c.delivery_id=d.delivery_id WHERE d.delivery_id=? AND d.state='sent' AND json_type(c.payload,'$.reply_markup')='object')",
          )
          .bind(row.delivery_id, row.group_id, row.delivery_id),
      );
    const group =
      row.part === 'issue' && state === 'sent'
        ? await this.group(row.group_id)
        : null;
    if (row.part === 'issue' && state === 'sent' && !group)
      throw new NotificationError('STALE_GROUP');
    if (group) {
      const slot = publicationSlot(
        group.event_id,
        group.revision,
        group.kind,
        group.report_version,
        group.group_id,
      );
      extra.push(
        this.db
          .prepare(
            `INSERT INTO notification_updates(update_id,group_id,delivery_id,publication_generation,state,created_at)
              SELECT p.action_id||':'||d.delivery_id,?,d.delivery_id,p.generation,'pending',? FROM
              (SELECT action_id,generation,status FROM ${slot.table} WHERE ${slot.where}) p
              CROSS JOIN notification_deliveries d WHERE p.status IN ('posted','held')
              AND d.delivery_id=? AND d.state='sent' AND d.result_owner=? ON CONFLICT DO NOTHING`,
          )
          .bind(
            row.group_id,
            nowIso(this.clock()),
            ...slot.bindings,
            row.delivery_id,
            owner,
          ),
      );
    }
    if (row.part === 'issue') {
      if (state === 'sent' && externalId) {
        const payload = JSON.parse(row.payload) as { marker: string };
        if (!group) throw new NotificationError('STALE_GROUP');
        extra.push(
          this.db
            .prepare(
              "INSERT INTO notification_issue_links SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM notification_attempts WHERE delivery_id=? AND owner=? AND outcome='sent' AND external_id=?) ON CONFLICT(event_id) DO UPDATE SET issue_number=excluded.issue_number,marker=excluded.marker,updated_at=excluded.updated_at WHERE notification_issue_links.mode=excluded.mode AND notification_issue_links.issue_number=excluded.issue_number",
            )
            .bind(
              group.event_id,
              REPORTS_REPO,
              Number(externalId),
              payload.marker,
              'simulation',
              nowIso(this.clock()),
              row.delivery_id,
              owner,
              externalId,
            ),
        );
      }
      extra.push(
        this.db
          .prepare(
            'UPDATE notification_issue_claims SET state=?,owner=NULL,lease_until=NULL,updated_at=? WHERE event_id=? AND owner=? AND EXISTS(SELECT 1 FROM notification_attempts WHERE delivery_id=? AND owner=? AND finished_at IS NOT NULL)',
          )
          .bind(
            state === 'uncertain' ? 'uncertain' : 'idle',
            nowIso(this.clock()),
            row.event_id,
            owner,
            row.delivery_id,
            owner,
          ),
      );
    }
    const result = await this.db.batch([
      this.db
        .prepare(
          "UPDATE notification_deliveries SET state=?,safe_error_code=?,external_id=?,next_attempt_at=?,retryable=?,result_owner=?,lease_owner=NULL,lease_until=NULL,sent_at=CASE WHEN ?='sent' THEN ? ELSE sent_at END WHERE delivery_id=? AND state='sending' AND lease_owner=? RETURNING delivery_id",
        )
        .bind(
          state,
          code,
          externalId,
          retryAt,
          retryAt ? 1 : 0,
          owner,
          state,
          nowIso(this.clock()),
          row.delivery_id,
          owner,
        ),
      this.db
        .prepare(
          'UPDATE notification_attempts SET finished_at=?,outcome=?,safe_code=?,external_id=? WHERE delivery_id=? AND owner=? AND EXISTS(SELECT 1 FROM notification_deliveries WHERE delivery_id=? AND lease_owner IS NULL AND state=? AND result_owner=?)',
        )
        .bind(
          nowIso(this.clock()),
          state,
          code,
          externalId,
          row.delivery_id,
          owner,
          row.delivery_id,
          state,
          owner,
        ),
      ...extra,
    ]);
    if (!result[0]?.results.length)
      throw new NotificationError('LEASE_CONFLICT');
  }
  async dispatch(
    deliveryId: string,
    owner: string,
    wire: IsolatedWire,
    usage: Usage | null,
  ) {
    this.budget(usage, 3);
    id(owner);
    const row = await this.row(deliveryId);
    if (
      !row ||
      row.state !== 'sending' ||
      row.lease_owner !== owner ||
      Date.parse(row.lease_until ?? '') <= this.clock()
    )
      throw new NotificationError('LEASE_CONFLICT');
    if (wire.mode !== 'isolated-fake')
      throw new NotificationError('LIVE_DELIVERY_DISABLED');
    const group = await this.group(row.group_id);
    if (!group) throw new NotificationError('STALE_GROUP');
    let current: Awaited<ReturnType<NotificationStore['capture']>>;
    try {
      current = await this.currentForRow(row, group);
    } catch {
      await this.finish(row, owner, 'failed', 'STALE_INPUT', null, null);
      return { state: 'failed' };
    }
    let payload: Record<string, unknown>;
    try {
      payload = await this.storedPayload(row, group, current);
    } catch {
      await this.finish(row, owner, 'failed', 'PAYLOAD_CHANGED', null, null);
      return { state: 'failed', code: 'PAYLOAD_CHANGED' };
    }
    const started = await this.db.batch([
      this.db
        .prepare(
          "UPDATE notification_deliveries SET started_at=? WHERE delivery_id=? AND state='sending' AND lease_owner=? AND started_at IS NULL AND lease_until>? RETURNING delivery_id",
        )
        .bind(nowIso(this.clock()), deliveryId, owner, nowIso(this.clock())),
      this.db
        .prepare(
          'INSERT INTO notification_attempts(attempt_id,delivery_id,owner,started_at) SELECT ?,delivery_id,?,started_at FROM notification_deliveries WHERE delivery_id=? AND lease_owner=? AND started_at IS NOT NULL ON CONFLICT DO NOTHING',
        )
        .bind('attempt-' + owner, owner, deliveryId, owner),
    ]);
    if (!started[0]?.results.length)
      throw new NotificationError('ATTEMPT_ALREADY_STARTED');
    let externalId: string | null = null;
    try {
      // This is the final current gate before the trusted fake invocation.
      await this.assertGuard(current, row.part === 'issue' ? null : 'pending');
      await this.reserveRequests(
        row.part === 'issue' ? 'github' : 'telegram',
        row.part === 'issue' ? 3 : 1,
        owner,
      );
      if (row.part === 'issue') {
        await this.issueLock(group.event_id, owner, deliveryId);
      }
      const protocol = new NotificationProtocol(wire, this.clock);
      const receipt =
        row.part === 'issue'
          ? await protocol.github(
              payload,
              await this.db
                .prepare(
                  'SELECT issue_number FROM notification_issue_links WHERE event_id=? AND mode=?',
                )
                .bind(group.event_id, 'simulation')
                .first<number>('issue_number'),
            )
          : await protocol.telegram(this.options.chatId, payload);
      externalId = receipt.externalId;
      try {
        await this.assertGuard(
          current,
          row.part === 'issue' ? null : 'pending',
        );
      } catch {
        throw new DeliveryFault('STALE_AFTER_SEND', true);
      }
      await this.finish(row, owner, 'sent', null, externalId, null);
      return { state: 'sent', externalId, simulated: true };
    } catch (error) {
      const fault =
        error instanceof DeliveryFault
          ? error
          : new DeliveryFault('DELIVERY_RESULT_UNCOMMITTED', true);
      await this.finish(
        row,
        owner,
        fault.uncertain ? 'uncertain' : 'failed',
        fault.code,
        externalId,
        fault.retryAt,
      );
      return {
        state: fault.uncertain ? 'uncertain' : 'failed',
        code: fault.code,
        simulated: true,
      };
    }
  }
  async recover(deliveryId: string, usage: Usage | null) {
    this.budget(usage);
    await this.schema();
    const before = await this.row(deliveryId);
    const result = await this.db
      .prepare(
        "UPDATE notification_deliveries SET state=CASE WHEN started_at IS NULL THEN 'pending' ELSE 'uncertain' END,safe_error_code=CASE WHEN started_at IS NULL THEN 'LEASE_EXPIRED_BEFORE_SEND' ELSE 'LEASE_EXPIRED_AFTER_START' END,lease_owner=NULL,lease_until=NULL WHERE delivery_id=? AND state='sending' AND lease_until<=? RETURNING state",
      )
      .bind(id(deliveryId), nowIso(this.clock()))
      .first();
    if (before?.part === 'issue' && result)
      await this.db
        .prepare(
          "UPDATE notification_issue_claims SET state='uncertain',owner=NULL,lease_until=NULL,updated_at=? WHERE event_id=? AND state='sending' AND lease_until<=?",
        )
        .bind(nowIso(this.clock()), before.event_id, nowIso(this.clock()))
        .run();
    return result;
  }
  async reconcileIssue(
    deliveryId: string,
    wire: IsolatedWire,
    usage: Usage | null,
  ) {
    this.budget(usage, 2);
    const row = await this.row(deliveryId);
    if (row?.part === 'issue' && row.state === 'sent' && row.external_id)
      return { state: 'sent', externalId: row.external_id, simulated: true };
    if (!row || row.part !== 'issue' || row.state !== 'uncertain')
      throw new NotificationError('RECONCILIATION_REQUIRED');
    const group = await this.group(row.group_id);
    if (!group) throw new NotificationError('STALE_GROUP');
    await this.schema();
    // Receipt reconciliation records a historical external fact, never re-authorizes an old post.
    if (
      group.mode !== 'simulation' ||
      row.payload.length > 60000 ||
      (await digest(row.payload)) !== row.payload_digest
    )
      throw new NotificationError('PAYLOAD_CHANGED');
    const payload = JSON.parse(row.payload) as {
      marker: string;
      body: string;
      repository: string;
    };
    if (
      payload.repository !== REPORTS_REPO ||
      payload.marker !==
        `<!-- astro-events-jp:event:${await digest(group.event_id)} -->`
    )
      throw new NotificationError('PAYLOAD_CHANGED');
    await this.reserveRequests('github', 2, crypto.randomUUID());
    const found = await new NotificationProtocol(wire, this.clock).findIssue(
      payload.marker,
      payload.body,
    );
    if (!found) return { state: 'uncertain', reason: 'NO_POSITIVE_RECEIPT' }; // absence never authorizes a second create
    const result = await this.db.batch([
      this.db
        .prepare(
          "UPDATE notification_deliveries SET state='sent',external_id=?,sent_at=?,safe_error_code='RECONCILED_POSITIVE_RECEIPT' WHERE delivery_id=? AND state='uncertain' RETURNING delivery_id",
        )
        .bind(found.externalId, nowIso(this.clock()), deliveryId),
      this.db
        .prepare(
          "INSERT INTO notification_issue_links SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM notification_deliveries WHERE delivery_id=? AND state='sent' AND external_id=?) ON CONFLICT DO NOTHING",
        )
        .bind(
          group.event_id,
          REPORTS_REPO,
          found.number,
          payload.marker,
          'simulation',
          nowIso(this.clock()),
          deliveryId,
          found.externalId,
        ),
      this.db
        .prepare(
          "UPDATE notification_issue_claims SET state='idle',owner=NULL,lease_until=NULL,updated_at=? WHERE event_id=? AND state='uncertain' AND cause_id=? AND EXISTS(SELECT 1 FROM notification_deliveries WHERE delivery_id=? AND state='sent' AND external_id=?)",
        )
        .bind(
          nowIso(this.clock()),
          group.event_id,
          deliveryId,
          deliveryId,
          found.externalId,
        ),
    ]);
    if (!result[0]?.results.length)
      throw new NotificationError('RECEIPT_CONFLICT');
    return { state: 'sent', externalId: found.externalId, simulated: true };
  }
  async confirmTelegram(
    deliveryId: string,
    externalId: string,
    reason: string,
    usage: Usage | null,
  ) {
    this.budget(usage);
    const row = await this.row(deliveryId);
    if (
      !row ||
      row.channel !== 'telegram' ||
      !['uncertain', 'sent'].includes(row.state) ||
      !/^\d{1,15}$/.test(externalId) ||
      reason.length < 8 ||
      reason.length > 500
    )
      throw new NotificationError('MANUAL_RECEIPT_REQUIRED');
    const normalized = text(reason, 500);
    const previous = await this.db
      .prepare(
        'SELECT external_id,reason FROM notification_manual_receipts WHERE delivery_id=?',
      )
      .bind(deliveryId)
      .first<{ external_id: string; reason: string }>();
    if (
      row.state === 'sent' &&
      previous?.external_id === externalId &&
      previous.reason === normalized
    )
      return { state: 'sent', simulated: true, independentVerification: false };
    if (row.state !== 'uncertain')
      throw new NotificationError('MANUAL_RECEIPT_CONFLICT');
    const group = await this.group(row.group_id);
    if (!group) throw new NotificationError('STALE_GROUP');
    await this.schema();
    if (
      group.mode !== 'simulation' ||
      (await digest(row.payload)) !== row.payload_digest ||
      row.target !== this.options.chatId
    )
      throw new NotificationError('PAYLOAD_CHANGED');
    if (normalized.length < 8)
      throw new NotificationError('MANUAL_RECEIPT_REQUIRED');
    const result = await this.db.batch([
      this.db
        .prepare(
          "UPDATE notification_deliveries SET state='sent',external_id=?,sent_at=?,safe_error_code='MANUAL_RECEIPT_CONFIRMED' WHERE delivery_id=? AND state='uncertain' RETURNING delivery_id",
        )
        .bind(externalId, nowIso(this.clock()), deliveryId),
      this.db
        .prepare(
          "INSERT INTO notification_manual_receipts SELECT ?,?,?,?,'simulation' WHERE EXISTS(SELECT 1 FROM notification_deliveries WHERE delivery_id=? AND state='sent' AND external_id=?) ON CONFLICT DO NOTHING",
        )
        .bind(
          deliveryId,
          externalId,
          normalized,
          nowIso(this.clock()),
          deliveryId,
          externalId,
        ),
      this.db
        .prepare(
          "UPDATE notification_callbacks SET delivery_id=? WHERE group_id=? AND delivery_id IS NULL AND EXISTS(SELECT 1 FROM notification_context c JOIN notification_deliveries d ON c.delivery_id=d.delivery_id WHERE d.delivery_id=? AND d.state='sent' AND json_type(c.payload,'$.reply_markup')='object')",
        )
        .bind(deliveryId, group.group_id, deliveryId),
    ]);
    if (!result[0]?.results.length)
      throw new NotificationError('RECEIPT_CONFLICT');
    return { state: 'sent', simulated: true, independentVerification: false };
  }
  async callback(
    token: string,
    action: Action,
    identity: Identity,
    usage: Usage | null,
  ) {
    this.budget(usage);
    await this.schema();
    if (
      !/^n6:[a-f0-9]{32}$/.test(token) ||
      !['posted', 'held', 'recheck'].includes(action) ||
      identity.chatId !== this.options.chatId ||
      !this.options.userIds.includes(identity.userId) ||
      !/^\d{1,20}$/.test(identity.messageId) ||
      !/^\d{1,20}$/.test(identity.updateId)
    )
      throw new NotificationError('CALLBACK_UNAUTHORIZED');
    const hash = await digest(token),
      t = await this.db
        .prepare('SELECT * FROM notification_callbacks WHERE token_hash=?')
        .bind(hash)
        .first<{
          group_id: string;
          action: Action;
          expected_generation: number;
          expires_at: string;
          consumed_at: string | null;
          delivery_id: string | null;
          result: string | null;
        }>();
    if (
      !t ||
      t.action !== action ||
      Date.parse(t.expires_at) <= this.clock() ||
      !t.delivery_id
    )
      throw new NotificationError('CALLBACK_EXPIRED_OR_INVALID');
    const message = await this.row(t.delivery_id);
    if (
      !message ||
      message.part !== 'management' ||
      message.state !== 'sent' ||
      message.external_id !== identity.messageId
    )
      throw new NotificationError('CALLBACK_MESSAGE_MISMATCH');
    if (t.consumed_at)
      return { status: t.result, idempotent: true, simulated: true };
    const group = await this.group(t.group_id);
    if (!group) throw new NotificationError('STALE_GROUP');
    const c = await this.currentGroup(group),
      now = nowIso(this.clock()),
      actionId = 'callback-' + hash;
    const { slot } = c;
    const ownsAction = `EXISTS(SELECT 1 FROM ${slot.table} WHERE ${slot.where} AND action_id=?)`;
    const fingerprint =
      'simulation:' +
      (await digest(
        bounded([
          group.event_id,
          group.revision,
          c.delivery.metadata.post.kind,
          c.delivery.copyText,
        ]),
      ));
    const actorHash = await digest(identity.chatId + ':' + identity.userId);
    const committed = await this.db.batch([
      this.db
        .prepare(
          `UPDATE ${slot.table} SET status=?,generation=generation+1,action_id=?,updated_at=?
            WHERE ${slot.where} AND generation=? AND status='pending' AND ${c.guard.sql}${slot.eventGate}
            AND EXISTS(SELECT 1 FROM notification_callbacks WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?)`,
        )
        .bind(
          action,
          actionId,
          now,
          ...slot.bindings,
          t.expected_generation,
          ...c.guard.values,
          ...slot.eventBindings,
          hash,
          now,
        ),
      this.db
        .prepare(
          `UPDATE notification_callbacks SET consumed_at=?,result=? WHERE token_hash=? AND consumed_at IS NULL AND ${ownsAction}`,
        )
        .bind(now, action, hash, ...slot.bindings, actionId),
      this.db
        .prepare(
          `INSERT INTO publication_records(publication_id,event_id,post_id,status,action_id,recorded_at,expires_at) SELECT ?,?,?,?,?,?,? WHERE ${ownsAction} ON CONFLICT DO NOTHING`,
        )
        .bind(
          actionId,
          group.event_id,
          group.post_id,
          action,
          actionId,
          now,
          this.detailExpiry(c.snapshot.event),
          ...slot.bindings,
          actionId,
        ),
      this.db
        .prepare(
          "INSERT INTO notification_action_provenance SELECT action_id,?,'simulation',?,? FROM publication_records WHERE action_id=? ON CONFLICT DO NOTHING",
        )
        .bind(group.group_id, actorHash, identity.updateId, actionId),
      this.db
        .prepare(
          `INSERT INTO posted_fingerprints(fingerprint,stable_event_id,edition_year,edition,revision,kind,posted_at,expires_at) SELECT ?,?,?,?,?,?,?,? WHERE ?='posted' AND ${ownsAction} ON CONFLICT DO NOTHING`,
        )
        .bind(
          fingerprint,
          group.event_id,
          c.snapshot.event.editionYear,
          c.snapshot.event.edition,
          group.revision,
          c.delivery.metadata.post.kind,
          now,
          fingerprintExpiry(this.clock()),
          action,
          ...slot.bindings,
          actionId,
        ),
      this.db
        .prepare(
          `INSERT INTO notification_reviews(review_id,event_id,revision,reason,created_at) SELECT ?,?,?,?,? WHERE ?='recheck' AND ${ownsAction} ON CONFLICT DO NOTHING`,
        )
        .bind(
          actionId,
          group.event_id,
          group.revision,
          'USER_RECHECK_NO_AUTOMATIC_FETCH',
          now,
          action,
          ...slot.bindings,
          actionId,
        ),
      this.db
        .prepare(
          `INSERT INTO notification_updates(update_id,group_id,delivery_id,publication_generation,state,created_at) SELECT ?||':'||d.delivery_id,?,d.delivery_id,?,'pending',? FROM notification_deliveries d JOIN notification_context c ON c.delivery_id=d.delivery_id WHERE c.group_id=? AND d.message_part='management' AND d.state='sent' AND ${ownsAction} ON CONFLICT DO NOTHING`,
        )
        .bind(
          actionId,
          group.group_id,
          t.expected_generation + 1,
          now,
          group.group_id,
          ...slot.bindings,
          actionId,
        ),
    ]);
    const final = await this.publication(slot);
    if (final.action_id !== actionId)
      throw new NotificationError('CALLBACK_CONFLICT');
    return {
      status: action,
      idempotent: committed[0]?.meta.changes === 0,
      userConfirmationOnly: action === 'posted',
      simulated: true,
    };
  }
  async callbackAction(token: string) {
    await this.schema();
    if (!/^n6:[a-f0-9]{32}$/.test(token))
      throw new NotificationError('CALLBACK_UNAUTHORIZED');
    const action = await this.db
      .prepare('SELECT action FROM notification_callbacks WHERE token_hash=?')
      .bind(await digest(token))
      .first<Action>('action');
    if (!action) throw new NotificationError('CALLBACK_UNAUTHORIZED');
    return action;
  }
  async queueCallbackAck(token: string, callbackId: string) {
    await this.schema();
    if (
      !/^n6:[a-f0-9]{32}$/.test(token) ||
      !callbackId ||
      callbackId.length > 128
    )
      throw new NotificationError('CALLBACK_UNAUTHORIZED');
    const hash = await digest(token),
      ackId = 'ack-' + (await digest(callbackId));
    await this.db
      .prepare(
        "INSERT INTO notification_callback_acks(ack_id,token_hash,callback_id,state,created_at) SELECT ?,token_hash,?,'pending',? FROM notification_callbacks WHERE token_hash=? AND consumed_at IS NOT NULL ON CONFLICT DO NOTHING",
      )
      .bind(ackId, callbackId, nowIso(this.clock()), hash)
      .run();
    return { ackId };
  }
  async processCallbackAck(
    ackId: string,
    wire: IsolatedWire,
    usage: Usage | null,
  ) {
    this.budget(usage, 1);
    await this.schema();
    const owner = crypto.randomUUID();
    const row = await this.db
      .prepare(
        "UPDATE notification_callback_acks SET state='sending',owner=?,lease_until=?,attempts=attempts+1 WHERE ack_id=? AND state='pending' AND attempts<3 AND (next_attempt_at IS NULL OR next_attempt_at<=?) RETURNING callback_id",
      )
      .bind(
        owner,
        nowIso(this.clock() + 30000),
        id(ackId),
        nowIso(this.clock()),
      )
      .first<{ callback_id: string }>();
    if (!row) return { changed: false };
    try {
      await this.reserveRequests('telegram', 1, owner);
      await new NotificationProtocol(wire, this.clock).acknowledgeCallback(
        row.callback_id,
      );
      const committed = await this.db
        .prepare(
          "UPDATE notification_callback_acks SET state='sent',owner=NULL,lease_until=NULL WHERE ack_id=? AND owner=? AND state='sending' RETURNING ack_id",
        )
        .bind(ackId, owner)
        .first();
      if (!committed) throw new DeliveryFault('CALLBACK_ACK_UNCERTAIN', true);
      return { state: 'sent' };
    } catch (error) {
      const fault =
        error instanceof DeliveryFault
          ? error
          : new DeliveryFault('CALLBACK_ACK_UNCERTAIN', true);
      const state = fault.uncertain
        ? 'uncertain'
        : fault.retryAt
          ? 'pending'
          : 'failed';
      await this.db
        .prepare(
          "UPDATE notification_callback_acks SET state=?,owner=NULL,lease_until=NULL,safe_code=?,next_attempt_at=? WHERE ack_id=? AND owner=? AND state='sending'",
        )
        .bind(state, fault.code, fault.retryAt, ackId, owner)
        .run();
      return { state };
    }
  }
  async recoverCallbackAck(ackId: string) {
    await this.schema();
    return this.db
      .prepare(
        "UPDATE notification_callback_acks SET state='uncertain',owner=NULL,lease_until=NULL,safe_code='CALLBACK_ACK_LEASE_EXPIRED' WHERE ack_id=? AND state='sending' AND lease_until<=? RETURNING ack_id",
      )
      .bind(id(ackId), nowIso(this.clock()))
      .first();
  }
  async updateManagement(
    updateId: string,
    wire: IsolatedWire,
    usage: Usage | null,
  ) {
    this.budget(usage, 1);
    await this.schema();
    const owner = crypto.randomUUID();
    const update = await this.db
      .prepare(
        "UPDATE notification_updates SET state='sending',owner=?,lease_until=?,attempts=attempts+1 WHERE update_id=? AND state='pending' AND attempts<3 AND (next_attempt_at IS NULL OR next_attempt_at<=?) AND NOT EXISTS(SELECT 1 FROM notification_updates other WHERE other.delivery_id=notification_updates.delivery_id AND other.state IN ('sending','uncertain')) RETURNING *",
      )
      .bind(
        owner,
        nowIso(this.clock() + 30000),
        id(updateId),
        nowIso(this.clock()),
      )
      .first<{
        group_id: string;
        delivery_id: string;
        publication_generation: number;
      }>();
    if (!update) return { changed: false };
    const group = await this.group(update.group_id),
      row = await this.row(update.delivery_id);
    if (
      !group ||
      !row ||
      !['management', 'issue'].includes(row.part) ||
      row.state !== 'sent' ||
      !row.external_id
    )
      throw new NotificationError('MANAGEMENT_ONLY');
    try {
      const c = await this.currentGroup(group, false);
      await this.storedPayload(row, group, c);
      const p = await this.publication(c.slot);
      if (p.generation !== update.publication_generation)
        throw new NotificationError('STALE_STATUS_UPDATE');
      const protocol = new NotificationProtocol(wire, this.clock);
      await this.reserveRequests(
        row.part === 'issue' ? 'github' : 'telegram',
        row.part === 'issue' ? 3 : 1,
        owner,
      );
      await this.assertGuard(c, null);
      if (row.part === 'issue') {
        await this.issueLock(group.event_id, owner, updateId);
        const current = await renderMessages(
          c.snapshot.event,
          c.delivery,
          p.status,
          '기록된 각 채널의 Outbox 상태 확인',
          group.report_version === MANAGEMENT_VERSION
            ? c.currentChanges
            : c.changes,
          group.report_version,
        );
        await protocol.github(
          {
            repository: REPORTS_REPO,
            ...current.issue,
            marker: current.marker,
          },
          Number(row.external_id),
        );
      } else {
        const payload = JSON.parse(row.payload) as { text: string };
        const updated = payload.text.includes('게시 상태: ')
          ? payload.text.replace(
              /게시 상태: (pending|posted|held|recheck)(?: \([^\n]*\))?/,
              `게시 상태: ${p.status}${group.report_version === MANAGEMENT_VERSION ? ` (${{ pending: '미게시', posted: '게시 확인', held: '보류', recheck: '재확인 대기' }[p.status]})` : ''}`,
            )
          : payload.text + `\n현재 게시 상태: ${p.status}`;
        // The immutable copy message is never edited, and updates never enqueue new reports.
        await protocol.editManagement(
          this.options.chatId,
          row.external_id,
          updated,
        );
      }
      await this.assertGuard(c, null);
      const done = await this.db
        .prepare(
          "UPDATE notification_updates SET state='sent',owner=NULL,lease_until=NULL WHERE update_id=? AND state='sending' AND owner=? RETURNING update_id",
        )
        .bind(updateId, owner)
        .first();
      if (!done) throw new NotificationError('LEASE_CONFLICT');
      if (row.part === 'issue')
        await this.db
          .prepare(
            "UPDATE notification_issue_claims SET state='idle',owner=NULL,lease_until=NULL,updated_at=? WHERE event_id=? AND owner=? AND cause_id=?",
          )
          .bind(nowIso(this.clock()), group.event_id, owner, updateId)
          .run();
      return { changed: true };
    } catch (error) {
      const fault =
        error instanceof DeliveryFault
          ? error
          : new DeliveryFault('STATUS_UPDATE_REVIEW', true);
      const state = fault.uncertain
        ? 'uncertain'
        : fault.retryAt
          ? 'pending'
          : 'failed';
      await this.db
        .prepare(
          "UPDATE notification_updates SET state=?,owner=NULL,lease_until=NULL,safe_code=?,next_attempt_at=? WHERE update_id=? AND state='sending' AND owner=?",
        )
        .bind(state, fault.code, fault.retryAt, updateId, owner)
        .run();
      if (row.part === 'issue')
        await this.db
          .prepare(
            'UPDATE notification_issue_claims SET state=?,owner=NULL,lease_until=NULL,updated_at=? WHERE event_id=? AND owner=? AND cause_id=?',
          )
          .bind(
            fault.uncertain ? 'uncertain' : 'idle',
            nowIso(this.clock()),
            group.event_id,
            owner,
            updateId,
          )
          .run();
      return { state };
    }
  }
  async recoverUpdate(updateId: string) {
    await this.schema();
    const result = await this.db
      .prepare(
        "UPDATE notification_updates SET state='uncertain',owner=NULL,lease_until=NULL,safe_code='STATUS_UPDATE_LEASE_EXPIRED' WHERE update_id=? AND state='sending' AND lease_until<=? RETURNING update_id",
      )
      .bind(id(updateId), nowIso(this.clock()))
      .first();
    if (result)
      await this.db
        .prepare(
          "UPDATE notification_issue_claims SET state='uncertain',owner=NULL,lease_until=NULL,updated_at=? WHERE cause_id=? AND state='sending' AND lease_until<=?",
        )
        .bind(nowIso(this.clock()), updateId, nowIso(this.clock()))
        .run();
    return result;
  }
  /** Explicit local operator acknowledgement; never retries or changes the immutable copy. */
  async confirmStatusReceipt(updateId: string, reason: string) {
    await this.schema();
    const normalized = text(reason, 500);
    if (normalized.length < 8)
      throw new NotificationError('MANUAL_RECEIPT_REQUIRED');
    const result = await this.db.batch([
      this.db
        .prepare(
          "UPDATE notification_updates SET state='sent',safe_code='MANUAL_STATUS_RECEIPT' WHERE update_id=? AND state='uncertain' RETURNING update_id",
        )
        .bind(id(updateId)),
      this.db
        .prepare(
          "UPDATE notification_issue_claims SET state='idle',owner=NULL,lease_until=NULL,updated_at=? WHERE cause_id=? AND state='uncertain' AND EXISTS(SELECT 1 FROM notification_updates WHERE update_id=? AND state='sent' AND safe_code='MANUAL_STATUS_RECEIPT')",
        )
        .bind(nowIso(this.clock()), updateId, updateId),
      this.db
        .prepare(
          "INSERT INTO notification_status_receipts(update_id,reason,recorded_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM notification_updates WHERE update_id=? AND state='sent' AND safe_code='MANUAL_STATUS_RECEIPT') ON CONFLICT DO NOTHING",
        )
        .bind(updateId, normalized, nowIso(this.clock()), updateId),
    ]);
    const receipt = await this.db
      .prepare(
        'SELECT reason FROM notification_status_receipts WHERE update_id=?',
      )
      .bind(updateId)
      .first<string>('reason');
    if (!result[0]?.results.length && receipt !== normalized)
      throw new NotificationError('MANUAL_RECEIPT_CONFLICT');
    return { state: 'sent', simulated: true, independentVerification: false };
  }
  async updates() {
    await this.schema();
    return (
      await this.db
        .prepare(
          'SELECT update_id,delivery_id,state,safe_code FROM notification_updates ORDER BY update_id LIMIT 50',
        )
        .all()
    ).results;
  }
  async history(deliveryId: string) {
    await this.schema();
    return (
      await this.db
        .prepare(
          'SELECT owner,started_at,finished_at,outcome,safe_code,external_id FROM notification_attempts WHERE delivery_id=? ORDER BY started_at LIMIT 50',
        )
        .bind(id(deliveryId))
        .all()
    ).results;
  }
}
