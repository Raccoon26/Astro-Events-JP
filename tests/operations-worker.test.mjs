import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { expect, it } from 'vitest';
import { preflight } from '../scripts/path-policy.mjs';
import { nativeTwitterAliases } from '../scripts/post-bundle-policy.mjs';
import { NOW } from './collection-fixtures';

it('runs a real workerd scheduled adapter and separate single-stage request with native D1', async () => {
  const out = await build({
    entryPoints: ['src/operations/fixture-worker.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    alias: nativeTwitterAliases(),
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-11-11',
      script: out.outputFiles[0].text,
      host: '127.0.0.1',
      port: 0,
      d1Databases: ['DB'],
      bindings: { OPS_ISOLATED_FIXTURE: 'true', OPS_FIXTURE_CLOCK: NOW },
    }),
  );
  try {
    const db = await mf.getD1Database('DB');
    for (const name of readdirSync('migrations')
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      const entries = readFileSync('migrations/' + name, 'utf8')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      await db.batch(entries.map((s) => db.prepare(s)));
    }
    await db
      .prepare(
        "INSERT INTO deployment_identity VALUES(1,'staging','astro-events-jp-staging',2,?)",
      )
      .bind(NOW)
      .run();
    const worker = await mf.getWorker();
    await worker.scheduled({
      cron: '0 */3 * * *',
      scheduledTime: new Date(NOW),
    });
    await worker.scheduled({
      cron: '0 */3 * * *',
      scheduledTime: new Date(NOW),
    });
    const req = await mf.dispatchFetch('http://localhost/fixture/step', {
      method: 'POST',
    });
    expect(req.status).toBe(200);
    const response = await req.json();
    expect(response).toMatchObject({
      result: { phase: 'recover', state: 'done' },
      synthetic: true,
      officialCpuMs: null,
    });
    expect(
      await db
        .prepare("SELECT count(*) AS n FROM ops_jobs WHERE state='done'")
        .first('n'),
    ).toBe(1);
    expect(
      await db.prepare('SELECT count(*) AS n FROM crawl_runs').first('n'),
    ).toBe(0);
    if (preflight().localDriveVerified)
      writeFileSync(
        '../reports/dev09-isolated-workerd.json',
        JSON.stringify(response, null, 2),
      );
  } finally {
    await mf.dispose();
  }
}, 30000);
