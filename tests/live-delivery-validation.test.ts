import { readdirSync, readFileSync } from 'node:fs';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MARKER,
  TITLE,
  TRIAL,
  type TrialContent,
  trialContent,
} from '../src/notifications/live-plan';
import {
  LiveTrialProviders,
  type TrialSecrets,
} from '../src/notifications/live-providers';
import { LiveTrialSession } from '../src/notifications/live-session';
import { REPORTS_REPO } from '../src/notifications/types';

const NOW = Date.parse('2026-11-19T12:10:00Z');
const secrets: TrialSecrets = {
  botToken: '123456:' + 'a'.repeat(35),
  botUsername: 'fixture_bot',
  chatId: '1234501',
  userId: '1234501',
  githubToken: 'github_pat_' + 'b'.repeat(60),
  reportsIssuesWriteAttested: true,
  exclusiveBotPolling: true,
};
const postIssue = `/repos/${REPORTS_REPO}/issues`;

function harness() {
  const requests: {
    host: string;
    path: string;
    method: string;
    payload: Record<string, unknown>;
  }[] = [];
  const updates: unknown[] = [];
  const issues: Record<string, unknown>[] = [];
  const overrides = {
    private: true,
    webhook: '',
    loseIssue: false,
    loseCopy: false,
    failManagement: false,
    copyEchoWrong: false,
    account: 'Raccoon26',
    chat: 'private',
    nextPages: false,
    publishAfterManagement: false,
  };
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)),
      method = init?.method ?? 'GET';
    const path =
      url.hostname === 'api.telegram.org'
        ? url.pathname.split('/').at(-1)!
        : url.pathname;
    const payload = (
      init?.body
        ? JSON.parse(String(init.body))
        : Object.fromEntries(url.searchParams)
    ) as Record<string, unknown>;
    requests.push({ host: url.hostname, path, method, payload });
    expect(init?.redirect).toBe('error');
    if (url.hostname === 'api.telegram.org') {
      const response = (result: unknown) => Response.json({ ok: true, result });
      if (path === 'getMe')
        return response({ id: 20, is_bot: true, username: 'fixture_bot' });
      if (path === 'getChat')
        return response({ id: Number(secrets.chatId), type: overrides.chat });
      if (path === 'getWebhookInfo')
        return response({ url: overrides.webhook });
      if (path === 'getUpdates') return response(updates);
      if (path === 'answerCallbackQuery') return response(true);
      if (path !== 'sendMessage') throw Error('Unexpected Telegram operation');
      const management = String(payload.text).startsWith('[TEST]');
      if (!management && overrides.loseCopy)
        throw Error('simulated response lost with ' + url.href);
      if (management && overrides.failManagement)
        return Response.json({}, { status: 403 });
      if (management && overrides.publishAfterManagement)
        overrides.private = false;
      return response({
        message_id: management ? 200 : 100,
        text: overrides.copyEchoWrong ? 'wrong' : payload.text,
        chat: { id: Number(secrets.chatId), type: 'private' },
        date: NOW / 1000,
      });
    }
    if (url.hostname !== 'api.github.com') throw Error('Unexpected provider');
    if (path === '/user')
      return Response.json({ login: overrides.account, id: 88 });
    if (path === `/repos/${REPORTS_REPO}`)
      return Response.json({
        id: 90,
        full_name: REPORTS_REPO,
        owner: { id: 88 },
        permissions: { push: false },
        private: overrides.private,
        has_issues: true,
        archived: false,
      });
    if (path !== postIssue) throw Error('Unexpected Reports operation');
    if (method === 'GET')
      return Response.json(issues, {
        headers: overrides.nextPages
          ? { link: '<https://api.github.com/page>; rel="next"' }
          : {},
      });
    const issue = {
      ...payload,
      number: 10,
      html_url: `https://github.com/${REPORTS_REPO}/issues/10`,
      user: { id: 88 },
      created_at: new Date(NOW).toISOString(),
    };
    issues.push(issue);
    if (overrides.loseIssue) return Response.json({}, { status: 503 });
    return Response.json(issue, { status: 201 });
  }) as typeof fetch;
  return {
    fetcher,
    requests,
    issues,
    updates,
    overrides,
    writes: () => requests.filter((x) => x.method === 'POST'),
  };
}

