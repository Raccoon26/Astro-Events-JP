export type ISODateTime = string;
export type VerificationStatus = 'Verified' | 'Review Required' | 'Blocked';
export type Category =
  | 'astronomy'
  | 'space-development'
  | 'research'
  | 'local'
  | 'facility'
  | 'vtuber';
export type EventStatus =
  | 'scheduled'
  | 'postponed'
  | 'cancelled'
  | 'ended'
  | 'unknown';
export type PublicationStatus = 'pending' | 'posted' | 'held' | 'recheck';
export type ImageRights = 'permitted' | 'unknown' | 'prohibited';
export type PostKind =
  | 'observation'
  | 'open-day'
  | 'space'
  | 'lecture'
  | 'exhibition'
  | 'vtuber'
  | 'merchandise'
  | 'closure'
  | 'reopening'
  | 'cancellation'
  | 'postponement'
  | 'applications-open'
  | 'deadline';
export interface Source {
  id: string;
  officialUrl: string;
  allowedHosts: readonly string[];
  prefecture: number | null;
  municipality: string | null;
  category: Category;
  format: 'rss' | 'atom' | 'html' | 'sitemap';
  priority: number;
  lastCrawledAt: ISODateTime | null;
  nextCrawlAt: ISODateTime;
  etag: string | null;
  lastModified: string | null;
  robotsCheckedAt: ISODateTime | null;
  termsReviewedAt: ISODateTime | null;
  state: 'active' | 'review' | 'unsupported' | 'paused';
}
export interface Facility {
  id: string;
  name: string;
  prefecture: number;
  officialUrl: string;
  operatingStatus: 'open' | 'closed' | 'renovation' | 'unknown';
  closureStart: ISODateTime | null;
  closureEnd: ISODateTime | null;
  reopeningDate: ISODateTime | null;
  statusSourceUrl: string | null;
  lastVerifiedAt: ISODateTime | null;
}
export interface Event {
  /** DEV04: date/month values never masquerade as midnight timestamps. */
  datePrecision?: 'datetime' | 'date' | 'month' | 'unknown';
  startDate?: string | null;
  endDate?: string | null;
  startMonth?: string | null;
  endMonth?: string | null;
  stableEventId: string;
  sourceId: string;
  facilityId: string | null;
  title: string;
  category: Category;
  organizer: string | null;
  prefecture: number | null;
  municipality: string | null;
  venue: string | null;
  startDatetime: ISODateTime | null;
  endDatetime: ISODateTime | null;
  timezone: 'Asia/Tokyo';
  applicationStart: ISODateTime | null;
  applicationDeadline: ISODateTime | null;
  reservationRequired: boolean | null;
  participationFee: string | null;
  officialUrl: string;
  status: EventStatus;
  verificationStatus: VerificationStatus;
  firstSeenAt: ISODateTime;
  lastVerifiedAt: ISODateTime | null;
  editionYear: number | null;
  edition: string | null;
}
export interface ImageMetadata {
  available?: boolean | null;
  related?: boolean;
  imageUrl: string;
  imageSourceUrl: string;
  imageType: 'poster' | 'key-visual' | 'representative' | 'facility';
  imageRightsStatus: ImageRights;
  imageAttribution: string | null;
  rightsEvidenceUrl: string | null;
  imageLastCheckedAt: ISODateTime | null;
}
export interface Evidence {
  candidateFingerprint?: string;
  documentDigest?: string;
  documentVersion?: string;
  ruleVersion?: string;
  judgement?: 'confirmed' | 'unknown' | 'ambiguous' | 'conflicting';
  field: string;
  sourceUrl: string;
  checkedAt: ISODateTime;
  excerpt: string;
}
export interface Validation {
  event: Event;
  evidence: Evidence[];
  reasons: string[];
}
export interface VerifiedEvent extends Event {
  verificationStatus: 'Verified';
}
export interface GeneratedPost {
  id: string;
  eventId: string;
  kind: PostKind;
  text: string;
  weightedLength: number;
  hashtags: readonly string[];
  templateVersion: string;
}
export interface CrawlRun {
  id: string;
  startedAt: ISODateTime;
  cursor: string | null;
  deferred: number;
  errors: number;
}
export interface Usage {
  requests: number;
  reads: number;
  writes: number;
  databaseBytes: number;
}
export interface Delivery {
  idempotencyKey: string;
  eventId: string;
  postId: string | null;
  channel: 'telegram' | 'github-issue';
  revision: string;
  state: 'pending' | 'sending' | 'sent' | 'uncertain' | 'failed';
}
export interface Report {
  event: Event;
  post: GeneratedPost | null;
  images: ImageMetadata[];
  evidence: Evidence[];
  changes: readonly string[];
  publicationStatus: PublicationStatus;
}
export interface Vtuber {
  id: string;
  name: string;
  officialUrl: string | null;
  verifiedAt: ISODateTime | null;
  sourceIds: readonly string[];
}
