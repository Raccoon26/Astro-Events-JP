import { build } from 'esbuild';
import { preflight } from './path-policy.mjs';
import { nativeTwitterAliases } from './post-bundle-policy.mjs';

const state = preflight();
const [command = 'simulation', first = '', second = '', third = '', ...rest] =
  process.argv.slice(2);
const usage = { requests: 0, reads: 0, writes: 0, databaseBytes: 0 };
const bundle = await build({
  entryPoints: ['src/nationwide-management-api.ts'],
  alias: nativeTwitterAliases(),
  bundle: true,
  platform: 'browser',
  format: 'esm',
  write: false,
});
const api = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
let result;
if (command === 'simulation') {
  if (second || third || rest.length || (first && !/^\d{1,4}$/u.test(first)))
    throw Error('SIMULATION_ARGUMENTS');
  result = api.simulateSurvey(first ? Number(first) : 410);
} else if (
  command === 'samples' &&
  !first &&
  !second &&
  !third &&
  !rest.length
) {
  const base = {
    revision: 1,
    decisionId: 'fixture-only',
    fingerprint: 'fixture-only',
    validUntil: '2026-11-22T15:00:00.000Z',
  };
  const members = [
    {
      ...base,
      eventId: 'fixture-hokkaido',
      date: '2026年11月21日',
      duration: false,
      days: '土',
      title: 'TEST 星空観察会 🌌',
      venue: '合成公民館',
      url: 'https://example.jp/fixture/stars',
      prefecture: 1,
      category: 'local',
      terms: ['要事前申込'],
    },
    {
      ...base,
      eventId: 'fixture-kyushu',
      date: '2026年11月21日〜2026年11月22日',
      duration: true,
      days: '土日',
      title: 'TEST 宇宙写真展',
      venue: '合成科学館',
      url: 'https://example.jp/fixture/exhibition',
      prefecture: 46,
      category: 'research',
      terms: ['入場料無料'],
    },
    {
      ...base,
      eventId: 'fixture-third',
      date: '2026年11月22日 18:30',
      duration: false,
      days: '日',
      title: 'TEST 月を観察する公開講座',
      venue: '合成図書館',
      url: 'https://example.jp/fixture/moon',
      prefecture: 15,
      category: 'local',
      terms: [],
    },
  ];
  result = { synthetic: true, ...api.buildWeekend(members, 'nationwide') };
} else {
  if (!state.localDriveVerified) throw Error('DEV08_E_DRIVE_REQUIRED');
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script:
        'export default {fetch(){return new Response("DEV08 local management only")}}',
      host: '127.0.0.1',
      port: 0,
      d1Databases: { DB: 'astro-registry-staging' },
      resourcePersistencePath: state.root + '/cache/registry/staging',
    }),
  );
  try {
    const db = await mf.getD1Database('DB');
    if (
      command === 'coverage' &&
      /^[1-9]\d?$/u.test(first) &&
      !third &&
      !rest.length
    )
      result = await api.localCoverage(db, Number(first), second);
    else if (
      command === 'survey' &&
      ['regional', 'category', 'vtuber'].includes(first) &&
      ((!second && !third && !rest.length) ||
        (third === '--apply' &&
          rest.length === 1 &&
          rest[0] === '--local-budget'))
    ) {
      const scheduler = new api.NationwideScheduler(db, { localOnly: true });
      result = {
        plan: await scheduler.step(
          first,
          usage,
          third === '--apply',
          second || undefined,
        ),
        d1: scheduler.meter.snapshot(),
      };
    } else if (
      command === 'weekend' &&
      ['0', '1'].includes(first) &&
      ((!third && !rest.length) ||
        (/^[a-f0-9]{64}$/u.test(third) &&
          rest.join(' ') === '--apply --local-budget'))
    ) {
      const store = new api.WeekendStore(db, {
        localOnly: true,
        chatId: '10001',
      });
      result = {
        plan: third
          ? await store.enqueue(Number(first), second, third, usage)
          : await store.preview(Number(first), second, usage),
        d1: store.meter.snapshot(),
      };
    } else if (
      command === 'weekend-status' &&
      /^weekend-[a-f0-9]{64}$/u.test(first) &&
      !second &&
      !third &&
      !rest.length
    ) {
      result = await new api.WeekendStore(db, {
        localOnly: true,
        chatId: '10001',
      }).list(first);
    } else throw Error('DEV08_ARGUMENTS');
  } finally {
    await mf.dispose();
  }
}
console.log(
  JSON.stringify(
    { local: true, networkRequests: 0, cloudflareCpuMs: null, result },
    null,
    2,
  ),
);
