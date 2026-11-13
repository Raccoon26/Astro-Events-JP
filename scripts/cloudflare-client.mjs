import { readFileSync } from 'node:fs';
import { validateStageSchedules } from './cron-policy.mjs';
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
export function latestDeploymentPath(worker) {
  if (!/^astro-events-jp-(staging|production)$/.test(worker))
    throw new Error('INVALID_DEPLOYMENT_TARGET');
  return `/workers/scripts/${worker}/deployments?page=1&per_page=1`;
}
export function cloudflareClient(token, accountId, fetcher = fetch) {
  if (!/^[a-f0-9]{32}$/.test(accountId))
    throw new Error('Explicit account ID required');
  return async (method, suffix, body) => {
    const latestOnly =
      method === 'GET' &&
      /^\/workers\/scripts\/astro-events-jp-(staging|production)\/deployments\?page=1&per_page=1$/.test(
        suffix,
      );
    // No arbitrary URL or account mutation endpoints. Billing/subscription writes are impossible here.
    if (
      !latestOnly &&
      !/^\/(?:subscriptions|d1\/database(?:\/[\da-f-]+(?:\/query)?)?|workers\/(?:subdomain|account-settings)|workers\/scripts(?:\/[a-z0-9-]+(?:\/settings|\/schedules|\/deployments)?)?)$/.test(
        suffix,
      )
    )
      throw new Error('Unsupported account endpoint');
    if (
      method !== 'GET' &&
      !(method === 'PUT' && validateStageSchedules(suffix, body)) &&
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
    if (
      latestOnly &&
      (data.result_info?.page !== 1 ||
        data.result_info?.per_page !== 1 ||
        !Array.isArray(data.result?.deployments) ||
        data.result.deployments.length !== 1)
    )
      throw new Error('DEPLOYMENT_LIST_UNVERIFIED');
    if (!latestOnly && data.result_info?.total_pages > 1)
      throw new Error(
        'Inventory pagination needs review; no partial inventory accepted',
      );
    return data.result;
  };
}
