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
const end = process.argv[4] ? new Date(process.argv[4]) : new Date();
const start = process.argv[3]
  ? new Date(process.argv[3])
  : new Date(end.toISOString().slice(0, 10) + 'T00:00:00Z');
if (
  !Number.isFinite(start.getTime()) ||
  !Number.isFinite(end.getTime()) ||
  start >= end ||
  end.getTime() > Date.now() + 60000
)
  throw new Error('Invalid metrics window');
const query = `query Metrics($accountTag:string!,$start:string!,$end:string!,$script:string!){unit:__type(name:"AccountWorkersInvocationsAdaptiveQuantiles"){fields{name description}} viewer{accounts(filter:{accountTag:$accountTag}){workersInvocationsAdaptive(limit:1000,filter:{scriptName:$script,datetime_geq:$start,datetime_leq:$end}){sum{requests errors subrequests}quantiles{cpuTimeP50 cpuTimeP99 memoryUsageBytesP50 memoryUsageBytesP99}dimensions{status eventType scriptVersion}} workersInvocationsScheduled(limit:100,filter:{scriptName:$script,datetime_geq:$start,datetime_leq:$end}){cron scheduledDatetime datetime cpuTimeUs status}}}}`;
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
const unitFields = json.data?.unit?.fields;
if (
  !Array.isArray(unitFields) ||
  !['cpuTimeP50', 'cpuTimeP99'].every((name) =>
    unitFields.some(
      (field) => field.name === name && /microseconds/.test(field.description),
    ),
  )
)
  throw new Error('CPU_METRIC_UNIT_UNVERIFIED');
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
    'microseconds; live GraphQL introspection verified. ms = raw / 1000',
  scheduledExecutions: json.data.viewer.accounts[0].workersInvocationsScheduled,
  groups: groups.map((group) => ({
    status: group.dimensions?.status,
    eventType: group.dimensions?.eventType,
    scriptVersion: group.dimensions?.scriptVersion,
    requests: group.sum?.requests,
    errors: group.sum?.errors,
    subrequests: group.sum?.subrequests,
    cpuTimeP50Raw: group.quantiles?.cpuTimeP50,
    cpuTimeP99Raw: group.quantiles?.cpuTimeP99,
    cpuTimeP50Ms: group.quantiles?.cpuTimeP50 / 1000,
    cpuTimeP99Ms: group.quantiles?.cpuTimeP99 / 1000,
    memoryUsageP50Bytes: group.quantiles?.memoryUsageBytesP50 ?? null,
    memoryUsageP99Bytes: group.quantiles?.memoryUsageBytesP99 ?? null,
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
