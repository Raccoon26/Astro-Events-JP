import type { GeneratedPost, PostKind } from '../domain';
import type { DetailedVerifiedEvent } from '../verification/types';

export const TEMPLATE_VERSION = 'ja-v1';
export const TEMPLATE_VERSIONS = ['ja-v1', 'ja-v1.1'] as const;
export const POST_KINDS: readonly PostKind[] = [
  'observation',
  'open-day',
  'space',
  'lecture',
  'exhibition',
  'vtuber',
  'merchandise',
  'closure',
  'reopening',
  'cancellation',
  'postponement',
  'applications-open',
  'deadline',
];
export interface PostDraft extends GeneratedPost {
  eventRevision: number;
  remaining: number;
  lengthPolicy: string;
  omitted: { field: string; reason: string }[];
  validUntil: string;
}
/** Copy text is deliberately separate from operational warnings, IDs, rights and evidence. */
export interface PostDelivery {
  copyText: string;
  metadata: {
    post: PostDraft;
    eventId: string;
    sourceId: string;
    eventRevision: number;
    verified: true;
    checkedAt: string;
    expiresAt: string;
    fingerprint: string;
    decisionId: string;
    officialUrl: string;
    images: DetailedVerifiedEvent['verification']['images'];
    impacts: DetailedVerifiedEvent['verification']['impacts'];
    recommended: true;
    recheckRequired: false;
    fields: Record<string, string>;
  };
}
export class PostError extends Error {
  constructor(
    readonly code:
      | 'unsafe-input'
      | 'not-currently-verified'
      | 'unsupported-template'
      | 'kind-mismatch'
      | 'date-role-ambiguous'
      | 'time-expired'
      | 'essential-info-too-long'
      | 'length-uncertain'
      | 'schema-unavailable'
      | 'environment-mismatch'
      | 'feature-disabled'
      | 'budget-exhausted'
      | 'write-conflict'
      | 'stored-post-invalid',
  ) {
    super(code);
    this.name = 'PostError';
  }
}
