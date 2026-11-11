import { execFileSync } from 'node:child_process';
import { assertTrustedQuality } from './deployment-check-policy.mjs';

const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
if (!process.env.GITHUB_TOKEN)
  throw new Error(
    'Read-only GitHub token required to verify current commit CI',
  );
const response = await fetch(
  `https://api.github.com/repos/Raccoon26/Astro-Events-JP/commits/${sha}/check-runs?per_page=100`,
  {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
  },
);
if (!response.ok) throw new Error('CI_VERIFICATION_FAILED');
const json = await response.json();
assertTrustedQuality(json, sha);
console.log('Current commit trusted quality CI verified.');
