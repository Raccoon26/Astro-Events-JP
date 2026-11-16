import fs from 'node:fs';
import path from 'node:path';
import { getCloudflareToken } from './cloudflare-client.mjs';
import { correlateCpu, queryCpuMetrics } from './cpu-metrics.mjs';
import { assertNoLinks, preflight } from './path-policy.mjs';

const state = preflight();
if (!state.localDriveVerified || process.argv.length !== 3)
  throw Error('EXPLICIT_E_REPORT_REQUIRED');
const file = path.resolve(process.argv[2]),
  directory = path.resolve(state.root, 'reports');
if (
  path.dirname(file) !== directory ||
  !/^dev05r-matrix-(?:remote-)?\d+\.json$/.test(path.basename(file))
)
  throw Error('REPORT_PATH_REFUSED');
assertNoLinks(file);
if (fs.statSync(file).size > 2000000) throw Error('REPORT_TOO_LARGE');
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
if (
  !report.synthetic ||
  !Array.isArray(report.samples) ||
  report.samples.length > 340 ||
  !report.versions?.optimized ||
  !Object.keys(report.versions).every(
    (k) =>
      ['baseline', 'optimized'].includes(k) &&
      /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(
        report.versions?.[k] ?? '',
      ),
  ) ||
  !(Date.parse(report.end) > Date.parse(report.start)) ||
  Date.parse(report.end) - Date.parse(report.start) > 20 * 60000
)
  throw Error('INVALID_MATRIX_REPORT');
const resources = JSON.parse(
  fs.readFileSync('cloudflare-resources.json', 'utf8'),
);
const metrics = await queryCpuMetrics({
  token: getCloudflareToken(),
  accountId: resources.accountId,
  scriptName: 'astro-events-jp-staging',
  start: report.start,
  end: report.end,
});
const correlated = correlateCpu(metrics, report.samples, report.versions);
const aggregates = {};
for (const implementation of Object.keys(report.versions)) {
  const phase = report.phases.find((p) => p.implementation === implementation);
  const last = report.samples
    .filter((s) => s.implementation === implementation)
    .at(-1);
  const start = new Date(
    Math.ceil(Date.parse(phase.start) / 1000) * 1000,
  ).toISOString();
  const end = new Date(
    Math.floor(Date.parse(phase.end ?? last.receivedAt) / 1000) * 1000,
  ).toISOString();
  aggregates[implementation] = {
    start,
    end,
    ...(await queryCpuMetrics({
      token: getCloudflareToken(),
      accountId: resources.accountId,
      scriptName: 'astro-events-jp-staging',
      start,
      end,
      grouped: false,
      scriptVersion: report.versions[implementation],
    })),
  };
}
const output = directory + `/dev05r-matrix-analysis-${Date.now()}.json`;
fs.writeFileSync(
  output,
  JSON.stringify({ ...report, metrics, correlated, aggregates }, null, 2),
  { flag: 'wx' },
);
console.log(
  JSON.stringify({
    file: output,
    summary: correlated.summary,
    cohorts: correlated.cohorts,
    complete: correlated.complete,
    providerAggregates: aggregates,
  }),
);
