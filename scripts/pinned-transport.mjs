import { lookup } from 'node:dns/promises';
import { Agent, request } from 'node:https';
import { isIPv4 } from 'node:net';
import { pipeline, Readable, Transform } from 'node:stream';
import { connect as tlsConnect } from 'node:tls';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

const BODY_LIMIT = 256 * 1024;
const DNS_ANSWER_LIMIT = 32;
const REQUEST_HEADERS = [
  'accept',
  'user-agent',
  'if-none-match',
  'if-modified-since',
];
const RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'location',
  'etag',
  'last-modified',
  'retry-after',
];
const invalidHost = () =>
  Object.assign(new Error('Unverified HTTPS target'), { code: 'invalid-host' });
const bodyTooLarge = () =>
  Object.assign(new Error('Response size limit'), { code: 'body-too-large' });

function verifiedRequest(url, options, response) {
  const agent = new Agent({ keepAlive: false, maxCachedSessions: 0 });
  agent.createConnection = (_options, ready) => {
    options.lookup(url.hostname, { all: false }, (_error, address) => {
      const socket = tlsConnect({
        host: address,
        port: 443,
        family: 4,
        servername: url.hostname,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        signal: options.signal,
      });
      // Do not give HTTP the socket, or send request headers, until TLS
      // validates the original hostname and the kernel peer matches the pin.
      let handedOff = false;
      const fail = (error) => {
        if (handedOff) return;
        handedOff = true;
        socket.destroy();
        ready(error);
      };
      socket.on('error', fail);
      socket.once('close', () =>
        fail(new Error('TLS closed before verification')),
      );
      socket.once('secureConnect', () => {
        if (
          options.signal.aborted ||
          !socket.authorized ||
          socket.remoteAddress !== address ||
          socket.remotePort !== 443
        ) {
          fail(invalidHost());
          return;
        }
        handedOff = true;
        ready(null, socket);
      });
    });
    // Returning the socket here would let the HTTP agent use it before verification.
  };
  const req = request(url, { ...options, agent }, response);
  req.once('close', () => agent.destroy());
  req.once('upgrade', (_response, socket) => {
    socket.destroy();
    req.destroy(new Error('Protocol upgrade refused'));
  });
  return req;
}

function sizeLimit() {
  let bytes = 0;
  return new Transform({
    transform(chunk, _encoding, done) {
      bytes += chunk.byteLength;
      if (bytes > BODY_LIMIT) done(bodyTooLarge());
      else done(null, chunk);
    },
  });
}

function boundedResponse(message) {
  const status = message.statusCode;
  if (!Number.isInteger(status) || status < 200 || status > 599)
    throw new Error('Unsupported HTTP status');
  const headers = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = message.headers[name];
    if (typeof value === 'string') headers.set(name, value);
  }
  if (status !== 200) {
    message.destroy();
    return new Response(null, { status, headers });
  }
  if (Number(headers.get('content-length')) > BODY_LIMIT) throw bodyTooLarge();
  const encoding = message.headers['content-encoding']?.toLowerCase();
  const decoders = {
    gzip: createGunzip,
    br: createBrotliDecompress,
    deflate: createInflate,
  };
  let decoder;
  if (encoding && encoding !== 'identity') {
    if (!Object.hasOwn(decoders, encoding))
      throw new Error('Unsupported encoding');
    decoder = decoders[encoding]();
    headers.delete('content-length');
  }
  const body = decoder
    ? pipeline(message, sizeLimit(), decoder, sizeLimit(), () => {})
    : pipeline(message, sizeLimit(), () => {});
  return new Response(
    Readable.toWeb(body, {
      strategy: {
        highWaterMark: 16384,
        size: (chunk) => chunk.byteLength,
      },
    }),
    { status, headers },
  );
}

// Approval/robots/redirect decisions are made by SafeHttpCollector before each
// call. The DNS resolver and HTTP connector can be replaced in isolated tests.
export function pinnedTransport(
  publicIPv4,
  resolve = lookup,
  connect = verifiedRequest,
) {
  return {
    assurance: 'dns-pinned',
    async request(url, headers, signal, checkCurrent) {
      if (
        url.href.length > 4096 ||
        url.protocol !== 'https:' ||
        url.port ||
        url.username ||
        url.password ||
        !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/u.test(url.hostname) ||
        /(?:^|\.)(?:localhost|local|internal|test|invalid)$/u.test(url.hostname)
      )
        throw invalidHost();
      signal.throwIfAborted();
      const answers = await resolve(url.hostname, {
        all: true,
        verbatim: true,
      });
      if (
        !Array.isArray(answers) ||
        !answers.length ||
        answers.length > DNS_ANSWER_LIMIT ||
        answers.some(
          (answer) =>
            answer?.family !== 4 ||
            !isIPv4(answer.address) ||
            !publicIPv4(answer.address),
        )
      )
        throw invalidHost();
      signal.throwIfAborted();
      await checkCurrent?.();
      signal.throwIfAborted();
      const address = answers[0].address;
      const outbound = { 'accept-encoding': 'gzip, br, deflate' };
      for (const name of REQUEST_HEADERS) {
        const value = headers.get(name);
        if (value !== null && value.length > 1024)
          throw new Error('Request header size limit');
        if (value !== null) outbound[name] = value;
      }
      return new Promise((resolve, reject) => {
        const req = connect(
          url,
          {
            method: 'GET',
            headers: outbound,
            agent: false,
            family: 4,
            autoSelectFamily: false,
            servername: url.hostname,
            rejectUnauthorized: true,
            maxHeaderSize: 16 * 1024,
            signal,
            lookup: (_host, options, callback) =>
              options?.all
                ? callback(null, [{ address, family: 4 }])
                : callback(null, address, 4),
          },
          (message) => {
            try {
              if (message.socket.remoteAddress !== address) throw invalidHost();
              resolve({ response: boundedResponse(message), decoded: true });
            } catch (error) {
              message.destroy();
              reject(error);
            }
          },
        );
        req.on('error', reject);
        req.end();
      });
    },
  };
}
