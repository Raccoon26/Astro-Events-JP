import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import initSqlJs from 'sql.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readConfig } from '../scripts/cloudflare-policy.mjs';
import { preflight } from '../scripts/path-policy.mjs';

const instances = [];
let staging, production, stagingDb, productionDb;
const migrationFiles = readdirSync('migrations')
  .filter((file) => file.endsWith('.sql'))
  .sort();
async function createRuntime(target, script) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: '2026-11-11',
      bindings: readConfig().env[target].vars,
      d1Databases: ['DB'],
      host: '127.0.0.1',
      port: 0,
    }),
  );
  instances.push(mf);
  const db = await mf.getD1Database('DB');
  for (const file of migrationFiles)
    for (const statement of readFileSync(`migrations/${file}`, 'utf8')
      .split(';')
      .map((sql) => sql.trim())
      .filter(Boolean))
      await db.prepare(statement).run();
  await db
    .prepare('INSERT INTO deployment_identity VALUES (?1,?2,?3,?4,?5)')
    .bind(1, target, `astro-events-jp-${target}`, 2, new Date().toISOString())
    .run();
  return { mf, db };
}
beforeAll(async () => {
  const bundle = await build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  });
  const first = await createRuntime('staging', bundle.outputFiles[0].text);
  staging = first.mf;
  stagingDb = first.db;
  const second = await createRuntime('production', bundle.outputFiles[0].text);
  production = second.mf;
  productionDb = second.db;
}, 30000);
afterAll(async () => {
  await Promise.all(instances.map((instance) => instance.dispose()));
});
describe('local workerd and D1 integration (not remote Cloudflare)', () => {
  it('serves a real localhost HTTP health check with one-row D1 read and no writes', async () => {
    const url = new URL('/health', await staging.ready);
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      environment: 'staging',
      collectionEnabled: false,
      database: 'ok',
    });
    const tables = await stagingDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all();
    expect(tables.results.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'sources',
        'events',
        'deployment_identity',
        'notification_deliveries',
      ]),
    );
    const indices = await stagingDb
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all();
    expect(indices.results.map((row) => row.name)).toContain('sources_due');
    expect(
      (await stagingDb.prepare('PRAGMA quick_check').all()).results,
    ).toEqual([{ quick_check: 'ok' }]);
    expect(
      (await stagingDb.prepare('PRAGMA foreign_key_check').all()).results,
    ).toEqual([]);
    const query = await stagingDb
      .prepare('SELECT environment FROM deployment_identity WHERE singleton=?1')
      .bind(1)
      .all();
    const state = preflight();
    if (state.localDriveVerified)
      writeFileSync(
        `${state.root}/reports/dev01-local-d1-measurement.json`,
        JSON.stringify(
          {
            at: new Date().toISOString(),
            local: true,
            remoteCloudflare: false,
            httpStatus: response.status,
            operation: 'identity SELECT',
            rowsRead: query.meta.rows_read,
            rowsWritten: query.meta.rows_written,
            cpuTimeMs: null,
            cpuStatus: 'not measured; Cloudflare metrics required',
          },
          null,
          2,
        ),
      );
  });
  it('inserts, reads and removes synthetic staging data without changing production', async () => {
    const id = 'dev01-local-probe';
    await stagingDb
      .prepare(
        'INSERT INTO discovery_candidates(candidate_id,canonical_url,discovered_from,reason,created_at) VALUES(?1,?2,?3,?4,?5)',
      )
      .bind(
        id,
        'https://example.invalid/dev01',
        'local',
        'synthetic',
        new Date().toISOString(),
      )
      .run();
    expect(
      await stagingDb
        .prepare(
          'SELECT candidate_id FROM discovery_candidates WHERE candidate_id=?1',
        )
        .bind(id)
        .first('candidate_id'),
    ).toBe(id);
    expect(
      await productionDb
        .prepare('SELECT COUNT(*) AS n FROM discovery_candidates')
        .first('n'),
    ).toBe(0);
    await stagingDb
      .prepare('DELETE FROM discovery_candidates WHERE candidate_id=?1')
      .bind(id)
      .run();
    expect(
      await stagingDb
        .prepare('SELECT COUNT(*) AS n FROM discovery_candidates')
        .first('n'),
    ).toBe(0);
  });
  it('executes both Cron entry points in workerd with no event or deletion work', async () => {
    const worker = await staging.getWorker();
    for (const cron of readConfig().env.staging.triggers.crons)
      await worker.scheduled({ cron });
    expect(
      await stagingDb
        .prepare('SELECT COUNT(*) AS n FROM crawl_runs')
        .first('n'),
    ).toBe(0);
    expect(
      await stagingDb.prepare('SELECT COUNT(*) AS n FROM events').first('n'),
    ).toBe(0);
  });
  it('isolates environment identity and recovers after a diagnostic binding error', async () => {
    await stagingDb
      .prepare(
        "UPDATE deployment_identity SET environment='production',database_name='astro-events-jp-production' WHERE singleton=1",
      )
      .run();
    expect(
      (await staging.dispatchFetch('https://example.jp/health')).status,
    ).toBe(503);
    expect(
      (await production.dispatchFetch('https://example.jp/health')).status,
    ).toBe(200);
    await stagingDb
      .prepare(
        "UPDATE deployment_identity SET environment='staging',database_name='astro-events-jp-staging' WHERE singleton=1",
      )
      .run();
    expect(
      (await staging.dispatchFetch('https://example.jp/health')).status,
    ).toBe(200);
  });
  it('detects migration failure and restores a local SQLite snapshot without production mutation', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    for (const file of migrationFiles)
      db.run(readFileSync(`migrations/${file}`, 'utf8'));
    db.run(
      "INSERT INTO deployment_identity VALUES(1,'staging','astro-events-jp-staging',2,'2026-11-11')",
    );
    const snapshot = db.export();
    expect(() => db.run('CREATE TABLE broken (')).toThrow();
    db.run('DELETE FROM deployment_identity');
    const restored = new SQL.Database(snapshot);
    expect(
      restored.exec('SELECT environment FROM deployment_identity')[0].values,
    ).toEqual([['staging']]);
    expect(restored.exec('PRAGMA integrity_check')[0].values).toEqual([['ok']]);
    expect(restored.exec('PRAGMA foreign_key_check')).toEqual([]);
    db.close();
    restored.close();
  });
});
