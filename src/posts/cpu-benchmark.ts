// Temporary staging diagnostic only. Fixed synthetic inputs, never an authorization API.
import { implementation, profileMarker, renderPost } from 'dev05r:renderer';
import type { Env } from '../config';
import { diagnose } from '../diagnostics';
import type { PostKind } from '../domain';
import worker from '../index';
import type { DetailedVerifiedEvent } from '../verification/types';
import corpus from './profile-corpus.json';

let isolateId: string | null = null;
let sequence = 0; // diagnostic counter only, no cached facts or output
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/health') return worker.fetch(request, env);
    if (
      env.APP_ENV === 'staging' &&
      request.method === 'GET' &&
      path === '/benchmark/cpu/ready'
    )
      return Response.json(
        { implementation, profileMarker },
        {
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    const match = /^\/benchmark\/cpu\/(baseline|optimized)\/([a-z-]+)$/.exec(
      path,
    );
    if (env.APP_ENV !== 'staging' || request.method !== 'GET' || !match)
      return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
    if (match[1] !== implementation)
      return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
    const input = corpus.cases.find((c) => c.id === match[2]);
    if (!input) return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
    const workerStartedAt = new Date().toISOString(); // timestamp, never a CPU timer
    const health = await diagnose(env);
    if (health.code !== 'OK')
      return Response.json({ code: health.code }, { status: 503 });
    isolateId ??= crypto.randomUUID();
    const post = await renderPost(
      input.event as DetailedVerifiedEvent,
      1,
      input.kind as PostKind,
      input.now,
    );
    return Response.json({
      synthetic: true,
      implementation,
      scenario: input.id,
      workerStartedAt,
      isolateId,
      sequence: ++sequence,
      post,
      externalRequests: 0,
      dbRowsRead: health.rowsRead,
      dbRowsWritten: health.rowsWritten,
      cpuTimeMs: null,
    });
  },
  scheduled: worker.scheduled,
};
