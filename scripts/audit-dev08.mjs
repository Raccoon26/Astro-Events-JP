import { existsSync, readFileSync } from 'node:fs';
import { regressionFileMatches } from './regression-baseline.mjs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const baseline = read('data/dev08-baseline.json');
if (
  baseline.main !== '3e80d77e678356da025ed4a0072aac9a406ee0f2' ||
  baseline.tests !== 743 ||
  baseline.testFiles !== 52 ||
  Object.keys(baseline.files).filter((p) => p.startsWith('migrations/'))
    .length !== 9 ||
  Object.keys(baseline.files).filter((p) => /\.test\.(?:ts|mjs)$/u.test(p))
    .length !== 52
)
  throw Error('DEV08_BASELINE_INVALID');
for (const [file, hash] of Object.entries(baseline.files))
  if (!regressionFileMatches(file, hash))
    throw Error('DEV08_BASELINE_CHANGED: ' + file);
const audit = read('dev08-coverage.json');
for (const [entries, ids] of [
  [audit.sections, Array.from({ length: 20 }, (_, i) => i + 1)],
  [
    audit.requirements,
    Array.from({ length: 32 }, (_, i) => 'R' + String(i + 1).padStart(2, '0')),
  ],
])
  for (const id of ids) {
    const a = entries[id];
    if (
      !a?.status ||
      !a.evidence?.length ||
      a.evidence.some((p) => !existsSync(p))
    )
      throw Error('DEV08_COVERAGE_MISSING: ' + id);
  }
const sources = read('data/sources.json'),
  added = sources.filter((s) => s.researchPhase === 'dev08'),
  coverage = read('data/coverage.json');
if (
  added.length !== 18 ||
  sources.length !== 114 ||
  coverage.verified !== 95 ||
  coverage.prefectures.filter((p) => p.verified === 1).length !== 8 ||
  added.some(
    (s) =>
      s.state !== 'review' ||
      s.officialStatus !== 'Verified' ||
      s.termsStatus !== 'not-reviewed' ||
      s.robotsStatus !== 'not-checked' ||
      new URL(s.url).protocol !== 'https:',
  )
)
  throw Error('DEV08_SOURCE_EVIDENCE_OR_STATE');
if (
  sources.some((s) => s.state === 'active') ||
  Object.values(audit.operational).some((v) => v !== false && v !== 0)
)
  throw Error('DEV08_OPERATING_BOUNDARY');
const config = read('wrangler.jsonc');
if (
  config.env.production.triggers.crons.length ||
  Object.values(config.env).some(
    (e) =>
      e.vars.COLLECTION_ENABLED !== 'false' ||
      e.vars.NOTIFICATIONS_ENABLED !== 'false',
  )
)
  throw Error('DEV08_FLAGS');
for (const file of ['src/index.ts', '.github/workflows/deploy.yml'])
  if (
    /nationwide\/(?:scheduler|weekend)|nationwide-management|0010_nationwide_weekends/u.test(
      readFileSync(file, 'utf8'),
    )
  )
    throw Error('DEV08_RUNTIME_WIRING');
console.log(
  'DEV08 preserves 743 tests/52 files and migrations 0001–0009, audits sections 1–20 and R01–R32, and keeps active sources, live delivery and remote migrations disabled.',
);
