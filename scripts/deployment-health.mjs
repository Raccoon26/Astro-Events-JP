// Only retry propagation/network failures. Configuration/identity errors fail immediately.
export async function verifyDeploymentHealth(
  url,
  target,
  {
    fetcher = fetch,
    delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    attempts = 8,
  } = {},
) {
  if (
    !['staging', 'production'].includes(target) ||
    !Number.isInteger(attempts) ||
    attempts < 1 ||
    attempts > 8
  )
    throw new Error('INVALID_HEALTH_CHECK');
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response;
    try {
      response = await fetcher(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      if (attempt === attempts) throw new Error('HEALTH_NETWORK_FAILED');
    }
    if (response) {
      if (
        [404, 502, 503, 504].includes(response.status) &&
        !response.headers.get('content-type')?.includes('application/json')
      ) {
        await response.body?.cancel();
      } else {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('HEALTH_INVALID_RESPONSE');
        const chunks = [];
        let length = 0;
        for (;;) {
          const item = await reader.read();
          if (item.done) break;
          length += item.value.byteLength;
          if (length > 4096) {
            await reader.cancel();
            throw new Error('HEALTH_BODY_TOO_LARGE');
          }
          chunks.push(item.value);
        }
        let body;
        try {
          const bytes = new Uint8Array(length);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          body = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          throw new Error('HEALTH_INVALID_RESPONSE');
        }
        const keys = [
          'status',
          'code',
          'environment',
          'database',
          'collectionEnabled',
          'mode',
        ];
        if (
          !response.ok ||
          body.status !== 'ok' ||
          body.code !== 'OK' ||
          body.environment !== target ||
          body.database !== 'ok' ||
          body.collectionEnabled !== false ||
          Object.keys(body).some((key) => !keys.includes(key))
        )
          throw new Error('HEALTH_CONTRACT_FAILED');
        return { httpStatus: response.status, ...body, attempts: attempt };
      }
    }
    if (attempt < attempts) await delay(5000);
  }
  throw new Error('HEALTH_PROPAGATION_TIMEOUT');
}
