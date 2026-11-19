import { readFileSync } from 'node:fs';
import { regressionFileMatches } from './regression-baseline.mjs';

const baseline = JSON.parse(readFileSync('data/dev06r-baseline.json', 'utf8'));
if (baseline.tests !== 696 || baseline.testFiles !== 48)
  throw Error('DEV06R baseline inventory changed');
for (const [file, expected] of Object.entries(baseline.files)) {
  if (!regressionFileMatches(file, expected))
    throw Error(`DEV06R baseline file changed: ${file}`);
}
for (const file of [
  'src/index.ts',
  'src/notifications/index.ts',
  'scripts/notifications.mjs',
  '.github/workflows/deploy.yml',
]) {
  if (
    /live-plan|live-providers|live-session|dev06r-secret|scripts\/dev06r\.mjs/u.test(
      readFileSync(file, 'utf8'),
    )
  )
    throw Error(
      `DEV06R live trial linked into the normal application: ${file}`,
    );
}
console.log(
  'DEV06R: preserved 696 original tests/48 test files and migrations 0001–0008. The standalone live trial stays separate from Worker entrypoints and simulation.',
);
