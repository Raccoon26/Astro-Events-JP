/** Exchange capability only. No key reader, signing, provider requests or live entrypoint is installed. */
export interface InstallationExchange {
  exchange(): Promise<InstallationGrant | InstallationFailure>;
}
export interface InstallationGrant {
  ok: true;
  token: string;
  expiresAt: number;
  repositoryIds: number[];
  permissions: Record<string, string>;
}
export interface InstallationFailure {
  ok: false;
  status: number;
  retryAt?: number;
}
export class InstallationAuthError extends Error {
  constructor(
    readonly code:
      | 'denied'
      | 'revoked'
      | 'backoff'
      | 'invalid-grant'
      | 'temporary',
  ) {
    super(code);
    this.name = 'InstallationAuthError';
  }
}

export class InstallationCredential {
  #grant: InstallationGrant | null = null;
  #pending: Promise<InstallationGrant> | null = null;
  #serial = 0;
  #refreshAfter = 0;
  #blocked: 'denied' | 'revoked' | 'invalid-grant' | null = null;
  readonly #repoId: number;
  readonly #exchange: InstallationExchange;
  readonly #clock: () => number;

  constructor(
    repositoryId: number,
    exchange: InstallationExchange,
    clock = Date.now,
  ) {
    if (!Number.isSafeInteger(repositoryId) || repositoryId < 1)
      throw new InstallationAuthError('invalid-grant');
    this.#repoId = repositoryId;
    this.#exchange = exchange;
    this.#clock = clock;
  }

  async get(): Promise<string> {
    if (this.#blocked) throw new InstallationAuthError(this.#blocked);
    const now = this.#clock();
    if (now < this.#refreshAfter) throw new InstallationAuthError('backoff');
    if (this.#grant && this.#grant.expiresAt > now + 120000)
      return this.#grant.token;
    const serial = this.#serial;
    const pending = (this.#pending ??= this.#renew(serial));
    try {
      const grant = await pending;
      if (serial !== this.#serial)
        throw new InstallationAuthError(this.#blocked ?? 'temporary');
      return grant.token;
    } finally {
      if (this.#pending === pending) this.#pending = null;
    }
  }

  /** Definite provider results only. The caller owns retry policy for any write. */
  observeRejection(tokenUsed: string, status: number, retryAt?: number) {
    if (!this.#grant || this.#grant.token !== tokenUsed) return;
    if (status === 429 || (status === 403 && retryAt !== undefined)) {
      this.#delay(retryAt);
    } else if (status === 401) {
      this.#grant = null;
      this.#serial++;
      this.#pending = null;
      // A later independent call can refresh. Rapid consecutive 401s are throttled.
      this.#delay(undefined);
    } else if (status === 403 || status === 404) {
      this.#blocked = 'denied';
      this.#grant = null;
      this.#serial++;
      this.#pending = null;
    }
  }

  revoke() {
    this.#blocked = 'revoked';
    this.#grant = null;
    this.#serial++;
    this.#pending = null;
  }

  #delay(retryAt: number | undefined) {
    // An explicit provider timestamp may require a longer delay. Keep the entire bound without retrying early.
    this.#refreshAfter = Math.max(
      this.#clock() + 60000,
      Number.isFinite(retryAt) ? retryAt! : 0,
    );
  }

  async #renew(serial: number) {
    let result: InstallationGrant | InstallationFailure;
    try {
      result = await this.#exchange.exchange();
    } catch {
      if (serial === this.#serial) this.#delay(undefined);
      throw new InstallationAuthError('temporary');
    }
    if (serial !== this.#serial)
      throw new InstallationAuthError(this.#blocked ?? 'temporary');
    if (!result.ok) {
      if (
        [401, 403, 404].includes(result.status) &&
        !(result.status === 403 && result.retryAt !== undefined)
      ) {
        this.#blocked = 'denied';
        throw new InstallationAuthError(this.#blocked);
      }
      this.#delay(result.retryAt);
      throw new InstallationAuthError(
        [403, 429].includes(result.status) ? 'backoff' : 'temporary',
      );
    }
    const now = this.#clock();
    if (
      typeof result.token !== 'string' ||
      result.token.length < 8 ||
      result.token.length > 8192 ||
      !/^[\x21-\x7e]+$/u.test(result.token) ||
      !Number.isFinite(result.expiresAt) ||
      result.expiresAt <= now + 120000 ||
      result.expiresAt > now + 3700000 ||
      !Array.isArray(result.repositoryIds) ||
      result.repositoryIds.length !== 1 ||
      result.repositoryIds[0] !== this.#repoId ||
      !result.permissions ||
      result.permissions.issues !== 'write' ||
      result.permissions.metadata !== 'read' ||
      Object.keys(result.permissions).some(
        (permission) => !['issues', 'metadata'].includes(permission),
      )
    ) {
      this.#blocked = 'invalid-grant';
      throw new InstallationAuthError(this.#blocked);
    }
    this.#grant = { ...result };
    return this.#grant;
  }
}
