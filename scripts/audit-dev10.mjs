import { existsSync, readFileSync } from 'node:fs';
import { regressionFileMatches } from './regression-baseline.mjs';

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const baseline = read('data/dev10-baseline.json'),
  files = Object.keys(baseline.files);
const protectedPaths = [
  'src/index.ts',
  'wrangler.jsonc',
  '.github/workflows/deploy.yml',
];
if (
  baseline.main !== '18787b2c74aa4ede382b0d6c193cf5894c1b2a02' ||
  baseline.tests !== 797 ||
  baseline.testFiles !== 58 ||
  files.filter((p) => /\.test\.(?:ts|mjs)$/u.test(p)).length !== 58 ||
  files.filter((p) => p.startsWith('migrations/')).length !== 11 ||
  !protectedPaths.every((p) => files.includes(p))
)
  throw Error('DEV10_BASELINE');
for (const path of files)
  if (!regressionFileMatches(path, baseline.files[path]))
    throw Error('DEV10_PRESERVATION: ' + path);
const audit = read('dev10-coverage.json');
for (const [list, keys] of [
  [audit.sections, Array.from({ length: 19 }, (_, i) => i)],
  [
    audit.requirements,
    Array.from({ length: 32 }, (_, i) => 'R' + String(i + 1).padStart(2, '0')),
  ],
])
  for (const key of keys) {
    const row = list[key];
    if (
      !row?.status ||
      !row.evidence.length ||
      row.evidence.some((p) => !existsSync(p))
    )
      throw Error('DEV10_EVIDENCE: ' + key);
  }
const cfg = read('wrangler.release.jsonc');
if (
  cfg.main !== 'src/release/worker.ts' ||
  cfg.workers_dev !== false ||
  cfg.preview_urls !== false ||
  cfg.routes?.length !== 0 ||
  cfg.triggers?.crons?.length !== 0 ||
  cfg.d1_databases ||
  cfg.services ||
  cfg.env ||
  cfg.vars.RELEASE_MODE !== 'off' ||
  cfg.vars.RELEASE_AUTH_APPROVED !== 'false' ||
  cfg.vars.COLLECTION_ENABLED !== 'false' ||
  cfg.vars.NOTIFICATIONS_ENABLED !== 'false' ||
  Object.values(audit.operational).some((x) => x !== false && x !== 0) ||
  read('data/sources.json').some((row) => row.state === 'active')
)
  throw Error('DEV10_RELEASE_MUST_REMAIN_DISABLED');
console.log(
  'DEV10: preserved 797 tests, 0001–0011, deployed configuration and entrypoint. R01–R32 and 0–18 reviewed. Separate release Worker defaults off.',
);
