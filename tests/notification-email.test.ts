import { expect, it } from 'vitest';
import { emailReadiness } from '../src/notifications/email';

const proof = {
  repositoryPrivate: true,
  repositoryAccess: true,
  issuesEnabled: true,
  watchSubscribed: true,
  issueSubscribed: false,
  ignored: false,
  verifiedEmail: true,
  emailNotificationsEnabled: true,
};
it('keeps successful settings separate from actual delivery and inbox receipt', () => {
  expect(emailReadiness(proof)).toMatchObject({
    canPlanSeparateApprovedTest: true,
    deliveryVerified: false,
    inboxReceiptVerified: false,
    mailTransportImplemented: false,
  });
});
it.each([
  'repositoryPrivate',
  'repositoryAccess',
  'issuesEnabled',
  'verifiedEmail',
  'emailNotificationsEnabled',
] as const)('fails closed on unknown %s', (key) => {
  expect(
    emailReadiness({ ...proof, [key]: null }).canPlanSeparateApprovedTest,
  ).toBe(false);
});
it('rejects extra personal or credential data and invalid proof types', () => {
  expect(() =>
    emailReadiness({ ...proof, email: 'not-accepted' } as typeof proof),
  ).toThrow('EMAIL_PROOF_INVALID');
  expect(() =>
    emailReadiness({ ...proof, ignored: 'false' } as unknown as typeof proof),
  ).toThrow('EMAIL_PROOF_INVALID');
});
