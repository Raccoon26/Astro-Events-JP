import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { publicIPv4 } from '../src/collection/policy';
import { REPORTS_REPO } from '../src/notifications/types';
import { validateLength } from '../src/posts/length';
import {
  CODE_GATES,
  PRODUCTION_GATES,
  releaseVerdict,
  STAGING_GATES,
} from '../src/release/decision';
import { reportsWire } from '../src/release/reports-wire';

const verified = (keys: readonly string[]) =>
  Object.fromEntries(keys.map((k) => [k, true]));
describe('release verdict', () => {
  it('requires code gates, separate staging evidence and separate production approval', () => {
    expect(releaseVerdict({}).verdict).toBe('BLOCKED');
    const code = verified(CODE_GATES),
      stage = verified(STAGING_GATES),
      prod = verified(PRODUCTION_GATES);
    expect(releaseVerdict(code).verdict).toBe(
      'CODE_READY / OPERATIONS_PENDING',
    );
    expect(releaseVerdict({ ...code, ...stage }).verdict).toBe(
      'STAGING_VALIDATED / PRODUCTION_PENDING',
    );
    expect(
      releaseVerdict({ ...code, ...stage, ...prod, productionApproval: false })
        .verdict,
    ).toBe('STAGING_VALIDATED / PRODUCTION_PENDING');
    expect(
      releaseVerdict({ ...code, ...stage, ...prod, peerProof: false }).missing
        .staging,
    ).toEqual(['peerProof']);
    expect(releaseVerdict({ ...code, ...stage, ...prod }).verdict).toBe(
      'PRODUCTION_READY',
    );
  });
});
it.each([
  '127.0.0.1',
  '169.254.169.254',
  '100.100.100.200',
  '192.88.99.1',
  '008.8.8.8',
  '::1',
  '::ffff:127.0.0.1',
])('treats non-global or ambiguous address %s as off limits', (ip) => {
  expect(publicIPv4(ip)).toBe(false);
  expect(publicIPv4('8.8.8.8')).toBe(true);
});
it('uses manual redirect rejection for the exact GitHub provider over Workers fetch', async () => {
  const upstream = vi.fn<typeof fetch>(
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://other.example.jp/redirect' },
      }),
  );
  const wire = reportsWire(5, upstream);
  for (const path of [
    'https://api.github.com.evil.example/repos/' + REPORTS_REPO,
    'https://api.github.com/repos/Raccoon26/Astro-Events-JP',
    'https://api.github.com/repos/' + REPORTS_REPO + '/issues',
  ])
    await expect(wire(path, { method: 'GET' })).rejects.toThrow(
      'REPORTS_REQUEST_DENIED',
    );
  await expect(
    wire('https://api.github.com/app/installations/8/access_tokens', {
      method: 'POST',
    }),
  ).rejects.toThrow('REPORTS_REQUEST_DENIED');
  expect(upstream).not.toHaveBeenCalled();
  await expect(
    wire('https://api.github.com/repos/' + REPORTS_REPO, {
      method: 'GET',
      redirect: 'error',
    }),
  ).rejects.toThrow('REPORTS_REDIRECT_DENIED');
  expect(upstream.mock.calls[0]?.[1]?.redirect).toBe('manual');
  expect(upstream).toHaveBeenCalledTimes(1);
});
it('caps a scoped credential probe at three operations and has no issue mutation route', async () => {
  const upstream = vi.fn<typeof fetch>(
    async () => new Response(null, { status: 200 }),
  );
  const wire = reportsWire(7, upstream);
  await wire('https://api.github.com/app/installations/7/access_tokens', {
    method: 'POST',
  });
  await wire('https://api.github.com/installation/repositories?per_page=2', {
    method: 'GET',
  });
  await wire('https://api.github.com/repos/' + REPORTS_REPO, { method: 'GET' });
  await expect(
    wire('https://api.github.com/repos/' + REPORTS_REPO, { method: 'GET' }),
  ).rejects.toThrow('REPORTS_REQUEST_DENIED');
  expect(upstream).toHaveBeenCalledTimes(3);
});
it('keeps all thirteen Japanese and both weekend samples within X weighted 280', () => {
  const examples = (file: string) =>
    readFileSync(file, 'utf8')
      .replaceAll('\r\n', '\n')
      .split('```text\n')
      .slice(1)
      .map((part) => part.split('\n```')[0]!);
  const posts = examples('POST_SAMPLES.md'),
    weekends = examples('DEV08_WEEKEND_SAMPLES.md');
  expect(posts).toHaveLength(13);
  expect(weekends.map((text) => validateLength(text).weightedLength)).toEqual([
    242, 128,
  ]);
  for (const text of [...posts, ...weekends]) {
    expect(validateLength(text)).toMatchObject({ valid: true });
    expect(text).toContain('https://example.jp/');
    expect(text.split('\n').at(-1)).toMatch(/^#/u);
  }
});
