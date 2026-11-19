import { NotificationError } from './types';
export interface EmailReadinessProof {
  repositoryPrivate: boolean | null;
  repositoryAccess: boolean | null;
  issuesEnabled: boolean | null;
  watchSubscribed: boolean | null;
  issueSubscribed: boolean | null;
  ignored: boolean | null;
  verifiedEmail: boolean | null;
  emailNotificationsEnabled: boolean | null;
}
export function emailReadiness(proof: EmailReadinessProof) {
  const keys = [
    'repositoryPrivate',
    'repositoryAccess',
    'issuesEnabled',
    'watchSubscribed',
    'issueSubscribed',
    'ignored',
    'verifiedEmail',
    'emailNotificationsEnabled',
  ];
  if (
    Object.keys(proof).some((k) => !keys.includes(k)) ||
    keys.some(
      (k) =>
        !Object.hasOwn(proof, k) ||
        !([true, false, null] as unknown[]).includes(
          proof[k as keyof EmailReadinessProof],
        ),
    )
  )
    throw new NotificationError('EMAIL_PROOF_INVALID');
  const missing: string[] = [];
  for (const field of [
    'repositoryPrivate',
    'repositoryAccess',
    'issuesEnabled',
    'verifiedEmail',
    'emailNotificationsEnabled',
  ] as const)
    if (proof[field] !== true) missing.push(field);
  if (proof.ignored !== false) missing.push('notifications-not-ignored');
  if (proof.watchSubscribed !== true && proof.issueSubscribed !== true)
    missing.push('watch-or-issue-subscription');
  return {
    canPlanSeparateApprovedTest: missing.length === 0,
    missing,
    deliveryVerified: false,
    inboxReceiptVerified: false,
    mailTransportImplemented: false,
    source: 'operator/settings assessment; never an email receipt',
    note: 'Issue success does not imply an email or full-body delivery. Own-update preferences and private access also apply.',
  };
}
