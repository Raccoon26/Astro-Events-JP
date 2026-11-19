import { MARKER, type TrialContent } from './live-plan';
import { retryAfter } from './protocol';
import { DeliveryFault, REPORTS_REPO } from './types';

const GITHUB = 'https://api.github.com';
const REPORT_PATH = `/repos/${REPORTS_REPO}`;
const TELEGRAM = 'https://api.telegram.org';
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('INVALID_PROVIDER_RESPONSE');
  return value as Record<string, unknown>;
}

export interface TrialSecrets {
  botToken: string;
  botUsername: string;
  chatId: string;
  userId: string;
  githubToken: string;
  reportsIssuesWriteAttested: boolean;
  exclusiveBotPolling: boolean;
}

export class LiveTrialProviders {
  private count = 0;
  constructor(
    private readonly secrets: TrialSecrets,
    private readonly budget: number,
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock = Date.now,
  ) {
    if (
      !/^\d{5,16}:[A-Za-z0-9_-]{25,100}$/u.test(secrets.botToken) ||
      !/^[a-zA-Z0-9_]{5,32}$/u.test(secrets.botUsername)
    )
      throw Error('TELEGRAM_SECRET_OR_BOT_MISSING');
    if (
      !/^[1-9]\d{0,15}$/u.test(secrets.chatId) ||
      !Number.isSafeInteger(Number(secrets.chatId)) ||
      secrets.chatId !== secrets.userId
    )
      throw Error('PRIVATE_SELF_ALLOWLIST_REQUIRED');
    if (
      !/^github_pat_[A-Za-z0-9_]{40,250}$/u.test(secrets.githubToken) ||
      secrets.reportsIssuesWriteAttested !== true
    )
      throw Error('SCOPED_REPORTS_SECRET_AND_ATTESTATION_REQUIRED');
    if (typeof secrets.exclusiveBotPolling !== 'boolean')
      throw Error('POLL_MODE_REQUIRED');
  }
  get requestCount() {
    return this.count;
  }
  private async request(url: string, init: RequestInit, mutation: boolean) {
    if (++this.count > this.budget)
      throw new DeliveryFault('LIVE_TRIAL_REQUEST_BUDGET', false);
    try {
      const r = await this.fetcher(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(7000),
      });
      if (
        r.status === 429 ||
        (r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0')
      )
        throw new DeliveryFault(
          'LIVE_PROVIDER_RATE_LIMIT',
          false,
          retryAfter(r.headers.get('retry-after'), this.clock()),
        );
      if (r.status >= 500 || r.status === 408 || r.status === 409)
        throw new DeliveryFault('LIVE_PROVIDER_UNAVAILABLE', mutation);
      if (r.status < 200 || r.status >= 300)
        throw new DeliveryFault('LIVE_PROVIDER_REJECTED_' + r.status, false);
      const reader = r.body?.getReader();
      if (!reader) throw Error('INVALID_PROVIDER_RESPONSE');
      const decoder = new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: false,
      });
      let bytes = 0,
        content = '';
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 2_000_000) {
          await reader.cancel();
          throw Error('PROVIDER_RESPONSE_LIMIT');
        }
        content += decoder.decode(part.value, { stream: true });
      }
      content += decoder.decode();
      return {
        status: r.status,
        headers: r.headers,
        json: JSON.parse(content) as unknown,
      };
    } catch (error) {
      if (error instanceof DeliveryFault) throw error;
      // Native fetch error causes may include a Telegram token in the URL.
      throw new DeliveryFault('LIVE_RESPONSE_LOST_OR_INVALID', mutation);
    }
  }
  private async telegram(
    method:
      | 'getMe'
      | 'getChat'
      | 'getWebhookInfo'
      | 'getUpdates'
      | 'sendMessage'
      | 'answerCallbackQuery',
    payload: Record<string, unknown> = {},
  ) {
    const mutation =
      method === 'sendMessage' || method === 'answerCallbackQuery';
    const endpoint = new URL(
      `${TELEGRAM}/bot${this.secrets.botToken}/${method}`,
    );
    if (!mutation)
      for (const [key, value] of Object.entries(payload))
        endpoint.searchParams.set(key, String(value));
    const request = mutation
      ? {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }
      : { method: 'GET' };
    const result = object(
      (await this.request(endpoint.href, request, mutation)).json,
    );
    if (result.ok !== true)
      throw new DeliveryFault('TELEGRAM_RESULT_INVALID', mutation);
    return result.result;
  }
  private github(path: string, body?: { title: string; body: string }) {
    return this.request(
      GITHUB + path,
      {
        method: body ? 'POST' : 'GET',
        headers: {
          authorization: `Bearer ${this.secrets.githubToken}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2026-03-10',
          'content-type': 'application/json',
          'user-agent': 'Astro-Events-JP-DEV06R',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      !!body,
    );
  }
  async telegramBinding() {
    const bot = object(await this.telegram('getMe'));
    if (
      !positive(bot.id) ||
      bot.is_bot !== true ||
      typeof bot.username !== 'string' ||
      bot.username.toLowerCase() !== this.secrets.botUsername.toLowerCase()
    )
      throw Error('TELEGRAM_BOT_MISMATCH');
    const chat = object(
      await this.telegram('getChat', { chat_id: this.secrets.chatId }),
    );
    if (
      !positive(chat.id) ||
      String(chat.id) !== this.secrets.chatId ||
      chat.type !== 'private'
    )
      throw Error('TELEGRAM_PRIVATE_CHAT_UNAVAILABLE');
    const webhook = object(await this.telegram('getWebhookInfo'));
    if (typeof webhook.url !== 'string')
      throw Error('TELEGRAM_WEBHOOK_STATE_UNKNOWN');
    return {
      botId: bot.id,
      botUsername: bot.username,
      chatId: this.secrets.chatId,
      userId: this.secrets.userId,
      poll: this.secrets.exclusiveBotPolling && webhook.url === '',
    };
  }
  async githubBinding() {
    const account = object((await this.github('/user')).json);
    if (account.login !== 'Raccoon26' || !positive(account.id))
      throw Error('REPORTS_ACCOUNT_MISMATCH');
    return {
      githubUserId: account.id,
      repoId: await this.privateRepo(account.id),
    };
  }
  private async privateRepo(accountId: number) {
    const repo = object((await this.github(REPORT_PATH)).json);
    if (
      repo.full_name !== REPORTS_REPO ||
      repo.private !== true ||
      repo.has_issues !== true ||
      repo.archived !== false ||
      !positive(repo.id) ||
      object(repo.owner).id !== accountId
    )
      throw new DeliveryFault('REPORTS_PRIVATE_ACCESS_UNVERIFIED', false);
    return repo.id;
  }
  private issueReceipt(
    issue: Record<string, unknown>,
    content: TrialContent,
    accountId: number,
  ) {
    if (
      !positive(issue.number) ||
      issue.pull_request ||
      issue.title !== content.title ||
      issue.body !== content.body ||
      object(issue.user).id !== accountId ||
      issue.html_url !==
        `https://github.com/${REPORTS_REPO}/issues/${issue.number}` ||
      typeof issue.created_at !== 'string' ||
      !Number.isFinite(Date.parse(issue.created_at))
    )
      throw new DeliveryFault('REPORTS_RECEIPT_MISMATCH', true);
    return {
      externalId: String(issue.number),
      createdAt: issue.created_at,
      url: issue.html_url,
    };
  }
  async existingIssue(content: TrialContent, accountId: number) {
    const matches: Record<string, unknown>[] = [];
    for (let page = 1; page <= 4; page++) {
      const response = await this.github(
        `${REPORT_PATH}/issues?state=all&per_page=50&page=${page}`,
      );
      if (!Array.isArray(response.json) || response.json.length > 50)
        throw Error('REPORTS_LIST_INVALID');
      for (const value of response.json) {
        const issue = object(value);
        if (
          !issue.pull_request &&
          typeof issue.body === 'string' &&
          issue.body.includes(MARKER)
        )
          matches.push(issue);
      }
      if (matches.length > 1) throw Error('REPORTS_DUPLICATE_MARKER');
      if (!/\brel="next"/u.test(response.headers.get('link') ?? ''))
        return matches[0]
          ? this.issueReceipt(matches[0], content, accountId)
          : null;
    }
    throw Error('REPORTS_LIST_INCOMPLETE');
  }
  async sendMessage(
    text: string,
    buttons?: readonly { text: string; callback_data: string }[],
  ) {
    if (
      !text ||
      text.length > 4096 ||
      !text.includes('TEST') ||
      buttons?.some((b) => !/^t6r:[a-f0-9]{32}$/u.test(b.callback_data))
    )
      throw new DeliveryFault('TELEGRAM_TEST_PAYLOAD_INVALID', false);
    const result = object(
      await this.telegram('sendMessage', {
        chat_id: this.secrets.chatId,
        text,
        link_preview_options: { is_disabled: true },
        ...(buttons ? { reply_markup: { inline_keyboard: [buttons] } } : {}),
      }),
    );
    const chat = object(result.chat);
    if (
      chat.type !== 'private' ||
      String(chat.id) !== this.secrets.chatId ||
      !positive(result.message_id) ||
      result.text !== text ||
      !positive(result.date)
    )
      throw new DeliveryFault('TELEGRAM_RECEIPT_MISMATCH', true);
    return {
      externalId: String(result.message_id),
      createdAt: new Date(result.date * 1000).toISOString(),
    };
  }
  async createIssue(
    content: TrialContent,
    accountId: number,
    repoId: number,
    expiresAt: number,
  ) {
    if (!content.title.startsWith('[TEST]') || !content.body.startsWith(MARKER))
      throw new DeliveryFault('REPORTS_TEST_PAYLOAD_INVALID', false);
    if ((await this.privateRepo(accountId)) !== repoId)
      throw new DeliveryFault('REPORTS_BINDING_CHANGED', false);
    if (this.clock() >= expiresAt)
      throw new DeliveryFault('PLAN_WINDOW_EXPIRED', false);
    const response = await this.github(`${REPORT_PATH}/issues`, {
      title: content.title,
      body: content.body,
    });
    if (response.status !== 201)
      throw new DeliveryFault('REPORTS_RECEIPT_MISMATCH', true);
    return this.issueReceipt(object(response.json), content, accountId);
  }
  async callbackUpdates() {
    const info = object(await this.telegram('getWebhookInfo'));
    if (!this.secrets.exclusiveBotPolling || info.url !== '')
      throw Error('TELEGRAM_POLLING_NOT_ALLOWED');
    const updates = await this.telegram('getUpdates', {
      timeout: 0,
      limit: 30,
    });
    if (!Array.isArray(updates) || updates.length > 30)
      throw Error('TELEGRAM_UPDATES_INVALID');
    return updates as unknown[];
  }
  async answerCallback(id: string) {
    if (!/^[\w-]{1,128}$/u.test(id))
      throw new DeliveryFault('TELEGRAM_CALLBACK_INVALID', false);
    if (
      (await this.telegram('answerCallbackQuery', {
        callback_query_id: id,
        text: 'TEST: 受信確認済み。投稿は行いません。',
      })) !== true
    )
      throw new DeliveryFault('TELEGRAM_ACK_UNCERTAIN', true);
  }
}
