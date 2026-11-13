// Fixed synthetic attestation for staging profiling only; never persisted or used for real source approval.
import { candidate } from '../collection/parse-common';
import { digest } from '../collection/text';
import type { ParseContext } from '../collection/types';
import { DEFAULT_LIMITS } from '../collection/types';
import type { Field, ReviewPacket, VerificationContext } from './types';
import { CandidateEventValidator, candidateToEvent } from './validator';

export async function syntheticVerification(at: string) {
  const source: ParseContext['source'] = {
    id: 'dev04-synthetic-only',
    name: '合成天文台',
    operator: 'synthetic only',
    officialUrl: 'https://example.jp/events',
    allowedHosts: ['example.jp'],
    prefecture: 1,
    municipality: null,
    category: 'local',
    format: 'html',
    priority: 0,
    lastCrawledAt: null,
    nextCrawlAt: at,
    etag: null,
    lastModified: null,
    robotsCheckedAt: at,
    termsReviewedAt: at,
    state: 'active',
    officialStatus: 'Verified',
    evidenceUrl: 'https://example.jp/about',
    checkedAt: at,
    robotsStatus: 'allowed',
    termsStatus: 'allowed',
    reason: 'Fixed synthetic attestation, not a real source approval',
    kind: 'observatory',
    parserApproved: true,
    minIntervalSeconds: 86400,
  };
  const approval: ParseContext['approval'] = {
    sourceId: source.id,
    url: source.officialUrl,
    operatorEvidenceUrl: source.evidenceUrl,
    termsEvidenceUrl: 'https://example.jp/terms',
    termsDecision: 'allowed',
    robotsDigest: null,
    robotsAbsenceApproved: true,
    reviewedAt: at,
    expiresAt: new Date(Date.parse(at) + 3600000).toISOString(),
    scopePaths: ['/'],
    imageHosts: [],
    formats: ['html'],
    minIntervalSeconds: 86400,
    requestGapMs: 1000,
    testEvidence: {
      url: source.officialUrl,
      digest: 'a'.repeat(64),
      parserVersion: 'synthetic-only',
      passed: true,
      checkedAt: at,
    },
    purpose: 'Fixed offline attestation; never request example.jp',
  };
  const fields: [Field, string][] = [
    ['title', '合成観望会'],
    ['kind', '天体観望会'],
    ['organizer', '主催：合成天文台'],
    ['schedule', '開催日2026年12月23日 13:30〜15:00'],
    ['location', '会場：北海道合成天文台'],
    ['fee', '参加無料'],
    ['reservation', '要事前予約 抽選 定員30名'],
    ['status', '開催予定 雨天中止'],
  ];
  const c = await candidate(
    { source, approval, at, url: source.officialUrl, limits: DEFAULT_LIMITS },
    {
      title: fields[0]![1],
      url: 'https://example.jp/events/synthetic',
      description: fields.map((f) => f[1]).join('。'),
    },
  );
  const text = fields.map((f) => f[1]).join('\n');
  const packet: ReviewPacket = {
    candidateId: c.id,
    sourceId: source.id,
    fingerprint: c.fingerprint,
    reviewedAt: at,
    reason: 'Fixed synthetic human attestation for isolated profiling',
    relationship: {
      confirmed: true,
      documentId: 'synthetic',
      quote: c.title,
      reason: 'Synthetic organizer explicitly identifies this fixture event',
    },
    documents: [
      {
        id: 'synthetic',
        url: c.officialUrl,
        checkedAt: at,
        text,
        digest: await digest(text),
        version: 'synthetic-1',
      },
    ],
    assertions: fields.map(([field, quote]) => ({
      field,
      quote,
      documentId: 'synthetic',
    })),
    images: [],
    facilityId: null,
    vtuberIds: [],
  };
  const context: VerificationContext = {
    candidate: c,
    source,
    approval,
    now: at,
    facility: null,
    facilityEpoch: 0,
    facilityLinked: false,
    notices: [],
    vtubers: [],
    documents: [{ url: c.originalUrl, digest: 'a'.repeat(64), changedAt: at }],
  };
  const validator = new CandidateEventValidator(context, packet, () =>
    Date.parse(at),
  );
  const result = await validator.validate(await candidateToEvent(context));
  return {
    status: result.event.verificationStatus,
    verified: validator.verify(result) !== null,
    reasons: result.reasons,
    precision: result.event.datePrecision,
    synthetic: true,
    externalRequests: 0,
  };
}
