import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { assertNoLinks, preflight } from './path-policy.mjs';
import { pinnedTransport } from './pinned-transport.mjs';

const state = preflight();
const command = process.argv[2] ?? 'status';
if (
  !['status', 'review', 'approve', 'run-one'].includes(command) ||
  process.argv.some((a) => /--remote|production/.test(a))
)
  throw new Error('Collector CLI supports local staging only');
const apply = process.argv.includes('--apply');
const compiled = await build({
  entryPoints: ['src/collector-management-api.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const api = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
);
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script:
      'export default {fetch(){return new Response("local collector management")}}',
    d1Databases: { DB: 'astro-registry-staging' },
    resourcePersistencePath: state.localDriveVerified
      ? `${state.root}/cache/registry/staging`
      : `${process.env.RUNNER_TEMP ?? state.root}/astro-registry-staging`,
    host: '127.0.0.1',
    port: 0,
  }),
);
try {
  const db = await mf.getD1Database('DB');
  const marker = await db
    .prepare(
      'SELECT environment,database_name FROM deployment_identity WHERE singleton=1',
    )
    .first();
  if (
    marker?.environment !== 'staging' ||
    marker.database_name !== 'astro-events-jp-staging'
  )
    throw new Error('Wrong local staging DB');
  const store = new api.CollectionStore(db);
  let result;
  if (command === 'status') {
    result = {
      local: true,
      remote: false,
      sourceStates: (
        await db
          .prepare('SELECT state,COUNT(*) AS n FROM sources GROUP BY state')
          .all()
      ).results,
      approvals: await db
        .prepare('SELECT COUNT(*) AS n FROM source_approvals')
        .first('n'),
      policyReviews: await db
        .prepare('SELECT COUNT(*) AS n FROM source_policy_reviews')
        .first('n'),
      jobs: (
        await db
          .prepare(
            'SELECT state,COUNT(*) AS n FROM collection_jobs GROUP BY state',
          )
          .all()
      ).results,
      candidates: await db
        .prepare('SELECT COUNT(*) AS n FROM event_candidates')
        .first('n'),
      cloudflareCpuTimeMs: null,
    };
  } else if (command === 'review' || command === 'approve') {
    const i = process.argv.indexOf('--file');
    if (i < 0 || !process.argv[i + 1])
      throw new Error('Explicit E-drive review JSON file required');
    const file = path.resolve(process.argv[i + 1]);
    if (
      state.localDriveVerified &&
      !file.startsWith(path.resolve(state.root) + path.sep)
    )
      throw new Error('Review files must stay on E project drive');
    assertNoLinks(file);
    if (statSync(file).size > 65536) throw new Error('Review file too large');
    const record = JSON.parse(readFileSync(file, 'utf8'));
    const source = await new api.D1SourceRegistry(db).get(record.sourceId);
    if (!source) throw new Error('Unknown source');
    if (command === 'approve')
      api.assertApproval(
        {
          ...source,
          state: 'active',
          parserApproved: true,
          robotsStatus: 'allowed',
          termsStatus: 'allowed',
          robotsCheckedAt: record.reviewedAt,
          termsReviewedAt: record.reviewedAt,
        },
        record,
        new Date().toISOString(),
      );
    if (apply) {
      if (command === 'approve')
        await store.approve(source, record, new Date().toISOString());
      else await store.recordReview(source.id, record);
    }
    result = {
      mode: apply ? 'apply' : 'dry-run',
      operation: command,
      sourceId: source.id,
      collectionActivated: apply && command === 'approve',
    };
  } else {
    const active = await db
      .prepare("SELECT COUNT(*) AS n FROM sources WHERE state='active'")
      .first('n');
    if (!apply || !active)
      result = {
        mode: apply ? 'apply' : 'dry-run',
        activeSources: active,
        networkRequests: 0,
        reason: !active
          ? 'No approved sources'
          : 'Explicit --apply and --local-budget required',
      };
    else {
      if (!process.argv.includes('--local-budget'))
        throw new Error('Explicit local-only budget attestation required');
      const engine = new api.CollectionOrchestrator(
        db,
        pinnedTransport(api.publicIPv4),
      );
      await engine.enqueueFair(new Date().toISOString());
      result = await engine.step({
        environment: 'staging',
        localOnly: true,
        accountUsage: { requests: 0, reads: 0, writes: 0, databaseBytes: 0 },
      });
    }
  }
  if (state.localDriveVerified)
    writeFileSync(
      `${state.root}/reports/dev03-collector-${Date.now()}.json`,
      JSON.stringify(result, null, 2),
    );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await mf.dispose();
}
