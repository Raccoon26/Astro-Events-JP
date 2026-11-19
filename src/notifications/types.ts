import type { Delivery, PublicationStatus, Report, Usage } from '../domain';
import type { PostDelivery } from '../posts/types';
export const REPORT_VERSION = 'dev06-1';
export const REPORTS_REPO = 'Raccoon26/Astro-Events-JP-Reports';
export type Action = Exclude<PublicationStatus, 'pending'>;
export type Part = 'copy' | 'management' | 'issue';
export interface NotificationOptions {
  enabled?: boolean;
  localOnly?: boolean;
  mode?: 'simulation';
  chatId: string;
  userIds: readonly string[];
  clock?: () => number;
}
export interface Button {
  text: string;
  callback_data: string;
}
export interface Plan {
  groupId: string;
  delivery: PostDelivery;
  report: Report;
  digest: string;
  marker: string;
  management: string[];
  issue: { title: string; body: string };
  priority: number;
}
export interface OutboxRow extends Delivery {
  delivery_id: string;
  group_id: string;
  event_id: string;
  post_id: string;
  revision_number: number;
  part: Part;
  payload: string;
  payload_digest: string;
  target: string;
  lease_owner: string | null;
  lease_until: string | null;
  attempts: number;
  external_id: string | null;
  retryable: number;
  next_attempt_at: string | null;
  part_index: number;
}
export interface Identity {
  chatId: string;
  userId: string;
  messageId: string;
  updateId: string;
}
export interface WireRequest {
  provider: 'telegram' | 'github';
  operation: string;
  payload: Record<string, unknown>;
}
export interface WireResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}
/** Trusted injected in-process/service-binding fake only. There is no network implementation in DEV06. */
export interface IsolatedWire {
  readonly mode: 'isolated-fake';
  request(request: WireRequest): Promise<WireResponse>;
}
export interface Receipt {
  externalId: string;
  simulated: true;
}
export interface NotificationBudget {
  usage: Usage | null;
  requests: number;
  reads: number;
  writes: number;
}
export class NotificationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'NotificationError';
  }
}
export class DeliveryFault extends NotificationError {
  constructor(
    code: string,
    readonly uncertain: boolean,
    readonly retryAt: string | null = null,
  ) {
    super(code);
  }
}
