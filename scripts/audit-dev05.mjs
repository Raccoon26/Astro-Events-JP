import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const baseline = JSON.parse(readFileSync('data/dev05-baseline.json', 'utf8'));
if (baseline.tests !== 350 || baseline.testFiles !== 25)
  throw new Error('DEV04 baseline inventory changed');
for (const [file, hash] of Object.entries(baseline.files)) {
  let text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  if (file === 'tests/verification-policy.test.ts') {
    // Exactly one version expectation changes. Every original assertion and fixture remains intact.
    if (text.split("ruleVersion: 'dev04-3'").length !== 2)
      throw new Error('Expected one documented rule-version assertion update');
    text = text.replace("ruleVersion: 'dev04-3'", "ruleVersion: 'dev04-2'");
  }
  if (createHash('sha256').update(text).digest('hex') !== hash)
    throw new Error(
      `Prior test/fixture changed: ${file}; review its original purpose before updating the baseline`,
    );
}
const coverage = JSON.parse(readFileSync('dev05-coverage.json', 'utf8'));
for (let i = 0; i <= 21; i++) {
  const item = coverage.sections[i];
  if (
    !item?.status ||
    !item.evidence?.length ||
    item.evidence.some((file) => !existsSync(file))
  )
    throw new Error('Unmapped DEV05 section ' + i);
}
for (let i = 1; i <= 32; i++) {
  const id = 'R' + String(i).padStart(2, '0'),
    item = coverage.requirements[id];
  if (
    !item?.status ||
    !item.evidence?.length ||
    item.evidence.some((file) => !existsSync(file))
  )
    throw new Error('Uncovered DEV05 requirement ' + id);
}
if (
  coverage.realEvents !== 0 ||
  coverage.remoteMigrations !== false ||
  Object.keys(coverage.remaining).length !== 6
)
  throw new Error('DEV05 boundaries changed');
console.log(
  `DEV05: sections0–21/R01–R32, original350 test purposes (${baseline.testFiles - 1} unchanged test files; one ruleVersion assertion updated 2→3), fixtures and later scope preserved. Semantic/Japanese review remains separate.`,
);
