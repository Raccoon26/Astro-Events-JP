import { digest } from '../collection/text';
import { renderPost } from '../posts/render';
import fixture from '../posts/synthetic-profile.json';
import type { DetailedVerifiedEvent } from '../verification/types';
import { renderMessages } from './messages';
import { REPORTS_REPO } from './types';

export const TRIAL = 'astro-events-jp-dev06r-live-test-v1';
export const REVISION = 1;
export const TITLE = '[TEST] Astro-Events-JP DEV-06R 제한 수신 시험';
export const MARKER = `<!-- ${TRIAL} -->`;
export const PARTS = ['copy', 'management', 'issue'] as const;
export type TrialPart = (typeof PARTS)[number];
export const ACTIONS = ['posted', 'held', 'recheck'] as const;
export type TrialAction = (typeof ACTIONS)[number];

export async function trialContent() {
  // This fixture stays outside the current verification, event and publication stores.
  const event = structuredClone(fixture.event as DetailedVerifiedEvent);
  event.title = 'TEST 合成観望会';
  const { verification } = event;
  verification.fields.title.value = event.title;
  verification.fields.title.raw = [event.title];
  verification.fields.title.evidence = verification.fields.title.evidence.map(
    (e) => ({ ...e, excerpt: event.title }),
  );
  const post = await renderPost(
    event,
    REVISION,
    'observation',
    Date.parse(verification.checkedAt),
  );
  const { management, issue } = await renderMessages(event, {
    copyText: post.text,
    metadata: {
      post,
      eventId: event.stableEventId,
      sourceId: event.sourceId,
      eventRevision: REVISION,
      verified: true,
      checkedAt: verification.checkedAt,
      expiresAt: verification.expiresAt,
      fingerprint: verification.fingerprint,
      decisionId: TRIAL,
      officialUrl: event.officialUrl,
      images: verification.images,
      impacts: verification.impacts,
      recommended: true,
      recheckRequired: false,
      fields: {},
    },
  });
  if (
    !fixture.synthetic ||
    management.length !== 1 ||
    !post.text.includes('TEST')
  )
    throw Error('TRIAL_FIXTURE_INVALID');
  const managementText =
    '[TEST] DEV-06R 合成データ限定試験\nXに投稿しないでください。\n' +
    management[0];
  if (managementText.length > 4096) throw Error('TRIAL_FIXTURE_INVALID');
  return {
    copy: post.text,
    management: managementText,
    title: TITLE,
    body: `${MARKER}\n[TEST] 합성 행사 수신 시험입니다. 실제 행사·X 게시로 집계하지 않습니다.\n\n${issue.body.slice(issue.body.indexOf('\n') + 1)}`,
    weightedLength: post.weightedLength,
  };
}
export type TrialContent = Awaited<ReturnType<typeof trialContent>>;

export interface TrialBinding {
  botId: number;
  botUsername: string;
  chatId: string;
  userId: string;
  githubUserId: number;
  repoId: number;
  poll: boolean;
}
export async function trialApproval(
  binding: TrialBinding,
  content: TrialContent,
  now: number,
) {
  // Include full identities in the digest. Only a masked destination is shown or recorded.
  const target = await digest(
    JSON.stringify([
      TRIAL,
      REVISION,
      REPORTS_REPO,
      binding.botId,
      binding.botUsername,
      binding.chatId,
      binding.userId,
      binding.githubUserId,
      binding.repoId,
      binding.poll,
      content,
    ]),
  );
  const expiresAt = (Math.floor(now / 1_800_000) + 1) * 1_800_000;
  const reference = await digest(JSON.stringify([target, expiresAt]));
  return {
    approval: reference,
    targetDigest: target,
    expiresAt: new Date(expiresAt).toISOString(),
    bot: '@' + binding.botUsername,
    maskedChat: '***' + binding.chatId.slice(-2),
    telegramMessages: 2,
    issueCount: 1,
    issueTitle: TITLE,
    repository: REPORTS_REPO,
    callbackPolling: binding.poll,
    callbackMaximum: binding.poll ? 3 : 0,
    maximumRequests: {
      preflight: 9,
      send: 13,
      pollPerSession: binding.poll ? 18 : 0,
      reconcile: 6,
    },
    freeBudget: { workersInvocations: 0, remoteD1Writes: 0, paidServices: 0 },
    githubEmailDelivery: 'unverified; GitHub handles dispatch',
    retention:
      'Preserve the private Issue, Telegram messages and isolated receipts. No automatic delete/edit.',
  };
}
