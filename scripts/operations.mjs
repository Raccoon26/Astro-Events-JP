import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { assertNoLinks, preflight } from './path-policy.mjs';

const workspace = preflight();
if (!workspace.localDriveVerified) throw Error('OPS_E_DRIVE_REQUIRED');
const [command = 'report', flag, ...rest] = process.argv.slice(2);
if (
  !['report', 'tick', 'step'].includes(command) ||
  rest.length ||
  (command === 'report' ? !!flag : flag !== '--apply-fixture')
)
  throw Error('Use report, tick --apply-fixture, or step --apply-fixture');
const destination = workspace.root + '/cache/operations-fixture';
for (const p of [destination, 'dist/operations/index.mjs'])
  if (existsSync(p)) assertNoLinks(p);
const api = await import('../dist/operations/index.mjs');
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    host: '127.0.0.1',
    port: 0,
    script: 'export default {fetch(){return new Response(null,{status:404})}}',
    d1Databases: { DB: 'dev09-isolated-fixture' },
    resourcePersistencePath: destination,
  }),
);
try {
  const db = await mf.getD1Database('DB');
  const now = Date.now(),
    iso = (t) => new Date(t).toISOString();
  const jst = Math.floor((now + 32400000) / 86400000) * 86400000 - 32400000;
  if (command !== 'report') {
    await db
      .prepare(
        'CREATE TABLE IF NOT EXISTS ops_cli_migrations(name TEXT PRIMARY KEY)',
      )
      .run();
    for (const name of readdirSync('migrations')
      .filter((s) => /^\d{4}_[a-z_]+\.sql$/.test(s))
      .sort()) {
      if (
        await db
          .prepare('SELECT name FROM ops_cli_migrations WHERE name=?')
          .bind(name)
          .first()
      )
        continue;
      const statements = readFileSync('migrations/' + name, 'utf8')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      await db.batch([
        ...statements.map((s) => db.prepare(s)),
        db.prepare('INSERT INTO ops_cli_migrations VALUES(?)').bind(name),
      ]);
    }
    await db
      .prepare(
        "INSERT INTO deployment_identity VALUES(1,'staging','astro-events-jp-staging',2,?) ON CONFLICT DO NOTHING",
      )
      .bind(iso(now))
      .run();
  }
  const engine = api.operationsPipeline(db);
  const reportMeter = command === 'report' ? new api.D1Meter(db) : null;
  const fixture = {
    ...api.ZERO,
    checkedAt: iso(now),
    plan: 'free',
    provenance: 'fixture',
    cronTriggers: 1,
    cpuP99Ms: 3,
    projectDatabaseBytes: 0,
    telemetryUnit: iso(now) >= '2026-12-01' ? 'bytes' : 'records',
  };
  const result =
    command === 'tick'
      ? await engine.tick(Math.floor(now / 10800000) * 10800000, fixture)
      : command === 'step'
        ? await engine.advance(fixture)
        : await api.dailyReport(
            reportMeter.db,
            iso(jst - 86400000),
            iso(jst),
            null,
          );
  console.log(
    JSON.stringify(
      {
        synthetic: true,
        networkWrites: 0,
        cloudflareCpuMs: null,
        result,
        d1: (reportMeter ?? engine.meter).snapshot(),
      },
      null,
      2,
    ),
  );
} finally {
  await mf.dispose();
}
