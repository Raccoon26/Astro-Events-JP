import { readdirSync, readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { prefecture, prefectures, regionPrefectures } from '../src/prefectures';
import {
  D1SourceRegistry,
  normalizeUrl,
  type Registration,
  selectFair,
  stableId,
  validateRegistration,
} from '../src/registry';
import { RegistryManagement } from '../src/registry-management';
import { importRegistrySeed, validateSeed } from '../src/seed-import';

let db: D1Database;
beforeEach(async () => {
  const SQL = await initSqlJs();
  const sql = new SQL.Database();
  for (const f of readdirSync('migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sql.run(readFileSync(`migrations/${f}`, 'utf8'));
  const prepare = (text: string) => {
    let params: unknown[] = [];
    const obj = {
      bind(...values: unknown[]) {
        params = values;
        return obj;
      },
      async all() {
        const statement = sql.prepare(text);
        statement.bind(params as never);
        const results = [];
        while (statement.step()) results.push(statement.getAsObject());
        statement.free();
        return { success: true, results, meta: {} };
      },
      async first(column?: string) {
        const row = (await obj.all()).results[0];
        return column ? (row?.[column] ?? null) : (row ?? null);
      },
      async run() {
        sql.run(text, params as never);
        return { success: true };
      },
    };
    return obj;
  };
  db = {
    prepare,
    async batch(statements: { run: () => Promise<unknown> }[]) {
      sql.run('BEGIN');
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        sql.run('COMMIT');
        return result;
      } catch (error) {
        sql.run('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
});
function source(i = 1): Registration {
  return {
    id: `s${i}`,
    name: '公式天文台',
    operator: '市',
    officialUrl: `https://example.jp/${i}`,
    allowedHosts: ['example.jp'],
    prefecture: i,
    municipality: null,
    category: 'local',
    format: 'html',
    priority: 10,
    lastCrawledAt: null,
    nextCrawlAt: '2026-01-01',
    etag: null,
    lastModified: null,
    robotsCheckedAt: '2026-01-01',
    termsReviewedAt: '2026-01-01',
    state: 'review',
    officialStatus: 'Verified',
    evidenceUrl: 'https://example.jp/',
    checkedAt: '2026-01-01',
    robotsStatus: 'allowed',
    termsStatus: 'allowed',
    reason: 'reviewed',
    kind: 'observatory',
  };
}
describe('source registry', () => {
  it('matches all 47 JIS names/codes and eight reporting regions', () => {
    const expected =
      '北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(
        ' ',
      );
    expect(prefectures.map((p) => p.name)).toEqual(expected);
    expect(prefectures.map((p) => p.jisCode)).toEqual(
      expected.map((_, i) => String(i + 1).padStart(2, '0')),
    );
    expect(new Set(prefectures.map((p) => p.region)).size).toBe(8);
    expect(prefecture(24).region).toBe('近畿');
    expect(regionPrefectures('九州・沖縄')).toHaveLength(8);
    expect(() => prefecture(0)).toThrow();
    expect(() => prefecture(48)).toThrow();
  });
  it('normalizes tracking/host/ports without merging distinct paths', async () => {
    expect(normalizeUrl('https://EXAMPLE.jp:443/a?utm_source=x#hash')).toBe(
      'https://example.jp/a',
    );
    expect(normalizeUrl('https://example.jp/a/')).not.toBe(
      normalizeUrl('https://example.jp/a'),
    );
    expect(await stableId('https://example.jp/?utm_source=x')).toBe(
      await stableId('https://example.jp/'),
    );
  });
  it.each([
    'https://127.0.0.1',
    'https://[::1]',
    'https://user:pass@example.jp',
    'file:///etc/passwd',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => normalizeUrl(url)).toThrow();
  });
  it('registers, reads, edits, pauses and retains history', async () => {
    const r = new D1SourceRegistry(db);
    await r.register(source());
    expect((await r.get('s1'))?.name).toBe('公式天文台');
    await r.save({ ...source(), name: '変更' });
    await r.pause('s1', 'manual hold');
    expect((await r.get('s1'))?.state).toBe('paused');
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM registry_history').first('n'),
    ).toBe(3);
  });
  it('filters prefecture/category/state and rejects duplicate URLs', async () => {
    const r = new D1SourceRegistry(db);
    await r.register(source());
    await r.register(source(2));
    expect(await r.listPrefecture(1, null)).toHaveLength(1);
    expect(await r.list({ category: 'local', state: 'review' })).toHaveLength(
      2,
    );
    await expect(r.register({ ...source(), id: 'other' })).rejects.toThrow(
      'Duplicate',
    );
  });
  it('preserves runtime/manual state on repeat import', async () => {
    const r = new D1SourceRegistry(db);
    await r.register(source());
    await r.pause('s1', 'manual');
    await r.schedule('s1', '2030-01-01');
    expect(await r.register(source())).toBe(false);
    expect((await r.get('s1'))?.nextCrawlAt).toBe('2030-01-01');
    expect((await r.get('s1'))?.state).toBe('paused');
  });
  it('blocks unverified activation and host mismatch', () => {
    expect(() =>
      validateRegistration({
        ...source(),
        state: 'active',
        termsStatus: 'unknown',
      }),
    ).toThrow();
    expect(() =>
      validateRegistration({ ...source(), allowedHosts: ['other.jp'] }),
    ).toThrow();
    expect(() =>
      validateRegistration({ ...source(), prefecture: 48 }),
    ).toThrow();
  });
  it('retains old URL aliases across URL changes', async () => {
    const r = new D1SourceRegistry(db);
    await r.register(source());
    await r.save({ ...source(), officialUrl: 'https://example.jp/new' });
    await expect(r.register({ ...source(), id: 'other' })).rejects.toThrow();
  });
  it('links facilities and updates official URL with stable ID', async () => {
    const r = new D1SourceRegistry(db);
    const m = new RegistryManagement(db);
    await r.register(source());
    await m.facility('f', '天文台', 1, 'https://example.jp/', {
      operator: '市',
    });
    await m.linkFacility('f', 's1');
    await r.register(source(2));
    await m.linkFacility('f', 's2');
    await m.facility('f', '天文台', 1, 'https://example.jp/new', {});
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM facility_sources').first('n'),
    ).toBe(2);
    expect(await m.listFacilities(1)).toHaveLength(1);
    await m.setOperatingStatus(
      'f',
      'renovation',
      'https://example.jp/official-notice',
    );
    expect(await m.getFacility('f')).toMatchObject({
      operating_status: 'renovation',
    });
  });
  it('holds discoveries until reviewed and supports rejection', async () => {
    const m = new RegistryManagement(db);
    await m.candidate('https://example.jp/', 'manual', null, 'local');
    await expect(m.decide('https://example.jp/', 'approved')).rejects.toThrow();
    await m.decide('https://example.jp/', 'rejected');
    expect(
      await db.prepare('SELECT state FROM discovery_candidates').first('state'),
    ).toBe('rejected');
  });
  it('registers extensible VTubers, aliases and never auto-enables accounts', async () => {
    const m = new RegistryManagement(db);
    await m.vtuber(
      'v',
      '星',
      [
        {
          url: 'https://example.jp/',
          evidenceUrl: 'https://example.jp/evidence',
          verified: false,
        },
      ],
      ['旧名'],
    );
    expect(
      await db.prepare('SELECT enabled FROM vtubers').first('enabled'),
    ).toBe(0);
    expect(
      await db
        .prepare('SELECT verification_status FROM vtubers')
        .first('verification_status'),
    ).toBe('Review Required');
    await db.prepare("UPDATE vtubers SET enabled=1 WHERE vtuber_id='v'").run();
    await m.vtuber(
      'v',
      '星',
      [
        {
          url: 'https://example.jp/',
          evidenceUrl: 'https://example.jp/evidence',
          verified: false,
        },
      ],
      [],
    );
    expect(
      await db.prepare('SELECT enabled FROM vtubers').first('enabled'),
    ).toBe(0);
  });
  it('rotates all 47 prefectures without VTuber consuming general allocation', () => {
    const all = Array.from({ length: 47 }, (_, i) => ({
      ...source(i + 1),
      state: 'active' as const,
    }));
    const v = {
      ...source(),
      id: 'v',
      category: 'vtuber' as const,
      state: 'active' as const,
    };
    let cursor = 0;
    const selected = [];
    for (let i = 0; i < 47; i++) {
      const batch = selectFair([...all, v], '2026-11-11', cursor, 1, 1);
      selected.push(batch.general[0]?.prefecture);
      cursor = batch.cursor;
      expect(batch.vtubers).toHaveLength(1);
    }
    expect(new Set(selected).size).toBe(47);
  });
  it('rolls back an atomic batch on failure and preserves FK constraints', async () => {
    await expect(
      db.batch([
        db.prepare("INSERT INTO facility_sources VALUES('missing','missing')"),
      ]),
    ).rejects.toThrow();
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM facility_sources').first('n'),
    ).toBe(0);
  });
  it('finds scheme/trailing-slash duplicate candidates without automatically merging pages', async () => {
    const r = new D1SourceRegistry(db);
    await r.register(source());
    expect(await r.duplicateCandidates('http://example.jp/1/')).toEqual(['s1']);
    expect(await r.duplicateCandidates('https://example.jp/campus2')).toEqual(
      [],
    );
    await expect(
      r.register({
        ...source(),
        id: 'variant',
        officialUrl: 'http://example.jp/1/',
      }),
    ).rejects.toThrow('variant');
    await r.register({
      ...source(),
      id: 'variant',
      officialUrl: 'http://example.jp/1/',
      distinctVariantEvidenceUrl: 'https://example.jp/canonical-review',
    });
  });
  it('rejects sensitive URL parameters and additional unsafe allowed hosts', () => {
    expect(() =>
      normalizeUrl('https://example.jp/?access_token=private'),
    ).toThrow();
    expect(() =>
      validateRegistration({
        ...source(),
        allowedHosts: ['example.jp', 'localhost'],
      }),
    ).toThrow();
  });
  it('stores hostile external titles as inert bound data', async () => {
    const r = new D1SourceRegistry(db);
    const title = "'; DROP TABLE sources; -- <script>execute()</script>";
    await r.register({ ...source(), name: title });
    expect((await r.get('s1'))?.name).toBe(title);
    expect(await r.list()).toHaveLength(1);
  });
  it('prevents facility alias and VTuber account reuse across identities', async () => {
    const m = new RegistryManagement(db);
    await m.facility('f1', '星', 1, 'https://example.jp/a', {});
    await m.facility('f1', '星', 1, 'https://example.jp/b', {});
    await expect(
      m.facility('f2', '別', 1, 'https://example.jp/a', {}),
    ).rejects.toThrow('Duplicate');
    const accounts = [
      {
        url: 'https://example.jp/channel',
        evidenceUrl: 'https://example.jp/',
        verified: true,
      },
    ];
    await m.vtuber('v1', '星', accounts, ['旧名']);
    await expect(m.vtuber('v2', '別', accounts, [])).rejects.toThrow(
      'Duplicate',
    );
    await m.vtuber('v3', '新', [], []);
  });
  it('holds incomplete discovery approval and links reviewed active source', async () => {
    const m = new RegistryManagement(db);
    const s = source();
    await m.candidate(s.officialUrl, 'official event list', 1, 'local');
    await expect(m.decide(s.officialUrl, 'approved', s)).rejects.toThrow();
    await m.decide(s.officialUrl, 'approved', {
      ...s,
      state: 'active',
      parserApproved: true,
    });
    expect((await new D1SourceRegistry(db).get('s1'))?.state).toBe('active');
    await new D1SourceRegistry(db).pause('s1', 'manual');
    await expect(
      m.decide(s.officialUrl, 'approved', {
        ...s,
        state: 'active',
        parserApproved: true,
      }),
    ).rejects.toThrow('manual update');
  });
  it('prioritizes old regions/local category floors and defers not-yet-due sources', () => {
    const a = {
      ...source(),
      state: 'active' as const,
      category: 'research' as const,
      priority: 100,
    };
    const local = {
      ...a,
      id: 'local',
      category: 'local' as const,
      priority: 1,
    };
    const future = {
      ...source(2),
      state: 'active' as const,
      nextCrawlAt: '2030-01-01',
    };
    expect(
      selectFair([a, local, future], '2026-11-11', 0, 2, 0).general.map(
        (s) => s.id,
      ),
    ).toEqual(['local']);
    expect(
      selectFair([a, local], '2026-11-11', 0, 1, 0, {}).general[0]?.id,
    ).toBe('s1');
  });
  it('preserves preexisting schema rows lacking DEV02 metadata and never silently approves them', async () => {
    await db
      .prepare(
        "INSERT INTO sources(source_id,name,official_url,allowed_hosts_json,category,prefecture,format,state,next_crawl_at) VALUES('legacy','旧','https://example.jp/legacy','[\"example.jp\"]','local',1,'html','active','2026-01-01')",
      )
      .run();
    const row = await new D1SourceRegistry(db).get('legacy');
    expect(row?.officialStatus).toBe('Review Required');
    expect(row?.state).toBe('review');
  });
  it('atomically imports source and facility and preserves manual/runtime state on replay', async () => {
    await db
      .prepare(
        "INSERT INTO deployment_identity VALUES(1,'staging','astro-events-jp-staging',2,'2026-01-01')",
      )
      .run();
    const s = source();
    const f = {
      id: 'f',
      name: '星',
      prefecture: 1,
      municipality: null,
      officialUrl: 'https://example.jp/',
      operator: null,
      kind: 'observatory',
      sourceIds: ['s1'],
    };
    expect(
      (await importRegistrySeed(db, [s], [f], [], false)).preview,
    ).toHaveLength(1);
    expect(await new D1SourceRegistry(db).get('s1')).toBeNull();
    expect((await importRegistrySeed(db, [s], [f], [], true)).inserted).toBe(1);
    const r = new D1SourceRegistry(db);
    await r.pause('s1', 'manual');
    await r.schedule('s1', '2030-01-01');
    await db
      .prepare(
        "UPDATE sources SET etag='manual',failure_count=7 WHERE source_id='s1'",
      )
      .run();
    expect((await importRegistrySeed(db, [s], [f], [], true)).inserted).toBe(0);
    expect(await r.get('s1')).toMatchObject({
      state: 'paused',
      etag: 'manual',
      nextCrawlAt: '2030-01-01',
    });
    expect(
      await db
        .prepare('SELECT failure_count FROM sources')
        .first('failure_count'),
    ).toBe(7);
  });
  it('rejects production import and validates the entire seed before any writes', async () => {
    await db
      .prepare(
        "INSERT INTO deployment_identity VALUES(1,'production','astro-events-jp-production',2,'2026-01-01')",
      )
      .run();
    await expect(
      importRegistrySeed(db, [source()], [], [], true),
    ).rejects.toThrow('staging');
    expect(() => validateSeed([source(), source()], [], [])).toThrow(
      'Duplicate',
    );
    expect(() =>
      validateSeed(
        [source()],
        [
          {
            id: 'f',
            name: '星',
            prefecture: 1,
            municipality: null,
            officialUrl: 'https://example.jp',
            operator: null,
            kind: 'observatory',
            sourceIds: ['missing'],
          },
        ],
        [],
      ),
    ).toThrow('Missing');
    expect(
      await db.prepare('SELECT COUNT(*) AS n FROM sources').first('n'),
    ).toBe(0);
  });
  it('rolls back a failed related insert while allowing safe retry of completed units', async () => {
    const r = new D1SourceRegistry(db);
    await r.register(source());
    await expect(
      r.register(source(2), true, [
        db.prepare("INSERT INTO facility_sources VALUES('absent','s2')"),
      ]),
    ).rejects.toThrow();
    expect(await r.get('s2')).toBeNull();
    expect(await r.get('s1')).not.toBeNull();
    expect(await r.register(source(2))).toBe(true);
  });
});
