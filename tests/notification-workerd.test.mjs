import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { preflight } from '../scripts/path-policy.mjs';
import { nativeTwitterAliases } from '../scripts/post-bundle-policy.mjs';
import { NOW, usage } from './collection-fixtures';
import { notificationHarness } from './notification-harness.mjs';

it('runs current gates, checkpoints, fake sends and callback in separate workerd invocations with zero outbound fetches', async () => {
  const built = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
    import {NotificationStore,FakeNotificationWire} from './src/notifications';
    const wire=new FakeNotificationWire();let now=${JSON.stringify(Date.parse(NOW))};let requests=0;
    export default {async fetch(request,env){
      globalThis.fetch=()=>{requests++;throw Error('OUTBOUND_DISABLED')};
      now+=1000;const store=new NotificationStore(env.DB,{enabled:true,localOnly:true,mode:'simulation',chatId:'10001',userIds:['20001'],clock:()=>now});
      const p=await request.json();const usage=${JSON.stringify(usage)};
      try {let result;
        if(p.op==='preview')result=await store.preview(p.post);
        else if(p.op==='enqueue')result=await store.enqueue(p.post,usage,p.expected,p.cursor||0);
        else if(p.op==='claim')result=await store.claim(p.id,usage);
        else if(p.op==='dispatch')result=await store.dispatch(p.id,p.owner,wire,usage);
        else if(p.op==='callback')result=await store.callback(p.token,p.action,p.identity,usage);
        else if(p.op==='stats')result={messages:[...wire.messages.values()],issues:[...wire.issues.values()],calls:wire.requests.length};
        else throw Error('INVALID_TEST_OPERATION');
        return Response.json({result,outboundRequests:requests,d1:store.meter.snapshot()});
      }catch(e){return Response.json({error:e.code||'TEST_ERROR',outboundRequests:requests},{status:400})}
    }}
  `,
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    alias: nativeTwitterAliases(),
  });
  const h = await notificationHarness(built.outputFiles[0].text);
  try {
    const f = await h.seed();
    const measurements = [];
    const call = async (p) => {
      const started = performance.now();
      const r = await h.mf.dispatchFetch('http://localhost/synthetic-dev06', {
        method: 'POST',
        body: JSON.stringify(p),
      });
      const v = await r.json();
      measurements.push({
        operation: p.op,
        localElapsedMs: performance.now() - started,
        d1: v.d1 ?? null,
        status: r.status,
      });
      expect(v.outboundRequests).toBe(0);
      return { status: r.status, ...v };
    };
    expect(
      (await call({ op: 'preview', post: f.postId })).result.delivery.copyText,
    ).toBe(f.plan.delivery.copyText);
    let cursor = 0,
      done;
    do {
      done = await call({
        op: 'enqueue',
        post: f.postId,
        expected: f.expected,
        cursor,
      });
      expect(done.status).toBe(200);
      expect(done.d1.calls).toBeLessThanOrEqual(50);
      cursor = done.result.nextCursor;
    } while (!done.result.complete);
    const rows = await h.rows();
    for (const row of rows) {
      const claim = await call({ op: 'claim', id: row.delivery_id });
      expect(claim.result.owner).toBeTruthy();
      const sent = await call({
        op: 'dispatch',
        id: row.delivery_id,
        owner: claim.result.owner,
      });
      expect(sent.result.state).toBe('sent');
      expect(sent.d1.calls).toBeLessThanOrEqual(50);
    }
    const stats = (await call({ op: 'stats' })).result;
    expect(stats.messages[0].text).toBe(f.plan.delivery.copyText);
    expect(stats.messages).toHaveLength(2);
    expect(stats.issues).toHaveLength(1);
    const context = await h.db
      .prepare(
        "SELECT payload FROM notification_context c JOIN notification_deliveries d ON d.delivery_id=c.delivery_id WHERE d.message_part='management' AND d.channel='telegram'",
      )
      .first('payload');
    const token =
      JSON.parse(context).reply_markup.inline_keyboard[0][0].callback_data;
    const acted = await call({
      op: 'callback',
      token,
      action: 'posted',
      identity: {
        chatId: '10001',
        userId: '20001',
        messageId: String(stats.messages[1].message_id),
        updateId: '900',
      },
    });
    expect(acted.status).toBe(200);
    expect(acted.result.status).toBe('posted');
    expect(acted.d1.calls).toBeLessThanOrEqual(50);
    await h.db.prepare('DELETE FROM source_approvals').run();
    expect((await call({ op: 'preview', post: f.postId })).status).toBe(400);
    expect((await call({ op: 'stats' })).result.calls).toBe(stats.calls);
    const paths = preflight();
    if (paths.localDriveVerified)
      writeFileSync(
        paths.root + '/reports/dev06-workerd-measurement.json',
        JSON.stringify(
          {
            synthetic: true,
            remote: false,
            cloudflareCpuMs: null,
            memoryBytes: null,
            externalNotificationRequests: 0,
            measurements,
          },
          null,
          2,
        ),
      );
  } finally {
    await h.mf.dispose();
  }
}, 60000);
