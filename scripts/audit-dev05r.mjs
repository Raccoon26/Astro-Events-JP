import fs from 'node:fs';
import { regressionFileMatches } from './regression-baseline.mjs';

const baseline = JSON.parse(
  fs.readFileSync('data/dev05r-baseline.json', 'utf8'),
);
if (baseline.tests !== 539 || baseline.testFiles !== 32)
  throw Error('DEV05R_BASELINE_CHANGED');
for (const [file, hash] of Object.entries(baseline.files))
  if (!regressionFileMatches(file, hash))
    throw Error('DEV05R_REGRESSION_FILE_CHANGED: ' + file);
const audit = JSON.parse(fs.readFileSync('dev05r-coverage.json', 'utf8'));
for (const key of [
  ...Array.from({ length: 13 }, (_, i) => String(i)),
  ...Array.from({ length: 32 }, (_, i) => 'R' + String(i + 1).padStart(2, '0')),
]) {
  const item = audit[key];
  if (
    !item?.status ||
    !item.evidence?.length ||
    item.evidence.some((f) => !fs.existsSync(f))
  )
    throw Error('DEV05R_COVERAGE_MISSING: ' + key);
}
if (
  audit.productionChanged !== false ||
  audit.remoteMigrations !== false ||
  audit.realSiteRequests !== 0
)
  throw Error('DEV05R_BOUNDARY_CHANGED');
console.log(
  'DEV05R original539 purposes/32 files and migrations0001–0007 preserved; R01–R32/sections0–12 mapped. Remote CPU success is separate evidence.',
);
