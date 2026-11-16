import { expect, it } from 'vitest';
import { verifyCpuReadiness } from '../scripts/cpu-readiness.mjs';

const url =
  'https://astro-events-jp-staging.33raccoon33.workers.dev/benchmark/cpu/ready';
const marker = '11111111-1111-4111-8111-111111111111';
const ready = () =>
  Response.json({ implementation: 'optimized', profileMarker: marker });
it('waits through stale JSON 404 and a different public diagnostic marker without rendering', async () => {
  const replies = [
    Response.json({ code: 'NOT_FOUND' }, { status: 404 }),
    Response.json({ implementation: 'optimized', profileMarker: 'old' }),
    ready(),
  ];
  const delays = [];
  expect(
    await verifyCpuReadiness(url, 'optimized', marker, {
      fetcher: async () => replies.shift(),
      delay: async (ms) => delays.push(ms),
    }),
  ).toMatchObject({ attempts: 3, profileMarker: marker });
  expect(delays).toEqual([3000, 3000]);
});
it('never treats the ordinary shared Health contract as diagnostic readiness', async () => {
  await expect(
    verifyCpuReadiness(url, 'optimized', marker, {
      attempts: 2,
      fetcher: async () => Response.json({ status: 'ok', code: 'OK' }),
      delay: async () => {},
    }),
  ).rejects.toThrow('CPU_READINESS_PROPAGATION_TIMEOUT');
});
it('fails immediately on a configuration failure and bounds streamed response size', async () => {
  await expect(
    verifyCpuReadiness(url, 'optimized', marker, {
      fetcher: async () =>
        Response.json({ code: 'INVALID_CONFIG' }, { status: 503 }),
    }),
  ).rejects.toThrow('CPU_READINESS_HTTP_FAILED');
  await expect(
    verifyCpuReadiness(url, 'optimized', marker, {
      fetcher: async () => new Response('x'.repeat(1025)),
    }),
  ).rejects.toThrow('CPU_READINESS_BODY_LIMIT');
});
it('rejects production, redirects and malformed markers before any useful operation', async () => {
  await expect(
    verifyCpuReadiness(
      url.replace('staging', 'production'),
      'optimized',
      marker,
    ),
  ).rejects.toThrow('CPU_READINESS_INVALID_TARGET');
  await expect(verifyCpuReadiness(url, 'optimized', 'bad')).rejects.toThrow(
    'CPU_READINESS_INVALID_INPUT',
  );
  await expect(
    verifyCpuReadiness(url, 'optimized', marker, {
      attempts: 1,
      fetcher: async () => {
        throw Error('redirect');
      },
    }),
  ).rejects.toThrow('CPU_READINESS_NETWORK_FAILED');
});
