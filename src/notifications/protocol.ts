import { bounded } from './messages';
import {
  DeliveryFault,
  type IsolatedWire,
  REPORTS_REPO,
  type Receipt,
  type WireRequest,
  type WireResponse,
} from './types';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new DeliveryFault('INVALID_RESPONSE', true);
  bounded(value, 65536);
  return value as Record<string, unknown>;
}
export function retryAfter(value: unknown, now: number, fallbackSeconds = 60) {
  let ms =
    typeof value === 'number' ||
    (typeof value === 'string' && /^\d+$/.test(value))
      ? now + Number(value) * 1000
      : typeof value === 'string'
        ? Date.parse(value)
        : NaN;
  if (!Number.isFinite(ms) || ms <= now) ms = now + fallbackSeconds * 1000;
  if (ms - now > 86400000) return null; // never shorten a provider delay to retry earlier
  return new Date(ms).toISOString();
}
export class NotificationProtocol {
  constructor(
    private readonly wire: IsolatedWire,
    private readonly clock = Date.now,
  ) {
    if (wire.mode !== 'isolated-fake')
      throw new DeliveryFault('LIVE_DELIVERY_DISABLED', false);
  }
  private async call(
    request: WireRequest,
    mutation: boolean,
  ): Promise<WireResponse> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        this.wire.request(request),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Error()), 5000);
        }),
      ]);
      bounded(response, 65536);
      if (
        !Number.isInteger(response.status) ||
        response.status < 100 ||
        response.status > 599
      )
        throw Error();
      if (
        response.status === 429 ||
        (response.status === 403 &&
          response.headers?.['x-ratelimit-remaining'] === '0')
      ) {
        const body = record(response.body);
        const parameters =
          body.parameters && typeof body.parameters === 'object'
            ? (body.parameters as Record<string, unknown>)
            : {};
        const reset = response.headers?.['x-ratelimit-reset'];
        throw new DeliveryFault(
          'RATE_LIMITED',
          false,
          retryAfter(
            parameters.retry_after ??
              response.headers?.['retry-after'] ??
              (reset
                ? new Date(Number(reset) * 1000).toUTCString()
                : undefined),
            this.clock(),
          ),
        );
      }
      if (response.status >= 500)
        throw new DeliveryFault(
          'PROVIDER_UNAVAILABLE',
          mutation,
          mutation ? null : retryAfter(null, this.clock()),
        );
      if (response.status < 200 || response.status >= 300)
        throw new DeliveryFault(`HTTP_${response.status}`, false);
      return response;
    } catch (e) {
      if (e instanceof DeliveryFault) throw e;
      throw new DeliveryFault(
        'RESPONSE_LOST_OR_INVALID',
        mutation,
        mutation ? null : retryAfter(null, this.clock()),
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async telegram(
    chatId: string,
    payload: Record<string, unknown>,
  ): Promise<Receipt> {
    if (
      payload.chat_id !== chatId ||
      typeof payload.text !== 'string' ||
      payload.text.length > 4096 ||
      'parse_mode' in payload ||
      'entities' in payload ||
      Object.keys(payload).some(
        (k) =>
          !['chat_id', 'text', 'link_preview_options', 'reply_markup'].includes(
            k,
          ),
      )
    )
      throw new DeliveryFault('TELEGRAM_PAYLOAD_INVALID', false);
    const response = await this.call(
      { provider: 'telegram', operation: 'sendMessage', payload },
      true,
    );
    const body = record(response.body),
      message = record(body.result),
      chat = record(message.chat);
    if (
      body.ok !== true ||
      message.text !== payload.text ||
      String(chat.id) !== chatId ||
      !Number.isSafeInteger(message.message_id) ||
      Number(message.message_id) <= 0
    )
      throw new DeliveryFault('TELEGRAM_ECHO_MISMATCH', true);
    return { externalId: String(message.message_id), simulated: true };
  }
  async editManagement(chatId: string, messageId: string, text: string) {
    if (text.length > 4096)
      throw new DeliveryFault('TELEGRAM_PAYLOAD_INVALID', false);
    const response = await this.call(
      {
        provider: 'telegram',
        operation: 'editMessageText',
        payload: {
          chat_id: chatId,
          message_id: Number(messageId),
          text,
          reply_markup: { inline_keyboard: [] },
          link_preview_options: { is_disabled: true },
        },
      },
      true,
    );
    const body = record(response.body),
      message = record(body.result),
      chat = record(message.chat);
    if (
      body.ok !== true ||
      message.text !== text ||
      String(chat.id) !== chatId ||
      String(message.message_id) !== messageId
    )
      throw new DeliveryFault('TELEGRAM_EDIT_MISMATCH', true);
  }
  async acknowledgeCallback(callbackId: string) {
    if (
      typeof callbackId !== 'string' ||
      !callbackId ||
      callbackId.length > 128
    )
      throw new DeliveryFault('CALLBACK_INVALID', false);
    const response = await this.call(
      {
        provider: 'telegram',
        operation: 'answerCallbackQuery',
        payload: { callback_query_id: callbackId, text: '処理しました' },
      },
      true,
    );
    const body = record(response.body);
    if (body.ok !== true || body.result !== true)
      throw new DeliveryFault('CALLBACK_ACK_INVALID', true);
  }
  async privateRepository() {
    const response = await this.call(
      {
        provider: 'github',
        operation: 'repository',
        payload: { repository: REPORTS_REPO },
      },
      false,
    );
    const body = record(response.body),
      permissions = record(body.permissions);
    if (
      body.full_name !== REPORTS_REPO ||
      body.private !== true ||
      body.has_issues !== true ||
      permissions.issues_write !== true
    )
      throw new DeliveryFault('PRIVATE_ISSUES_PERMISSION_UNVERIFIED', false);
  }
  private issue(
    body: unknown,
    marker: string,
    expectedBody?: string,
  ): Receipt & { number: number } {
    const issue = record(body);
    if (
      !Number.isSafeInteger(issue.number) ||
      Number(issue.number) <= 0 ||
      issue.pull_request ||
      typeof issue.body !== 'string' ||
      !issue.body.includes(marker) ||
      issue.html_url !==
        `https://github.com/${REPORTS_REPO}/issues/${issue.number}` ||
      (expectedBody !== undefined && issue.body !== expectedBody)
    )
      throw new DeliveryFault('ISSUE_RECEIPT_INVALID', true);
    return {
      number: Number(issue.number),
      externalId: String(issue.number),
      simulated: true,
    };
  }
  async findIssue(
    marker: string,
    expectedBody?: string,
  ): Promise<(Receipt & { number: number }) | null> {
    await this.privateRepository();
    // A bounded complete list is used, not eventually-consistent Search as proof of absence.
    const response = await this.call(
      {
        provider: 'github',
        operation: 'listIssues',
        payload: { repository: REPORTS_REPO, state: 'all', per_page: 50 },
      },
      false,
    );
    const items = response.body;
    if (
      !Array.isArray(items) ||
      items.length > 50 ||
      /rel="next"/.test(response.headers?.link ?? '')
    )
      throw new DeliveryFault('ISSUE_RECONCILIATION_INCOMPLETE', true);
    const matches = items.filter(
      (x) =>
        x &&
        typeof x === 'object' &&
        !('pull_request' in x) &&
        typeof x.body === 'string' &&
        x.body.includes(marker),
    );
    if (matches.length > 1)
      throw new DeliveryFault('ISSUE_DUPLICATE_REVIEW', true);
    return matches.length ? this.issue(matches[0], marker, expectedBody) : null;
  }
  async github(
    payload: Record<string, unknown>,
    existingNumber: number | null,
  ): Promise<Receipt> {
    if (
      payload.repository !== REPORTS_REPO ||
      typeof payload.marker !== 'string' ||
      typeof payload.body !== 'string' ||
      payload.body.length > 50000
    )
      throw new DeliveryFault('ISSUE_PAYLOAD_INVALID', false);
    let found: (Receipt & { number: number }) | null;
    if (existingNumber !== null) {
      await this.privateRepository();
      const response = await this.call(
        {
          provider: 'github',
          operation: 'getIssue',
          payload: { repository: REPORTS_REPO, number: existingNumber },
        },
        false,
      );
      found = this.issue(response.body, payload.marker);
    } else found = await this.findIssue(payload.marker);
    if (existingNumber !== null && found?.number !== existingNumber)
      throw new DeliveryFault('ISSUE_TARGET_CHANGED', true);
    const response = await this.call(
      {
        provider: 'github',
        operation: found ? 'updateIssue' : 'createIssue',
        payload: {
          repository: REPORTS_REPO,
          title: payload.title,
          body: payload.body,
          ...(found ? { number: found.number } : {}),
        },
      },
      true,
    );
    return this.issue(response.body, payload.marker, payload.body);
  }
}
