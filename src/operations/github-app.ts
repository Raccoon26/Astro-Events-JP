import {
  InstallationCredential,
  type InstallationExchange,
  type InstallationFailure,
  type InstallationGrant,
} from '../notifications/installation-auth';
import { REPORTS_REPO } from '../notifications/types';

const API = 'https://api.github.com';
const encoder = new TextEncoder();
function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}
function part(value: Record<string, unknown>) {
  return base64url(encoder.encode(JSON.stringify(value)));
}
export type AppSigner = (
  message: Uint8Array<ArrayBuffer>,
) => Promise<ArrayBuffer>;
export async function pkcs8Signer(pem: string): Promise<AppSigner> {
  // GitHub's RSA PEM may use PKCS#1. Wrap the DER sequence with the PKCS#8 RSA identifier.
  const match =
    /^-----BEGIN (RSA PRIVATE KEY|PRIVATE KEY)-----\s+([A-Za-z0-9+/=\r\n]+)\s+-----END \1-----\s*$/u.exec(
      pem,
    );
  if (pem.length > 8192 || !match) throw Error('APP_KEY_INVALID');
  let der: Uint8Array<ArrayBuffer>;
  try {
    const native = Uint8Array.from(atob(match[2]!.replace(/\s/gu, '')), (c) =>
      c.charCodeAt(0),
    );
    const length = (n: number) => (n < 128 ? [n] : [0x82, n >> 8, n & 255]);
    const prefix = [
      2,
      1,
      0,
      48,
      13,
      6,
      9,
      42,
      134,
      72,
      134,
      247,
      13,
      1,
      1,
      1,
      5,
      0,
      4,
      ...length(native.length),
    ];
    der =
      match[1] === 'RSA PRIVATE KEY'
        ? new Uint8Array([
            48,
            ...length(prefix.length + native.length),
            ...prefix,
            ...native,
          ])
        : native;
    const key = await crypto.subtle.importKey(
      'pkcs8',
      der,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    return (message) => crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, message);
  } catch {
    throw Error('APP_KEY_INVALID');
  }
}
export async function appJwt(clientId: string, sign: AppSigner, now: number) {
  if (
    !/^[a-zA-Z0-9_]{1,120}$/u.test(clientId) ||
    !Number.isSafeInteger(now) ||
    now <= 0
  )
    throw Error('APP_CONFIG_INVALID');
  const seconds = Math.floor(now / 1000);
  const input =
    part({ alg: 'RS256', typ: 'JWT' }) +
    '.' +
    part({ iat: seconds - 60, exp: seconds + 480, iss: clientId });
  const signature = await sign(new Uint8Array(encoder.encode(input)));
  if (signature.byteLength < 128 || signature.byteLength > 1024)
    throw Error('APP_SIGNATURE_INVALID');
  return input + '.' + base64url(new Uint8Array(signature));
}

