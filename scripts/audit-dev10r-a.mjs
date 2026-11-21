import { existsSync, readFileSync } from 'node:fs';
import { regressionFileMatches } from './regression-baseline.mjs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const baseline = read('data/dev10r-a-baseline.json');
const audit = read('dev10r-a-coverage.json');
const files = Object.keys(baseline.files);

if (
  baseline.main !== 'e3378e64cd7b18e2007315517371bccf60ed6f0d' ||
  baseline.tests !== 810 ||
  baseline.testFiles !== 60 ||
  files.filter((path) => /\.test\.(?:ts|mjs)$/u.test(path)).length !== 60 ||
  files.filter((path) => path.startsWith('migrations/')).length !== 12
)
  throw new Error('DEV10R-A baseline is incomplete');
for (const path of files)
  if (!regressionFileMatches(path, baseline.files[path]))
    throw new Error('DEV10R-A preservation: ' + path);
for (const [items, keys] of [
  [audit.sections, Array.from({ length: 14 }, (_, i) => i)],
  [
    audit.requirements,
    Array.from({ length: 32 }, (_, i) => 'R' + String(i + 1).padStart(2, '0')),
  ],
])
  for (const key of keys) {
    const row = items[key];
    if (
      !row?.status ||
      !row.evidence.length ||
      row.evidence.some((path) => !existsSync(path))
    )
      throw new Error('DEV10R-A audit evidence: ' + key);
  }
const seed = read('data/sources.json');
if (
  seed.length !== 114 ||
  seed.filter((row) => row.officialStatus === 'Verified').length !== 95 ||
  seed.some((row) => row.state === 'active') ||
  Object.values(audit.remote).some((value) => value !== 0 && value !== false)
)
  throw new Error('DEV10R-A collection must stay disabled');
console.log(
  'DEV10R-A: 810 original tests, migrations 0001–0012 and deployed Worker gates preserved. R01–R32 and sections 0–13 audited.',
);
