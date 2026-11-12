import {
  type Approval,
  DEFAULT_LIMITS,
  type Format,
  type ParseContext,
  type Transport,
} from '../src/collection/types';
import type { Registration } from '../src/registry';
export const NOW = '2026-11-12T00:00:00.000Z';
export const usage = { requests: 0, reads: 0, writes: 0, databaseBytes: 0 };
export function sourceFixture(format: Format = 'html'): Registration {
  return {
    id: 'fixture-source',
    name: '合成天文台',
    operator: 'fixture only',
    officialUrl: 'https://example.jp/events',
    allowedHosts: ['example.jp'],
    prefecture: 1,
    municipality: null,
    category: 'local',
    format,
    priority: 1,
    lastCrawledAt: null,
    nextCrawlAt: NOW,
    etag: null,
    lastModified: null,
    robotsCheckedAt: NOW,
    termsReviewedAt: NOW,
    state: 'active',
    officialStatus: 'Verified',
    evidenceUrl: 'https://example.jp/',
    checkedAt: NOW,
    robotsStatus: 'allowed',
    termsStatus: 'allowed',
    reason: 'Synthetic test only',
    kind: 'observatory',
    parserApproved: true,
    minIntervalSeconds: 3600,
  };
}
export function approvalFixture(source = sourceFixture()): Approval {
  return {
    sourceId: source.id,
    url: source.officialUrl,
    operatorEvidenceUrl: 'https://example.jp/about',
    termsEvidenceUrl: 'https://example.jp/terms',
    termsDecision: 'allowed',
    robotsDigest: null,
    robotsAbsenceApproved: true,
    reviewedAt: NOW,
    expiresAt: '2026-11-18T00:00:00.000Z',
    scopePaths: ['/'],
    imageHosts: [],
    formats: ['rss', 'atom', 'html', 'sitemap'],
    minIntervalSeconds: 3600,
    requestGapMs: 1000,
    testEvidence: {
      url: source.officialUrl,
      digest: 'a'.repeat(64),
      parserVersion: 'synthetic-fixture-1',
      passed: true,
      checkedAt: NOW,
    },
    purpose: 'Synthetic offline test; no authorization for real example.jp',
  };
}
export function context(format: Format = 'html'): ParseContext {
  const source = sourceFixture(format);
  return {
    source,
    url: source.officialUrl,
    at: NOW,
    approval: approvalFixture(source),
    limits: { ...DEFAULT_LIMITS },
  };
}
export const htmlFixture =
  '<html><head><title>合成天文台</title><meta property="og:image" content="/images/sky.jpg"><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body><ul><li><h2><a href="/events/2026">星空観望会 &amp; 宇宙講座</a></h2><time datetime="2026-11-01">2026年12月1日</time><p>会場：市民天文台</p><img src="/poster.jpg" alt="ポスター"></li><li><a href="/events/2027">2027年 星空観望会</a><p>2027年1月2日</p></li></ul><script>globalThis.unsafeExecuted=true</script></body></html>';
export function fixtureTransport(
  handler: (
    url: URL,
    headers: Headers,
    signal: AbortSignal,
  ) => Response | Promise<Response>,
  calls: string[] = [],
): Transport {
  return {
    assurance: 'fixture',
    async request(url, headers, signal) {
      calls.push(url.href);
      return { response: await handler(url, headers, signal), decoded: true };
    },
  };
}
export function pageResponse(
  body = htmlFixture,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers },
  });
}
