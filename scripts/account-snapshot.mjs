import { cloudflareClient } from './cloudflare-client.mjs';

export async function graphql(token, query, variables, fetcher = fetch) {
  let response, json;
  try {
    response = await fetcher('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    json = await response.json();
  } catch {
    throw new Error('ACCOUNT_METRICS_UNAVAILABLE');
  }
  if (!response.ok || json.errors?.length || !json.data)
    throw new Error('ACCOUNT_METRICS_UNAVAILABLE');
  return json.data;
}
export function sumUsage(groups, keys) {
  if (!Array.isArray(groups) || groups.length > 1)
    throw new Error('ACCOUNT_METRICS_INCOMPLETE');
  const values = {};
  for (const key of keys) {
    const value = groups.length ? groups[0]?.sum?.[key] : 0;
    if (!Number.isFinite(value) || value < 0)
      throw new Error('ACCOUNT_METRICS_INCOMPLETE');
    values[key] = value;
  }
  return values;
}
export function verifyFreePlan(
  proof,
  accountId,
  subscriptions,
  now = Date.now(),
) {
  if (
    proof?.accountId !== accountId ||
    proof.plan !== 'free' ||
    proof.source !== 'authenticated-cloudflare-dashboard' ||
    !Number.isFinite(Date.parse(proof.checkedAt)) ||
    Date.parse(proof.checkedAt) > now
  )
    throw new Error('FREE_PLAN_UNVERIFIED');
  if (subscriptions !== null) {
    if (!Array.isArray(subscriptions)) throw new Error('FREE_PLAN_UNVERIFIED');
    for (const subscription of subscriptions) {
      const plan = subscription.rate_plan;
      if (!plan || typeof plan.id !== 'string')
        throw new Error('UNRECOGNIZED_SUBSCRIPTION');
      const label = [plan.id, plan.public_name, plan.name]
        .filter(Boolean)
        .join(' ');
      if (
        /workers|worker|d1/i.test(label) &&
        (!/free/i.test(label) || subscription.price > 0)
      )
        throw new Error('PAID_OR_UNRECOGNIZED_WORKERS_PLAN');
    }
  } else if (now - Date.parse(proof.checkedAt) > 15 * 60000)
    throw new Error('FRESH_DASHBOARD_PLAN_REQUIRED');
  return true;
}
export async function accountSnapshot({
  token,
  accountId,
  planEvidence,
  allowDashboardFallback = false,
  fetcher = fetch,
}) {
  const api = cloudflareClient(token, accountId, fetcher);
  let subscriptions;
  try {
    subscriptions = await api('GET', '/subscriptions');
  } catch (error) {
    if (
      !allowDashboardFallback ||
      error.message !== 'CLOUDFLARE_API_FAILED_403'
    )
      throw error;
    subscriptions = null;
  }
  verifyFreePlan(planEvidence, accountId, subscriptions);
  const databases = await api('GET', '/d1/database'),
    workers = await api('GET', '/workers/scripts');
  if (
    !Array.isArray(databases) ||
    !Array.isArray(workers) ||
    databases.length > 10 ||
    workers.length > 100
  )
    throw new Error('RESOURCE_INVENTORY_INVALID');
  let databaseBytes = 0,
    cronTriggers = 0;
  const projectCronTriggers = { staging: 0, production: 0 };
  for (const db of databases) {
    const detail = await api('GET', `/d1/database/${db.uuid}`);
    if (!Number.isFinite(detail.file_size) || detail.file_size < 0)
      throw new Error('STORAGE_USAGE_UNAVAILABLE');
    databaseBytes += detail.file_size;
  }
  for (const worker of workers) {
    if (!/^[a-z0-9-]+$/.test(worker.id))
      throw new Error('WORKER_INVENTORY_UNSUPPORTED');
    const data = await api('GET', `/workers/scripts/${worker.id}/schedules`);
    if (!Array.isArray(data.schedules))
      throw new Error('CRON_USAGE_UNAVAILABLE');
    cronTriggers += data.schedules.length;
    for (const target of ['staging', 'production'])
      if (worker.id === `astro-events-jp-${target}`)
        projectCronTriggers[target] = data.schedules.length;
  }
  const end = new Date().toISOString(),
    day = end.slice(0, 10),
    start = day + 'T00:00:00Z';
  const data = await graphql(
    token,
    'query($id:string!,$start:string!,$end:string!,$day:Date!){viewer{accounts(filter:{accountTag:$id}){workersInvocationsAdaptive(limit:1,filter:{datetime_geq:$start,datetime_leq:$end}){sum{requests}} d1AnalyticsAdaptiveGroups(limit:1,filter:{date_geq:$day,date_leq:$day}){sum{rowsRead rowsWritten}}}}}',
    { id: accountId, start, end, day },
    fetcher,
  );
  if (data.viewer?.accounts?.length !== 1)
    throw new Error('ACCOUNT_METRICS_INCOMPLETE');
  const account = data.viewer.accounts[0],
    usage = sumUsage(account.workersInvocationsAdaptive, ['requests']),
    d1 = sumUsage(account.d1AnalyticsAdaptiveGroups, [
      'rowsRead',
      'rowsWritten',
    ]);
  return {
    accountId,
    source: 'cloudflare-dashboard',
    usageSource: 'authenticated-cloudflare-graphql-and-inventory',
    plan: 'free',
    checkedAt: new Date().toISOString(),
    utcDay: day,
    requests: usage.requests,
    reads: d1.rowsRead,
    writes: d1.rowsWritten,
    databaseBytes,
    cronTriggers,
    projectCronTriggers,
    planSource:
      subscriptions === null
        ? 'fresh-authenticated-dashboard'
        : 'authenticated-dashboard-and-current-subscription-safety-check',
    observedEmptyWorkers: account.workersInvocationsAdaptive.length === 0,
    observedEmptyD1: account.d1AnalyticsAdaptiveGroups.length === 0,
    analyticsCaveat:
      'Provider-reported aggregates may be delayed/sampled; reserve headroom. Empty successful datasets mean no reported records, not a CPU baseline.',
    databaseCount: databases.length,
    workerCount: workers.length,
  };
}
