import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { preflight } from './path-policy.mjs';

const state = preflight();
if (!process.argv.includes('--reviewed'))
  throw new Error(
    'Review requirements, regression, public diff and PROJECT_STATUS first; then pass --reviewed',
  );
const repo = 'Raccoon26/Astro-Events-JP';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
if (git('remote', 'get-url', 'origin') !== `https://github.com/${repo}.git`)
  throw new Error('Unexpected remote');
const branch = git('branch', '--show-current');
if (!/^dev\/dev-(?:\d{2}|01r)-[a-z0-9-]+$/.test(branch))
  throw new Error('A DEV branch is required');
const npm = spawnSync(
  process.execPath,
  [
    process.env.npm_execpath ||
      `${process.env.ProgramFiles}/nodejs/node_modules/npm/bin/npm-cli.js`,
    'run',
    'check',
  ],
  { stdio: 'inherit' },
);
if (npm.status !== 0) throw new Error('Quality gate failed');
git('diff', '--check');
const credential = spawnSync('git', ['credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n',
  encoding: 'utf8',
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
});
const token = credential.stdout
  ?.split('\n')
  .find((line) => line.startsWith('password='))
  ?.slice(9);
if (!token)
  throw new Error(
    'Existing noninteractive Git authentication unavailable; do not paste tokens into chat',
  );
async function api(method, endpoint, body) {
  const response = await fetch(
    `https://api.github.com/repos/${repo}${endpoint}`,
    {
      method,
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      `GitHub ${method} ${endpoint}: ${response.status} ${data.message}`,
    );
  return data;
}
// Settings are intentionally never weakened or created implicitly by this command.
const protection = await api('GET', '/branches/main/protection');
if (
  !protection.enforce_admins?.enabled ||
  !protection.required_status_checks?.contexts?.includes('quality') ||
  !protection.required_pull_request_reviews ||
  protection.allow_force_pushes?.enabled ||
  protection.allow_deletions?.enabled
)
  throw new Error(
    'Expected PR/quality/admin protection missing; inspect settings separately',
  );
git('fetch', 'origin', 'main');
git('merge-base', '--is-ancestor', 'origin/main', 'HEAD');
if (git('status', '--porcelain')) {
  git('add', '--all');
  git(
    'commit',
    '-m',
    process.env.DEV_COMMIT_MESSAGE ||
      `${branch}: complete reviewed DEV changes`,
  );
}
git('push', '--set-upstream', 'origin', branch);
const head = git('rev-parse', 'HEAD');
let prs = await api(
  'GET',
  `/pulls?state=open&base=main&head=${encodeURIComponent(`Raccoon26:${branch}`)}`,
);
if (!prs.length)
  prs = [
    await api('POST', '/pulls', {
      title: `${branch}: reviewed implementation`,
      head: branch,
      base: 'main',
      body: 'See PROJECT_STATUS.md for scope, validation and limitations. Requirements and regression reviewed; npm run check passed. Merge requires current-head CI and all existing repository policies.',
    }),
  ];
const number = prs[0].number;
console.log(`PR ${prs[0].html_url}; awaiting current-head checks`);
const propagationDeadline = Date.now() + 60000;
const deadline = Date.now() + 12 * 60 * 1000;
let ready = false;
while (Date.now() < deadline) {
  const pr = await api('GET', `/pulls/${number}`);
  if (pr.head.sha !== head) {
    const ancestor = spawnSync('git', [
      'merge-base',
      '--is-ancestor',
      pr.head.sha,
      head,
    ]);
    if (ancestor.status === 0 && Date.now() < propagationDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      continue; // GitHub may briefly return the previous head immediately after push.
    }
    throw new Error('PR head changed; re-review required');
  }
  const checks = await api('GET', `/commits/${head}/check-runs?per_page=100`);
  const status = await api('GET', `/commits/${head}/status`);
  if (checks.total_count > 100)
    throw new Error('Check pagination requires manual inspection');
  if (
    checks.check_runs.some(
      (check) =>
        check.status === 'completed' &&
        !['success', 'neutral', 'skipped'].includes(check.conclusion),
    )
  )
    throw new Error('CI failed; retain PR and repair');
  if (status.statuses.some((item) => ['failure', 'error'].includes(item.state)))
    throw new Error('Commit status failed');
  const quality = checks.check_runs.some(
    (check) => check.name === 'quality' && check.conclusion === 'success',
  );
  if (
    quality &&
    checks.check_runs.every((check) => check.status === 'completed') &&
    status.statuses.every((item) => item.state === 'success') &&
    pr.mergeable === true &&
    pr.mergeable_state === 'clean'
  ) {
    ready = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 10000));
}
if (!ready)
  throw new Error(
    'CI/approval/merge conditions not ready; PR retained. Inspect the exact blocking policy before retry',
  );
const merged = await api('PUT', `/pulls/${number}/merge`, {
  sha: head,
  merge_method: 'squash',
});
if (!merged.merged) throw new Error('Merge blocked; PR retained');
const verified = await api('GET', `/pulls/${number}`);
if (!verified.merged) throw new Error('Merge not confirmed');
git('fetch', 'origin', 'main');
if (git('status', '--porcelain'))
  throw new Error('Worktree changed; refusing checkout');
git('switch', 'main');
git('merge', '--ff-only', 'origin/main');
const report = {
  pr: verified.html_url,
  head,
  merge: verified.merge_commit_sha,
  main: git('rev-parse', 'HEAD'),
  merged: true,
};
if (state.localDriveVerified)
  writeFileSync(
    `${state.root}/reports/github-completion-${Date.now()}.json`,
    JSON.stringify(report, null, 2),
    { flag: 'wx' },
  );
console.log(JSON.stringify(report, null, 2));
