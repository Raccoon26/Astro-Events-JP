import type { CollectedPage, Collector } from '../contracts';
import type { Source } from '../domain';
import type { Registration } from '../registry';
import { assertApproval, inScope, safeUrl, USER_AGENT } from './policy';
import { robotsPolicy } from './robots';
import { decodeDocument, digest } from './text';
import {
  type Approval,
  CollectionError,
  type Limits,
  limits,
  type Transport,
} from './types';
export interface HttpDocument extends CollectedPage {
  status: 200 | 304;
  etag: string | null;
  lastModified: string | null;
  requests: number;
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new CollectionError('aborted'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new CollectionError('aborted'));
    signal.addEventListener('abort', abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}
export function retryTime(value: string | null, now: number, failure = 0) {
  const parsed =
    value && /^\d+$/.test(value)
      ? now + Number(value) * 1000
      : value
        ? Date.parse(value)
        : NaN;
  return new Date(
    Math.min(
      now + 7 * 86400000,
      Math.max(
        now + 1000,
        Number.isFinite(parsed)
          ? parsed
          : now + Math.min(86400000, 60000 * 2 ** Math.min(failure, 10)),
      ),
    ),
  ).toISOString();
}
export class SafeHttpCollector implements Collector {
  readonly settings: Limits;
  requests = 0;
  private lastRequest = 0;
  constructor(
    readonly transport: Transport,
    readonly approval: Approval,
    settings: Partial<Limits> = {},
    readonly fixtureMode = false,
    readonly clock = () => Date.now(),
    readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    this.settings = limits(settings);
  }
  private async request(url: URL, headers: Headers, signal: AbortSignal) {
    if (
      this.transport.assurance === 'unavailable' ||
      (this.transport.assurance === 'fixture' && !this.fixtureMode)
    )
      throw new CollectionError('dns-protection-unavailable');
    if (signal.aborted) throw new CollectionError('aborted');
    if (this.requests >= this.settings.maxRequests)
      throw new CollectionError('budget-exhausted');
    const gap = Math.max(this.settings.gapMs, this.approval.requestGapMs);
    const wait = Math.max(0, this.lastRequest + gap - this.clock());
    if (wait) await this.sleep(wait);
    if (signal.aborted) throw new CollectionError('aborted');
    this.requests++;
    this.lastRequest = this.clock();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.settings.timeoutMs);
    try {
      const result = await abortable(
        this.transport.request(url, headers, controller.signal),
        controller.signal,
      );
      const response = result.response;
      if (!result.decoded) throw new CollectionError('invalid-content-type');
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => {});
        return { response, bytes: new Uint8Array() };
      }
      const declared = Number(response.headers.get('Content-Length'));
      if (declared > this.settings.maxBytes) {
        await response.body?.cancel();
        throw new CollectionError('body-too-large');
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (reader) {
        let next: ReadableStreamReadResult<Uint8Array>;
        try {
          next = await abortable(reader.read(), controller.signal);
        } catch (error) {
          void reader.cancel().catch(() => {});
          throw error;
        }
        if (next.done) break;
        size += next.value.byteLength;
        if (size > this.settings.maxBytes) {
          void reader.cancel().catch(() => {});
          throw new CollectionError('body-too-large');
        }
        chunks.push(next.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return { response, bytes };
    } catch (error) {
      if (timedOut) throw new CollectionError('timeout');
      if (signal.aborted) throw new CollectionError('aborted');
      if (error instanceof CollectionError) throw error;
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        ['invalid-host', 'body-too-large'].includes(String(error.code))
      )
        throw new CollectionError(
          error.code as 'invalid-host' | 'body-too-large',
        );
      throw new CollectionError('network-error');
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
  private async follow(
    raw: string,
    source: Registration,
    signal: AbortSignal,
    headers: Headers,
    robots = false,
    checkPath?: (url: URL) => void,
  ) {
    let url = safeUrl(raw, source.allowedHosts);
    const originalOrigin = url.origin;
    for (let hop = 0; hop <= this.settings.maxRedirects; hop++) {
      if (!robots && !inScope(url, this.approval.scopePaths))
        throw new CollectionError('unsafe-redirect');
      if (!robots && url.origin !== originalOrigin)
        throw new CollectionError('unsafe-redirect');
      checkPath?.(url);
      const result = await this.request(url, headers, signal);
      if ([301, 302, 303, 307, 308].includes(result.response.status)) {
        const location = result.response.headers.get('location');
        if (!location || hop === this.settings.maxRedirects)
          throw new CollectionError('unsafe-redirect');
        try {
          const next = safeUrl(
            new URL(location, url).href,
            source.allowedHosts,
          );
          if (
            robots &&
            (next.origin !== url.origin || next.pathname !== '/robots.txt')
          )
            throw new Error();
          url = next;
        } catch {
          throw new CollectionError('unsafe-redirect');
        }
        // Validators belong to one representation, never forward them across URL changes.
        headers = new Headers({
          'User-Agent': USER_AGENT,
          Accept: headers.get('Accept') ?? '*/*',
        });
        continue;
      }
      return { ...result, url: url.href };
    }
    throw new CollectionError('unsafe-redirect');
  }
  async fetchDocument(
    source: Registration,
    signal: AbortSignal,
    raw = source.officialUrl,
    validators: { etag: string | null; lastModified: string | null } = {
      etag: source.etag,
      lastModified: source.lastModified,
    },
  ): Promise<HttpDocument> {
    const now = new Date(this.clock()).toISOString();
    assertApproval(source, this.approval, now);
    const target = safeUrl(raw, source.allowedHosts);
    if (!inScope(target, this.approval.scopePaths))
      throw new CollectionError('invalid-host');
    const baseHeaders = new Headers({
      'User-Agent': USER_AGENT,
      Accept:
        'text/html, application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9',
    });
    const robotsUrl = new URL('/robots.txt', target).href;
    const robots = await this.follow(
      robotsUrl,
      source,
      signal,
      new Headers({ 'User-Agent': USER_AGENT, Accept: 'text/plain' }),
      true,
    );
    let robotsText: string | null = null;
    if (robots.response.status === 429)
      throw new CollectionError(
        'rate-limited',
        retryTime(robots.response.headers.get('Retry-After'), this.clock()),
      );
    if (robots.response.status === 404) {
      if (!this.approval.robotsAbsenceApproved)
        throw new CollectionError('robots-denied');
    } else {
      if (robots.response.status !== 200)
        throw new CollectionError('robots-denied');
      const text = decodeDocument(
        robots.bytes,
        robots.response.headers.get('Content-Type') ?? 'text/plain',
      );
      if (/<(?:html|!doctype)/i.test(text))
        throw new CollectionError('robots-denied');
      robotsText = text;
      if (this.approval.robotsDigest !== (await digest(text)))
        throw new CollectionError('policy-changed');
      const policy = robotsPolicy(text, target.href);
      if (!policy.allowed) throw new CollectionError('robots-denied');
      // Long crawl-delay is deferred, never held as a long-running Cron sleep.
      if (policy.crawlDelayMs > this.approval.requestGapMs)
        throw new CollectionError(
          'rate-limited',
          new Date(this.clock() + policy.crawlDelayMs).toISOString(),
        );
    }
    if (validators.etag)
      baseHeaders.set('If-None-Match', validators.etag.slice(0, 512));
    if (validators.lastModified)
      baseHeaders.set(
        'If-Modified-Since',
        validators.lastModified.slice(0, 128),
      );
    let fetched: Awaited<ReturnType<SafeHttpCollector['follow']>> | undefined;
    for (let attempt = 0; attempt <= this.settings.maxRetries; attempt++) {
      try {
        fetched = await this.follow(
          target.href,
          source,
          signal,
          baseHeaders,
          false,
          (url) => {
            if (
              robotsText !== null &&
              !robotsPolicy(robotsText, url.href).allowed
            )
              throw new CollectionError('robots-denied');
          },
        );
        const status = fetched.response.status;
        if (status === 429)
          throw new CollectionError(
            'rate-limited',
            retryTime(
              fetched.response.headers.get('Retry-After'),
              this.clock(),
              attempt,
            ),
          );
        if ([500, 502, 503, 504].includes(status)) {
          if (fetched.response.headers.has('Retry-After'))
            throw new CollectionError(
              'temporary-server-error',
              retryTime(
                fetched.response.headers.get('Retry-After'),
                this.clock(),
                attempt,
              ),
            );
          if (attempt < this.settings.maxRetries) continue;
          throw new CollectionError(
            'temporary-server-error',
            retryTime(
              fetched.response.headers.get('Retry-After'),
              this.clock(),
              attempt,
            ),
          );
        }
        break;
      } catch (error) {
        if (
          error instanceof CollectionError &&
          ['network-error', 'timeout'].includes(error.code) &&
          attempt < this.settings.maxRetries
        )
          continue;
        throw error;
      }
    }
    if (!fetched) throw new CollectionError('network-error');
    const { response, bytes, url } = fetched;
    if ([401, 403].includes(response.status))
      throw new CollectionError('access-denied');
    if ([404, 410].includes(response.status))
      throw new CollectionError('permanent-not-found');
    if (![200, 304].includes(response.status))
      throw new CollectionError('network-error');
    const contentType = response.headers.get('Content-Type') ?? '';
    if (response.status === 304 && url !== target.href)
      throw new CollectionError('parse-error');
    if (response.status === 304)
      return {
        sourceId: source.id,
        url,
        content: '',
        contentType,
        digest: '',
        fetchedAt: now,
        status: 304,
        etag: response.headers.get('ETag')?.slice(0, 512) ?? validators.etag,
        lastModified:
          response.headers.get('Last-Modified')?.slice(0, 128) ??
          validators.lastModified,
        requests: this.requests,
      };
    const mime = contentType.split(';')[0]?.trim().toLowerCase();
    const accepted =
      source.format === 'html'
        ? ['text/html', 'application/xhtml+xml']
        : [
            'application/xml',
            'text/xml',
            'application/rss+xml',
            'application/atom+xml',
          ];
    if (!mime || !accepted.includes(mime))
      throw new CollectionError('invalid-content-type');
    const content = decodeDocument(bytes, contentType);
    return {
      sourceId: source.id,
      url,
      content,
      contentType,
      digest: await digest(content),
      fetchedAt: now,
      status: 200,
      etag:
        url === target.href
          ? (response.headers.get('ETag')?.slice(0, 512) ?? null)
          : null,
      lastModified:
        url === target.href
          ? (response.headers.get('Last-Modified')?.slice(0, 128) ?? null)
          : null,
      requests: this.requests,
    };
  }
  async collect(
    source: Source,
    signal: AbortSignal,
  ): Promise<CollectedPage | null> {
    const page = await this.fetchDocument(source as Registration, signal);
    return page.status === 304 ? null : page;
  }
}
