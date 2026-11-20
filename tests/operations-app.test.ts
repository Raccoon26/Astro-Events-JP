import { expect, it, vi } from 'vitest';
import { REPORTS_REPO } from '../src/notifications/types';
import {
  appJwt,
  pkcs8Signer,
  ReportsInstallation,
} from '../src/operations/github-app';

const settings = {
  clientId: 'Iv1_fixture',
  installationId: 7,
  repositoryId: 22,
};
const repo = {
  id: 22,
  full_name: REPORTS_REPO,
  private: true,
  has_issues: true,
};
const start = Date.parse('2026-12-01T15:00:00.000Z');
const sign = () => Promise.resolve(new Uint8Array(256).buffer);
function trial(status = 201) {
  let now = start,
    responseStatus = status,
    count = 0,
    visible = true;
  const request = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url));
    expect(path.origin).toBe('https://api.github.com');
    expect(init?.redirect).toBe('error');
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    if (path.pathname.endsWith('/access_tokens')) {
      count++;
      expect(JSON.parse(String(init?.body))).toEqual({
        repository_ids: [22],
        permissions: { issues: 'write', metadata: 'read' },
      });
      if (responseStatus !== 201)
        return new Response(null, {
          status: responseStatus,
          headers: { 'retry-after': '120' },
        });
      return Response.json(
        {
          token: 'fixture-token-' + count,
          expires_at: new Date(now + 3600000).toISOString(),
          repositories: [repo],
          permissions: { issues: 'write', metadata: 'read' },
        },
        { status: 201 },
      );
    }
    return Response.json({ ...repo, private: visible });
  });
  return {
    app: new ReportsInstallation(settings, sign, request, () => now),
    request,
    advance: (ms: number) => {
      now += ms;
    },
    allow: () => {
      responseStatus = 201;
    },
    publish: () => {
      visible = false;
    },
    exchanges: () => count,
  };
}
it('uses RS256 and the official JWT time claims with an actual generated RSA key', async () => {
  const keys = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  if (!('privateKey' in keys)) throw Error('RSA key pair required');
  const buffer = await crypto.subtle.exportKey('pkcs8', keys.privateKey);
  if (!(buffer instanceof ArrayBuffer)) throw Error('Expected PKCS8 bytes');
  const armor = 'PRIVATE KEY';
  const pem = [
    `-----BEGIN ${armor}-----`,
    btoa(String.fromCharCode(...new Uint8Array(buffer))),
    `-----END ${armor}-----`,
  ].join('\n');
  const jwt = await appJwt(settings.clientId, await pkcs8Signer(pem), start);
  const [a, b, c] = jwt.split('.');
  const decode = (s: string) =>
    Uint8Array.from(atob(s.replaceAll('_', '/').replaceAll('-', '+')), (n) =>
      n.charCodeAt(0),
    );
  expect(JSON.parse(new TextDecoder().decode(decode(b!)))).toEqual({
    iss: settings.clientId,
    iat: start / 1000 - 60,
    exp: start / 1000 + 480,
  });
  expect(
    await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      keys.publicKey,
      decode(c!),
      new TextEncoder().encode(a + '.' + b),
    ),
  ).toBe(true);
});
it('coalesces exchanges, refreshes near expiry and checks Private Issues each time', async () => {
  const t = trial();
  await expect(
    Promise.all([t.app.accessForReports(), t.app.accessForReports()]),
  ).resolves.toEqual(['fixture-token-1', 'fixture-token-1']);
  expect(t.exchanges()).toBe(1);
  t.advance(3540000);
  expect(await t.app.accessForReports()).toBe('fixture-token-2');
  t.publish();
  await expect(t.app.accessForReports()).rejects.toThrow(
    'APP_REPORTS_SCOPE_CHANGED',
  );
  await expect(t.app.accessForReports()).rejects.toThrow('revoked');
});
it.each([401, 404])(
  'halts on unambiguous installation failure %i',
  async (status) => {
    const t = trial(status);
    await expect(t.app.accessForReports()).rejects.toThrow('denied');
    t.allow();
    t.advance(3600000);
    await expect(t.app.accessForReports()).rejects.toThrow('denied');
    expect(t.exchanges()).toBe(1);
  },
);
it.each([403, 429, 503])(
  'bounds requests and follows provider backoff %i',
  async (status) => {
    const t = trial(status);
    await expect(t.app.accessForReports()).rejects.toThrow(
      status === 503 ? 'temporary' : 'backoff',
    );
    t.allow();
    await expect(t.app.accessForReports()).rejects.toThrow('backoff');
    t.advance(121000);
    await expect(t.app.accessForReports()).resolves.toBe('fixture-token-2');
  },
);
it('blocks a revoked grant and keeps token values out of errors', async () => {
  const t = trial();
  await t.app.accessForReports();
  await t.app.revokeProvider();
  await expect(t.app.accessForReports()).rejects.toThrow(/^revoked$/u);
  expect(t.request.mock.calls.at(-1)?.[1]?.method).toBe('DELETE');
});
