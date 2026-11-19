import { expect, it } from 'vitest';
import { SafeHttpCollector } from '../src/collection/http';
import { unavailableTransport } from '../src/collection/types';
import { fingerprintExpiry } from '../src/notifications/publication';
import {
  approvalFixture,
  fixtureTransport,
  pageResponse,
  sourceFixture,
} from './collection-fixtures';

it.each([
  ['2028-02-29T13:14:15.000Z', '2030-02-28T13:14:15.000Z'],
  ['2026-11-18T01:02:03.000Z', '2028-11-18T01:02:03.000Z'],
])('clamps two calendar years from %s', (input, expected) => {
  expect(fingerprintExpiry(Date.parse(input))).toBe(expected);
});
it('rejects invalid retention timestamps', () => {
  expect(() => fingerprintExpiry(NaN)).toThrow('INVALID_RETENTION_DATE');
});
it.each(['unavailable', 'fixture'] as const)(
  'unsupported %s transport fails closed even after the approval expires',
  async (kind) => {
    const calls: string[] = [];
    const transport =
      kind === 'fixture'
        ? fixtureTransport(() => pageResponse(), calls)
        : unavailableTransport;
    const collector = new SafeHttpCollector(
      transport,
      approvalFixture(),
      {},
      false,
      () => Date.parse('2030-01-01T00:00:00Z'),
    );
    await expect(
      collector.fetchDocument(sourceFixture(), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'dns-protection-unavailable' });
    expect(calls).toEqual([]);
  },
);
