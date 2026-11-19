import type { Evidence } from '../domain';
import type { Judgement, VerificationResult } from '../verification/types';

export interface TrackedValue {
  state: Judgement<unknown>['state'];
  value: unknown;
  evidence: Evidence[];
}
export interface TrackedChange {
  field: string;
  before: TrackedValue | null;
  after: TrackedValue;
  official: boolean;
}

function facts(result: VerificationResult): Record<string, TrackedValue> {
  const values: Record<string, TrackedValue> = {};
  for (const [key, fact] of Object.entries(result.fields)) {
    if (key === 'vtuberRelation') continue;
    values[key] = {
      state: fact.state,
      value: fact.state === 'confirmed' ? fact.value : null,
      evidence: fact.evidence,
    };
  }
  values.officialUrl = {
    state: 'confirmed',
    value: result.event.officialUrl,
    evidence:
      result.packet?.documents.flatMap((doc) =>
        doc.id === result.packet?.relationship.documentId
          ? [
              {
                field: 'officialUrl',
                sourceUrl: doc.url,
                checkedAt: doc.checkedAt,
                excerpt: result.packet.relationship.quote,
                documentDigest: doc.digest,
                documentVersion: doc.version,
                candidateFingerprint: result.fingerprint,
                ruleVersion: result.ruleVersion,
                judgement: 'confirmed' as const,
              },
            ]
          : [],
      ) ?? [],
  };
  values.images = {
    state: 'confirmed',
    value: result.images
      .map(({ imageLastCheckedAt: _, ...image }) => image)
      .sort((a, b) => a.imageUrl.localeCompare(b.imageUrl)),
    evidence:
      result.packet?.images.flatMap(
        (review) =>
          result.packet?.documents
            .filter((doc) => doc.id === review.documentId)
            .map((doc) => ({
              field: 'image-rights',
              sourceUrl: doc.url,
              checkedAt: doc.checkedAt,
              excerpt: review.quote,
              documentDigest: doc.digest,
              documentVersion: doc.version,
              candidateFingerprint: result.fingerprint,
              ruleVersion: result.ruleVersion,
              judgement: 'confirmed' as const,
            })) ?? [],
      ) ?? [],
  };
  values.facilityImpact = {
    state: 'confirmed',
    value: result.impacts,
    evidence: [],
  };
  return values;
}
const semantic = (fact: TrackedValue | undefined) =>
  JSON.stringify(
    [fact?.state ?? 'unknown', fact?.value ?? null],
    (key, value) =>
      key === 'raw'
        ? undefined
        : typeof value === 'string' && !/^https:\/\//u.test(value)
          ? value.normalize('NFKC').replace(/\s+/gu, ' ').trim()
          : value,
  );

export function changesBetween(
  previous: VerificationResult | null,
  current: VerificationResult,
  facilityEvidence: Evidence[] = [],
) {
  const before = previous ? facts(previous) : {};
  const after = facts(current);
  after.facilityImpact!.evidence = facilityEvidence;
  const differences: TrackedChange[] = [];
  const official = current.event.verificationStatus === 'Verified';
  for (const [field, value] of Object.entries(after)) {
    if (semantic(before[field]) === semantic(value)) continue;
    differences.push({
      field,
      before: before[field] ?? null,
      after: value,
      official:
        official &&
        value.state === 'confirmed' &&
        (value.evidence.length > 0 ||
          field === 'images' ||
          field === 'facilityImpact'),
    });
  }
  const purpose = !official
    ? 'recheck'
    : !previous
      ? 'initial'
      : differences.some((change) => change.official)
        ? 'official-change'
        : 'recheck';
  return { purpose, differences } as const;
}
