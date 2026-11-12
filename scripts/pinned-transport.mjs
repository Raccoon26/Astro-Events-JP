import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
// The resolver and address validator are injected for deterministic security tests.
export function pinnedTransport(
  publicIPv4,
  resolve = lookup,
  connect = request,
) {
  return {
    assurance: 'dns-pinned',
    async request(url, headers, signal) {
      const answers = await resolve(url.hostname, {
        all: true,
        verbatim: true,
      });
      if (
        !answers.length ||
        answers.some((a) => a.family !== 4 || !publicIPv4(a.address))
      )
        throw Object.assign(new Error('Unapproved DNS answer'), {
          code: 'invalid-host',
        });
      if (signal.aborted) throw new Error('Aborted');
      const address = answers[0].address;
      return new Promise((resolve, reject) => {
        const req = connect(
          url,
          {
            method: 'GET',
            headers: Object.fromEntries(headers),
            agent: false,
            family: 4,
            autoSelectFamily: false,
            servername: url.hostname,
            signal,
            lookup: (_host, options, callback) =>
              options?.all
                ? callback(null, [{ address, family: 4 }])
                : callback(null, address, 4),
          },
          (response) => {
            if (response.socket.remoteAddress !== address) {
              response.destroy();
              reject(
                Object.assign(new Error('Peer mismatch'), {
                  code: 'invalid-host',
                }),
              );
              return;
            }
            const responseHeaders = new Headers();
            for (const [name, value] of Object.entries(response.headers))
              if (value !== undefined)
                responseHeaders.set(
                  name,
                  Array.isArray(value) ? value.join(', ') : value,
                );
            const encoding =
              response.headers['content-encoding']?.toLowerCase();
            let stream = response;
            if (encoding && encoding !== 'identity') {
              const decoder =
                encoding === 'gzip'
                  ? createGunzip()
                  : encoding === 'br'
                    ? createBrotliDecompress()
                    : encoding === 'deflate'
                      ? createInflate()
                      : null;
              if (!decoder) {
                response.destroy();
                reject(new Error('Unsupported encoding'));
                return;
              }
              response.on('error', (error) => decoder.destroy(error));
              stream = response.pipe(decoder);
              responseHeaders.delete('content-encoding');
              responseHeaders.delete('content-length');
            }
            let wireBytes = 0;
            response.on('data', (chunk) => {
              wireBytes += chunk.length;
              if (wireBytes > 262144) {
                response.destroy(new Error('Wire limit'));
                stream.destroy(new Error('Wire limit'));
              }
            });
            const status = response.statusCode ?? 500;
            const body = [204, 304].includes(status)
              ? null
              : Readable.toWeb(stream, {
                  strategy: {
                    highWaterMark: 16384,
                    size: (chunk) => chunk.byteLength,
                  },
                });
            if (!body) response.resume();
            resolve({
              response: new Response(body, {
                status,
                headers: responseHeaders,
              }),
              decoded: true,
            });
          },
        );
        req.on('error', reject);
        req.end();
      });
    },
  };
}
