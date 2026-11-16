// Official sampled invocation metrics. Never substitute client elapsed time.
export async function queryCpuMetrics({
  token,
  accountId,
  scriptName,
  start,
  end,
  grouped = true,
  scriptVersion = null,
  fetcher = fetch,
}) {
  if (
    !/^[a-f0-9]{32}$/.test(accountId) ||
    scriptName !== 'astro-events-jp-staging' ||
    !Number.isFinite(Date.parse(start)) ||
    !(Date.parse(end) > Date.parse(start))
  )
    throw Error('CPU_METRICS_TARGET');
  if (
    scriptVersion !== null &&
    !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(scriptVersion)
  )
    throw Error('CPU_VERSION_REQUIRED');
  const query = `query CPU($a:string!,$s:string!,$b:string!,$e:string!${scriptVersion ? ',$v:string!' : ''}){unit:__type(name:"AccountWorkersInvocationsAdaptiveQuantiles"){fields{name description}}viewer{accounts(filter:{accountTag:$a}){workersInvocationsAdaptive(limit:1000,filter:{scriptName:$s,datetime_geq:$b,datetime_leq:$e,eventType:"fetch"${scriptVersion ? ',scriptVersion:$v' : ''}}){sum{requests errors subrequests}quantiles{cpuTimeP50 cpuTimeP95 cpuTimeP99 wallTimeP50 wallTimeP99 memoryUsageBytesP99 startupCpuTimeUsP99}dimensions{${grouped ? 'datetime scriptVersion status coloCode httpResponseStatus' : 'scriptVersion status'}}}}}}`;
  const response = await fetcher(
    'https://api.cloudflare.com/client/v4/graphql',
    {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          a: accountId,
          s: scriptName,
          b: start,
          e: end,
          ...(scriptVersion ? { v: scriptVersion } : {}),
        },
      }),
    },
  );
  const json = await response.json();
  if (!response.ok || json.errors?.length) {
    const messages = (json.errors ?? [])
      .map((e) => String(e.message ?? ''))
      .join(' ');
    const category = [401, 403].includes(response.status)
      ? 'AUTHORIZATION'
      : response.status === 429
        ? 'RATE_LIMITED'
        : /syntax|parse error|expected.*name/i.test(messages)
          ? 'QUERY_SYNTAX'
          : /cannot query field|unknown (?:field|argument|type)/i.test(messages)
            ? 'QUERY_SCHEMA'
            : 'QUERY_REJECTED';
    throw Error(`CPU_METRICS_${category}_${response.status}`);
  }
  const fields = json.data?.unit?.fields;
  const units = Object.fromEntries(
    [
      'cpuTimeP50',
      'cpuTimeP95',
      'cpuTimeP99',
      'wallTimeP50',
      'wallTimeP99',
      'startupCpuTimeUsP99',
    ].map((name) => [
      name,
      fields?.find((f) => f.name === name)?.description ?? 'unavailable',
    ]),
  );
  if (
    !['cpuTimeP50', 'cpuTimeP95', 'cpuTimeP99'].every((n) =>
      /microseconds/i.test(units[n]),
    )
  )
    throw Error('CPU_METRIC_UNIT_UNVERIFIED');
  const groups = json.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
  if (!Array.isArray(groups) || groups.length >= 1000)
    throw Error('CPU_METRICS_INCOMPLETE');
  return {
    source: 'Cloudflare GraphQL workersInvocationsAdaptive',
    sampling:
      'provider adaptive data; missing/ambiguous invocations are never estimated',
    units,
    groups,
  };
}
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}
export function correlateCpu(report, samples, version) {
  const measurements = samples.map((s) => {
    const timestamp = s.workerStartedAt ?? s.serverDate;
    const second =
      typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp))
        ? new Date(
            Math.floor(Date.parse(timestamp) / 1000) * 1000,
          ).toISOString()
        : null;
    const found = report.groups.filter(
      (g) =>
        g.dimensions.scriptVersion ===
          (typeof version === 'string' ? version : version[s.implementation]) &&
        new Date(g.dimensions.datetime).toISOString() === second &&
        g.dimensions.coloCode === s.colo &&
        g.dimensions.httpResponseStatus === s.httpStatus,
    );
    const g = found.length === 1 ? found[0] : null;
    const exact =
      g?.sum?.requests === 1 &&
      g.quantiles.cpuTimeP50 === g.quantiles.cpuTimeP99 &&
      Number.isFinite(g.quantiles.cpuTimeP50) &&
      g.quantiles.cpuTimeP50 >= 0;
    const timeMs = (name) => {
      const value = g?.quantiles[name],
        unit = report.units?.[name];
      if (!Number.isFinite(value) || value < 0) return null;
      return /microseconds/i.test(unit ?? '')
        ? value / 1000
        : /milliseconds/i.test(unit ?? '')
          ? value
          : null;
    };
    return {
      ...s,
      cpuTimeMs: exact ? g.quantiles.cpuTimeP50 / 1000 : null,
      providerWallTimeMs: exact ? timeMs('wallTimeP50') : null,
      providerStartupCpuMs: exact ? timeMs('startupCpuTimeUsP99') : null,
      providerStatus: g?.dimensions.status ?? null,
      providerErrors: g?.sum.errors ?? null,
      subrequests: g?.sum.subrequests ?? null,
      memoryBytes: g?.quantiles.memoryUsageBytesP99 ?? null,
    };
  });
  const summary = {};
  for (const implementation of ['baseline', 'optimized']) {
    const items = measurements.filter(
        (s) => s.implementation === implementation,
      ),
      observed = items.filter((s) => s.cpuTimeMs !== null),
      values = observed.map((s) => s.cpuTimeMs);
    summary[implementation] = {
      sent: items.length,
      observed: observed.length,
      missingOrAmbiguous: items.length - observed.length,
      p50Ms: percentile(values, 0.5),
      p95Ms: percentile(values, 0.95),
      p99Ms: percentile(values, 0.99),
      maxObservedMs: values.length ? Math.max(...values) : null,
      over10ms: values.filter((v) => v > 10).length,
      over10Rate: values.length
        ? values.filter((v) => v > 10).length / values.length
        : null,
      httpFailures: items.filter((s) => s.httpStatus !== 200).length,
      providerErrors:
        observed.length &&
        observed.every((s) => Number.isFinite(s.providerErrors))
          ? observed.reduce((n, s) => n + s.providerErrors, 0)
          : null,
      scope:
        'observed matched single-invocation CPU samples only; not an unsampled provider-wide maximum',
    };
  }
  const cohorts = {};
  for (const implementation of ['baseline', 'optimized'])
    for (const scenario of [
      ...new Set(samples.map((s) => s.scenario)),
      'first-in-isolate',
      'subsequent-in-isolate',
    ]) {
      const items = measurements.filter(
          (s) =>
            s.implementation === implementation &&
            (scenario === 'first-in-isolate'
              ? s.sequence === 1
              : scenario === 'subsequent-in-isolate'
                ? s.sequence > 1
                : s.scenario === scenario),
        ),
        values = items.map((s) => s.cpuTimeMs).filter((v) => v !== null);
      cohorts[`${implementation}/${scenario}`] = {
        sent: items.length,
        observed: values.length,
        p50Ms: percentile(values, 0.5),
        p95Ms: percentile(values, 0.95),
        p99Ms: percentile(values, 0.99),
        maxObservedMs: values.length ? Math.max(...values) : null,
        over10ms: values.filter((v) => v > 10).length,
      };
    }
  return {
    measurements,
    summary,
    cohorts,
    complete: measurements.every((s) => s.cpuTimeMs !== null),
  };
}
