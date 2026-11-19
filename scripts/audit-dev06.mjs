import { existsSync, readFileSync } from 'node:fs';
import { regressionFileMatches } from './regression-baseline.mjs';

const baseline = JSON.parse(readFileSync('data/dev06-baseline.json', 'utf8'));
if (baseline.tests !== 597 || baseline.testFiles !== 39)
  throw Error('DEV06_BASELINE_CHANGED');
for (const [file, hash] of Object.entries(baseline.files))
  if (!regressionFileMatches(file, hash))
    throw Error('DEV06_REGRESSION_CHANGED: ' + file);
const audit = JSON.parse(readFileSync('dev06-coverage.json', 'utf8'));
for (const key of [
  ...Array.from({ length: 27 }, (_, i) => String(i)),
  ...Array.from({ length: 32 }, (_, i) => 'R' + String(i + 1).padStart(2, '0')),
]) {
  const item = audit[key];
  if (
    !item?.status ||
    !item.evidence?.length ||
    item.evidence.some((f) => !existsSync(f))
  )
    throw Error('DEV06_COVERAGE_MISSING: ' + key);
}
if (
  audit.realNotifications !== 0 ||
  audit.remoteMigrations !== false ||
  audit.productionChanged !== false ||
  audit.realSiteRequests !== 0
)
  throw Error('DEV06_BOUNDARY_CHANGED');
const operational = readFileSync('src/index.ts', 'utf8');
if (/from ['"].*notifications|telegram.*webhook/i.test(operational))
  throw Error('DEV06_OPERATIONAL_ROUTE_ENABLED');
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
for (const env of Object.values(config.env))
  if (
    env.vars.COLLECTION_ENABLED !== 'false' ||
    env.vars.NOTIFICATIONS_ENABLED !== 'false'
  )
    throw Error('DEV06_FLAGS_ENABLED');
for (const file of [
  'NOTIFICATION_DESIGN',
  'TELEGRAM_MESSAGE_POLICY',
  'TELEGRAM_CALLBACK_SECURITY',
  'GITHUB_REPORTS_POLICY',
  'GITHUB_EMAIL_NOTIFICATION',
  'DELIVERY_OUTBOX_DESIGN',
  'DELIVERY_RECOVERY',
  'DEV06_TEST_REPORT',
  'DEV06_COMPLETION',
  'NOTIFICATION_SAMPLES',
])
  if (readFileSync(file + '.md', 'utf8').length < 200)
    throw Error('DEV06_DOCUMENT_MISSING');
console.log(
  'DEV06 original597 purposes/39 files and migrations0001–0007 preserved; sections0–26 and R01–R32 mapped; live send/remote migration/production change disabled. Remote receipt and CPU remain unverified.',
);
