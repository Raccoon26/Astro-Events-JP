import { describe, expect, it } from 'vitest';
import { digest } from '../src/collection/text';
import { syntheticVerification } from '../src/verification/benchmark';
import { parseFees, parseReservation } from '../src/verification/conditions';
import { parseLocation } from '../src/verification/fields';
import { recommendedImages, verifyImages } from '../src/verification/images';
import { verificationFixture } from './verification-fixtures';

describe('image permissions are independently evidenced and conservative', () => {
  it.each([
    ['この画像はSNSへの転載を許可します。', 'permitted'],
    ['この画像はSNSへの転載禁止です。', 'prohibited'],
    ['この画像はSNSへの転載を許可していません。', 'prohibited'],
    ['この画像はSNSへの転載には事前許可が必要です。', 'unknown'],
    ['この画像はSNSへの転載を非営利の場合許可します。', 'unknown'],
    ['この画像はSNSへの転載を許可します。出典を明記。', 'unknown'],
  ])('%s → %s', async (text, status) => {
    const f = await verificationFixture();
    f.ctx.candidate.images = [
      {
        url: 'https://example.jp/poster.jpg',
        sourceUrl: f.ctx.candidate.officialUrl,
        type: 'poster',
        relation: 'synthetic',
        rightsStatus: 'unknown',
        rightsEvidenceUrl: null,
        attribution: null,
        lastCheckedAt: f.ctx.now,
        available: null,
      },
    ];
    f.packet.documents.push({
      id: 'rights',
      url: 'https://example.jp/rights',
      checkedAt: f.ctx.now,
      text,
      digest: await digest(text),
      version: 'synthetic-1',
    });
    f.packet.images = [
      {
        imageUrl: f.ctx.candidate.images[0]!.url,
        documentId: 'rights',
        quote: text,
        scope: 'image-reupload',
        relationConfirmed: true,
        attributionRequired: false,
        attribution: null,
        available: true,
        availabilityCheckedAt: f.ctx.now,
      },
    ];
    const result = await verifyImages(f.ctx, f.packet);
    expect(result[0]?.imageRightsStatus).toBe(status);
    expect(result[0]?.available).toBeNull(); // A raw boolean is not a file-existence witness.
    expect(recommendedImages(result)).toHaveLength(0);
    f.packet.documents[1]!.digest = '0'.repeat(64);
    expect((await verifyImages(f.ctx, f.packet))[0]?.imageRightsStatus).toBe(
      'unknown',
    );
  });
  it('omits unsafe URLs and preserves a missing-image event without downloading bytes', async () => {
    const f = await verificationFixture();
    f.ctx.candidate.images = [
      {
        url: 'http://127.0.0.1/secret',
        sourceUrl: f.ctx.candidate.officialUrl,
        type: 'poster',
        relation: 'synthetic',
        rightsStatus: 'unknown',
        rightsEvidenceUrl: null,
        attribution: null,
        lastCheckedAt: f.ctx.now,
        available: null,
      },
    ];
    expect(await verifyImages(f.ctx, f.packet)).toEqual([]);
    expect((await syntheticVerification(f.ctx.now)).verified).toBe(true);
  });
});
describe('negated conditions never become confident free/optional/online claims', () => {
  it.each(['参加無料ではありません', '参加費未定', '参加費-500円'])(
    'holds %s',
    (raw) => expect(parseFees(raw).state).toBe('ambiguous'),
  );
  it.each([
    '予約不要ではありません',
    '要事前予約ではありません',
    '予約条件調整中',
  ])('holds %s', (raw) =>
    expect(parseReservation(raw).state).toBe('ambiguous'),
  );
  it('does not convert a negated or hybrid venue to online-only', () => {
    expect(parseLocation('オンラインではありません').state).toBe('ambiguous');
    expect(parseLocation('現地とオンラインのハイブリッド').state).toBe(
      'ambiguous',
    );
  });
});
