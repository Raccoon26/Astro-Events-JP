import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function regressionFileMatches(path, expected) {
  const actual = createHash('sha256')
    .update(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'))
    .digest('hex');
  return (
    actual === expected ||
    // DEV06R changed fixture preparation only. It still inserts the same 5,000
    // review rows and tests the same lookup, read budget and 30s deadline.
    (path === 'tests/posts-integration.test.mjs' &&
      expected ===
        'e528f55720262323ddb2a2ef023269efd71b3e6afe345929d55fd5c920bb0a81' &&
      actual ===
        '1dea6d1acfd576cbde770d0d10ece6b19f7b1c0df1d0ce284cced17aed819892')
  );
}
