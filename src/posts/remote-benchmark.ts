// Temporary staging-only pure generation entry: does not initialize Collector or Validator.
import type { Env } from '../config';
import { diagnose } from '../diagnostics';
import worker from '../index';
import { syntheticPost } from './benchmark';
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/health') return worker.fetch(request, env);
    if (
      env.APP_ENV !== 'staging' ||
      request.method !== 'GET' ||
      path !== '/benchmark/posts'
    )
      return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
    const health = await diagnose(env);
    if (health.code !== 'OK')
      return Response.json({ code: health.code }, { status: 503 });
    return Response.json({
      format: 'posts',
      candidates: 1,
      ...(await syntheticPost(new Date().toISOString())),
      dbRowsRead: health.rowsRead,
      dbRowsWritten: health.rowsWritten,
      cpuTimeMs: null,
    });
  },
  scheduled: worker.scheduled,
};
