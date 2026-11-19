import { digest } from '../collection/text';
import type { NotificationService } from '../contracts';
import type { Delivery, PublicationStatus, Report, Usage } from '../domain';
import { bounded } from './messages';
import type { NotificationStore } from './store';
import {
  type Action,
  type Identity,
  NotificationError,
  REPORTS_REPO,
} from './types';

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map(
        (k) =>
          JSON.stringify(k) +
          ':' +
          canonical((value as Record<string, unknown>)[k]),
      )
      .join(',') +
    '}'
  );
}
/** deliver means durable local outbox acceptance, not external delivery success. */
export class OutboxNotificationService implements NotificationService {
  constructor(
    private readonly store: NotificationStore,
    private readonly usage: Usage | null,
    private readonly identity?: Identity,
  ) {}
  async deliver(report: Report, delivery: Delivery): Promise<Delivery> {
    bounded(report);
    bounded(delivery);
    if (!report.post) throw new NotificationError('CURRENT_POST_REQUIRED');
    const plan = await this.store.preview(report.post.id),
      m = plan.delivery.metadata;
    if (
      canonical(report) !== canonical(plan.report) ||
      delivery.eventId !== m.eventId ||
      delivery.postId !== m.post.id ||
      delivery.revision !== String(m.eventRevision) ||
      delivery.state !== 'pending'
    )
      throw new NotificationError('REPORT_MISMATCH');
    const index =
      delivery.channel === 'telegram'
        ? 0
        : delivery.channel === 'github-issue'
          ? plan.management.length + 1
          : -1;
    const target =
      delivery.channel === 'telegram'
        ? this.store.options.chatId
        : REPORTS_REPO;
    if (
      index < 0 ||
      delivery.idempotencyKey !==
        (await digest(bounded([plan.groupId, target, index])))
    )
      throw new NotificationError('DELIVERY_KEY_MISMATCH');
    await this.store.enqueue(
      m.post.id,
      this.usage,
      {
        sourceId: m.sourceId,
        fingerprint: m.fingerprint,
        revision: m.eventRevision,
      },
      index,
    );
    const row = await this.store.receipt('delivery-' + delivery.idempotencyKey);
    if (!row) throw new NotificationError('WRITE_CONFLICT');
    return {
      idempotencyKey: row.idempotencyKey,
      eventId: row.eventId,
      postId: row.postId,
      channel: row.channel,
      revision: row.revision,
      state: row.state,
    };
  }
  async callback(token: string, action: PublicationStatus) {
    if (!this.identity || !['posted', 'held', 'recheck'].includes(action))
      throw new NotificationError('CALLBACK_UNAUTHORIZED');
    await this.store.callback(
      token,
      action as Action,
      this.identity,
      this.usage,
    );
  }
}
