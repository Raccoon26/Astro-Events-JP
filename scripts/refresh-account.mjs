import { readFileSync, writeFileSync } from 'node:fs';
import { accountSnapshot } from './account-snapshot.mjs';
import { getCloudflareToken } from './cloudflare-client.mjs';
import { assertNoLinks, preflight } from './path-policy.mjs';

const state = preflight(),
  args = process.argv.slice(2),
  i = args.indexOf('--plan-file');
if (i < 0 || !args[i + 1])
  throw new Error('Explicit reviewed plan proof required');
assertNoLinks(args[i + 1]);
const proof = JSON.parse(readFileSync(args[i + 1], 'utf8'));
const snapshot = await accountSnapshot({
  token: getCloudflareToken(),
  accountId: proof.accountId,
  planEvidence: proof,
  allowDashboardFallback:
    args.includes('--allow-fresh-dashboard') && state.localDriveVerified,
});
const destination = state.localDriveVerified
  ? `${state.root}/reports/dev01r-account-evidence.json`
  : process.env.CF_EVIDENCE_FILE;
if (!destination) throw new Error('Account evidence destination required');
writeFileSync(destination, JSON.stringify(snapshot, null, 2));
console.log(
  JSON.stringify({ ...snapshot, accountId: 'verified; see local manifest' }),
);
