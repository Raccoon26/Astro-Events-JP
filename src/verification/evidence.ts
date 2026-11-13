import { assertApproval, inScope, safeUrl } from '../collection/policy';
import { digest } from '../collection/text';
import type { Evidence } from '../domain';
import {
  type ReviewPacket,
  VERIFICATION_RULE,
  type VerificationContext,
  VerificationError,
} from './types';

export function bounded(value: unknown, maxBytes = 32768): void {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new VerificationError('invalid-input');
  }
  if (
    typeof encoded !== 'string' ||
    new TextEncoder().encode(encoded).length > maxBytes
  )
    throw new VerificationError('invalid-input');
  let nodes = 0;
  function visit(v: unknown, depth: number) {
    if (++nodes > 1500 || depth > 14)
      throw new VerificationError('invalid-input');
    if (
      typeof v === 'string' &&
      (v.length > 8192 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v))
    )
      throw new VerificationError('invalid-input');
    if (typeof v === 'number' && !Number.isFinite(v))
      throw new VerificationError('invalid-input');
    if (Array.isArray(v)) {
      if (v.length > 100) throw new VerificationError('invalid-input');
      for (const item of v) visit(item, depth + 1);
    } else if (v && typeof v === 'object')
      for (const [k, item] of Object.entries(v)) {
        if (['__proto__', 'constructor', 'prototype'].includes(k))
          throw new VerificationError('invalid-input');
        visit(item, depth + 1);
      }
  }
  visit(value, 0);
}
export function sourceSnapshot(ctx: VerificationContext) {
  const s = ctx.source;
  return {
    id: s.id,
    format: s.format,
    minIntervalSeconds: s.minIntervalSeconds,
    prefecture: s.prefecture,
    municipality: s.municipality,
    firstSeenAt: ctx.firstSeenAt ?? ctx.candidate.collectedAt,
    officialUrl: s.officialUrl,
    allowedHosts: s.allowedHosts,
    state: s.state,
    officialStatus: s.officialStatus,
    parserApproved: s.parserApproved,
    robotsStatus: s.robotsStatus,
    termsStatus: s.termsStatus,
    robotsCheckedAt: s.robotsCheckedAt,
    termsReviewedAt: s.termsReviewedAt,
    checkedAt: s.checkedAt,
    category: s.category,
    operator: s.operator,
    kind: s.kind,
    vtubers: ctx.vtubers,
    documents: ctx.documents,
    facility: ctx.facility,
    facilityEpoch: ctx.facilityEpoch,
    notices: ctx.notices,
  };
}
export function officialGate(ctx: VerificationContext): string[] {
  try {
    if (!ctx.approval) return ['source-approval-missing'];
    assertApproval(ctx.source, ctx.approval, ctx.now);
    if (
      !inScope(
        safeUrl(ctx.candidate.officialUrl, ctx.source.allowedHosts),
        ctx.approval.scopePaths,
      )
    )
      return ['official-url-out-of-scope'];
    const witness = ctx.documents.find(
      (d) => d.url === ctx.candidate.originalUrl,
    );
    if (
      !witness?.digest ||
      !/^[a-f0-9]{64}$/.test(witness.digest) ||
      !witness.changedAt ||
      !Number.isFinite(Date.parse(witness.changedAt)) ||
      Date.parse(ctx.candidate.collectedAt) < Date.parse(witness.changedAt)
    )
      return ['candidate-not-observed-in-current-document'];
    return [];
  } catch {
    return ['source-approval-invalid-or-revoked'];
  }
}
export async function checkPacket(
  packet: ReviewPacket,
  ctx: VerificationContext,
): Promise<Evidence[]> {
  bounded(packet, 24576);
  if (
    packet.resolvesNoticeIds &&
    (!Array.isArray(packet.resolvesNoticeIds) ||
      packet.resolvesNoticeIds.length > 8 ||
      new Set(packet.resolvesNoticeIds).size !==
        packet.resolvesNoticeIds.length ||
      packet.resolvesNoticeIds.some(
        (id) => typeof id !== 'string' || id.length > 200,
      ))
  )
    throw new VerificationError('invalid-input');
  if (
    packet.candidateId !== ctx.candidate.id ||
    packet.fingerprint !== ctx.candidate.fingerprint ||
    packet.sourceId !== ctx.source.id
  )
    throw new VerificationError('stale-candidate');
  if (
    !packet.reason?.trim() ||
    packet.reason.length > 1000 ||
    !Array.isArray(packet.documents) ||
    packet.documents.length > 4 ||
    !Array.isArray(packet.assertions) ||
    packet.assertions.length > 24 ||
    !Array.isArray(packet.images) ||
    packet.images.length > 8 ||
    !Array.isArray(packet.vtuberIds) ||
    packet.vtuberIds.length > 8
  )
    throw new VerificationError('invalid-input');
  const reviewed = Date.parse(packet.reviewedAt),
    now = Date.parse(ctx.now);
  if (
    !Number.isFinite(reviewed) ||
    reviewed > now ||
    now - reviewed > 7 * 86400000
  )
    throw new VerificationError('stale-candidate');
  const ids = new Set<string>();
  for (const doc of packet.documents) {
    if (
      !doc.id ||
      ids.has(doc.id) ||
      !doc.version?.trim() ||
      !doc.text?.trim() ||
      doc.text.length > 4096 ||
      !/^[a-f0-9]{64}$/.test(doc.digest) ||
      (await digest(doc.text)) !== doc.digest
    )
      throw new VerificationError('invalid-input');
    ids.add(doc.id);
    const checked = Date.parse(doc.checkedAt);
    if (
      !Number.isFinite(checked) ||
      checked > reviewed ||
      now - checked > 7 * 86400000 ||
      checked < Date.parse(ctx.candidate.collectedAt)
    )
      throw new VerificationError('stale-candidate');
    const url = safeUrl(doc.url, ctx.source.allowedHosts);
    if (ctx.approval && !inScope(url, ctx.approval.scopePaths))
      throw new VerificationError('unsafe-evidence');
  }
  const relation = packet.relationship;
  if (
    !relation ||
    typeof relation.confirmed !== 'boolean' ||
    !relation.reason?.trim()
  )
    throw new VerificationError('invalid-input');
  const relationDoc = packet.documents.find(
    (d) => d.id === relation.documentId,
  );
  if (
    !relationDoc ||
    !relation.quote?.trim() ||
    !relationDoc.text.includes(relation.quote)
  )
    throw new VerificationError('invalid-input');
  const fields = [
    'title',
    'kind',
    'organizer',
    'location',
    'schedule',
    'applicationStart',
    'applicationDeadline',
    'fee',
    'reservation',
    'status',
    'vtuberRelation',
  ];
  return packet.assertions.map((a) => {
    const doc = packet.documents.find((d) => d.id === a.documentId);
    if (
      !fields.includes(a.field) ||
      !doc ||
      !a.quote?.trim() ||
      a.quote.length > 1024 ||
      !doc.text.includes(a.quote)
    )
      throw new VerificationError('invalid-input');
    return {
      field: a.field,
      sourceUrl: doc.url,
      checkedAt: doc.checkedAt,
      excerpt: a.quote,
      candidateFingerprint: packet.fingerprint,
      documentDigest: doc.digest,
      documentVersion: doc.version,
      ruleVersion: VERIFICATION_RULE,
      judgement: 'confirmed',
    };
  });
}
