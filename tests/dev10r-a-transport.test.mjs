import { generateKeyPairSync, sign } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:https';
import { createServer as createTcpServer } from 'node:net';
import { PassThrough } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pinnedTransport } from '../scripts/pinned-transport.mjs';
import { SafeHttpCollector } from '../src/collection/http';
import { publicIPv4, safeUrl } from '../src/collection/policy';
import { unavailableTransport } from '../src/collection/types';
import {
  approvalFixture,
  fixtureTransport,
  NOW,
  pageResponse,
  sourceFixture,
} from './collection-fixtures';

const fixture = vi.hoisted(() => ({ dial: null }));
vi.mock('node:tls', async (original) => {
  const tls = await original();
  return {
    ...tls,
    connect(options) {
      if (!fixture.dial) throw new Error('Test must never access the network');
      return fixture.dial(tls.connect, options);
    },
  };
});
const abortSignal = () => new AbortController().signal;
const target = new URL('https://example.jp/events');
const pin = '8.8.8.8';
const answer = (address = pin, family = 4) => ({ address, family });

afterEach(() => {
  fixture.dial = null;
  vi.restoreAllMocks();
});

describe('DNS and pre-request transport checks', () => {
  it.each([
    ['RFC 1918', [answer(), answer('10.0.0.4')]],
    ['loopback', [answer(), answer('127.0.0.4')]],
    ['metadata', [answer('169.254.169.254')]],
    ['Azure platform address', [answer('168.63.129.16')]],
    ['reserved AS112 range', [answer('192.31.196.1')]],
    ['public A and AAAA', [answer(), answer('2606:4700::1', 6)]],
    ['IPv6 only', [answer('2606:4700::1', 6)]],
    ['IPv4-mapped IPv6', [answer('::ffff:127.0.0.1', 6)]],
    ['malformed family', [answer('::1', 4)]],
    ['excessive answer set', Array.from({ length: 33 }, () => answer())],
  ])('never dials for %s', async (_scenario, answers) => {
    const connect = vi.fn();
    const transport = pinnedTransport(publicIPv4, async () => answers, connect);
    await expect(
      transport.request(target, new Headers(), abortSignal()),
    ).rejects.toMatchObject({ code: 'invalid-host' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('takes one public pin from an all-public answer set and forwards only collection headers', async () => {
    const resolve = vi.fn(async () => [answer(), answer('1.1.1.1')]);
    const connect = vi.fn((_url, opts, done) => {
      opts.lookup('example.jp', { all: true }, (_err, rows) =>
        expect(rows).toEqual([answer()]),
      );
      expect(opts.headers).toEqual({
        'if-none-match': '"v1"',
        'accept-encoding': 'gzip, br, deflate',
      });
      return message({ done, status: 304 });
    });
    const headers = new Headers({
      'If-None-Match': '"v1"',
      Authorization: 'synthetic',
      Cookie: 'synthetic',
      Host: 'other.example.jp',
      'Proxy-Authorization': 'synthetic',
    });
    await expect(
      pinnedTransport(publicIPv4, resolve, connect).request(
        target,
        headers,
        abortSignal(),
      ),
    ).resolves.toMatchObject({ response: { status: 304 } });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('does not dial if DNS resolves after the deadline', async () => {
    const controller = new AbortController();
    const connect = vi.fn();
    const transport = pinnedTransport(
      publicIPv4,
      async () => {
        controller.abort();
        return [answer()];
      },
      connect,
    );
    await expect(
      transport.request(target, new Headers(), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('checks the current approval again after DNS and before dialing', async () => {
    const connect = vi.fn();
    const resolve = vi.fn(async () => [answer()]);
    const transport = pinnedTransport(publicIPv4, resolve, connect);
    await expect(
      transport.request(target, new Headers(), abortSignal(), async () => {
        expect(resolve).toHaveBeenCalledOnce();
        throw new Error('approval withdrawn');
      }),
    ).rejects.toThrow('approval withdrawn');
    expect(connect).not.toHaveBeenCalled();
  });
});

function message({ done, status = 200, headers = {}, body = '' }) {
  const req = new EventEmitter();
  req.end = () => {
    const response = new PassThrough();
    response.socket = { remoteAddress: pin };
    response.headers = headers;
    response.statusCode = status;
    done(response);
    response.end(body);
  };
  return req;
}

describe('bounded response', () => {
  it.each([
    ['chunked wire limit', {}, Buffer.alloc(256 * 1024 + 1)],
    [
      'decoded gzip limit',
      { 'content-encoding': 'gzip' },
      gzipSync(Buffer.alloc(256 * 1024 + 1)),
    ],
  ])('stops at the %s', async (_name, headers, body) => {
    const transport = pinnedTransport(
      publicIPv4,
      async () => [answer()],
      (_url, _options, done) => message({ done, headers, body }),
    );
    const { response } = await transport.request(
      target,
      new Headers(),
      abortSignal(),
    );
    await expect(response.arrayBuffer()).rejects.toMatchObject({
      code: 'body-too-large',
    });
  });
  it('keeps redirect and retry metadata while discarding non-200 bodies', async () => {
    const transport = pinnedTransport(
      publicIPv4,
      async () => [answer()],
      (_url, _options, done) =>
        message({
          done,
          status: 503,
          headers: {
            'retry-after': '1800',
            'set-cookie': ['internal=value'],
          },
          body: Buffer.alloc(300000),
        }),
    );
    const { response } = await transport.request(
      target,
      new Headers(),
      abortSignal(),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('1800');
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(response.body).toBeNull();
  });
});

describe('lexical URL, revocation and Worker gates', () => {
  it.each([
    'https://%65xample.jp/events',
    'https://example.jp:0443/events',
    'https://example.jp/events/%2e%2e/x',
    'https://example.jp:/events',
  ])('rejects ambiguous original spelling %s', (url) => {
    expect(() => safeUrl(url, ['example.jp'])).toThrow();
  });
  it.each([
    'http://example.jp/events/new',
    '///example.jp/events/new',
    '//%65xample.jp/events/new',
    '//éxample.jp/events/new',
    'https://sub.example.jp/events/new',
    '/events/%2e/new',
    '/events/\\new',
  ])(
    'does not normalize an untrusted redirect into an allowed request %s',
    async (location) => {
      const calls = [];
      const t = fixtureTransport(
        (url) =>
          url.pathname === '/robots.txt'
            ? new Response(null, { status: 404 })
            : new Response(null, {
                status: 302,
                headers: { Location: location },
              }),
        calls,
      );
      const collector = new SafeHttpCollector(
        t,
        approvalFixture(),
        {},
        true,
        () => Date.parse(NOW),
        async () => {},
      );
      await expect(
        collector.fetchDocument(sourceFixture(), abortSignal()),
      ).rejects.toMatchObject({ code: 'unsafe-redirect' });
      expect(calls).toHaveLength(2);
    },
  );
  it('rechecks a revoked approval between robots and the first document request', async () => {
    const calls = [];
    let current = true;
    const t = fixtureTransport(() => {
      current = false;
      return new Response(null, { status: 404 });
    }, calls);
    const collector = new SafeHttpCollector(
      t,
      approvalFixture(),
      {},
      true,
      () => Date.parse(NOW),
      async () => {},
      async () => {
        if (!current) throw new Error('policy revoked');
      },
    );
    await expect(
      collector.fetchDocument(sourceFixture(), abortSignal()),
    ).rejects.toThrow('policy revoked');
    expect(calls).toHaveLength(1);
  });
  it('leaves normal relative redirects within the approved HTTPS origin available', async () => {
    const calls = [];
    const t = fixtureTransport((url) => {
      if (url.pathname === '/robots.txt')
        return new Response(null, { status: 404 });
      if (url.pathname === '/events')
        return new Response(null, {
          status: 302,
          headers: { Location: '/events/new' },
        });
      return pageResponse();
    }, calls);
    const collector = new SafeHttpCollector(
      t,
      approvalFixture(),
      {},
      true,
      () => Date.parse(NOW),
      async () => {},
    );
    await expect(
      collector.fetchDocument(sourceFixture(), abortSignal()),
    ).resolves.toMatchObject({ url: 'https://example.jp/events/new' });
    expect(calls).toHaveLength(3);
  });
  it('does not call generic fetch as a fallback in Workers', async () => {
    const globalFetch = vi.spyOn(globalThis, 'fetch');
    await expect(
      new SafeHttpCollector(
        unavailableTransport,
        approvalFixture(),
      ).fetchDocument(sourceFixture(), abortSignal()),
    ).rejects.toMatchObject({ code: 'dns-protection-unavailable' });
    expect(globalFetch).not.toHaveBeenCalled();
  });
});

function der(tag, ...content) {
  const bytes = Buffer.concat(content);
  const length = bytes.length;
  const size =
    length < 128
      ? [length]
      : length < 256
        ? [129, length]
        : [130, length >> 8, length & 255];
  return Buffer.concat([Buffer.from([tag, ...size]), bytes]);
}

// Ephemeral self-signed test roots. The fixture private key only exists in process memory.
function credentials(hostname, expired) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const sequence = (...parts) => der(48, ...parts);
  const sha256WithRsa = sequence(
    Buffer.from('06092a864886f70d01010b0500', 'hex'),
  );
  const name = sequence(
    der(
      49,
      sequence(
        Buffer.from('0603550403', 'hex'),
        der(12, Buffer.from(hostname)),
      ),
    ),
  );
  const validity = sequence(
    der(23, Buffer.from('200101000000Z')),
    der(23, Buffer.from(expired ? '210101000000Z' : '491231235959Z')),
  );
  const tbs = sequence(
    der(2, Buffer.from([1])),
    sha256WithRsa,
    name,
    validity,
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
  );
  const certificate = sequence(
    tbs,
    sha256WithRsa,
    der(3, Buffer.from([0]), sign('sha256', tbs, privateKey)),
  );
  const cert =
    '-----BEGIN CERTIFICATE-----\n' +
    certificate.toString('base64') +
    '\n-----END CERTIFICATE-----\n';
  return { cert, key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
}

describe('native TLS on an isolated loopback server', () => {
  it.each(['disconnect', 'timeout'])(
    'closes an unverified TLS handshake on %s',
    async (mode) => {
      const started = Promise.withResolvers();
      const server = createTcpServer((socket) => {
        started.resolve(socket);
        if (mode === 'disconnect') socket.destroy();
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const controller = new AbortController();
      fixture.dial = (nativeConnect, options) =>
        nativeConnect({ ...options, port: server.address().port });
      const transport = pinnedTransport(
        (ip) => ip === '127.0.0.1',
        async () => [answer('127.0.0.1')],
      );
      const pending = expect(
        transport.request(target, new Headers(), controller.signal),
      ).rejects.toThrow();
      const socket = await started.promise;
      try {
        if (mode === 'timeout') setTimeout(() => controller.abort(), 25);
        await pending;
      } finally {
        socket.destroy();
        await new Promise((resolve) => server.close(resolve));
      }
    },
    10000,
  );
  it.each([
    [
      'verified certificate and peer',
      'example.jp',
      false,
      'matches',
      undefined,
    ],
    [
      'wrong certificate hostname',
      'other.example.jp',
      false,
      'matches',
      'ERR_TLS_CERT_ALTNAME_INVALID',
    ],
    ['expired certificate', 'example.jp', true, 'matches', 'CERT_HAS_EXPIRED'],
    [
      'untrusted chain',
      'example.jp',
      false,
      'untrusted',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
    ],
    [
      'peer mismatch after authorized TLS',
      'example.jp',
      false,
      'mismatch',
      'invalid-host',
    ],
  ])(
    '%s',
    async (_label, name, expired, mode, errorCode) => {
      const tls = credentials(name, expired);
      const got = { sni: null, requests: 0 };
      const server = createServer(tls, (req, res) => {
        got.requests++;
        expect(req.headers.host).toBe('example.jp');
        res.writeHead(200, { 'Content-Type': 'text/html' }).end('verified');
      });
      server.on('secureConnection', (socket) => {
        got.sni = socket.servername;
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const testPort = server.address().port;
        const dnsIp = mode === 'mismatch' ? pin : '127.0.0.1';
        fixture.dial = (nativeConnect, options) => {
          expect(options).toMatchObject({
            host: dnsIp,
            port: 443,
            servername: 'example.jp',
            rejectUnauthorized: true,
          });
          // Redirect only this test's dial to loopback and its ephemeral port.
          const socket = nativeConnect({
            ...options,
            host: '127.0.0.1',
            port: testPort,
            ca: mode === 'untrusted' ? [] : tls.cert,
          });
          Object.defineProperty(socket, 'remotePort', { get: () => 443 });
          return socket;
        };
        const transport = pinnedTransport(
          (ip) => ip === dnsIp,
          async () => [answer(dnsIp)],
        );
        const pending = transport.request(
          target,
          new Headers(),
          AbortSignal.timeout(4000),
        );
        if (errorCode) {
          await expect(pending).rejects.toMatchObject({ code: errorCode });
          expect(got.requests).toBe(0);
        } else {
          const { response } = await pending;
          expect(await response.text()).toBe('verified');
          expect(got.requests).toBe(1);
          expect(got.sni).toBe('example.jp');
        }
      } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    },
    10000,
  );
});
