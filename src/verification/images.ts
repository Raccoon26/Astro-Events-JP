import { safeUrl } from '../collection/policy';
import type { ImageMetadata } from '../domain';
import { checkPacket, officialGate } from './evidence';
import type { ReviewPacket, VerificationContext } from './types';

const prohibited =
  /転載禁止|転載不可|再(?:投稿|アップロード)(?:禁止|不可)|利用禁止|許可しません|許可されません|許可(?:は)?(?:していません|されていません|ありません|しない|されない)|認めません|認められていません|できません/u;
export async function verifyImages(
  ctx: VerificationContext,
  packet: ReviewPacket | null,
): Promise<ImageMetadata[]> {
  if (packet) {
    try {
      await checkPacket(packet, ctx);
    } catch {
      packet = null;
    }
  }
  const found: ImageMetadata[] = [];
  for (const image of ctx.candidate.images.slice(0, 8)) {
    try {
      safeUrl(image.url, [
        ...ctx.source.allowedHosts,
        ...(ctx.approval?.imageHosts ?? []),
      ]);
      safeUrl(image.sourceUrl, ctx.source.allowedHosts);
    } catch {
      continue;
    }
    const result: ImageMetadata = {
      imageUrl: image.url,
      imageSourceUrl: image.sourceUrl,
      imageType: image.type,
      imageRightsStatus: 'unknown',
      imageAttribution: null,
      rightsEvidenceUrl: null,
      imageLastCheckedAt: null,
      available: null,
      related: false,
    };
    found.push(result);
    if (!packet || officialGate(ctx).length) continue;
    const reviews = packet.images.filter((r) => r.imageUrl === image.url);
    const qualified = reviews.flatMap((review) => {
      const doc = packet.documents.find((d) => d.id === review.documentId);
      return doc &&
        review.scope === 'image-reupload' &&
        review.quote.trim() &&
        doc.text.includes(review.quote)
        ? [{ review, doc }]
        : [];
    });
    const prohibition = qualified.find((q) => prohibited.test(q.review.quote));
    if (prohibition) {
      result.imageRightsStatus = 'prohibited';
      result.rightsEvidenceUrl = prohibition.doc.url;
      result.imageLastCheckedAt = prohibition.doc.checkedAt;
    }
    // Conflicting/duplicate reviews never silently choose the first permission.
    if (qualified.length !== 1) continue;
    const { review, doc } = qualified[0]!;
    result.related = review.relationConfirmed === true;
    const witness = review.availabilityWitness;
    if (
      witness &&
      witness.method === 'manual-observation' &&
      witness.imageUrl === image.url &&
      [200, 404, 410].includes(witness.status) &&
      Number.isFinite(Date.parse(witness.checkedAt)) &&
      Date.parse(witness.checkedAt) <= Date.parse(packet.reviewedAt) &&
      Date.parse(ctx.now) - Date.parse(witness.checkedAt) <= 86400000 &&
      review.availabilityCheckedAt === witness.checkedAt
    ) {
      const observed = witness.status === 200;
      if (review.available === observed) result.available = observed;
    }
    result.imageLastCheckedAt = doc.checkedAt;
    result.imageAttribution = review.attribution?.trim() || null;
    if (prohibition) continue;
    const creditNeeded =
      review.attributionRequired === true ||
      /クレジット.*必須|出典.*明記|要表記/u.test(review.quote);
    if (
      result.related &&
      /(?:SNS|ソーシャルメディア|本ポスター|この画像).*(?:転載|再投稿|再アップロード).*(?:許可|できます|可)/u.test(
        review.quote,
      ) &&
      !/不明|条件.*別途|営利|商用|改変|場合|事前許可|個別許可|許可(?:が|を)?.{0,3}(?:必要|必須)|場合/u.test(
        review.quote,
      ) &&
      review.attributionRequired !== null &&
      (!creditNeeded || result.imageAttribution)
    ) {
      result.imageRightsStatus = 'permitted';
      result.rightsEvidenceUrl = doc.url;
    }
  }
  return found.sort(
    (a, b) =>
      ['poster', 'key-visual', 'representative', 'facility'].indexOf(
        a.imageType,
      ) -
      ['poster', 'key-visual', 'representative', 'facility'].indexOf(
        b.imageType,
      ),
  );
}
export function recommendedImages(images: ImageMetadata[]) {
  return images.filter(
    (i) =>
      i.imageRightsStatus === 'permitted' &&
      i.rightsEvidenceUrl &&
      i.related &&
      i.available === true,
  );
}
