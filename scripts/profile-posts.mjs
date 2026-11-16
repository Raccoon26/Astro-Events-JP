import fs from 'node:fs';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { preflight } from './path-policy.mjs';
import { CPU_BASELINE, postProfileBuild } from './post-profile-build.mjs';

const state = preflight();
const args = process.argv.slice(2);
if (
  args.some((a) => !['--baseline', '--cold'].includes(a)) ||
  new Set(args).size !== args.length
)
  throw Error('LOCAL_PROFILER_OPTIONS');
const baseline = args.includes('--baseline');
const built = await postProfileBuild(
  `
import {renderPost} from './src/posts/render';
import {plain,validateLength,extractUrls,extractHashtags} from './src/posts/length';
import {parse as emoji} from 'twemoji-parser';
import {digest} from './src/collection/text';
import corpus from './src/posts/profile-corpus.json';
const input=corpus.cases[0];
export default {async fetch(r){
 const phase=new URL(r.url).pathname.slice(1);
 const n=${args.includes('--cold') ? '1' : "phase==='render'?300:phase==='sha'?1000:3000"};
 let output;
 for(let i=0;i<n;i++){
  if(phase==='render')output=await renderPost(input.event,1,input.kind,input.now);
  else if(phase==='plain')output=plain(input.event.title);
  else if(phase==='normalize')output=input.expected.text.normalize('NFC');
  else if(phase==='hashtags')output=extractHashtags(input.expected.text);
  else if(phase==='emoji')output=emoji(corpus.cases[13].expected.text);
  else if(phase==='url')output=extractUrls(input.expected.text);
  else if(phase==='length')output=validateLength(input.expected.text);
  else if(phase==='json')output=JSON.stringify(input.event);
  else if(phase==='sha')output=await digest(input.expected.text);
  else throw Error('UNKNOWN_PHASE');
 }
 return Response.json({phase,iterations:n,ok:!!output});
}}`,
  baseline,
);
const mf = new Miniflare(
  convertV4MiniflareOptions({
    name: 'dev05r-profile',
    modules: true,
    compatibilityDate: '2026-11-11',
    script: built.outputFiles[0].text,
    inspectorPort: 0,
    host: '127.0.0.1',
    port: 0,
  }),
);
let ws;
try {
  await mf.ready;
  const url = await mf.getInspectorURL();
  ws = new WebSocket(new URL('/core:user:dev05r-profile', url));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error('LOCAL_INSPECTOR_TIMEOUT')),
      5000,
    );
    ws.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    ws.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(Error('LOCAL_INSPECTOR_CONNECT_FAILED'));
      },
      { once: true },
    );
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const key = ++id;
      pending.set(key, { resolve, reject });
      ws.send(JSON.stringify({ id: key, method, params }));
    });
  await send('Profiler.enable');
  await send('Profiler.setSamplingInterval', { interval: 100 });
  const phases = [];
  const selectedPhases = args.includes('--cold')
    ? ['render', 'render', 'hashtags', 'hashtags']
    : ['plain', 'normalize', 'emoji', 'url', 'length', 'json', 'sha', 'render'];
  for (const [ordinal, phase] of selectedPhases.entries()) {
    await send('Profiler.start');
    const start = performance.now(),
      response = await mf.dispatchFetch('http://localhost/' + phase),
      result = await response.json();
    const elapsedMs = performance.now() - start;
    if (!response.ok || !result.ok) throw Error('PROFILE_WORKLOAD_FAILED');
    const { profile } = await send('Profiler.stop');
    fs.writeFileSync(
      `${state.root}/reports/dev05r-${baseline ? 'baseline' : 'current'}-${args.includes('--cold') ? 'cold-' : ''}${ordinal}-${phase}.cpuprofile`,
      JSON.stringify(profile),
    );
    const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
    const sampleCosts = new Map();
    for (let i = 0; i < (profile.samples ?? []).length; i++) {
      const node = nodes.get(profile.samples[i]),
        name = node?.callFrame?.functionName ?? 'unknown';
      sampleCosts.set(
        name,
        (sampleCosts.get(name) ?? 0) + (profile.timeDeltas?.[i] ?? 0),
      );
    }
    phases.push({
      ...result,
      ordinal,
      localElapsedMs: elapsedMs,
      topSampledMicroseconds: [...sampleCosts]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12),
    });
  }
  const report = {
    at: new Date().toISOString(),
    scope:
      'local workerd CDP sampled CPU; not Cloudflare request CPU or an 8ms certification',
    baseline: baseline ? CPU_BASELINE : null,
    remote: false,
    externalRequests: 0,
    phases,
  };
  fs.writeFileSync(
    `${state.root}/reports/dev05r-local-${baseline ? 'baseline' : 'current'}${args.includes('--cold') ? '-cold' : ''}-profile.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  ws?.close();
  await mf.dispose();
}
