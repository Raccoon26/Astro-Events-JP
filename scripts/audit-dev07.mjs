import { existsSync, readFileSync } from 'node:fs';
import { regressionFileMatches } from './regression-baseline.mjs';

const read = (name) => JSON.parse(readFileSync(name, 'utf8'));
const baseline = read('data/dev07-baseline.json');
if (
  baseline.main !== '632822aa898218d63255a3dc6b3a1edcb94df306' ||
  baseline.tests !== 708 ||
  baseline.testFiles !== 49 ||
  Object.keys(baseline.files).filter((name) => name.startsWith('migrations/'))
    .length !== 8 ||
  Object.keys(baseline.files).filter((name) =>
    /\.test\.(?:ts|mjs)$/u.test(name),
  ).length !== 49
)
  throw Error('DEV07_BASELINE_INVALID');
for (const [file, hash] of Object.entries(baseline.files))
  if (!regressionFileMatches(file, hash))
    throw Error('DEV07_BASELINE_CHANGED: ' + file);

const audit = read('dev07-coverage.json');
for (const [items, keys] of [
  [audit.sections, Array.from({ length: 20 }, (_, i) => String(i))],
  [
    audit.requirements,
    Array.from({ length: 32 }, (_, i) => 'R' + String(i + 1).padStart(2, '0')),
  ],
])
  for (const key of keys) {
    const item = items[key];
    if (
      !item?.status ||
      !item.evidence?.length ||
      item.evidence.some((file) => !existsSync(file))
    )
      throw Error('DEV07_COVERAGE_MISSING: ' + key);
  }
if (
  Object.values(audit.operation).some((value) => value !== false && value !== 0)
)
  throw Error('DEV07_OPERATION_SCOPE_CHANGED');
const config = read('wrangler.jsonc');
if (
  Object.values(config.env).some(
    (env) =>
      env.vars.COLLECTION_ENABLED !== 'false' ||
      env.vars.NOTIFICATIONS_ENABLED !== 'false',
  ) ||
  config.env.production.triggers.crons.length !== 0 ||
  read('data/sources.json').some((entry) => entry.state === 'active')
)
  throw Error('DEV07_OPERATION_ENABLED');
for (const file of [
  'src/index.ts',
  'src/notifications/index.ts',
  '.github/workflows/deploy.yml',
]) {
  if (
    /installation-auth|canonicalEvent|0009_event_tracking|tracking-init/u.test(
      readFileSync(file, 'utf8'),
    )
  )
    throw Error('DEV07_OPERATION_WIRING: ' + file);
}
console.log(
  'DEV07 preserves 708 tests/49 test files and migrations 0001–0008; sections 0–19 and R01–R32 audited. External writes and remote tracking remain disabled.',
);
