import { digest } from '../collection/text';
import {
  ACTIONS,
  PARTS,
  REVISION,
  TRIAL,
  type TrialBinding,
  type TrialPart,
  trialApproval,
  trialContent,
} from './live-plan';
import { type LiveTrialProviders, object } from './live-providers';
import { DeliveryFault, REPORTS_REPO } from './types';

type PendingPlan = Awaited<ReturnType<typeof trialApproval>>;
interface Run {
  target_digest: string;
  github_user_id: number;
  repo_id: number;
  approved_plan: string;
  revision: number;
  expires_at: number;
}
interface OutboxState {
  part: TrialPart;
  state: string;
  external_id: string | null;
  provider_at: string | null;
  safe_code: string | null;
}
const safeCode = (error: unknown) =>
  error instanceof DeliveryFault
    ? error.code
    : 'LIVE_PROVIDER_EVIDENCE_UNCERTAIN';
const REPORT_TTL = 30_000;
const actionLabels = ['TEST 投稿済み', 'TEST 保留', 'TEST 再確認'];
const token = () =>
  't6r:' +
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

export class LiveTrialSession {
  constructor(
    private readonly db: D1Database,
    private readonly providers: LiveTrialProviders,
    private readonly clock = Date.now,
    private readonly wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}

  private async run() {
    if (
      (await this.db
        .prepare('SELECT version FROM notification_schema WHERE version=1')
        .first('version')) !== 1
    )
      throw Error('LOCAL_SCHEMA_0008_REQUIRED');
    // Identity is installed only by the trial CLI, never by a remote migration.
    if (
      (await this.db
        .prepare(
          "SELECT purpose FROM trial_live_identity WHERE purpose='dev06r-local-only'",
        )
        .first('purpose')) !== 'dev06r-local-only'
    )
      throw Error('TRIAL_LEDGER_REQUIRED');
    return this.db
      .prepare('SELECT * FROM trial_live_run WHERE id=?')
      .bind(TRIAL)
      .first<Run>();
  }
  private async probe() {
    const started = this.clock();
    const content = await trialContent();
    const telegram = await this.providers.telegramBinding();
    const github = await this.providers.githubBinding();
    const existing = await this.providers.existingIssue(
      content,
      github.githubUserId,
    );
    const binding: TrialBinding = { ...telegram, ...github };
    const plan = await trialApproval(binding, content, started);
    if (this.clock() >= Date.parse(plan.expiresAt))
      throw Error('PLAN_WINDOW_EXPIRED');
    return { binding, plan, existing, content };
  }
  async preflight() {
    const prior = await this.run();
    const { plan, existing } = await this.probe();
    const { targetDigest, ...summary } = plan;
    return {
      ...summary,
      priorIssueFound: !!existing,
      priorRunFound: !!prior,
      readyForApproval: prior
        ? prior.target_digest === targetDigest
        : !existing,
      githubIssuesWrite:
        'scoped token and owner access checked; write permission attested, actual write untested',
      externalWriteRequests: 0,
    };
  }
  private async expireLeases() {
    await this.db
      .prepare(
        "UPDATE trial_live_outbox SET state='uncertain',safe_code='LEASE_EXPIRED',owner=NULL,lease_until=NULL WHERE trial_id=? AND state='sending' AND lease_until<=?",
      )
      .bind(TRIAL, this.clock())
      .run();
    // An acknowledgement is never retried. A later poll may observe the result as uncertain.
    await this.db
      .prepare(
        "UPDATE trial_live_buttons SET ack_state='uncertain' WHERE trial_id=? AND ack_state='sending' AND consumed_at<=?",
      )
      .bind(TRIAL, this.clock() - REPORT_TTL)
      .run();
  }
  private async initialize(plan: PendingPlan, binding: TrialBinding) {
    const expiresAt = Date.parse(plan.expiresAt);
    const key = (part: TrialPart) =>
      digest(JSON.stringify([TRIAL, REVISION, plan.targetDigest, part]));
    const ids = await Promise.all(PARTS.map(key));
    const statements = [
      this.db
        .prepare(
          'INSERT INTO trial_live_run(id,target_digest,github_user_id,repo_id,approved_plan,revision,expires_at,started_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
        )
        .bind(
          TRIAL,
          plan.targetDigest,
          binding.githubUserId,
          binding.repoId,
          plan.approval,
          REVISION,
          expiresAt,
          this.clock(),
        ),
    ];
    for (const [i, part] of PARTS.entries())
      statements.push(
        this.db
          .prepare(
            'INSERT INTO trial_live_outbox(id,trial_id,part) SELECT ?,id,? FROM trial_live_run WHERE id=? AND target_digest=? ON CONFLICT(trial_id,part) DO NOTHING',
          )
          .bind(ids[i], part, TRIAL, plan.targetDigest),
      );
    await this.db.batch(statements);
    const updated = await this.db
      .prepare(
        'UPDATE trial_live_run SET approved_plan=?,expires_at=? WHERE id=? AND target_digest=? AND revision=? RETURNING id',
      )
      .bind(plan.approval, expiresAt, TRIAL, plan.targetDigest, REVISION)
      .first('id');
    if (updated !== TRIAL) throw Error('TRIAL_TARGET_CHANGED');
  }
  private async claim(part: TrialPart, plan: PendingPlan) {
    const owner = crypto.randomUUID(),
      now = this.clock();
    if (now >= Date.parse(plan.expiresAt)) throw Error('PLAN_WINDOW_EXPIRED');
    const claimed = await this.db
      .prepare(
        "UPDATE trial_live_outbox SET state='sending',owner=?,lease_until=? WHERE part=? AND trial_id=? AND state='pending' AND EXISTS(SELECT 1 FROM trial_live_run WHERE id=? AND approved_plan=? AND revision=? AND expires_at>?) AND (?!='management' OR EXISTS(SELECT 1 FROM trial_live_outbox WHERE trial_id=? AND part='copy' AND state='sent')) RETURNING id",
      )
      .bind(
        owner,
        now + REPORT_TTL,
        part,
        TRIAL,
        TRIAL,
        plan.approval,
        REVISION,
        now,
        part,
        TRIAL,
      )
      .first('id');
    return claimed ? owner : null;
  }
  private async finish(
    part: TrialPart,
    owner: string,
    state: 'sent' | 'failed' | 'uncertain',
    receipt: { externalId: string; createdAt: string } | null,
    code: string | null,
  ) {
    const result = await this.db
      .prepare(
        "UPDATE trial_live_outbox SET state=?,external_id=?,provider_at=?,safe_code=?,owner=NULL,lease_until=NULL WHERE trial_id=? AND part=? AND owner=? AND state='sending' RETURNING id",
      )
      .bind(
        state,
        receipt?.externalId ?? null,
        receipt?.createdAt ?? null,
        code,
        TRIAL,
        part,
        owner,
      )
      .first('id');
    if (!result) throw Error('TRIAL_LEASE_LOST');
  }
  private async buttons(plan: PendingPlan) {
    const out = [];
    const statements = [];
    for (const [index, action] of ACTIONS.entries()) {
      const value = token();
      out.push({ text: actionLabels[index]!, callback_data: value });
      statements.push(
        this.db
          .prepare(
            'INSERT INTO trial_live_buttons(token_hash,trial_id,action,revision,expires_at) VALUES(?,?,?,?,?)',
          )
          .bind(
            await digest(value),
            TRIAL,
            action,
            REVISION,
            Date.parse(plan.expiresAt),
          ),
      );
    }
    await this.db.batch(statements);
    return out;
  }
  async send(approval: string) {
    if (!/^[a-f0-9]{64}$/u.test(approval))
      throw Error('EXACT_APPROVAL_REQUIRED');
    const prior = await this.run();
    const { binding, plan, existing, content } = await this.probe();
    if (approval !== plan.approval)
      throw Error('APPROVAL_DOES_NOT_MATCH_CURRENT_PLAN');
    if (!prior && existing) throw Error('PRIOR_TRIAL_ISSUE_FOUND');
    if (prior && prior.target_digest !== plan.targetDigest)
      throw Error('TRIAL_TARGET_CHANGED');
    await this.initialize(plan, binding);
    await this.expireLeases();
    for (const part of PARTS) {
      if (part === 'issue' && existing) {
        await this.adoptIssue(existing);
        continue;
      }
      const owner = await this.claim(part, plan);
      if (!owner) continue;
      try {
        if (part === 'management') await this.wait(1100);
        if (this.clock() >= Date.parse(plan.expiresAt))
          throw new DeliveryFault('PLAN_WINDOW_EXPIRED', false);
        const buttons =
          part === 'management' && binding.poll
            ? await this.buttons(plan)
            : undefined;
        const receipt =
          part === 'issue'
            ? await this.providers.createIssue(
                content,
                binding.githubUserId,
                binding.repoId,
                Date.parse(plan.expiresAt),
              )
            : await this.providers.sendMessage(content[part], buttons);
        await this.finish(part, owner, 'sent', receipt, null);
      } catch (error) {
        await this.finish(
          part,
          owner,
          error instanceof DeliveryFault && !error.uncertain
            ? 'failed'
            : 'uncertain',
          null,
          safeCode(error),
        );
      }
    }
    return this.status();
  }
  private async adoptIssue(receipt: { externalId: string; createdAt: string }) {
    await this.db
      .prepare(
        "UPDATE trial_live_outbox SET state='sent',external_id=?,provider_at=?,safe_code='RECONCILED_EXISTING_ISSUE',owner=NULL,lease_until=NULL WHERE trial_id=? AND part='issue' AND state='uncertain'",
      )
      .bind(receipt.externalId, receipt.createdAt, TRIAL)
      .run();
  }
  async reconcile() {
    const run = await this.run();
    if (!run) throw Error('NO_APPROVED_TRIAL');
    const binding = await this.providers.githubBinding();
    if (
      binding.githubUserId !== run.github_user_id ||
      binding.repoId !== run.repo_id
    )
      throw Error('REPORTS_BINDING_CHANGED');
    await this.expireLeases();
    const found = await this.providers.existingIssue(
      await trialContent(),
      binding.githubUserId,
    );
    if (found) await this.adoptIssue(found);
    return this.status();
  }
  async poll(approval: string) {
    const run = await this.run();
    if (
      !run ||
      run.approved_plan !== approval ||
      run.revision !== REVISION ||
      run.expires_at <= this.clock()
    )
      throw Error('POLL_APPROVAL_EXPIRED_OR_MISMATCH');
    const reserved = await this.db
      .prepare(
        'UPDATE trial_live_run SET poll_reads=poll_reads+5 WHERE id=? AND poll_reads<=10 AND approved_plan=? AND expires_at>? RETURNING id',
      )
      .bind(TRIAL, approval, this.clock())
      .first('id');
    if (!reserved) throw Error('POLL_BUDGET_EXHAUSTED');
    const telegram = await this.providers.telegramBinding();
    const binding = {
      ...telegram,
      githubUserId: run.github_user_id,
      repoId: run.repo_id,
    };
    const plan = await trialApproval(
      binding,
      await trialContent(),
      this.clock(),
    );
    if (
      !binding.poll ||
      plan.approval !== approval ||
      plan.targetDigest !== run.target_digest
    )
      throw Error('POLL_DESTINATION_CHANGED_OR_WEBHOOK_ACTIVE');
    for (const update of await this.providers.callbackUpdates()) {
      const action = await this.consume(update, binding, approval);
      if (!action) continue;
      let state = 'sent';
      try {
        await this.providers.answerCallback(action.queryId);
      } catch (error) {
        state =
          error instanceof DeliveryFault && !error.uncertain
            ? 'failed'
            : 'uncertain';
      }
      await this.db
        .prepare(
          "UPDATE trial_live_buttons SET ack_state=? WHERE trial_id=? AND update_id=? AND ack_state='sending'",
        )
        .bind(state, TRIAL, action.updateId)
        .run();
    }
    return this.status();
  }
  private async consume(
    value: unknown,
    binding: TrialBinding,
    approval: string,
  ) {
    let updateId: number, queryId: string, data: string, messageId: number;
    try {
      const update = object(value),
        callback = object(update.callback_query),
        from = object(callback.from),
        message = object(callback.message),
        chat = object(message.chat);
      if (
        typeof update.update_id !== 'number' ||
        !Number.isSafeInteger(update.update_id) ||
        update.update_id < 0 ||
        typeof callback.id !== 'string' ||
        !/^[-\w]{1,128}$/u.test(callback.id) ||
        typeof callback.data !== 'string' ||
        !/^t6r:[a-f0-9]{32}$/u.test(callback.data) ||
        String(from.id) !== binding.userId ||
        from.is_bot !== false ||
        String(chat.id) !== binding.chatId ||
        chat.type !== 'private' ||
        String(object(message.from).id) !== String(binding.botId) ||
        typeof message.message_id !== 'number' ||
        !Number.isSafeInteger(message.message_id) ||
        message.message_id <= 0
      )
        return null;
      ({ id: queryId, data } = callback as { id: string; data: string });
      updateId = update.update_id;
      messageId = message.message_id;
    } catch {
      return null;
    }
    const now = this.clock();
    const accepted = await this.db
      .prepare(
        "UPDATE trial_live_buttons SET update_id=?,consumed_at=?,ack_state='sending' WHERE trial_id=? AND token_hash=? AND revision=? AND expires_at>? AND consumed_at IS NULL AND NOT EXISTS(SELECT 1 FROM trial_live_buttons WHERE update_id=?) AND EXISTS(SELECT 1 FROM trial_live_run WHERE id=? AND approved_plan=? AND expires_at>? AND revision=?) AND EXISTS(SELECT 1 FROM trial_live_outbox WHERE trial_id=? AND part='management' AND state='sent' AND external_id=?) RETURNING action",
      )
      .bind(
        updateId,
        now,
        TRIAL,
        await digest(data),
        REVISION,
        now,
        updateId,
        TRIAL,
        approval,
        now,
        REVISION,
        TRIAL,
        String(messageId),
      )
      .first('action');
    return accepted ? { queryId, updateId } : null;
  }
  async status() {
    const run = await this.run();
    const { results } = await this.db
      .prepare(
        'SELECT part,state,external_id,provider_at,safe_code FROM trial_live_outbox WHERE trial_id=? ORDER BY part',
      )
      .bind(TRIAL)
      .all<OutboxState>();
    const buttons = (
      await this.db
        .prepare(
          'SELECT action,consumed_at,ack_state FROM trial_live_buttons WHERE trial_id=? ORDER BY action',
        )
        .bind(TRIAL)
        .all()
    ).results;
    const issue = results.find(
      (row) =>
        row.part === 'issue' &&
        row.state === 'sent' &&
        /^\d+$/u.test(row.external_id ?? ''),
    );
    const observations = (
      await this.db
        .prepare(
          'SELECT channel,observed_at,outcome,provenance FROM trial_live_observations WHERE trial_id=? ORDER BY observed_at DESC LIMIT 20',
        )
        .bind(TRIAL)
        .all()
    ).results;
    return {
      scope: 'dev06r-live-test',
      trialStarted: !!run,
      deliveries: results,
      buttons,
      issueUrl: issue
        ? `https://github.com/${REPORTS_REPO}/issues/${issue.external_id}`
        : null,
      observations,
      githubWebNotification:
        observations.find((row) => row.channel === 'github-web') ??
        'not observed',
      githubEmail:
        observations.find((row) => row.channel === 'email') ?? 'not observed',
      actualXPosts: 0,
      requestCount: this.providers.requestCount,
    };
  }
  async observe(
    channel: string,
    outcome: string,
    issueUrl: string,
    observedAt: string,
  ) {
    const status = await this.status();
    const issue = status.deliveries.find(
      (row) => row.part === 'issue' && row.state === 'sent',
    );
    const observed = Date.parse(observedAt);
    if (
      !issue?.external_id ||
      !issue.provider_at ||
      issueUrl !== status.issueUrl ||
      !['github-web', 'email'].includes(channel) ||
      !['received', 'not-received'].includes(outcome) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(
        observedAt,
      ) ||
      !Number.isFinite(observed) ||
      observed < Date.parse(issue.provider_at) ||
      observed > this.clock()
    )
      throw Error('OBSERVATION_MUST_MATCH_CONFIRMED_ISSUE');
    await this.db
      .prepare(
        "INSERT INTO trial_live_observations(trial_id,channel,issue_id,observed_at,outcome,provenance) VALUES(?,?,?,?,?,'operator-observation') ON CONFLICT DO NOTHING",
      )
      .bind(
        TRIAL,
        channel,
        issue.external_id,
        new Date(observed).toISOString(),
        outcome,
      )
      .run();
    return this.status();
  }
}
