import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { accountSnapshot } from './account-snapshot.mjs';
import { cloudflareClient, getCloudflareToken } from './cloudflare-client.mjs';
import {
  checkFreeAccount,
  readConfig,
  validateBindings,
} from './cloudflare-policy.mjs';
import {
  verifyDeploymentHealth,
  verifyDeploymentVersion,
} from './deployment-health.mjs';
import { preflight } from './path-policy.mjs';

preflight();
if (process.argv[2] !== 'staging' || process.argv.length !== 3)
  throw new Error('Explicit staging-only diagnostics required');
const resources = JSON.parse(readFileSync('cloudflare-resources.json', 'utf8'));
validateBindings(readConfig(), resources, true);
const token = getCloudflareToken(),
  api = cloudflareClient(token, resources.accountId);
const planEvidence = JSON.parse(
  readFileSync('data/cloudflare-plan-evidence.json', 'utf8'),
);
async function evidence() {
  const snapshot = await accountSnapshot({
    token,
    accountId: resources.accountId,
    planEvidence,
  });
  checkFreeAccount(snapshot, 'staging', Date.now(), 1);
  return JSON.stringify(snapshot);
}
async function command(file, ...args) {
  const result = spawnSync(process.execPath, [`scripts/${file}.mjs`, ...args], {
    stdio: 'inherit',
    timeout: 300000,
    env: { ...process.env, CF_ACCOUNT_EVIDENCE: await evidence() },
  });
  if (result.status !== 0) throw new Error('STAGING_DIAGNOSTIC_COMMAND_FAILED');
}
const name = resources.staging.workerName;
const deployment = await api('GET', `/workers/scripts/${name}/deployments`);
const prior = deployment.deployments?.[0]?.versions;
if (
  prior?.length !== 1 ||
  prior[0].percentage !== 100 ||
  !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(prior[0].version_id)
)
  throw new Error('Stable staging rollback version required');
const subdomain = await api('GET', '/workers/subdomain');
if (!/^[a-z0-9-]+$/.test(subdomain.subdomain))
  throw new Error('Invalid worker subdomain');
const base = `https://${name}.${subdomain.subdomain}.workers.dev`;
await command('staging-health-probe', '--apply');
try {
  await command('cloudflare', 'benchmark', 'staging');
  const version = (await api('GET', `/workers/scripts/${name}/deployments`))
    .deployments?.[0]?.versions?.[0]?.version_id;
  console.log(
    JSON.stringify({
      phase: 'benchmark-start',
      at: new Date().toISOString(),
      version,
      synthetic: true,
    }),
  );
  for (const format of ['rss', 'atom', 'html', 'sitemap', 'ssrf']) {
    // Three fixed invocations per parser; no supplied URLs or external website requests.
    for (let i = 0; i < (format === 'ssrf' ? 1 : 3); i++) {
      const response = await fetch(`${base}/benchmark/${format}`, {
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      const body = await response.json();
      if (
        !response.ok ||
        (format === 'ssrf'
          ? body.code !== 'dns-protection-unavailable' ||
            body.externalRequests !== 0
          : body.format !== format ||
            body.candidates !== 1 ||
            body.externalRequests !== 0 ||
            body.dbRowsRead !== 1 ||
            body.dbRowsWritten !== 0 ||
            body.synthetic !== true)
      )
        throw new Error('STAGING_BENCHMARK_FAILED');
      console.log(
        JSON.stringify({
          phase: 'benchmark-sample',
          at: new Date().toISOString(),
          version,
          ...body,
        }),
      );
    }
  }
} finally {
  // Worker version rollback does not roll back D1. The benchmark only SELECTs.
  await command('cloudflare', 'rollback', 'staging', prior[0].version_id);
  const restored = await verifyDeploymentVersion(
    () => api('GET', `/workers/scripts/${name}/deployments`),
    prior[0].version_id,
  );
  const health = await verifyDeploymentHealth(`${base}/health`, 'staging');
  console.log(
    JSON.stringify({
      phase: 'normal-version-restored',
      version: prior[0].version_id,
      restored,
      health,
    }),
  );
}
