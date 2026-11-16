import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import configs from 'twitter-text/dist/esm/configs.js';
import parseTweet from 'twitter-text/dist/esm/parseTweet.js';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  officialMeasure,
  plain,
  validateLength,
  X_CONFIG,
} from '../src/posts/length';

const fixtures = parse(
  readFileSync('tests/fixtures/twitter-text/validate.yml', 'utf8'),
).tests as Record<
  string,
  { text: string; expected: Record<string, unknown>; description: string }[]
>;
describe('pinned upstream twitter-text conformance (unmodified Apache-2.0 fixtures)', () => {
  for (const [group, options] of [
    ['WeightedTweetsWithDiscountedEmojiCounterTest', X_CONFIG],
    ['WeightedTweetsCounterTest', configs.version2],
    ['UnicodeDirectionalMarkerCounterTest', X_CONFIG],
  ] as const) {
    it.each(fixtures[group]!)(`${group}: $description`, (fixture) => {
      expect(parseTweet(fixture.text, options)).toMatchObject(fixture.expected);
      if (group !== 'WeightedTweetsCounterTest') {
        if (fixture.text.length > 8192)
          expect(() => officialMeasure(fixture.text)).toThrow('unsafe-input');
        else
          expect(officialMeasure(fixture.text)).toMatchObject(fixture.expected);
      }
    });
  }
  it('verifies fixture hashes and runtime config against the pinned upstream bytes', () => {
    const origin = JSON.parse(
      readFileSync('tests/fixtures/twitter-text/origin.json', 'utf8'),
    );
    // Source metadata is audited separately; runtime and upstream JSON must be identical in meaning.
    expect(origin.commit).toBe('30e2430d90cff3b46393ea54caf511441983c260');
    expect(X_CONFIG).toEqual(
      JSON.parse(readFileSync('tests/fixtures/twitter-text/v3.json', 'utf8')),
    );
    for (const [file, hash] of Object.entries(origin.files))
      expect(
        createHash('sha256')
          .update(readFileSync(`tests/fixtures/twitter-text/${file}`))
          .digest('hex'),
      ).toBe(hash);
  });
});
describe('project publication policy and weighted boundaries', () => {
  it('matches unmodified official emoji-enabled v3 across the entire fast-path character subset', () => {
    const ranges = [
      [0x20, 0x7e],
      [0x3000, 0x302f],
      [0x3040, 0x30ff],
      [0x3400, 0x4dbf],
      [0x4e00, 0x9fff],
      [0xff01, 0xff60],
      [0xff65, 0xff9f],
    ];
    let text = '\t\n\r';
    for (const [start, end] of ranges)
      for (let cp = start!; cp <= end!; cp++) text += String.fromCodePoint(cp);
    for (let offset = 0; offset < text.length; offset += 100) {
      const chunk = text.substring(offset, offset + 100);
      expect(officialMeasure(chunk)).toEqual(parseTweet(chunk, X_CONFIG));
    }
  });
  it.each(['©', '®', '〰', '〽', '㊗', '㊙', '#️⃣', '1️⃣', '👩‍👩‍👧‍👦', '🇯🇵', '🆕'])(
    'retains full official emoji parsing for %s',
    (text) => expect(officialMeasure(text)).toEqual(parseTweet(text, X_CONFIG)),
  );
  it('keeps nested official ranges immutable as well as limit constants', () => {
    expect(Object.isFrozen(X_CONFIG)).toBe(true);
    expect(Object.isFrozen(X_CONFIG.ranges)).toBe(true);
    expect(X_CONFIG.ranges.every(Object.isFrozen)).toBe(true);
  });
  it.each([
    ['漢ひカ', 6],
    ['ｶﾀｶﾅ', 8],
    ['abc123', 6],
    ['Ａ１', 4],
    ['、。', 4],
    ['a\nb', 3],
    ['#宇宙', 5],
    ['@space', 6],
    ['😀', 2],
    ['✈️', 2],
    ['👍🏽', 2],
    ['👩‍👩‍👧‍👦', 2],
    ['🇯🇵', 2],
    ['𠮷', 2],
    ['https://example.jp/' + 'x'.repeat(300), 23],
    ['https://example.jp/a https://example.org/b', 47],
    ['（https://example.jp/a）。', 29],
  ])('%s → %i', (text, count) =>
    expect(officialMeasure(text as string).weightedLength).toBe(count),
  );
  it.each([279, 280, 281])('%i ASCII boundary', (length) =>
    expect(validateLength('a'.repeat(length)).valid).toBe(length <= 280),
  );
  it('normalizes NFC and NFD weights equivalently (raw indices intentionally differ)', () =>
    expect(validateLength('é')).toEqual(validateLength('e\u0301')));
  it.each([
    '\ud800',
    '\udc00',
    'x\u202ey',
    'x\u200by',
    'x\u200dy',
    'x\u2061y',
    'x\u034fy',
    '<script>x</script>',
    'x @user',
    'x #tag',
    'x https://example.jp',
  ])('refuses unsafe display field %j', (text) =>
    expect(() => plain(text)).toThrow(),
  );
  it('keeps emoji and normal Japanese whitespace while rejecting invalid publication controls', () => {
    expect(plain('　星空\t観察　😀')).toBe('星空 観察 😀');
    expect(validateLength('x\u202ey').valid).toBe(false);
    expect(validateLength('\ud800').valid).toBe(false);
  });
  it('refuses token-looking data rather than echoing it into a post', () => {
    const text = 'cfut_' + 'x'.repeat(40);
    expect(() => plain(text)).toThrow('unsafe-input');
    expect(validateLength(text).valid).toBe(false);
  });
});