async function body(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('APP_RESPONSE_INVALID');
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
  let bytes = 0,
    json = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 32768) throw Error('APP_RESPONSE_LIMIT');
      json += text.decode(value, { stream: true });
    }
    const parsed: unknown = JSON.parse(json + text.decode());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw Error('APP_RESPONSE_INVALID');
    return parsed as Record<string, unknown>;
  } catch {
    throw Error('APP_RESPONSE_INVALID');
  } finally {
    await reader.cancel().catch(() => {});
  }
}
const positiveId = (id: number) => Number.isSafeInteger(id) && id > 0;
const parseReset = (r: Response, now: number) => {
  const retry = r.headers.get('retry-after');
  const rawReset = r.headers.get('x-ratelimit-reset');
  const limit =
    r.status === 429 ||
    (r.status === 403 &&
      (retry || r.headers.get('x-ratelimit-remaining') === '0'));
  if (!limit) return undefined;
  const when =
    retry && /^\d{1,10}$/u.test(retry)
      ? now + Number(retry) * 1000
      : Date.parse(retry ?? '');
  return Math.max(
    now + 60000,
    Number.isFinite(when) ? when : 0,
    rawReset && /^\d{1,12}$/u.test(rawReset) ? Number(rawReset) * 1000 : 0,
  );
};
type Settings = {
  clientId: string;
  installationId: number;
  repositoryId: number;
};
type Repository = {
  id: number;
  full_name: string;
  private: boolean;
  has_issues: boolean;
};
export class ReportsInstallation {
  readonly #credentials: InstallationCredential;
  #revoked = false;
  constructor(
    private readonly settings: Settings,
    private readonly sign: AppSigner,
    private readonly wire: typeof fetch,
    private readonly clock = Date.now,
  ) {
    if (
      !positiveId(settings.installationId) ||
      !positiveId(settings.repositoryId) ||
      !/^[a-zA-Z0-9_]{1,120}$/u.test(settings.clientId)
    )
      throw Error('APP_CONFIG_INVALID');
    this.settings = { ...settings };
    const exchange: InstallationExchange = { exchange: () => this.exchange() };
    this.#credentials = new InstallationCredential(
      settings.repositoryId,
      exchange,
      clock,
    );
  }
  private request(
    path: string,
    token: string,
    method = 'GET',
    json?: Record<string, unknown>,
  ) {
    return this.wire(API + path, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2026-03-10',
      },
      ...(json ? { body: JSON.stringify(json) } : {}),
    }).catch(() => {
      throw Error('APP_PROVIDER_UNAVAILABLE');
    });
  }
  private failure(r: Response): InstallationFailure {
    const retryAt = parseReset(r, this.clock());
    return {
      ok: false,
      status: r.status,
      ...(retryAt === undefined ? {} : { retryAt }),
    };
  }
  private same(repo: Partial<Repository>) {
    return (
      repo?.id === this.settings.repositoryId &&
      repo.full_name === REPORTS_REPO &&
      repo.private === true
    );
  }
  private async exchange(): Promise<InstallationGrant | InstallationFailure> {
    const r = await this.request(
      '/app/installations/' + this.settings.installationId + '/access_tokens',
      await appJwt(this.settings.clientId, this.sign, this.clock()),
      'POST',
      {
        repository_ids: [this.settings.repositoryId],
        permissions: { issues: 'write', metadata: 'read' },
      },
    );
    if (r.status !== 201) return this.failure(r);
    const { token, expires_at, permissions, repositories } = await body(r);
    if (typeof token !== 'string' || !/^[\x21-\x7e]{8,8192}$/u.test(token))
      throw Error('APP_TOKEN_INVALID');
    const scope = Array.isArray(repositories)
      ? repositories
      : await this.request('/installation/repositories?per_page=2', token).then(
          async (list) => {
            if (!list.ok) return null;
            const response = await body(list);
            return response.total_count === 1 ? response.repositories : null;
          },
        );
    return {
      ok: true,
      token,
      expiresAt: Date.parse(String(expires_at)),
      repositoryIds:
        Array.isArray(scope) && scope.length === 1 && this.same(scope[0])
          ? [this.settings.repositoryId]
          : [],
      permissions: permissions as Record<string, string>,
    };
  }
  /** Returns the checked grant only for a separately approved internal delivery client. */
  async accessForReports() {
    const token = await this.#credentials.get();
    const r = await this.request('/repos/' + REPORTS_REPO, token);
    if (!r.ok) {
      this.#credentials.observeRejection(
        token,
        r.status,
        parseReset(r, this.clock()),
      );
      throw Error('APP_REPORTS_UNAVAILABLE');
    }
    const repo = await body(r);
    if (this.#revoked || !this.same(repo) || repo.has_issues !== true) {
      this.revokeLocal();
      throw Error('APP_REPORTS_SCOPE_CHANGED');
    }
    return token;
  }
  observeRejection(token: string, status: number, retryAt?: number) {
    this.#credentials.observeRejection(token, status, retryAt);
  }
  /** Rotation always uses a new instance. This blocks old credentials and in-flight exchanges. */
  revokeLocal() {
    this.#revoked = true;
    this.#credentials.revoke();
  }
  async revokeProvider() {
    const token = await this.#credentials.get();
    this.revokeLocal();
    const r = await this.request('/installation/token', token, 'DELETE');
    if (r.status !== 204 && r.status !== 401)
      throw Error('APP_REVOCATION_UNCONFIRMED');
  }
}
