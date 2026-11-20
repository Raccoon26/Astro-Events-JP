import { REPORTS_REPO } from '../notifications/types';
/** Fixed provider API. Workers uses manual redirects with explicit rejection of every redirect response. */
export function reportsWire(
  installationId: number,
  upstream: typeof fetch = fetch,
): typeof fetch {
  if (!Number.isSafeInteger(installationId) || installationId < 1)
    throw Error('REPORTS_ID_INVALID');
  let remaining = 3;
  return async (target, init) => {
    const prefix = 'https://api.github.com';
    const url = String(target);
    const allowed =
      (init?.method === 'POST' &&
        url ===
          prefix + '/app/installations/' + installationId + '/access_tokens') ||
      (init?.method === 'GET' &&
        [
          prefix + '/repos/' + REPORTS_REPO,
          prefix + '/installation/repositories?per_page=2',
        ].includes(url));
    if (!allowed || remaining-- <= 0) throw Error('REPORTS_REQUEST_DENIED');
    const response = await upstream(url, { ...init, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      throw Error('REPORTS_REDIRECT_DENIED');
    }
    return response;
  };
}
