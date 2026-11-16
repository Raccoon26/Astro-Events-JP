import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { preflight } from './path-policy.mjs';

preflight();
if (process.argv.slice(2).join(' ') !== '--write')
  throw new Error('Explicit --write required; synthetic offline corpus only');
const built = await build({
  stdin: {
    contents:
      "export {postFixture,examples,POST_NOW} from './tests/post-fixtures';export {renderPost} from './src/posts/render';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
});
const api = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
);
const cases = [];
for (const { kind } of api.examples) {
  const { event } = await api.postFixture(kind);
  cases.push({ id: kind, kind, now: api.POST_NOW, event });
}
for (const [id, overrides] of [
  ['emoji', { title: '合成・月と星 🌙 🔭 👨‍👩‍👧‍👦 観望会' }],
  ['long-url', {}],
  [
    'recompose',
    {
      fee: '参加費 大人500円 / 小学生200円',
      reservation: '要事前予約 抽選 定員30名',
      applicationStart: '申込開始2026年11月15日',
      applicationDeadline: '申込締切2026年11月20日',
      title:
        '合成・市民のための天体観望会と星空の解説・月と惑星の観察プログラム',
    },
  ],
]) {
  const { event } = await api.postFixture('observation', overrides);
  if (id === 'long-url')
    event.officialUrl = `https://example.jp/events/${'official-'.repeat(100)}observatory?year=2026`;
  cases.push({ id, kind: 'observation', now: api.POST_NOW, event });
}
// Find a stable near-limit input without slicing a generated sentence.
for (let n = 0; n < 100; n++) {
  const { event } = await api.postFixture('observation', {
    title: '合成・' + '星'.repeat(n) + '観望会',
  });
  const p = await api.renderPost(event, 1, 'observation', api.POST_NOW);
  if (p.weightedLength >= 278 && p.weightedLength <= 280) {
    cases.push({
      id: 'near-limit',
      kind: 'observation',
      now: api.POST_NOW,
      event,
    });
    break;
  }
}
if (cases.length !== 17) throw Error('CORPUS_INCOMPLETE');
for (const c of cases) {
  const p = await api.renderPost(c.event, 1, c.kind, c.now);
  c.expected = p;
}
writeFileSync(
  'src/posts/profile-corpus.json',
  JSON.stringify(
    {
      synthetic: true,
      clock: '2026-11-12 JST fixed; not current real verification',
      cases,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    synthetic: true,
    cases: cases.map((c) => ({
      id: c.id,
      weightedLength: c.expected.weightedLength,
      omitted: c.expected.omitted,
    })),
  }),
);
