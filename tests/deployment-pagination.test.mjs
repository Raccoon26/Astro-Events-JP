import { describe, expect, it, vi } from 'vitest';
import {
  cloudflareClient,
  latestDeploymentPath,
} from '../scripts/cloudflare-client.mjs';

describe('current deployment is an explicit bounded read, not a complete resource inventory', () => {
  const response = (overrides = {}) =>
    Response.json({
      success: true,
      result: {
        deployments: [
          {
            id: 'current',
            versions: [{ version_id: 'synthetic', percentage: 100 }],
          },
        ],
      },
      result_info: { page: 1, per_page: 1, total_pages: 21 },
      ...overrides,
    });
  it('reads the documented current first deployment after the history exceeds ten entries', async () => {
    const fetcher = vi.fn(async () => response());
    const api = cloudflareClient('synthetic-auth', 'a'.repeat(32), fetcher);
    const result = await api(
      'GET',
      latestDeploymentPath('astro-events-jp-staging'),
    );
    expect(result.deployments[0].id).toBe('current');
    expect(fetcher.mock.calls[0][0]).toContain(
      '/deployments?page=1&per_page=1',
    );
  });
  it.each([
    '/workers/scripts',
    '/d1/database',
    '/workers/scripts/astro-events-jp-staging/deployments',
  ])('still rejects incomplete inventory %s', async (suffix) => {
    const api = cloudflareClient('synthetic-auth', 'a'.repeat(32), async () =>
      response(),
    );
    await expect(api('GET', suffix)).rejects.toThrow('Inventory pagination');
  });
  it('rejects an ignored page bound or missing current deployment', async () => {
    for (const result of [
      response({ result_info: { page: 2, per_page: 1, total_pages: 21 } }),
      response({ result: { deployments: [] } }),
      response({ result_info: { page: 1, per_page: 10 } }),
    ]) {
      const api = cloudflareClient(
        'synthetic-auth',
        'a'.repeat(32),
        async () => result,
      );
      await expect(
        api('GET', latestDeploymentPath('astro-events-jp-staging')),
      ).rejects.toThrow('DEPLOYMENT_LIST_UNVERIFIED');
    }
  });
  it('does not admit arbitrary resources, query parameters or write requests through the bounded path', async () => {
    const fetcher = vi.fn();
    const api = cloudflareClient('synthetic-auth', 'a'.repeat(32), fetcher);
    expect(() => latestDeploymentPath('other-project')).toThrow(
      'INVALID_DEPLOYMENT_TARGET',
    );
    await expect(
      api('GET', '/d1/database?page=1&per_page=1'),
    ).rejects.toThrow();
    await expect(
      api('POST', latestDeploymentPath('astro-events-jp-staging')),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
