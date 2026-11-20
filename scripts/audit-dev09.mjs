import { existsSync, readFileSync } from 'node:fs';
import { regressionFileMatches } from './regression-baseline.mjs';

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const baseline = read('data/dev09-baseline.json');
if (
  baseline.main !== '7dd75ce4297e7df3ef6e28d3109af3e3c8fdd7da' ||
  baseline.tests !== 766 ||
  baseline.testFiles !== 54 ||
  Object.keys(baseline.files).filter((p) => p.startsWith('migrations/'))
    .length !== 10 ||
  Object.keys(baseline.files).filter((p) => /\.test\.(?:mjs|ts)$/u.test(p))
    .length !== 54
)
  throw Error('DEV09_BASELINE_INVALID');
for (const [path, expected] of Object.entries(baseline.files))
  if (!regressionFileMatches(path, expected))
    throw Error('DEV09_BASELINE_CHANGED: ' + path);
const manifest = read('dev09-coverage.json');
const inspect = (list, keys) => {
  for (const key of keys) {
    const row = list[key];
    if (
      !row?.status ||
      !row.evidence?.length ||
      row.evidence.some((p) => !existsSync(p))
    )
      throw Error('DEV09_EVIDENCE_MISSING: ' + key);
  }
};
inspect(
  manifest.sections,
  Array.from({ length: 21 }, (_, i) => i),
);
inspect(
  manifest.requirements,
  Array.from({ length: 32 }, (_, i) => 'R' + String(i + 1).padStart(2, '0')),
);
const config = read('wrangler.jsonc');
if (
  Object.values(manifest.operational).some((v) => v !== false && v !== 0) ||
  config.env.production.triggers.crons.length !== 0 ||
  JSON.stringify(config.env.staging.triggers.crons) !== '["0 */3 * * *"]' ||
  Object.values(config.env).some(
    (e) =>
      e.vars.COLLECTION_ENABLED !== 'false' ||
      e.vars.NOTIFICATIONS_ENABLED !== 'false',
  ) ||
  read('data/sources.json').some((s) => s.state === 'active')
)
  throw Error('DEV09_RUNTIME_BOUNDARY');
for (const file of ['src/index.ts', '.github/workflows/deploy.yml'])
  if (/(?:operations\/|0011_automation)/u.test(readFileSync(file, 'utf8')))
    throw Error('DEV09_REMOTE_ACTIVATION');
console.log(
  'DEV09: preserved 766 tests/54 files and migrations 0001–0010. Sections 0–20 and R01–R32 mapped. Remote activation and data changes remain disabled.',
);
