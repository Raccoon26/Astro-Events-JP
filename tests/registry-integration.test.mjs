import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { expect, it } from 'vitest';
import { meterD1 } from '../scripts/d1-meter.mjs';
import { preflight } from '../scripts/path-policy.mjs';

it('imports the real seeds transactionally into isolated local D1, replays without writes and benchmarks 2000 fixtures', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      d1Databases: ['DB'],
      host: '127.0.0.1',
      port: 0,
    }),
  );
  try {
    const bundle = await build({
      entryPoints: ['src/registry-api.ts'],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
    });
    const api = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
    );
    const raw = JSON.parse(readFileSync('data/sources.json'));
    const facilities = JSON.parse(readFileSync('data/facilities.json'));
    const vtubers = JSON.parse(readFileSync('data/vtubers.json'));
    const candidates = JSON.parse(readFileSync('data/candidates.json'));
    const seed = raw.map((row) => ({
      ...row,
      officialUrl: row.url,
      format: 'html',
      priority: 10,
      lastCrawledAt: null,
      nextCrawlAt: row.registeredAt,
      etag: null,
      lastModified: null,
      robotsCheckedAt: null,
      termsReviewedAt: null,
    }));
    const db = await mf.getD1Database('DB');
    for (const file of readdirSync('migrations')
      .filter((f) => f.endsWith('.sql'))
      .sort())
      for (const sql of readFileSync(`migrations/${file}`, 'utf8')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean))
        await db.prepare(sql).run();
    await db
      .prepare(
        "INSERT INTO deployment_identity VALUES(1,'staging','astro-events-jp-staging',2,'2026-11-11')",
      )
      .run();
    const measured = meterD1(db);
    const started = performance.now();
    expect(
      (
        await api.importRegistrySeed(
          measured.db,
          seed,
          facilities,
          vtubers,
          false,
          candidates,
        )
      ).preview,
    ).toHaveLength(raw.length);
    expect(measured.usage.rowsWritten).toBe(0);
    const first = meterD1(db);
    expect(
      (
        await api.importRegistrySeed(
          first.db,
          seed,
          facilities,
          vtubers,
          true,
          candidates,
        )
      ).inserted,
    ).toBe(raw.length);
    const importedMs = performance.now() - started;
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM facilities').first('n'),
    ).toBe(facilities.length);
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM vtuber_sources').first('n'),
    ).toBe(4);
    const second = meterD1(db);
    expect(
      (
        await api.importRegistrySeed(
          second.db,
          seed,
          facilities,
          vtubers,
          true,
          candidates,
        )
      ).existing,
    ).toBe(raw.length);
    expect(second.usage.rowsWritten).toBe(0);
    // Synthetic rows are isolated test fixtures, never production seed data.
    const bulkStart = performance.now();
    for (let offset = 0; offset < 2000; offset += 40)
      await db.batch(
        Array.from({ length: 40 }, (_, i) =>
          db
            .prepare(
              "INSERT INTO sources(source_id,name,official_url,allowed_hosts_json,category,prefecture,format,state,next_crawl_at) VALUES(?1,'fixture',?2,'[\"example.org\"]','local',?3,'html','review','2030-01-01')",
            )
            .bind(
              `fixture-${offset + i}`,
              `https://example.org/${offset + i}`,
              ((offset + i) % 47) + 1,
            ),
        ),
      );
    const bulkMs = performance.now() - bulkStart;
    const q = meterD1(db);
    const registry = new api.D1SourceRegistry(q.db);
    const searchStart = performance.now();
    const page = await registry.list({
      prefecture: 1,
      category: 'local',
      state: 'review',
      limit: 25,
    });
    expect(page.length).toBeGreaterThan(0);
    expect(page.length).toBeLessThanOrEqual(25);
    expect(q.usage.queries).toBe(1);
    const searchMs = performance.now() - searchStart;
    const group = await db
      .prepare(
        'SELECT prefecture,COUNT(*) AS n FROM sources GROUP BY prefecture',
      )
      .all();
    expect(group.results.filter((r) => r.prefecture !== null)).toHaveLength(47);
    expect(
      (await db.prepare('PRAGMA foreign_key_check').all()).results,
    ).toEqual([]);
    expect(await db.prepare('PRAGMA quick_check').first('quick_check')).toBe(
      'ok',
    );
    const state = preflight();
    if (state.localDriveVerified)
      writeFileSync(
        `${state.root}/reports/dev02-benchmark.json`,
        JSON.stringify(
          {
            local: true,
            remote: false,
            cpuTimeMs: null,
            realSeeds: raw.length,
            facilities: facilities.length,
            dryRun: measured.usage,
            first: first.usage,
            repeat: second.usage,
            fixtureRows: 2000,
            importedMs,
            bulkMs,
            searchMs,
            search: q.usage,
            groupRowsRead: group.meta.rows_read,
            sizeBytes: group.meta.size_after ?? null,
            integrity: 'ok',
          },
          null,
          2,
        ),
      );
  } finally {
    await mf.dispose();
  }
}, 120000);
