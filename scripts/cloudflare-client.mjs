import { readFileSync } from 'node:fs';
import { assertNoLinks, preflight } from './path-policy.mjs';
export function getCloudflareToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  // Avoid `wrangler auth token`: its CLI output could also reach a debug log.
  const state = preflight();
  const file = state.localDriveVerified
    ? `${state.root}/tools/config/.wrangler/config/default.toml`
    : null;
  if (!file)
    throw new Error(
      'Cloudflare API token must be supplied through environment Secrets',
    );
  assertNoLinks(file);
  const token = readFileSync(file, 'utf8').match(
    /^oauth_token\s*=\s*"([^"\r\n]+)"/m,
  )?.[1];
  if (!token) throw new Error('Existing Cloudflare authentication required');
  return token;
}
export function cloudflareClient(token, accountId, fetcher = fetch) {
  if (!/^[a-f0-9]{32}$/.test(accountId))
    throw new Error('Explicit account ID required');
  return async (method, suffix, body) => {
    // No arbitrary URL or account mutation endpoints. Billing/subscription writes are impossible here.
    if (
      !/^\/(?:d1\/database(?:\/[\da-f-]+(?:\/query)?)?|workers\/subdomain|workers\/scripts(?:\/[a-z0-9-]+(?:\/settings|\/schedules|\/deployments)?)?)$/.test(
        suffix,
      )
    )
      throw new Error('Unsupported account endpoint');
    if (
      method !== 'GET' &&
      !(
        method === 'POST' &&
        (suffix === '/d1/database' ||
          /^\/d1\/database\/[\da-f-]+\/query$/.test(suffix))
      )
    )
      throw new Error('Unsupported mutation');
    let response;
    try {
      response = await fetcher(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}${suffix}`,
        {
          method,
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
    } catch {
      throw new Error('CLOUDFLARE_NETWORK_FAILED');
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('CLOUDFLARE_INVALID_RESPONSE');
    }
    if (!response.ok || data.success !== true)
      throw new Error(`CLOUDFLARE_API_FAILED_${response.status}`);
    if (data.result_info?.total_pages > 1)
      throw new Error(
        'Inventory pagination needs review; no partial inventory accepted',
      );
    return data.result;
  };
}
