import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { retryTime, SafeHttpCollector } from '../src/collection/http';
import { publicIPv4, safeUrl } from '../src/collection/policy';
import { robotsPolicy } from '../src/collection/robots';
import { digest } from '../src/collection/text';
import { unavailableTransport } from '../src/collection/types';
import {
  approvalFixture,
  fixtureTransport,
  htmlFixture,
  NOW,
  pageResponse,
  sourceFixture,
} from './collection-fixtures';

const signal = () => new AbortController().signal;
function collector(
  handler: (
    url: URL,
    headers: Headers,
    signal: AbortSignal,
  ) => Response | Promise<Response>,
  settings = {},
  approval = approvalFixture(),
) {
  const calls: string[] = [];
  const transport = fixtureTransport(
    (url, headers, sig) =>
      url.pathname === '/robots.txt'
        ? new Response('', { status: 404 })
        : handler(url, headers, sig),
    calls,
  );
  const http = new SafeHttpCollector(
    transport,
    approval,
    settings,
    true,
    () => Date.parse(NOW),
    async () => {},
  );
  return { http, calls, transport };
}
describe('exact host and routable address policy', () => {
  it.each([
    'https://localhost/a',
    'https://127.0.0.1/a',
    'https://10.0.0.1/a',
    'https://[::1]/',
    'https://[fc00::1]/',
    'https://169.254.169.254/',
    'file:///x',
    'ftp://example.jp/x',
    'data:text/html,x',
    'javascript:alert(1)',
    'https://user:pass@example.jp/x',
    'https://example.jp:8080/',
    'https://example.jp.attacker.test/',
    'https://example.jp/%2fsecret',
    'https://example.jp/%ZZ',
    'https://ｅxample.jp/',
    'https://example.jp/\\x',
  ])('blocks dangerous URL %s', (url) => {
    expect(() => safeUrl(url, ['example.jp'])).toThrow();
  });
  it('canonicalizes reviewed hosts and allows explicit IDN punycode only', () => {
    expect(
      safeUrl('https://EXAMPLE.JP:443/events', ['example.jp']).hostname,
    ).toBe('example.jp');
    expect(
      safeUrl('https://xn--wgv71a119e.jp/', ['xn--wgv71a119e.jp']).hostname,
    ).toBe('xn--wgv71a119e.jp');
    expect(() => safeUrl('https://sub.example.jp/', ['example.jp'])).toThrow();
  });
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '127.1.2.3',
    '100.64.0.1',
    '169.254.169.254',
    '172.16.1.1',
    '192.168.0.1',
    '192.0.2.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '::ffff:127.0.0.1',
    'fc00::1',
  ])('rejects non-global address %s', (ip) => {
    expect(publicIPv4(ip)).toBe(false);
  });
});
describe('robots matching and manual approval gates', () => {
  it('separates a crawl-delay-only group and ignores end anchors in rule specificity', () => {
    const groups =
      'User-agent: AstroEventsJP\nCrawl-delay: 5\nUser-agent: OtherBot\nDisallow: /';
    expect(robotsPolicy(groups, 'https://example.jp/')).toEqual({
      allowed: true,
      crawlDelayMs: 5000,
    });
    expect(
      robotsPolicy(
        'User-agent: *\nAllow: /events\nDisallow: /events$',
        'https://example.jp/events',
      ).allowed,
    ).toBe(true);
  });
  it('uses matching User-Agent groups, longest paths, allow ties and case-sensitive paths', () => {
    const text =
      'User-agent: *\nDisallow: /\nUser-agent: AstroEventsJP\nDisallow: /events\nAllow: /events/public\nDisallow: /events/public/private\nAllow: /events/public/private';
    expect(robotsPolicy(text, 'https://example.jp/events/public').allowed).toBe(
      true,
    );
    expect(
      robotsPolicy(text, 'https://example.jp/events/private').allowed,
    ).toBe(false);
    expect(robotsPolicy(text, 'https://example.jp/Events').allowed).toBe(true);
    expect(
      robotsPolicy(text, 'https://example.jp/events/public/private').allowed,
    ).toBe(true);
  });
  it('handles wildcards, end anchors, percent-encoded paths and crawl delay', () => {
    const text =
      'User-agent: *\nDisallow: /*.pdf$\nDisallow: /%E5%A4%A9%E6%96%87\nCrawl-delay: 3';
    expect(robotsPolicy(text, 'https://example.jp/a.pdf').allowed).toBe(false);
    expect(robotsPolicy(text, 'https://example.jp/a.pdf?view=1').allowed).toBe(
      true,
    );
    expect(robotsPolicy(text, 'https://example.jp/天文').allowed).toBe(false);
    expect(robotsPolicy(text, 'https://example.jp/').crawlDelayMs).toBe(3000);
  });
  it.each(['review', 'unsupported', 'paused'] as const)(
    'never requests a %s source',
    async (state) => {
      const { http, calls } = collector(() => pageResponse());
      await expect(
        http.fetchDocument({ ...sourceFixture(), state }, signal()),
      ).rejects.toMatchObject({ code: 'source-not-active' });
      expect(calls).toEqual([]);
    },
  );
  it('fails closed for missing terms, expired review and unsupported Worker DNS guarantees', async () => {
    const approval = approvalFixture();
    approval.expiresAt = '2026-11-01';
    const { http, calls } = collector(() => pageResponse(), {}, approval);
    await expect(
      http.fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({ code: 'terms-unreviewed' });
    expect(calls).toHaveLength(0);
    await expect(
      new SafeHttpCollector(
        unavailableTransport,
        approvalFixture(),
      ).fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({ code: 'dns-protection-unavailable' });
  });
  it('does not allow fixture transports in the network collector by default', async () => {
    const { transport } = collector(() => pageResponse());
    await expect(
      new SafeHttpCollector(transport, approvalFixture()).fetchDocument(
        sourceFixture(),
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'dns-protection-unavailable' });
  });
  it('rechecks fresh robots and refuses changed rules or failed policy retrieval', async () => {
    const approval = approvalFixture();
    approval.robotsDigest = await digest('User-agent: *\nDisallow: /');
    const transport = fixtureTransport(
      () =>
        new Response('User-agent: *\nDisallow: /', {
          headers: { 'Content-Type': 'text/plain' },
        }),
    );
    const http = new SafeHttpCollector(
      transport,
      approval,
      {},
      true,
      () => Date.parse(NOW),
      async () => {},
    );
    await expect(
      http.fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({ code: 'robots-denied' });
    const missing = new SafeHttpCollector(
      fixtureTransport(() => new Response('', { status: 503 })),
      approval,
      {},
      true,
      () => Date.parse(NOW),
      async () => {},
    );
    await expect(
      missing.fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({ code: 'robots-denied' });
  });
});
describe('bounded HTTP fetch, redirects, caches and backoff', () => {
  it('handles 200 and sends conditional headers without treating ETag as event verification', async () => {
    let actual: Headers | undefined;
    const { http } = collector((_url, headers) => {
      actual = headers;
      return pageResponse(undefined, 200, {
        ETag: '"v1"',
        'Last-Modified': 'Sun, 01 Nov 2026 00:00:00 GMT',
      });
    });
    const page = await http.fetchDocument(
      sourceFixture(),
      signal(),
      undefined,
      { etag: '"old"', lastModified: 'old-date' },
    );
    expect(page.status).toBe(200);
    expect(actual?.get('If-None-Match')).toBe('"old"');
    expect(page.etag).toBe('"v1"');
    expect(page.digest).toHaveLength(64);
  });
  it('returns 304 without a body and honors request budgets', async () => {
    const { http } = collector(() => new Response(null, { status: 304 }));
    expect(await http.collect(sourceFixture(), signal())).toBeNull();
    const tiny = collector(() => pageResponse(), { maxRequests: 1 });
    await expect(
      tiny.http.fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({ code: 'budget-exhausted' });
  });
  it.each([301, 302, 307, 308])(
    'validates each %i redirect and drops old validators',
    async (status) => {
      let conditional: string | null = 'not checked';
      const { http } = collector((url, headers) =>
        url.pathname === '/events'
          ? new Response(null, {
              status,
              headers: { Location: '/events/next' },
            })
          : ((conditional = headers.get('If-None-Match')), pageResponse()),
      );
      expect(
        (
          await http.fetchDocument(sourceFixture(), signal(), undefined, {
            etag: 'old',
            lastModified: null,
          })
        ).url,
      ).toBe('https://example.jp/events/next');
      expect(conditional).toBeNull();
    },
  );
  it('rejects cross-host redirects, path escapes, loops and robots-disallowed destinations', async () => {
    const { http } = collector(
      () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://127.0.0.1/' },
        }),
    );
    await expect(
      http.fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({ code: 'unsafe-redirect' });
    const approval = approvalFixture();
    approval.scopePaths = ['/events'];
    await expect(
      collector(
        () =>
          new Response(null, {
            status: 302,
            headers: { Location: '/private' },
          }),
        {},
        approval,
      ).http.fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({ code: 'unsafe-redirect' });
    await expect(
      collector(
        () =>
          new Response(null, { status: 302, headers: { Location: '/events' } }),
      ).http.fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({ code: 'unsafe-redirect' });
  });
  it.each([
    [403, 'access-denied'],
    [404, 'permanent-not-found'],
    [410, 'permanent-not-found'],
    [500, 'temporary-server-error'],
    [503, 'temporary-server-error'],
  ] as const)('classifies HTTP %s as %s', async (status, code) => {
    const { http, calls } = collector(() => new Response('', { status }));
    await expect(
      http.fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({ code });
    expect(calls.length).toBeLessThanOrEqual(3);
  });
  it('defers 429 without immediate retry and understands numeric/date Retry-After', async () => {
    const { http, calls } = collector(
      () =>
        new Response('', { status: 429, headers: { 'Retry-After': '120' } }),
    );
    await expect(
      http.fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({
      code: 'rate-limited',
      retryAt: '2026-11-12T00:02:00.000Z',
    });
    expect(calls).toHaveLength(2);
    expect(retryTime('Thu, 12 Nov 2026 00:03:00 GMT', Date.parse(NOW))).toBe(
      '2026-11-12T00:03:00.000Z',
    );
    expect(Date.parse(retryTime(null, Date.parse(NOW), 2))).toBeGreaterThan(
      Date.parse(NOW),
    );
  });
  it('retries transient failure once and isolates network errors', async () => {
    let n = 0;
    const { http } = collector(() =>
      ++n === 1 ? new Response('', { status: 503 }) : pageResponse(),
    );
    expect((await http.fetchDocument(sourceFixture(), signal())).status).toBe(
      200,
    );
    const broken = collector(() => {
      throw new Error('do not log upstream secret');
    });
    await expect(
      broken.http.fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({ message: 'network-error' });
    expect(broken.calls).toHaveLength(3);
  });
  it('rejects Content-Length lies, oversized streams and incorrect MIME', async () => {
    await expect(
      collector(() =>
        pageResponse('small', 200, { 'Content-Length': '999999' }),
      ).http.fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({ code: 'body-too-large' });
    await expect(
      collector(() => pageResponse('x'.repeat(100)), {
        maxBytes: 50,
      }).http.fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({ code: 'body-too-large' });
    await expect(
      collector(() =>
        pageResponse('binary', 200, { 'Content-Type': 'image/png' }),
      ).http.fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({ code: 'invalid-content-type' });
  });
  it('checks decompressed bytes rather than trusting a tiny compressed representation', async () => {
    const compressed = gzipSync('x'.repeat(5000));
    const stream = new Blob([compressed])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    await expect(
      collector(
        () =>
          new Response(stream, { headers: { 'Content-Type': 'text/html' } }),
        { maxBytes: 100 },
      ).http.fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({ code: 'body-too-large' });
  });
  it('times out an uncooperative transport and cancels slow bodies/external aborts', async () => {
    await expect(
      collector(() => new Promise<Response>(() => {}), {
        timeoutMs: 20,
        maxRetries: 0,
      }).http.fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({ code: 'timeout' });
    const controller = new AbortController();
    controller.abort();
    await expect(
      collector(() => pageResponse()).http.fetchDocument(
        sourceFixture(),
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: 'aborted' });
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1]));
      },
    });
    await expect(
      collector(
        () =>
          new Response(stream, { headers: { 'Content-Type': 'text/html' } }),
        { timeoutMs: 20, maxRetries: 0 },
      ).http.fetchDocument(sourceFixture(), signal()),
    ).rejects.toMatchObject({ code: 'timeout' });
  });
});
