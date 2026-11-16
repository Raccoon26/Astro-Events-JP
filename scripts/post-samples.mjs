import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { assertNoLinks, preflight } from './path-policy.mjs';

const state = preflight();
if (
  process.argv.slice(2).some((a) => !['--write', '--check'].includes(a)) ||
  (process.argv.includes('--write') && process.argv.includes('--check'))
)
  throw new Error('Explicit samples/check/write only');
const built = await build({
  stdin: {
    contents:
      "export {examples,postFixture,POST_NOW} from './tests/post-fixtures';export {renderPost} from './src/posts/render';",
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
let markdown =
  '# DEV05 일본어 전체 샘플 — 합성 자료 전용\n\n실제 공식 행사·승인·검증 건수가 아니다. 고정된 2026-11-12 JST 검토 시각 기준이며 실제 사용 시 현재 Verified 게이트를 다시 통과해야 한다. 자동 시험과 개발자 일본어 자기 검토 대상이며 일본어 원어민 실사용자 검수를 받았다는 뜻이 아니다.\n';
for (const sample of api.examples) {
  const f = await api.postFixture(sample.kind),
    p = await api.renderPost(f.event, 1, sample.kind, api.POST_NOW);
  markdown += `\n## ${sample.kind} — ${p.weightedLength}/280, ${p.templateVersion}\n\n\`\`\`text\n${p.text}\n\`\`\`\n`;
}
if (process.argv.includes('--check')) {
  if (
    readFileSync('POST_SAMPLES.md', 'utf8').replace(/\r\n/g, '\n') !== markdown
  )
    throw new Error(
      'Japanese samples changed: review and explicitly regenerate',
    );
  console.log('All 13 reviewed synthetic Japanese samples reproduce exactly.');
} else {
  if (process.argv.includes('--write')) {
    writeFileSync('POST_SAMPLES.md', markdown);
    const f = await api.postFixture('observation', {
      schedule: '開催日2099年11月23日 13:30〜15:00',
    });
    writeFileSync(
      'src/posts/synthetic-profile.json',
      JSON.stringify({ synthetic: true, event: f.event }, null, 2) + '\n',
    );
  }
  if (state.localDriveVerified) {
    assertNoLinks(state.root + '/reports');
    writeFileSync(state.root + '/reports/dev05-japanese-samples.md', markdown);
  }
  console.log(markdown);
}
