// Temporary staging-only version. No external fetch, arbitrary input, DB writes or Source activation.

import { parseDocument } from './collection/parse';
import {
  DEFAULT_LIMITS,
  type Format,
  type ParseContext,
  unavailableTransport,
} from './collection/types';
import type { Env } from './config';
import { diagnose } from './diagnostics';
import worker from './index';

const fixtures: Record<Format, string> = {
  html: '<ul><li><a href="/events/1">合成 星空観望会</a><p>2026年12月1日 会場：合成施設</p><img src="/poster.jpg" alt="ポスター"></li></ul>',
  rss: '<rss version="2.0"><channel><item><title>合成 星空観望会</title><link>https://example.jp/events/1</link><guid>fixture1</guid></item></channel></rss>',
  atom: '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>合成 宇宙講演</title><id>fixture1</id><link href="https://example.jp/events/1"/></entry></feed>',
  sitemap: '<urlset><url><loc>https://example.jp/events/1</loc></url></urlset>',
};
function context(format: Format): ParseContext {
  const at = new Date().toISOString();
  return {
    at,
    url: 'https://example.jp/events',
    limits: { ...DEFAULT_LIMITS, maxItems: 1, maxBytes: 4096 },
    source: {
      id: 'dev01r-synthetic-only',
      name: '合成施設',
      operator: 'synthetic',
      officialUrl: 'https://example.jp/events',
      allowedHosts: ['example.jp'],
      prefecture: null,
      municipality: null,
      category: 'local',
      format,
      priority: 0,
      lastCrawledAt: null,
      nextCrawlAt: at,
      etag: null,
      lastModified: null,
      robotsCheckedAt: null,
      termsReviewedAt: null,
      state: 'review',
      officialStatus: 'Review Required',
      evidenceUrl: 'https://example.jp/',
      checkedAt: at,
      robotsStatus: 'not-checked',
      termsStatus: 'not-checked',
      reason:
        'Synthetic parser benchmark; never activate or request example.jp',
      kind: 'observatory',
    },
    approval: {
      sourceId: 'dev01r-synthetic-only',
      url: 'https://example.jp/events',
      operatorEvidenceUrl: 'https://example.jp/',
      termsEvidenceUrl: 'https://example.jp/',
      termsDecision: 'allowed',
      robotsDigest: null,
      robotsAbsenceApproved: false,
      reviewedAt: at,
      expiresAt: at,
      scopePaths: ['/'],
      imageHosts: [],
      formats: [format],
      minIntervalSeconds: 86400,
      requestGapMs: 1000,
      testEvidence: {
        url: 'https://example.jp/events',
        digest: '0'.repeat(64),
        parserVersion: 'synthetic-only',
        passed: false,
        checkedAt: at,
      },
      purpose:
        'Pure fixed parser input; deliberately invalid for network approval',
    },
  };
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/health') return worker.fetch(request, env);
    if (env.APP_ENV !== 'staging' || request.method !== 'GET')
      return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
    const format = path.slice('/benchmark/'.length);
    if (
      !path.startsWith('/benchmark/') ||
      !['rss', 'atom', 'html', 'sitemap', 'ssrf'].includes(format)
    )
      return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
    const health = await diagnose(env);
    if (health.code !== 'OK')
      return Response.json({ code: health.code }, { status: 503 });
    if (format === 'ssrf') {
      try {
        await unavailableTransport.request(
          new URL('https://example.jp/'),
          new Headers(),
          new AbortController().signal,
        );
      } catch {
        return Response.json({
          code: 'dns-protection-unavailable',
          externalRequests: 0,
        });
      }
      return Response.json({ code: 'UNEXPECTED_TRANSPORT' }, { status: 500 });
    }
    const parsed = await parseDocument(
      fixtures[format as Format],
      context(format as Format),
    );
    console.log(
      JSON.stringify({
        kind: 'synthetic-parser-benchmark',
        format,
        candidates: parsed.candidates.length,
        dbRowsRead: health.rowsRead,
        dbRowsWritten: health.rowsWritten,
        externalRequests: 0,
        collectionEnabled: false,
        notificationsEnabled: false,
        cpuTimeMs: null,
      }),
    );
    return Response.json({
      format,
      candidates: parsed.candidates.length,
      rights: parsed.candidates.flatMap((c) =>
        c.images.map((i) => i.rightsStatus),
      ),
      dbRowsRead: health.rowsRead,
      dbRowsWritten: health.rowsWritten,
      cpuTimeMs: null,
      externalRequests: 0,
      synthetic: true,
    });
  },
  scheduled: worker.scheduled,
} satisfies ExportedHandler<Env>;
