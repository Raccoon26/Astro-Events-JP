import type { Registration } from '../registry';
export type Format = 'rss' | 'atom' | 'html' | 'sitemap';
export type CollectionCode =
  | 'timeout'
  | 'network-error'
  | 'invalid-content-type'
  | 'body-too-large'
  | 'invalid-encoding'
  | 'parse-error'
  | 'robots-denied'
  | 'terms-unreviewed'
  | 'unsupported-format'
  | 'unsafe-redirect'
  | 'invalid-host'
  | 'rate-limited'
  | 'temporary-server-error'
  | 'permanent-not-found'
  | 'access-denied'
  | 'budget-exhausted'
  | 'aborted'
  | 'dns-protection-unavailable'
  | 'policy-changed'
  | 'source-not-active'
  | 'checkpoint-conflict';
export class CollectionError extends Error {
  constructor(
    readonly code: CollectionCode,
    readonly retryAt: string | null = null,
  ) {
    super(code);
    this.name = 'CollectionError';
  }
}
export interface Limits {
  maxBytes: number;
  timeoutMs: number;
  maxRequests: number;
  maxRedirects: number;
  maxRetries: number;
  gapMs: number;
  maxItems: number;
  maxNodes: number;
  maxDepth: number;
  maxLinks: number;
  maxSitemapDepth: number;
  maxQueuedSitemaps: number;
}
export const DEFAULT_LIMITS: Limits = {
  maxBytes: 256 * 1024,
  timeoutMs: 5000,
  maxRequests: 8,
  maxRedirects: 3,
  maxRetries: 1,
  gapMs: 1000,
  maxItems: 10,
  maxNodes: 10000,
  maxDepth: 48,
  maxLinks: 20,
  maxSitemapDepth: 1,
  maxQueuedSitemaps: 3,
};
export function limits(input: Partial<Limits> = {}): Limits {
  const result = { ...DEFAULT_LIMITS, ...input };
  for (const [key, value] of Object.entries(result))
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > DEFAULT_LIMITS[key as keyof Limits]
    )
      throw new Error('Unsafe collection limit');
  if (
    !result.maxBytes ||
    !result.timeoutMs ||
    !result.maxRequests ||
    !result.maxItems ||
    !result.maxNodes ||
    !result.maxDepth
  )
    throw new Error('Empty collection limit');
  return result;
}
export interface Approval {
  sourceId: string;
  url: string;
  operatorEvidenceUrl: string;
  termsEvidenceUrl: string;
  termsDecision: 'allowed';
  robotsDigest: string | null;
  robotsAbsenceApproved: boolean;
  reviewedAt: string;
  expiresAt: string;
  scopePaths: string[];
  imageHosts: string[];
  formats: Format[];
  minIntervalSeconds: number;
  requestGapMs: number;
  testEvidence: {
    url: string;
    digest: string;
    parserVersion: string;
    passed: boolean;
    checkedAt: string;
  };
  purpose: string;
}
export interface Transport {
  assurance: 'dns-pinned' | 'fixture' | 'unavailable';
  request(
    url: URL,
    headers: Headers,
    signal: AbortSignal,
  ): Promise<{ response: Response; decoded: boolean }>;
}
export const unavailableTransport: Transport = {
  assurance: 'unavailable',
  async request() {
    throw new CollectionError('dns-protection-unavailable');
  },
};
export interface ImageCandidate {
  url: string;
  sourceUrl: string;
  type: 'poster' | 'key-visual' | 'representative';
  relation: string;
  rightsStatus: 'unknown';
  rightsEvidenceUrl: null;
  attribution: null;
  lastCheckedAt: string;
  available: boolean | null;
}
export interface EventCandidate {
  id: string;
  sourceId: string;
  itemId: string | null;
  originalUrl: string;
  officialUrl: string;
  title: string;
  comparisonTitle: string;
  publishedAt: string | null;
  updatedAt: string | null;
  publishedRaw: string | null;
  author: string | null;
  dateRaw: string[];
  venueRaw: string[];
  description: string;
  images: ImageCandidate[];
  collectedAt: string;
  fingerprint: string;
  originalType: Format;
  ruleVersion: string;
  confidence: 'low' | 'medium';
  reviewStatus: 'Review Required';
  evidence: Record<string, { url: string; text: string }>;
}
export interface DiscoveredSource {
  url: string;
  from: string;
  relation: string;
  format: Format | null;
  lastmod?: string | null;
}
export interface ParsedDocument {
  candidates: EventCandidate[];
  discoveries: DiscoveredSource[];
  sitemaps: { url: string; lastmod: string | null }[];
  truncated: boolean;
  nextOffset?: number;
}
export interface HtmlRules {
  itemSelector?: string;
  linkSelector?: string;
  titleSelector?: string;
  dateSelector?: string;
  venueSelector?: string;
  detailPage?: boolean;
}
export interface ParseContext {
  source: Registration;
  url: string;
  at: string;
  approval: Approval;
  limits: Limits;
  rules?: HtmlRules;
  offset?: number;
  baseUrl?: string;
}
export const RULE_VERSION = 'dev03-1';
