import { expect, it } from 'vitest';
import { workerVersionId } from '../scripts/deployment-health.mjs';
import { wranglerFailure } from '../scripts/wrangler-failure.mjs';

it.each([
  [
    { status: 1, stderr: 'network ECONNRESET private credential value' },
    'NETWORK',
  ],
  [{ status: null, error: { code: 'ETIMEDOUT' } }, 'TIMEOUT'],
  [{ status: 1, stderr: 'script startup CPU time limit' }, 'STARTUP_LIMIT'],
  [{ status: 1, stderr: 'authentication failed' }, 'AUTH'],
  [
    { status: 1, stderr: '[code: 10021] validation details secret' },
    'PROVIDER',
  ],
])(
  'returns only stable categories and numeric provider codes',
  (result, category) => {
    const safe = wranglerFailure(result);
    expect(safe.category).toBe(category);
    expect(Object.keys(safe)).toEqual(['category', 'exitCode', 'providerCode']);
    expect(JSON.stringify(safe)).not.toMatch(
      /private|credential|secret|details/,
    );
  },
);
it('pins one exact uploaded version rather than trusting a potentially stale latest GET', () => {
  const id = '1d200e4d-842e-42e2-9b54-648ec687cf79';
  expect(workerVersionId('Current Version ID: ' + id)).toBe(id);
  expect(workerVersionId('Worker Startup Time: 22 ms')).toBeNull();
  expect(
    workerVersionId(
      'Current Version ID: ' + id + '\nCurrent Version ID: ' + id,
    ),
  ).toBeNull();
  expect(workerVersionId('Current Version ID: private-value')).toBeNull();
});
