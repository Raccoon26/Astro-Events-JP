import { describe, expect, it, vi } from 'vitest';
import { cloudflareClient } from '../scripts/cloudflare-client.mjs';

describe('Cloudflare control plane isolation', () => {
  it('refuses billing, account mutations and unrelated endpoints before network access', async () => {
    const request = vi.fn();
    const api = cloudflareClient(
      'synthetic-test-credential',
      'a'.repeat(32),
      request,
    );
    await expect(api('POST', '/subscriptions', {})).rejects.toThrow();
    await expect(
      api('DELETE', '/d1/database/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    ).rejects.toThrow();
    await expect(api('GET', 'https://evil.invalid')).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it('reports safe failures with zero automatic retries and bounded requests', async () => {
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            errors: [{ message: 'sensitive-account secret' }],
          }),
          { status: 403 },
        ),
    );
    const api = cloudflareClient(
      'synthetic-test-credential',
      'a'.repeat(32),
      request,
    );
    await expect(api('GET', '/workers/scripts')).rejects.toThrow(
      'CLOUDFLARE_API_FAILED_403',
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toMatchObject({
      redirect: 'error',
      signal: expect.any(AbortSignal),
    });
  });
  it('rejects paginated/incomplete inventory instead of assuming empty account usage', async () => {
    const request = vi.fn(async () =>
      Response.json({
        success: true,
        result: [],
        result_info: { total_pages: 2 },
      }),
    );
    await expect(
      cloudflareClient('test', 'a'.repeat(32), request)('GET', '/d1/database'),
    ).rejects.toThrow('pagination');
  });
});
