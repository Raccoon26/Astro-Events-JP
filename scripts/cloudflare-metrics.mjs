import { readFileSync, writeFileSync } from 'node:fs';
import { getCloudflareToken } from './cloudflare-client.mjs';
import {
  readConfig,
  validateBindings,
  validateEnvironment,
} from './cloudflare-policy.mjs';
import { preflight } from './path-policy.mjs';

const state = preflight();
const target = validateEnvironment(process.argv[2]);
const resources = JSON.parse(readFileSync('cloudflare-resources.json', 'utf8'));
validateBindings(readConfig(), resources, true);
const end = new Date();
const start = new Date(end);
start.setUTCHours(0, 0, 0, 0);
const query = `query Metrics($accountTag:string!,$start:string!,$end:string!,$script:string!){viewer{accounts(filter:{accountTag:$accountTag}){workersInvocationsAdaptive(limit:1000,filter:{scriptName:$script,datetime_geq:$start,datetime_leq:$end}){sum{requests errors subrequests}quantiles{cpuTimeP50 cpuTimeP99}dimensions{status}}}}}`;
const token = getCloudflareToken();
let response;
try {
  response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        accountTag: resources.accountId,
        start: start.toISOString(),
        end: end.toISOString(),
        script: resources[target].workerName,
      },
    }),
  });
} catch {
  throw new Error('CLOUDFLARE_METRICS_NETWORK_FAILED');
}
let json;
try {
  json = await response.json();
} catch {
  throw new Error('CLOUDFLARE_METRICS_INVALID_RESPONSE');
}
const groups = json.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
if (
  !response.ok ||
  json.errors?.length ||
  !Array.isArray(groups) ||
  !groups.length ||
  groups.length >= 1000
)
  throw new Error(
    'CPU metrics unavailable, empty or incomplete; do not substitute wall time',
  );
const report = {
  at: end.toISOString(),
  target,
  source: 'Cloudflare GraphQL workersInvocationsAdaptive',
  start: start.toISOString(),
  end: end.toISOString(),
  scope: 'project Worker only; not account-wide budget evidence',
  cpuMetricUnit:
    'raw provider schema unit; verify schema description before conversion to ms',
  groups: groups.map((group) => ({
    status: group.dimensions?.status,
    requests: group.sum?.requests,
    errors: group.sum?.errors,
    subrequests: group.sum?.subrequests,
    cpuTimeP50Raw: group.quantiles?.cpuTimeP50,
    cpuTimeP99Raw: group.quantiles?.cpuTimeP99,
  })),
};
if (
  report.groups.some(
    (group) =>
      ![
        group.requests,
        group.errors,
        group.subrequests,
        group.cpuTimeP50Raw,
        group.cpuTimeP99Raw,
      ].every((value) => Number.isFinite(value) && value >= 0),
  )
)
  throw new Error('Incomplete metrics; no baseline certified');
if (state.localDriveVerified)
  writeFileSync(
    `${state.root}/reports/cloudflare-cpu-${target}-${Date.now()}.json`,
    JSON.stringify(report, null, 2),
    { flag: 'wx' },
  );
console.log(JSON.stringify(report));