let mf: Miniflare;
let db: D1Database;
let content: TrialContent;
beforeAll(async () => {
  content = await trialContent();
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script:
        'export default {fetch(){return new Response(null,{status:404})}}',
      d1Databases: ['DB'],
      host: '127.0.0.1',
      port: 0,
    }),
  );
  db = (await mf.getD1Database('DB')) as unknown as D1Database;
  const migrations = readdirSync('migrations')
    .filter((f) => /^000[1-8]_.*\.sql$/u.test(f))
    .sort()
    .map((f) => `migrations/${f}`);
  const statements = [...migrations, 'scripts/dev06r-local-ledger.sql'].flatMap(
    (file) =>
      readFileSync(file, 'utf8')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => db.prepare(s)),
  );
  await db.batch(statements);
}, 30_000);
beforeEach(async () => {
  await db.batch(
    [
      'trial_live_observations',
      'trial_live_buttons',
      'trial_live_outbox',
      'trial_live_run',
    ].map((table) => db.prepare(`DELETE FROM ${table}`)),
  );
});
afterAll(async () => {
  await mf?.dispose();
});
const session = (h: ReturnType<typeof harness>, now = NOW, budget = 13) =>
  new LiveTrialSession(
    db,
    new LiveTrialProviders(secrets, budget, h.fetcher, () => now),
    () => now,
    async () => {},
  );

