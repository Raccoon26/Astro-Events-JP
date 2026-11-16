import { describe, expect, it } from 'vitest';
import { workerStartupMs } from '../scripts/deployment-health.mjs';

describe('separate official Worker startup evidence from request CPU', () => {
  it('accepts CLI color codes without returning any other captured text', () =>
    expect(
      workerStartupMs(
        '\u001b[32mWorker Startup Time: \u001b[39m24 ms\nprivate',
      ),
    ).toBe(24));
  it('extracts only startup milliseconds from captured Wrangler output', () =>
    expect(workerStartupMs('Worker Startup Time: 24 ms\ninternal data')).toBe(
      24,
    ));
  it.each([
    'CPU wall time: 24 ms',
    'Worker Startup Time: NaN ms',
    'Worker Startup Time: -1 ms',
    'Worker Startup Time: 1001 ms',
  ])('does not certify absent/invalid startup evidence: %s', (text) =>
    expect(workerStartupMs(text)).toBeNull(),
  );
});
