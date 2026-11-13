// Entirely synthetic official attestations. These are not real source approvals or verified events.
import { candidate } from '../src/collection/parse-common';
import { digest } from '../src/collection/text';
import type {
  Field,
  ReviewPacket,
  VerificationContext,
} from '../src/verification/types';
import { context as collectionContext, NOW } from './collection-fixtures';
export async function verificationFixture(
  overrides: Partial<Record<Field, string | null>> = {},
) {
  const fields: Partial<Record<Field, string | null>> = {
    title: '合成観望会',
    kind: '天体観望会',
    organizer: '主催：合成天文台',
    location: '会場：合成天文台（北海道合成町）',
    schedule: '開催日2026年11月23日 13:30〜15:00',
    fee: '参加費500円',
    reservation: '要事前予約',
    status: '開催予定',
    ...overrides,
  };
  const col = collectionContext();
  const c = await candidate(col, {
    url: 'https://example.jp/events/synthetic',
    title: fields.title ?? '合成観望会',
    description: Object.values(fields).filter(Boolean).join('。'),
  });
  const text = Object.values(fields)
    .filter((v): v is string => typeof v === 'string')
    .join('\n');
  const packet: ReviewPacket = {
    candidateId: c.id,
    sourceId: c.sourceId,
    fingerprint: c.fingerprint,
    reviewedAt: NOW,
    reason: 'Synthetic explicit human review only; no real website was visited',
    relationship: {
      confirmed: true,
      documentId: 'main',
      quote: fields.title ?? '合成観望会',
      reason:
        'Synthetic organizer explicitly identifies this event in this official excerpt',
    },
    documents: [
      {
        id: 'main',
        url: c.officialUrl,
        checkedAt: NOW,
        text,
        digest: await digest(text),
        version: 'synthetic-official-excerpt-1',
      },
    ],
    assertions: Object.entries(fields)
      .filter((e): e is [Field, string] => typeof e[1] === 'string')
      .map(([field, quote]) => ({ field, quote, documentId: 'main' })),
    images: [],
    facilityId: null,
    vtuberIds: [],
  };
  const ctx: VerificationContext = {
    candidate: c,
    source: col.source,
    approval: col.approval,
    now: NOW,
    facility: null,
    facilityEpoch: 0,
    facilityLinked: false,
    notices: [],
    vtubers: [],
    documents: [{ url: col.url, digest: 'a'.repeat(64), changedAt: col.at }],
  };
  return { ctx, packet };
}
