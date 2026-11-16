import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { accountSnapshot } from './account-snapshot.mjs';
import {
  cloudflareClient,
  getCloudflareToken,
  latestDeploymentPath,
} from './cloudflare-client.mjs';
import {
  checkFreeAccount,
  readConfig,
  validateBindings,
} from './cloudflare-policy.mjs';
import { correlateCpu, queryCpuMetrics } from './cpu-metrics.mjs';
import {
  verifyDeploymentHealth,
  verifyDeploymentVersion,
} from './deployment-health.mjs';
import { preflight } from './path-policy.mjs';

const state = preflight();
const optimizedOnly =
  process.argv.slice(2).join(' ') === 'staging --optimized-only';
if (process.argv.slice(2).join(' ') !== 'staging' && !optimizedOnly)
  throw Error('STAGING_CPU_MATRIX_ONLY');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
if (
  git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main') ||
  git('status', '--porcelain') ||
  !(
    git('branch', '--show-current') === 'main' ||
    process.env.GITHUB_REF === 'refs/heads/main'
  )
)
  throw Error('CLEAN_CURRENT_MAIN_REQUIRED');
const resources = JSON.parse(
  fs.readFileSync('cloudflare-resources.json', 'utf8'),
);
validateBindings(readConfig(), resources, true);
const token = getCloudflareToken(),
  api = cloudflareClient(token, resources.accountId);
const planEvidence = JSON.parse(
  fs.readFileSync('data/cloudflare-plan-evidence.json', 'utf8'),
);
async function evidence() {
  const p = await accountSnapshot({
    token,
    accountId: resources.accountId,
    planEvidence,
  });
  checkFreeAccount(p, 'staging', Date.now(), 1);
  if (p.requests + 512 >= 80000 || p.reads + 1024 >= 4000000)
    throw Error('CPU_MATRIX_BUDGET_INSUFFICIENT');
  return JSON.stringify(p);
}
async function command(...args) {
  const r = spawnSync(process.execPath, ['scripts/cloudflare.mjs', ...args], {
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    timeout: 180000,
    env: { ...process.env, CF_ACCOUNT_EVIDENCE: await evidence() },
  });
  const records = String(r.stdout ?? '')
    .split('\n')
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  const record = records.findLast(
    (row) => row.operation === args[0] && row.target === 'staging',
  );
  if (record) console.log(JSON.stringify(record));
  if (r.status !== 0 || !record?.success)
    throw Error('CPU_MATRIX_DEPLOYMENT_FAILED');
  return record;
}
const name = resources.staging.workerName;
const prior = (await api('GET', latestDeploymentPath(name))).deployments?.[0]
  ?.versions;
if (
  prior?.length !== 1 ||
  prior[0].percentage !== 100 ||
  !/^[\da-f-]{36}$/.test(prior[0].version_id)
)
  throw Error('STABLE_ROLLBACK_REQUIRED');
const sub = await api('GET', '/workers/subdomain');
if (!/^[a-z0-9-]+$/.test(sub.subdomain)) throw Error('SUBDOMAIN_INVALID');
const base = `https://${name}.${sub.subdomain}.workers.dev`;
const corpus = JSON.parse(
  fs.readFileSync('src/posts/profile-corpus.json', 'utf8'),
);
const report = {
  synthetic: true,
  baseline: '157aaab6eb284f3e65df85d5207ee6efcf8a60b8',
  rounds: 10,
  requestSpacingMs: 1250,
  expectedRequests: optimizedOnly ? 170 : 340,
  externalRequests: 0,
  remoteWrites: 0,
  samples: [],
};
const file = state.localDriveVerified
  ? `${state.root}/reports/dev05r-matrix-${Date.now()}.json`
  : `${process.env.RUNNER_TEMP}/astro-events-jp/dev05r-matrix.json`;
