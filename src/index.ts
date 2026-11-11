import type { Env } from './config';
import { diagnose, logDiagnostic } from './diagnostics';
import { AppError } from './errors';
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (new URL(request.url).pathname !== '/health')
      return new Response(JSON.stringify({ code: 'NOT_FOUND' }), {
        status: 404,
        headers,
      });
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response(JSON.stringify({ code: 'METHOD_NOT_ALLOWED' }), {
        status: 405,
        headers: { ...headers, Allow: 'GET, HEAD' },
      });
    const startedAt = Date.now();
    const result = await diagnose(env);
    logDiagnostic('health', result, Date.now() - startedAt);
    const body = JSON.stringify({
      status: result.code === 'OK' ? 'ok' : 'unavailable',
      code: result.code,
      environment: result.environment,
      database: result.code === 'OK' ? 'ok' : 'unavailable',
      collectionEnabled: false,
      mode: 'diagnostic-only',
    });
    return new Response(request.method === 'HEAD' ? null : body, {
      status: result.code === 'OK' ? 200 : 503,
      headers,
    });
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const startedAt = Date.now();
    const result = await diagnose(env);
    logDiagnostic(
      'cron',
      result,
      Date.now() - startedAt,
      controller.scheduledTime,
    );
    if (result.code !== 'OK')
      throw new AppError(result.code === 'CONFIG' ? 'CONFIG' : 'SOURCE', false);
    // Read-only diagnostics until DEV-09: no collection, deletion or notification.
  },
} satisfies ExportedHandler<Env>;
