import { describe, expect, it } from 'vitest';
import type { PostKind } from '../src/domain';
import {
  officialMeasure,
  scalarText,
  validateLength,
} from '../src/posts/length';
import corpus from '../src/posts/profile-corpus.json';
import { renderPost } from '../src/posts/render';
import type { DetailedVerifiedEvent } from '../src/verification/types';

describe('DEV05R optimization preserves every fixed synthetic rendering', () => {
  it('retains the original size rejection when NFC expands scalar input', () => {
    const input = '\u0344'.repeat(4097);
    expect(input.length).toBeLessThan(8192);
    expect(input.normalize('NFC').length).toBeGreaterThan(8192);
    expect(() => officialMeasure(input.normalize('NFC'))).toThrow(
      'unsafe-input',
    );
    expect(validateLength(input)).toEqual({
      weightedLength: -1,
      valid: false,
      remaining: null,
    });
  });
  it.each(corpus.cases)(
    '$id is byte-identical to the DEV05 baseline',
    async (c) => {
      expect(
        await renderPost(
          c.event as DetailedVerifiedEvent,
          1,
          c.kind as PostKind,
          c.now,
        ),
      ).toEqual(c.expected);
    },
  );
  it('retains all 13 kinds and independent near-limit/emoji/URL/recomposition workloads', () => {
    expect(new Set(corpus.cases.map((c) => c.kind)).size).toBe(13);
    expect(
      corpus.cases.find((c) => c.id === 'near-limit')!.expected.weightedLength,
    ).toBeGreaterThanOrEqual(278);
    expect(
      corpus.cases
        .find((c) => c.id === 'recompose')!
        .expected.omitted.some((o) => o.reason === 'weighted-length-budget'),
    ).toBe(true);
  });
  it('the UTF-16 loop is equivalent to the prior scalar-codepoint policy', () => {
    const old = (s: string) =>
      s.length <= 8192 &&
      ![...s].some((c) => {
        const cp = c.codePointAt(0)!;
        return cp >= 0xd800 && cp <= 0xdfff;
      });
    const accepts = (s: string) => {
      try {
        scalarText(s);
        return true;
      } catch {
        return false;
      }
    };
    for (let cp = 0; cp <= 0x10ffff; cp += 113) {
      const s = String.fromCodePoint(cp);
      expect(accepts(s)).toBe(old(s));
    }
    for (let a = 0xd7ff; a <= 0xe000; a++) {
      for (const b of [0, 0xd7ff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xe000]) {
        const s = String.fromCharCode(a, b);
        expect(accepts(s)).toBe(old(s));
      }
    }
    for (const s of [
      'a'.repeat(8192),
      'a'.repeat(8193),
      '🌙'.repeat(4096),
      '🌙'.repeat(4097),
    ])
      expect(accepts(s)).toBe(old(s));
  });
});
