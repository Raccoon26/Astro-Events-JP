import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { withinBudget } from '../src/budget';
import { validateConfig } from '../src/config';
import { AppError, safeError } from '../src/errors';
import worker from '../src/index';
import { EXPIRED_EVENTS_SQL, retentionCutoffs } from '../src/retention';
import { escapeHtml, validateSourceUrl } from '../src/security';

describe('foundation security and configuration', () => {
  it('uses only reviewed HTTPS hosts and rejects SSRF URL forms', () => {
    for (const url of [
      'http://example.jp',
      'https://user:pass@example.jp',
      'https://127.0.0.1',
      'https://[::1]',
      'https://2130706433',
      'https://example.jp:8443',
      'https://evil.jp',
      'https://localhost',
      'https://a.internal',
    ]) {
      expect(() => validateSourceUrl(url, ['example.jp'])).toThrow();
    }
    expect(
      validateSourceUrl('https://example.jp/event#fragment', ['example.jp'])
        .href,
    ).toBe('https://example.jp/event');
    expect(escapeHtml('<script>"&')).toBe('&lt;script&gt;&quot;&amp;');
  });
  it('does not disclose upstream exception messages', () => {
    expect(safeError(new Error('sensitive-value'))).toEqual({
      code: 'UNKNOWN',
      retryable: false,
    });
    expect(safeError(new AppError('TIMEOUT', true))).toEqual({
      code: 'TIMEOUT',
      retryable: true,
    });
  });
  it('fails closed on invalid deployment and unimplemented collection', async () => {
    const env = {
      APP_ENV: 'staging',
      DEPLOYMENT_ENV: 'staging',
      DATABASE_ENVIRONMENT: 'staging',
      DATABASE_NAME: 'astro-events-jp-staging',
      NOTIFICATIONS_ENABLED: 'false',
      REPORTS_REPOSITORY: 'Raccoon26/Astro-Events-JP-Reports',
      COLLECTION_ENABLED: 'false',
      DB: {
        prepare() {
          return {
            bind() {
              return {
                async all() {
                  return {
                    success: true,
                    results: [
                      {
                        environment: 'staging',
                        database_name: 'astro-events-jp-staging',
                        schema_version: 2,
                      },
                    ],
                    meta: { rows_read: 1, rows_written: 0, size_after: 4096 },
                  };
                },
              };
            },
          };
        },
      } as unknown as D1Database,
    };
    expect(validateConfig(env).collectionEnabled).toBe(false);
    expect(() =>
      validateConfig({
        ...env,
        REPORTS_REPOSITORY: 'Raccoon26/Astro-Events-JP',
      }),
    ).toThrow();
    expect(() =>
      validateConfig({ ...env, COLLECTION_ENABLED: 'yes' }),
    ).toThrow();
    await expect(
      worker.scheduled({} as ScheduledController, {
        ...env,
        COLLECTION_ENABLED: 'true',
      }),
    ).rejects.toThrow('CONFIG');
    await expect(
      worker.scheduled({} as ScheduledController, env),
    ).resolves.toBeUndefined();
    expect(
      (await worker.fetch(new Request('https://example.jp/health'), env))
        .status,
    ).toBe(200);
  });
  it('rejects over-budget, negative, and unavailable usage', () => {
    const zero = { requests: 0, reads: 0, writes: 0, databaseBytes: 0 };
    expect(withinBudget(zero, zero)).toBe(true);
    expect(withinBudget(zero, { ...zero, writes: 80001 })).toBe(false);
    expect(withinBudget({ ...zero, reads: Number.NaN }, zero)).toBe(false);
    expect(withinBudget(zero, { ...zero, writes: -1 })).toBe(false);
  });
});
describe('D1-compatible SQLite schema', () => {
  it('enforces relations, rights evidence, dedupe, and safe retention', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(readFileSync('migrations/0001_foundation.sql', 'utf8'));
    expect(db.exec('PRAGMA integrity_check')[0]?.values[0]?.[0]).toBe('ok');
    db.run(
      `INSERT INTO sources(source_id,name,official_url,allowed_hosts_json,category,format,next_crawl_at) VALUES ('s','test','https://example.jp','["example.jp"]','local','rss','2026-01-01T00:00:00.000Z')`,
    );
    const insert = db.prepare(
      `INSERT INTO events(stable_event_id,source_id,title,category,official_url,first_seen_at,start_datetime,end_datetime,confirmed_ended_at) VALUES (?,'s','test','local','https://example.jp','2026-01-01T00:00:00.000Z',?,?,?)`,
    );
    for (const row of [
      [
        'old',
        '2026-01-01T00:00:00.000Z',
        '2026-01-02T00:00:00.000Z',
        '2026-01-02T00:00:00.000Z',
      ],
      [
        'future',
        '2027-01-01T00:00:00.000Z',
        '2027-01-02T00:00:00.000Z',
        '2026-01-02T00:00:00.000Z',
      ],
      ['unknown', null, null, null],
      ['ongoing', '2026-01-01T00:00:00.000Z', null, null],
      [
        'recent',
        '2026-11-01T00:00:00.000Z',
        '2026-11-02T00:00:00.000Z',
        '2026-11-02T00:00:00.000Z',
      ],
    ])
      insert.run(row);
    insert.free();
    const cutoffs = retentionCutoffs(new Date('2026-11-11T00:00:00.000Z'));
    expect(
      db.exec(EXPIRED_EVENTS_SQL, [cutoffs.details, cutoffs.now, 100])[0]
        ?.values,
    ).toEqual([['old']]);
    expect(() =>
      db.run(
        `INSERT INTO event_images(image_id,event_id,image_url,image_source_url,image_type,image_rights_status) VALUES('i','old','https://example.jp/a.png','https://example.jp','poster','permitted')`,
      ),
    ).toThrow();
    expect(() =>
      db.run(
        `INSERT INTO events(stable_event_id,source_id,title,category,official_url,first_seen_at) VALUES('bad','absent','x','local','https://example.jp','2026')`,
      ),
    ).toThrow();
    db.run(
      `INSERT INTO posted_fingerprints VALUES('hash','old',2026,'1',1,'observation','2026-01-01','2028-01-01')`,
    );
    expect(() =>
      db.run(
        `INSERT INTO posted_fingerprints VALUES('hash','old',2026,'1',1,'observation','2026-01-01','2028-01-01')`,
      ),
    ).toThrow();
    db.run(`DELETE FROM events WHERE stable_event_id='old'`);
    expect(
      db.exec('SELECT fingerprint FROM posted_fingerprints')[0]?.values,
    ).toEqual([['hash']]);
    expect(db.exec('PRAGMA foreign_key_check')).toEqual([]);
    db.close();
  });
});
