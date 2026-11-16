// Local actual workerd + isolated native D1; never a remote benchmark/migration.
import fs from 'node:fs';
import { preflight } from './path-policy.mjs';
import { nativeTwitterAliases } from './post-bundle-policy.mjs';

const state = preflight();
if (process.argv.length !== 2) throw Error('LOCAL_STORE_PROFILE_ONLY');
const { build } = await import('esbuild');
const { convertV4MiniflareOptions, Miniflare } = await import('miniflare');
async function compile(contents) {
  return (
    await build({
      stdin: { contents, resolveDir: process.cwd() },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'esm',
      alias: nativeTwitterAliases(),
    })
  ).outputFiles[0].text;
}
const setup = await compile(
  "export * from './src/post-management-api';export {verificationFixture} from './tests/verification-fixtures';export {NOW,usage} from './tests/collection-fixtures';",
);
const api = await import(
  `data:text/javascript;base64,${Buffer.from(setup).toString('base64')}`
);
const f = await api.verificationFixture(),
  now = api.NOW;
const source =
  await compile(`import {PostStore} from './src/posts/store';import {VerificationStore} from './src/verification/store';
const options={enabled:true,localOnly:true,clock:()=>Date.parse(${JSON.stringify(now)})};
export default {async fetch(r,env){const path=new URL(r.url).pathname, eventId=new URL(r.url).searchParams.get('event');
if(path==='/verified'){const s=new VerificationStore(env.DB,options),e=await s.verified(eventId);return Response.json({ok:!!e,meter:s.meter.snapshot()});}
const s=new PostStore(env.DB,options);let p;if(path==='/preview')p=await s.preview(eventId,'observation');else p=await s.save(eventId,'observation',${JSON.stringify(api.usage)});
return Response.json({ok:!!p,changed:p.changed??false,meter:s.meter.snapshot()});}}`);
const mf = new Miniflare(
  convertV4MiniflareOptions({
    name: 'dev05r-store',
    modules: true,
    compatibilityDate: '2026-11-11',
    script: source,
    d1Databases: ['DB'],
    inspectorPort: 0,
    host: '127.0.0.1',
    port: 0,
  }),
);
let ws;
try {
  const db = await mf.getD1Database('DB');
  for (const file of fs
    .readdirSync('migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const sql of fs
      .readFileSync('migrations/' + file, 'utf8')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(sql).run();
  await db
    .prepare(
      "INSERT INTO deployment_identity VALUES(1,'staging','astro-events-jp-staging',2,?)",
    )
    .bind(now)
    .run();
  await new api.D1SourceRegistry(db).register(f.ctx.source);
  await db
    .prepare('INSERT INTO source_approvals VALUES(?,?,?)')
    .bind(f.ctx.source.id, JSON.stringify(f.ctx.approval), now)
    .run();
  const c = f.ctx.candidate;
  await db
    .prepare(
      'INSERT INTO event_candidates(candidate_id,source_id,official_url,fingerprint,payload,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?)',
    )
    .bind(
      c.id,
      c.sourceId,
      c.officialUrl,
      c.fingerprint,
      JSON.stringify(c),
      now,
      now,
    )
    .run();
  await db
    .prepare('INSERT INTO candidate_versions VALUES(?,?,?,?)')
    .bind(c.id, c.fingerprint, JSON.stringify(c), now)
    .run();
  await db
    .prepare(
      'INSERT INTO collection_documents(source_id,url,digest,succeeded_at,changed_at,complete) VALUES(?,?,?,?,?,1)',
    )
    .bind(c.sourceId, c.originalUrl, 'a'.repeat(64), now, now)
    .run();
  const verifier = new api.VerificationStore(db, {
      enabled: true,
      localOnly: true,
      clock: () => Date.parse(now),
    }),
    preview = await verifier.preview(c.id, f.packet);
  await verifier.commit(preview.loaded, preview.result, api.usage);
  const eventId = preview.result.event.stableEventId;
  ws = new WebSocket(
    new URL('/core:user:dev05r-store', await mf.getInspectorURL()),
  );
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Error('LOCAL_INSPECTOR_TIMEOUT')), 5000);
    ws.addEventListener(
      'open',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
    ws.addEventListener(
      'error',
      () => {
        clearTimeout(t);
        reject(Error('LOCAL_INSPECTOR_FAILED'));
      },
      { once: true },
    );
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data),
      p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      m.error ? p.reject(Error('CDP_COMMAND_FAILED')) : p.resolve(m.result);
    }
  });
  const send = (method) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method }));
    });
  await send('Profiler.enable');
  const phases = [];
  for (const phase of ['verified', 'preview', 'save', 'replay']) {
    await send('Profiler.start');
    const start = performance.now();
    const r = await mf.dispatchFetch(
        `http://localhost/${phase}?event=${encodeURIComponent(eventId)}`,
      ),
      result = await r.json();
    const elapsed = performance.now() - start;
    if (!r.ok || !result.ok || (phase === 'replay' && result.changed))
      throw Error('STORE_PROFILE_FAILED');
    const { profile } = await send('Profiler.stop');
    fs.writeFileSync(
      `${state.root}/reports/dev05r-store-${phase}.cpuprofile`,
      JSON.stringify(profile),
    );
    const costs = new Map(),
      nodes = new Map(profile.nodes.map((n) => [n.id, n]));
    for (let i = 0; i < (profile.samples?.length ?? 0); i++) {
      const name =
        nodes.get(profile.samples[i])?.callFrame?.functionName ?? 'unknown';
      costs.set(name, (costs.get(name) ?? 0) + (profile.timeDeltas[i] ?? 0));
    }
    phases.push({
      phase,
      ...result,
      localElapsedMs: elapsed,
      topSampledMicroseconds: [...costs]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15),
    });
  }
  const report = {
    synthetic: true,
    remote: false,
    externalRequests: 0,
    cloudflareCpuMs: null,
    scope:
      'actual local workerd/native D1 CDP profiles; elapsed includes DB waits, sampling is not remote CPU certification',
    phases,
  };
  fs.writeFileSync(
    `${state.root}/reports/dev05r-local-store-profile.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  ws?.close();
  await mf.dispose();
}
