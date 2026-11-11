import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { meterD1 } from './d1-meter.mjs';
import { preflight } from './path-policy.mjs';

const state = preflight();
const command = process.argv[2] ?? 'validate';
if (
  !['validate', 'coverage', 'init', 'import', 'list', 'stats'].includes(command)
)
  throw new Error('Unknown registry command');
if (process.argv.some((a) => /production|--remote/.test(a)))
  throw new Error('Registry CLI is local staging only');
const sources = JSON.parse(readFileSync('data/sources.json', 'utf8'));
const prefectures = JSON.parse(readFileSync('data/prefectures.json', 'utf8'));
const facilities = JSON.parse(readFileSync('data/facilities.json', 'utf8'));
const vtubers = JSON.parse(readFileSync('data/vtubers.json', 'utf8'));
const candidates = JSON.parse(readFileSync('data/candidates.json', 'utf8'));
const bundle = await build({
  entryPoints: ['src/registry-api.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const mod = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
async function registration(row) {
  const url = mod.normalizeUrl(row.url);
  return {
    ...row,
    id: row.id,
    officialUrl: url,
    allowedHosts: row.allowedHosts,
    format: 'html',
    priority: row.category === 'local' ? 20 : 10,
    lastCrawledAt: null,
    nextCrawlAt: row.registeredAt,
    etag: null,
    lastModified: null,
    robotsCheckedAt: row.robotsStatus === 'not-checked' ? null : row.checkedAt,
    termsReviewedAt: null,
  };
}
const seed = [];
const urls = new Set();
for (const row of sources) {
  const s = await registration(row);
  mod.validateRegistration(s);
  if (urls.has(s.officialUrl)) throw new Error('Duplicate seed URL');
  urls.add(s.officialUrl);
  seed.push(s);
}
mod.validateSeed(seed, facilities, vtubers);
if (
  prefectures.length !== 47 ||
  new Set(prefectures.map((p) => p.code)).size !== 47
)
  throw new Error('Invalid prefecture metadata');
const report = {
  at: sources.reduce(
    (latest, row) => (row.checkedAt > latest ? row.checkedAt : latest),
    '',
  ),
  sources: seed.length,
  verified: seed.filter((s) => s.officialStatus === 'Verified').length,
  states: Object.fromEntries(
    ['active', 'review', 'unsupported', 'paused'].map((state) => [
      state,
      seed.filter((s) => s.state === state).length,
    ]),
  ),
  prefectures: prefectures.map((p) => ({
    ...p,
    sources: seed.filter((s) => s.prefecture === p.code).length,
    verified: seed.filter(
      (s) => s.prefecture === p.code && s.officialStatus === 'Verified',
    ).length,
    facilities: facilities.filter((f) => f.prefecture === p.code).length,
  })),
  missing: prefectures
    .filter((p) => !seed.some((s) => s.prefecture === p.code))
    .map((p) => p.name),
  unverifiedRegions: prefectures
    .filter(
      (p) =>
        !seed.some(
          (s) => s.prefecture === p.code && s.officialStatus === 'Verified',
        ),
    )
    .map((p) => p.name),
  kinds: Object.fromEntries(
    [...new Set(seed.map((s) => s.kind))].map((k) => [
      k,
      seed.filter((s) => s.kind === k).length,
    ]),
  ),
  categories: Object.fromEntries(
    [...new Set(seed.map((s) => s.category))].map((k) => [
      k,
      seed.filter((s) => s.category === k).length,
    ]),
  ),
  vtubers: vtubers.map((v) => ({
    name: v.name,
    status:
      v.accounts.length && v.accounts.every((a) => a.verified)
        ? 'Verified'
        : 'Review Required',
    reason: v.reason,
  })),
  accessIssues: seed
    .filter(
      (s) =>
        s.state === 'unsupported' ||
        s.state === 'paused' ||
        s.officialStatus !== 'Verified',
    )
    .map((s) => ({ id: s.id, name: s.name, url: s.url, reason: s.reason })),
};
if (command === 'validate') {
  console.log(
    JSON.stringify({
      valid: true,
      sources: seed.length,
      verified: report.verified,
      verifiedPrefectures: 47 - report.unverifiedRegions.length,
    }),
  );
  process.exit(0);
}
if (command === 'coverage') {
  writeFileSync('data/coverage.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("registry-local")}}',
    d1Databases: { DB: 'astro-registry-staging' },
    host: '127.0.0.1',
    port: 0,
    resourcePersistencePath: state.localDriveVerified
      ? `${state.root}/cache/registry/staging`
      : `${process.env.RUNNER_TEMP ?? state.root}/astro-registry-staging`,
  }),
);
try {
  const db = await mf.getD1Database('DB');
  if (command === 'init') {
    const hasIdentity = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE name='deployment_identity'",
      )
      .first();
    if (hasIdentity) {
      const marker = await db
        .prepare(
          'SELECT environment,database_name FROM deployment_identity WHERE singleton=1',
        )
        .first();
      if (
        marker &&
        (marker.environment !== 'staging' ||
          marker.database_name !== 'astro-events-jp-staging')
      )
        throw new Error('Wrong environment before initialization');
    }
    await db
      .prepare(
        'CREATE TABLE IF NOT EXISTS registry_migrations(name TEXT PRIMARY KEY)',
      )
      .run();
    for (const file of readdirSync('migrations')
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      if (
        await db
          .prepare('SELECT name FROM registry_migrations WHERE name=?1')
          .bind(file)
          .first()
      )
        continue;
      await db.batch([
        ...readFileSync(`migrations/${file}`, 'utf8')
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s && !/^PRAGMA foreign_keys/i.test(s))
          .map((s) => db.prepare(s)),
        db.prepare('INSERT INTO registry_migrations VALUES(?1)').bind(file),
      ]);
    }
  }
  const identity = await db
    .prepare('SELECT environment FROM deployment_identity WHERE singleton=1')
    .first('environment');
  if (identity && identity !== 'staging') throw new Error('Wrong environment');
  if (!identity && command === 'init')
    await db
      .prepare(
        "INSERT INTO deployment_identity VALUES(1,'staging','astro-events-jp-staging',2,?1)",
      )
      .bind(new Date().toISOString())
      .run();
  if (command === 'init') {
    console.log('Dedicated local staging registry initialized.');
    process.exitCode = 0;
  } else {
    const actualName = await db
      .prepare(
        'SELECT database_name FROM deployment_identity WHERE singleton=1',
      )
      .first('database_name');
    if (identity !== 'staging' || actualName !== 'astro-events-jp-staging')
      throw new Error('Wrong local staging identity');
    const registry = new mod.D1SourceRegistry(db);
    if (command === 'import') {
      const started = performance.now();
      const measured = meterD1(db);
      const result = await mod.importRegistrySeed(
        measured.db,
        seed,
        facilities,
        vtubers,
        process.argv.includes('--apply'),
        candidates,
      );
      const integrity = await db.prepare('PRAGMA quick_check').first();
      const fk = await db.prepare('PRAGMA foreign_key_check').all();
      if (integrity.quick_check !== 'ok' || fk.results.length)
        throw new Error('Integrity failed');
      const metrics = {
        ...result,
        elapsedMs: performance.now() - started,
        cpuTimeMs: null,
        local: true,
        remote: false,
        integrity: 'ok',
        ...measured.usage,
      };
      if (state.localDriveVerified)
        writeFileSync(
          `${state.root}/reports/dev02-import-${Date.now()}.json`,
          JSON.stringify(metrics, null, 2),
        );
      console.log(JSON.stringify(metrics, null, 2));
    }
    if (command === 'list') {
      const index = process.argv.indexOf('--prefecture');
      const ci = process.argv.indexOf('--category');
      const si = process.argv.indexOf('--state');
      const cursor = process.argv.indexOf('--cursor');
      console.log(
        JSON.stringify(
          await registry.list({
            ...(index >= 0
              ? { prefecture: Number(process.argv[index + 1]) }
              : {}),
            ...(ci >= 0 ? { category: process.argv[ci + 1] } : {}),
            ...(si >= 0 ? { state: process.argv[si + 1] } : {}),
            ...(cursor >= 0 ? { cursor: process.argv[cursor + 1] } : {}),
            limit: 100,
          }),
          null,
          2,
        ),
      );
    } else if (command === 'stats') {
      const rows = await db
        .prepare(
          'SELECT prefecture,category,state,COUNT(*) AS n FROM sources GROUP BY prefecture,category,state',
        )
        .all();
      console.log(
        JSON.stringify(
          {
            local: true,
            remote: false,
            groups: rows.results,
            rowsRead: rows.meta.rows_read,
            rowsWritten: rows.meta.rows_written,
            providerSizeBytes: rows.meta.size_after ?? null,
            cpuTimeMs: null,
          },
          null,
          2,
        ),
      );
    }
  }
} finally {
  await mf.dispose();
}
