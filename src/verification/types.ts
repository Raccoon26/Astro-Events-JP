import type { Approval, EventCandidate } from '../collection/types';
import type {
  Event,
  Evidence,
  Facility,
  ImageMetadata,
  PostKind,
  Validation,
  VerifiedEvent,
} from '../domain';
import type { Registration } from '../registry';

export const VERIFICATION_RULE = 'dev04-2';
export type JudgementState =
  | 'confirmed'
  | 'unknown'
  | 'ambiguous'
  | 'conflicting';
export interface Judgement<T> {
  state: JudgementState;
  value: T | null;
  raw: string[];
  reasons: string[];
  evidence: Evidence[];
}
export type Field =
  | 'title'
  | 'kind'
  | 'organizer'
  | 'location'
  | 'schedule'
  | 'applicationStart'
  | 'applicationDeadline'
  | 'fee'
  | 'reservation'
  | 'status'
  | 'vtuberRelation';
export interface Temporal {
  precision: 'datetime' | 'date' | 'month' | 'unknown';
  startDate: string | null;
  endDate: string | null;
  startMonth: string | null;
  endMonth: string | null;
  startDatetime: string | null;
  endDatetime: string | null;
  doorsTime: string | null;
  raw: string;
}
export interface Fees {
  participation: 'free' | 'paid' | 'unknown';
  entrance: 'free' | 'paid' | 'unknown';
  tiers: { label: string; yen: number; scope: 'participation' | 'entrance' }[];
}
export interface Reservation {
  required: boolean | null;
  method: 'advance' | 'walk-in' | null;
  selection: 'first-come' | 'lottery' | null;
  capacity: number | null;
  reception: 'open' | 'not-yet-open' | 'closed' | 'full' | 'waitlist' | null;
}
export interface Location {
  online: boolean;
  venue: string | null;
  prefecture: number | null;
  municipality: string | null;
}
export interface StatusFact {
  status: Event['status'];
  conditional: string[];
  tentative: boolean;
}
/** A bounded, explicit human attestation of official excerpts; not a downloaded page or automatic proof. */
export interface ReviewDocument {
  id: string;
  url: string;
  checkedAt: string;
  text: string;
  digest: string;
  version: string;
}
export interface Assertion {
  field: Field;
  documentId: string;
  quote: string;
}
export interface ImageReview {
  availabilityWitness?: {
    imageUrl: string;
    status: 200 | 404 | 410;
    method: 'manual-observation';
    checkedAt: string;
  };
  imageUrl: string;
  documentId: string;
  quote: string;
  relationConfirmed: boolean;
  scope: 'image-reupload';
  attributionRequired: boolean | null;
  attribution: string | null;
  available: boolean | null;
  availabilityCheckedAt: string | null;
}
export interface ReviewPacket {
  resolvesNoticeIds?: string[];
  candidateId: string;
  sourceId: string;
  fingerprint: string;
  reviewedAt: string;
  reason: string;
  relationship: {
    confirmed: boolean;
    documentId: string;
    quote: string;
    reason: string;
  };
  documents: ReviewDocument[];
  assertions: Assertion[];
  images: ImageReview[];
  facilityId: string | null;
  vtuberIds: string[];
}
export interface Notice {
  resolves?: string[];
  id: string;
  facilityId: string;
  candidateId: string;
  sourceId: string;
  kind:
    | 'closure'
    | 'renovation'
    | 'reopening'
    | 'special-opening'
    | 'night-opening'
    | 'maintenance'
    | 'operating-change'
    | 'venue-change'
    | 'routine';
  period: Temporal;
  partial: boolean;
  routine: boolean;
  resolvedAt: string | null;
  verifiedAt: string;
  evidence: Evidence[];
  fingerprint: string;
}
export interface FacilityEffect {
  noticeId: string;
  impact: 'overlap' | 'uncertain';
  cancellationConfirmed: false;
  reason: string;
}
export interface VerificationContext {
  firstSeenAt?: string;
  candidate: EventCandidate;
  source: Registration;
  approval: Approval | null;
  now: string;
  facility: Facility | null;
  facilityEpoch: number;
  facilityLinked: boolean;
  notices: Notice[];
  vtubers: { id: string; status: string; linked: boolean }[];
  documents: { url: string; digest: string | null; changedAt: string | null }[];
}
export interface VerificationResult extends Validation {
  primaryDateField:
    | 'schedule'
    | 'applicationStart'
    | 'applicationDeadline'
    | null;
  candidateId: string;
  fingerprint: string;
  candidateDigest: string;
  packetDigest: string;
  sourceDigest: string;
  approvalDigest: string;
  ruleVersion: typeof VERIFICATION_RULE;
  checkedAt: string;
  expiresAt: string;
  kind: PostKind | null;
  fields: {
    title: Judgement<string>;
    kind: Judgement<PostKind>;
    organizer: Judgement<string>;
    location: Judgement<Location>;
    schedule: Judgement<Temporal>;
    applicationStart: Judgement<Temporal>;
    applicationDeadline: Judgement<Temporal>;
    fee: Judgement<Fees>;
    reservation: Judgement<Reservation>;
    status: Judgement<StatusFact>;
    vtuberRelation: Judgement<string>;
  };
  images: ImageMetadata[];
  impacts: FacilityEffect[];
  facilityEpoch: number;
  facilityId: string | null;
  packet: ReviewPacket | null;
}
export interface DetailedVerifiedEvent extends VerifiedEvent {
  verification: {
    primaryDateField: VerificationResult['primaryDateField'];
    candidateId: string;
    fingerprint: string;
    ruleVersion: string;
    checkedAt: string;
    expiresAt: string;
    kind: PostKind;
    fields: VerificationResult['fields'];
    images: ImageMetadata[];
    impacts: FacilityEffect[];
  };
}
export class VerificationError extends Error {
  constructor(
    readonly code:
      | 'invalid-input'
      | 'unsafe-evidence'
      | 'stale-candidate'
      | 'write-conflict'
      | 'schema-unavailable'
      | 'environment-mismatch'
      | 'feature-disabled'
      | 'budget-exhausted',
  ) {
    super(code);
    this.name = 'VerificationError';
  }
}
