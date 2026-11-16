// Whitelisted diagnostics only. Never retain raw CLI stderr, URLs, headers or tokens.
export function wranglerFailure(result) {
  const raw = String(result.stderr ?? '') + '\n' + String(result.stdout ?? '');
  const providerCode = Number(raw.match(/\[code:\s*(\d{4,6})\]/i)?.[1] ?? NaN);
  const category =
    result.error?.code === 'ETIMEDOUT'
      ? 'TIMEOUT'
      : /startup.*(?:CPU|time.*limit|timed out)/i.test(raw)
        ? 'STARTUP_LIMIT'
        : /ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(raw)
          ? 'NETWORK'
          : /authentication|not authenticated|unauthorized/i.test(raw)
            ? 'AUTH'
            : Number.isFinite(providerCode)
              ? 'PROVIDER'
              : 'EXIT';
  return {
    category,
    exitCode: Number.isInteger(result.status) ? result.status : null,
    providerCode: Number.isFinite(providerCode) ? providerCode : null,
  };
}
