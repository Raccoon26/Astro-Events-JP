import fs from 'node:fs';
import { build } from 'esbuild';
import { assertNoLinks, preflight } from './path-policy.mjs';
import { nativeTwitterAliases } from './post-bundle-policy.mjs';

const state = preflight();
if (
  process.argv.slice(2).some((x) => x !== '--check') ||
  process.argv.slice(2).length > 1
)
  throw Error('SYNTHETIC_SAMPLES_ONLY');
const out = await build({
  entryPoints: ['src/notifications/messages.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  alias: nativeTwitterAliases(),
});
const api = await import(
  `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`
);
const corpus = JSON.parse(
  fs.readFileSync('src/posts/profile-corpus.json', 'utf8'),
);
const lines = [
  '# DEV06 合成通知サンプル / 실제 행사·수신자 아님',
  '',
  '실제 Source 승인·행사·발송 건수에 포함하지 않는다. A는 복사 본문, B는 관리용이며 버튼은 게시완료/보류/재확인이다. Issue는 Private Reports 전용이다.',
];
for (const c of corpus.cases.slice(0, 13)) {
  const e = c.event,
    p = c.expected,
    delivery = {
      copyText: p.text,
      metadata: {
        post: p,
        eventId: e.stableEventId,
        sourceId: e.sourceId,
        eventRevision: 1,
        verified: true,
        checkedAt: e.verification.checkedAt,
        expiresAt: e.verification.expiresAt,
        fingerprint: e.verification.fingerprint,
        decisionId: 'synthetic-only',
        officialUrl: e.officialUrl,
        images: e.verification.images,
        impacts: e.verification.impacts,
        recommended: true,
        recheckRequired: false,
        fields: Object.fromEntries(
          Object.entries(e.verification.fields).map(([k, v]) => [k, v.state]),
        ),
      },
    };
  const rendered = await api.renderMessages(e, delivery);
  lines.push(
    '',
    `## ${c.id} — A / ${p.weightedLength}/280`,
    '',
    '```text',
    p.text,
    '```',
    '',
    '### B 管理',
    '',
    ...rendered.management.map((text) => '```text\n' + text + '\n```'),
    '',
    '### Private Issue Markdown',
    '',
    '````text',
    rendered.issue.body,
    '````',
  );
}
const output = lines.join('\n') + '\n',
  file = 'NOTIFICATION_SAMPLES.md';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n') !== output)
    throw Error('NOTIFICATION_SAMPLES_CHANGED');
  console.log('All 13 synthetic notification samples match; no sends.');
} else {
  if (fs.existsSync(file)) assertNoLinks(file);
  fs.writeFileSync(file, output);
  if (state.localDriveVerified) {
    assertNoLinks(state.root + '/reports');
    fs.writeFileSync(
      state.root + '/reports/DEV06_NOTIFICATION_SAMPLES.md',
      output,
    );
  }
  console.log('Generated 13 synthetic samples, no D1 or external requests.');
}
