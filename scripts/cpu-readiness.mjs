// Management-plane activation and a shared Health response do not prove that the
// public data plane serves this diagnostic build. No rendering/DB work is done here.
export async function verifyCpuReadiness(
  url,
  implementation,
  profileMarker,
  {
    fetcher = fetch,
    delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    attempts = 12,
  } = {},
) {
  if (
    !['baseline', 'optimized'].includes(implementation) ||
    !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/.test(profileMarker ?? '') ||
    !Number.isInteger(attempts) ||
    attempts < 1 ||
    attempts > 12
  )
    throw Error('CPU_READINESS_INVALID_INPUT');
  const address = new URL(url);
  if (
    address.protocol !== 'https:' ||
    address.username ||
    address.password ||
    address.port ||
    address.hostname !== 'astro-events-jp-staging.33raccoon33.workers.dev' ||
    address.pathname !== '/benchmark/cpu/ready' ||
    address.search ||
    address.hash
  )
    throw Error('CPU_READINESS_INVALID_TARGET');
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response;
    try {
      response = await fetcher(url, {
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      if (attempt === attempts) throw Error('CPU_READINESS_NETWORK_FAILED');
    }
    if (response) {
      if (
        response.status === 404 ||
        ([502, 503, 504].includes(response.status) &&
          !response.headers.get('content-type')?.includes('application/json'))
      ) {
        await response.body?.cancel();
      } else {
        if (!response.ok) throw Error('CPU_READINESS_HTTP_FAILED');
        const reader = response.body?.getReader();
        if (!reader) throw Error('CPU_READINESS_INVALID_RESPONSE');
        const chunks = [];
        let length = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 1024) {
            await reader.cancel();
            throw Error('CPU_READINESS_BODY_LIMIT');
          }
          chunks.push(value);
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        let body;
        try {
          body = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          throw Error('CPU_READINESS_INVALID_RESPONSE');
        }
        if (
          body?.implementation === implementation &&
          body.profileMarker === profileMarker &&
          Object.keys(body).length === 2
        )
          return { attempts: attempt, implementation, profileMarker };
      }
    }
    if (attempt < attempts) await delay(3000);
  }
  throw Error('CPU_READINESS_PROPAGATION_TIMEOUT');
}
