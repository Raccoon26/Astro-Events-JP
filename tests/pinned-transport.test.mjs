import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { expect, it } from 'vitest';
import { pinnedTransport } from '../scripts/pinned-transport.mjs';

it('never connects if DNS includes private/IPv6/ambiguous answers', async () => {
  let connects = 0;
  const connect = () => {
    connects++;
    throw new Error('must not connect');
  };
  for (const answers of [
    [{ address: '127.0.0.1', family: 4 }],
    [
      { address: '1.1.1.1', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ],
    [{ address: '2001:db8::1', family: 6 }],
    [],
  ])
    await expect(
      pinnedTransport(
        (ip) => ip === '1.1.1.1',
        async () => answers,
        connect,
      ).request(
        new URL('https://example.jp/'),
        new Headers(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'invalid-host' });
  expect(connects).toBe(0);
});
it('pins lookup to the checked IP with TLS SNI, disables connection pooling and verifies the peer', async () => {
  let options;
  const connect = (_url, opts, callback) => {
    options = opts;
    const req = new EventEmitter();
    req.end = () => {
      const body = new PassThrough();
      body.socket = { remoteAddress: '1.1.1.1' };
      body.headers = { 'content-type': 'text/html' };
      body.statusCode = 200;
      callback(body);
      body.end('fixture');
    };
    return req;
  };
  const transport = pinnedTransport(
    (ip) => ip === '1.1.1.1',
    async () => [{ address: '1.1.1.1', family: 4 }],
    connect,
  );
  const { response } = await transport.request(
    new URL('https://example.jp/'),
    new Headers(),
    new AbortController().signal,
  );
  expect(await response.text()).toBe('fixture');
  expect(options.servername).toBe('example.jp');
  expect(options.agent).toBe(false);
  expect(options.family).toBe(4);
  options.lookup('example.jp', { all: false }, (_error, address, family) => {
    expect(address).toBe('1.1.1.1');
    expect(family).toBe(4);
  });
});
it('rejects peer-IP changes after DNS verification rather than falling back to native fetch', async () => {
  const connect = (_url, _opts, callback) => {
    const req = new EventEmitter();
    req.end = () => {
      const body = new PassThrough();
      body.socket = { remoteAddress: '127.0.0.1' };
      body.headers = {};
      body.statusCode = 200;
      callback(body);
    };
    return req;
  };
  await expect(
    pinnedTransport(
      () => true,
      async () => [{ address: '1.1.1.1', family: 4 }],
      connect,
    ).request(
      new URL('https://example.jp/'),
      new Headers(),
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'invalid-host' });
});