report.versions = {};
report.phases = [];
try {
  report.start = new Date().toISOString();
  console.log(
    JSON.stringify({
      phase: 'cpu-matrix-start',
      requests: report.expectedRequests,
      scenarios: 17,
    }),
  );
  for (const implementation of optimizedOnly
    ? ['optimized']
    : ['baseline', 'optimized']) {
    const deployed = await command(
      'benchmark',
      'staging',
      `--cpu-matrix-${implementation}`,
    );
    const version = deployed.uploadedVersionId;
    await verifyDeploymentVersion(
      () => api('GET', latestDeploymentPath(name)),
      version,
    );
    report.versions[implementation] = version;
    report.phases.push({
      implementation,
      version,
      start: new Date().toISOString(),
      startupTimeMs: deployed.startupTimeMs,
    });
    console.log(
      JSON.stringify({
        phase: 'cpu-matrix-implementation-start',
        ...report.phases.at(-1),
      }),
    );
    let consecutiveErrors = 0;
    for (let round = 0; round < 10; round++)
      for (const input of corpus.cases) {
        await new Promise((resolve) => setTimeout(resolve, 1250));
        const start = performance.now(),
          sentAt = new Date().toISOString();
        const response = await fetch(
          `${base}/benchmark/cpu/${implementation}/${input.id}`,
          { redirect: 'error', signal: AbortSignal.timeout(10000) },
        );
        const raw = await response.text();
        if (raw.length > 32768) throw Error('CPU_MATRIX_BODY_LIMIT');
        let body = null;
        try {
          body = JSON.parse(raw);
        } catch {
          /* Cloudflare error pages are not trusted input. */
        }
        const sample = {
          round,
          scenario: input.id,
          implementation,
          version,
          sentAt,
          receivedAt: new Date().toISOString(),
          serverDate: response.headers.get('date'),
          workerStartedAt: body?.workerStartedAt ?? null,
          colo: response.headers.get('cf-ray')?.split('-').at(-1),
          clientWallMs: performance.now() - start,
          httpStatus: response.status,
          isolateId: body?.isolateId ?? null,
          sequence: body?.sequence ?? null,
          synthetic: body?.synthetic === true,
          dbRowsRead: body?.dbRowsRead ?? null,
          dbRowsWritten: body?.dbRowsWritten ?? null,
          externalRequests: body?.externalRequests ?? null,
          error1102: !response.ok && /\b1102\b/.test(raw),
        };
        report.samples.push(sample);
        if (
          response.ok &&
          (JSON.stringify(body?.post) !== JSON.stringify(input.expected) ||
            body.implementation !== implementation ||
            body.scenario !== input.id ||
            !body.synthetic ||
            body.dbRowsRead !== 1 ||
            body.dbRowsWritten !== 0 ||
            body.externalRequests !== 0)
        )
          throw Error('CPU_MATRIX_OUTPUT_OR_SAFETY_MISMATCH');
        consecutiveErrors = response.ok ? 0 : consecutiveErrors + 1;
        console.log(JSON.stringify({ phase: 'cpu-matrix-sample', ...sample }));
        fs.writeFileSync(file, JSON.stringify(report, null, 2));
        if (consecutiveErrors >= 3)
          throw Error('CPU_MATRIX_CONSECUTIVE_ERRORS');
      }
    report.phases.at(-1).end = new Date().toISOString();
  }
  report.end = new Date().toISOString();
} finally {
  await command('rollback', 'staging', prior[0].version_id);
  const restored = await verifyDeploymentVersion(
    () => api('GET', latestDeploymentPath(name)),
    prior[0].version_id,
  );
  const health = await verifyDeploymentHealth(base + '/health', 'staging');
  report.restored = { ...restored, health };
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({ phase: 'cpu-matrix-restored', ...report.restored }),
  );
}
// Provider ingestion may lag. The persisted run remains usable for a later read-only query.
try {
  await new Promise((resolve) => setTimeout(resolve, 10000));
  const metrics = await queryCpuMetrics({
    token,
    accountId: resources.accountId,
    scriptName: name,
    start: report.start,
    end: report.end,
  });
  report.metrics = metrics;
  report.correlated = correlateCpu(metrics, report.samples, report.versions);
  console.log(
    JSON.stringify({
      phase: 'cpu-matrix-metrics',
      ...report.correlated.summary,
      complete: report.correlated.complete,
    }),
  );
} catch {
  report.metricsUnavailable = true;
  console.log(
    JSON.stringify({
      phase: 'cpu-matrix-metrics-unavailable',
      reason:
        'Read-only metrics can be queried later; no wall-time CPU substitution',
    }),
  );
}
fs.writeFileSync(file, JSON.stringify(report, null, 2));
