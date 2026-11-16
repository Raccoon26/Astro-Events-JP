import { parse as emojiSpans } from 'twemoji-parser';
import extractHashtags from 'twitter-text/dist/esm/extractHashtags.js';
import extractMentions from 'twitter-text/dist/esm/extractMentions.js';
import extractUrls from 'twitter-text/dist/esm/extractUrlsWithIndices.js';
import parseTweet from 'twitter-text/dist/esm/parseTweet.js';
import { PostError } from './types';
import config from './x-v3.json';

export const LENGTH_POLICY = 'twitter-text-3.1.0-v3/input-1';
for (const range of config.ranges) Object.freeze(range);
Object.freeze(config.ranges);
export const X_CONFIG = Object.freeze(config);
export { extractHashtags, extractUrls };

function looksSecret(text: string) {
  return /gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}|cf[ua]t_[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|\b\d{8,12}:[A-Za-z0-9_-]{35}\b/u.test(
    text,
  );
}

function safeJoiners(text: string) {
  // Only the pinned official emoji parser may authorize invisible emoji joiners/selectors.
  if (/[\p{Cf}]/u.test(text.replace(/\u200d/gu, '')) || /\u034f/u.test(text))
    return false;
  if (!/[\u200d\ufe0e\ufe0f]/u.test(text)) return true;
  const spans = emojiSpans(text);
  for (let i = 0; i < text.length; i++)
    if (
      /[\u200d\ufe0e\ufe0f]/u.test(text[i]!) &&
      !spans.some((s) => s.indices[0] <= i && i < s.indices[1])
    )
      return false;
  return true;
}
export function scalarText(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 8192)
    throw new PostError('unsafe-input');
  for (const char of value) {
    const cp = char.codePointAt(0)!;
    if (cp >= 0xd800 && cp <= 0xdfff) throw new PostError('unsafe-input');
  }
}
/** Official weighting is separate from the stricter project publication-input policy. */
export function officialMeasure(text: string) {
  scalarText(text);
  // Proven emoji-free subset only. All possible emoji (including #/digit keycap
  // combiners, VS, supplementary characters and ©/®/〰/㊗) take the full official path.
  const noEmoji =
    /^[\u0009\u000a\u000d\u0020-\u007e\u3000-\u302f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff01-\uff60\uff65-\uff9f]*$/u.test(
      text,
    );
  return parseTweet(
    text,
    noEmoji ? { ...X_CONFIG, emojiParsingEnabled: false } : X_CONFIG,
  );
}
export function validateLength(text: string) {
  try {
    scalarText(text);
    const normalized = text.normalize('NFC'),
      m = officialMeasure(normalized);
    const safe =
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u00ad\u061c\u200b\u200c\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff\ufffe\uffff]/u.test(
        text,
      );
    return {
      weightedLength: m.weightedLength,
      valid:
        m.valid && safe && safeJoiners(normalized) && !looksSecret(normalized),
      remaining: X_CONFIG.maxWeightedTweetLength - m.weightedLength,
    };
  } catch {
    return { weightedLength: -1, valid: false, remaining: null };
  }
}
export function plain(value: string): string {
  scalarText(value);
  if (
    /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u00ad\u061c\u200b\u200c\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/u.test(
      value,
    )
  )
    throw new PostError('unsafe-input');
  const text = value
    .normalize('NFC')
    .replace(/[\s\u00a0\u3000]+/gu, ' ')
    .trim();
  if (
    !text ||
    looksSecret(text) ||
    !safeJoiners(text) ||
    extractUrls(text).length ||
    extractHashtags(text).length ||
    extractMentions(text).length
  )
    throw new PostError('unsafe-input');
  return text;
}