describe('isolated DEV06R API and D1 contracts', () => {
  it('builds exact Japanese copy and one separate TEST management message', () => {
    expect(content.copy).toContain('TEST 合成観望会');
    expect(content.copy).not.toContain('Xに投稿しないでください');
    expect(content.management).toMatch(/^\[TEST\]/);
    expect(content.body).toContain(content.copy);
    expect(content.body).toMatch(new RegExp('^' + MARKER));
    expect(content.title).toBe(TITLE);
    expect(content.weightedLength).toBeLessThanOrEqual(280);
  });
  it('does read-only preflight, exposes only masked destination and gates exact approval', async () => {
    const h = harness();
    const plan = await session(h).preflight();
    expect(plan).toMatchObject({
      maskedChat: '***01',
      readyForApproval: true,
      telegramMessages: 2,
      issueCount: 1,
      externalWriteRequests: 0,
    });
    expect(JSON.stringify(plan)).not.toContain(secrets.chatId);
    expect(JSON.stringify(plan)).not.toContain(secrets.botToken);
    expect(h.writes()).toHaveLength(0);
    await expect(session(h).send('0'.repeat(64))).rejects.toThrow(
      'APPROVAL_DOES_NOT_MATCH_CURRENT_PLAN',
    );
    await expect(
      session(h, NOW + 1_800_000).send(plan.approval),
    ).rejects.toThrow('APPROVAL_DOES_NOT_MATCH_CURRENT_PLAN');
    expect(h.writes()).toHaveLength(0);
  });
  it('requires private self chat, personal account and an explicit Reports-only permission attestation', async () => {
    const h = harness();
    expect(
      () =>
        new LiveTrialProviders({ ...secrets, chatId: '222' }, 12, h.fetcher),
    ).toThrow('PRIVATE_SELF_ALLOWLIST_REQUIRED');
    expect(
      () =>
        new LiveTrialProviders(
          { ...secrets, reportsIssuesWriteAttested: false },
          12,
          h.fetcher,
        ),
    ).toThrow('SCOPED_REPORTS_SECRET');
    h.overrides.chat = 'supergroup';
    await expect(session(h).preflight()).rejects.toThrow(
      'TELEGRAM_PRIVATE_CHAT_UNAVAILABLE',
    );
    h.overrides.chat = 'private';
    h.overrides.private = false;
    await expect(session(h).preflight()).rejects.toThrow(
      'REPORTS_PRIVATE_ACCESS_UNVERIFIED',
    );
    h.overrides.private = true;
    h.overrides.account = 'another';
    await expect(session(h).preflight()).rejects.toThrow(
      'REPORTS_ACCOUNT_MISMATCH',
    );
    expect(h.writes()).toHaveLength(0);
  });
  it('claims exactly two Telegram parts and one private Issue under concurrency, without product records', async () => {
    const h = harness(),
      { approval } = await session(h).preflight();
    const outcomes = await Promise.allSettled([
      session(h).send(approval),
      session(h).send(approval),
    ]);
    expect(outcomes.some((x) => x.status === 'fulfilled')).toBe(true);
    const result = await session(h).status();
    expect(result.deliveries.every((row) => row.state === 'sent')).toBe(true);
    expect(result).toMatchObject({
      actualXPosts: 0,
      githubEmail: 'not observed',
      githubWebNotification: 'not observed',
    });
    expect(h.writes()).toHaveLength(3);
    expect(
      h
        .writes()
        .find(
          (row) =>
            row.path === 'sendMessage' && !('reply_markup' in row.payload),
        )?.payload,
    ).toMatchObject({
      text: content.copy,
      link_preview_options: { is_disabled: true },
    });
    expect(
      h
        .writes()
        .filter((x) => x.path === 'sendMessage' && 'reply_markup' in x.payload),
    ).toHaveLength(1);
    await session(h).send(approval);
    expect(h.writes()).toHaveLength(3);
    const product = await db
      .prepare('SELECT count(*) AS n FROM events')
      .first('n');
    expect(product).toBe(0);
  }, 15_000);
  it('preserves partial success and reconciles a lost Issue response without another POST', async () => {
    const h = harness();
    h.overrides.failManagement = true;
    h.overrides.loseIssue = true;
    const { approval } = await session(h).preflight();
    const sent = await session(h).send(approval);
    expect(sent.deliveries.map((r) => [r.part, r.state])).toEqual([
      ['copy', 'sent'],
      ['issue', 'uncertain'],
      ['management', 'failed'],
    ]);
    const reconciled = await session(h, NOW, 6).reconcile();
    expect(reconciled.issueUrl).toBe(
      `https://github.com/${REPORTS_REPO}/issues/10`,
    );
    await session(h).send(approval);
    expect(h.writes()).toHaveLength(3);
  }, 15_000);
  it.each(['loseCopy', 'copyEchoWrong'] as const)(
    'leaves Telegram %s uncertain and does not resend',
    async (fault) => {
      const h = harness();
      h.overrides[fault] = true;
      const { approval } = await session(h).preflight();
      const result = await session(h).send(approval);
      expect(result.deliveries.find((r) => r.part === 'copy')).toMatchObject({
        state: 'uncertain',
        external_id: null,
      });
      expect(JSON.stringify(result)).not.toContain(secrets.botToken);
      await session(h).send(approval);
      expect(h.writes().filter((r) => r.path === 'sendMessage')).toHaveLength(
        1,
      );
    },
  );
  it('rechecks the private repository immediately before the Issue write', async () => {
    const h = harness();
    h.overrides.publishAfterManagement = true;
    const { approval } = await session(h).preflight();
    const result = await session(h).send(approval);
    expect(result.deliveries.find((row) => row.part === 'issue')).toMatchObject(
      { state: 'failed', safe_code: 'REPORTS_PRIVATE_ACCESS_UNVERIFIED' },
    );
    expect(h.writes().every((row) => row.path === 'sendMessage')).toBe(true);
  });
  it('blocks sending if the previous test Issue already exists or the listing is incomplete', async () => {
    const h = harness();
    h.overrides.nextPages = true;
    await expect(session(h).preflight()).rejects.toThrow(
      'REPORTS_LIST_INCOMPLETE',
    );
    h.overrides.nextPages = false;
    h.issues.push({
      number: 10,
      title: TITLE,
      body: content.body,
      html_url: `https://github.com/${REPORTS_REPO}/issues/10`,
      user: { id: 88 },
      created_at: new Date(NOW).toISOString(),
    });
    const plan = await session(h).preflight();
    expect(plan.readyForApproval).toBe(false);
    await expect(session(h).send(plan.approval)).rejects.toThrow(
      'PRIOR_TRIAL_ISSUE_FOUND',
    );
    expect(h.writes()).toHaveLength(0);
  });
  it('recovers expired claims as uncertain and cannot replay them', async () => {
    const h = harness();
    h.overrides.loseCopy = true;
    const { approval } = await session(h).preflight();
    await session(h).send(approval);
    await db
      .prepare(
        "UPDATE trial_live_outbox SET state='sending',lease_until=? WHERE part='copy'",
      )
      .bind(NOW - 1)
      .run();
    await session(h).reconcile();
    expect(
      (await session(h).status()).deliveries.find((r) => r.part === 'copy'),
    ).toMatchObject({ state: 'uncertain', safe_code: 'LEASE_EXPIRED' });
    expect(h.writes().filter((r) => r.path === 'sendMessage')).toHaveLength(1);
  });
  it('records web and email observations independently against the confirmed private Issue', async () => {
    const h = harness(),
      { approval } = await session(h).preflight();
    const sent = await session(h).send(approval);
    const operator = session(h, NOW + 1000, 0),
      observed = new Date(NOW + 1000).toISOString();
    await expect(
      operator.observe(
        'email',
        'received',
        'https://github.com/elsewhere/issues/10',
        observed,
      ),
    ).rejects.toThrow('OBSERVATION_MUST_MATCH_CONFIRMED_ISSUE');
    const web = await operator.observe(
      'github-web',
      'not-received',
      sent.issueUrl!,
      observed,
    );
    expect(web.githubWebNotification).toMatchObject({
      outcome: 'not-received',
      provenance: 'operator-observation',
    });
    expect(web.githubEmail).toBe('not observed');
    const email = await operator.observe(
      'email',
      'received',
      sent.issueUrl!,
      observed,
    );
    expect(email.githubEmail).toMatchObject({
      outcome: 'received',
      observed_at: observed,
      provenance: 'operator-observation',
    });
    expect(email.requestCount).toBe(0);
  });
  it('never takes over a webhook and accepts only matching live trial callbacks once', async () => {
    const h = harness();
    h.overrides.webhook = 'https://example.invalid';
    expect((await session(h).preflight()).callbackPolling).toBe(false);
    h.overrides.webhook = '';
    const { approval } = await session(h).preflight();
    await session(h).send(approval);
    const message = h.writes().find((r) => 'reply_markup' in r.payload)!;
    const keyboard = (
      message.payload.reply_markup as {
        inline_keyboard: { callback_data: string }[][];
      }
    ).inline_keyboard[0]!;
    const update = (
      id: number,
      index: number,
      user = Number(secrets.userId),
      messageId = 200,
    ) => ({
      update_id: id,
      callback_query: {
        id: 'cb' + id,
        data: keyboard[index]!.callback_data,
        from: { id: user, is_bot: false },
        message: {
          message_id: messageId,
          from: { id: 20 },
          chat: { id: Number(secrets.chatId), type: 'private' },
        },
      },
    });
    h.updates.push(
      update(1, 0, 998),
      update(2, 0, Number(secrets.userId), 100),
      update(3, 0),
      update(4, 0),
      update(5, 1),
      update(6, 2),
    );
    const final = await session(h, NOW, 8).poll(approval);
    expect(final.buttons).toHaveLength(3);
    expect(
      h.writes().filter((r) => r.path === 'answerCallbackQuery'),
    ).toHaveLength(3);
    await session(h, NOW, 8).poll(approval);
    await expect(session(h, NOW + 1_800_000, 8).poll(approval)).rejects.toThrow(
      'POLL_APPROVAL_EXPIRED',
    );
    expect(h.writes()).toHaveLength(6);
    expect(
      h.requests.some((x) => x.path === 'getUpdates' && 'offset' in x.payload),
    ).toBe(false);
    expect(
      await db
        .prepare('SELECT count(*) AS n FROM notification_publications')
        .first('n'),
    ).toBe(0);
    expect(
      await db
        .prepare('SELECT count(*) AS n FROM trial_live_run WHERE id=?')
        .bind(TRIAL)
        .first('n'),
    ).toBe(1);
  }, 15_000);
});
