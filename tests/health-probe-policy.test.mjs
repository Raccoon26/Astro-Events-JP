import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { verifyStagingHealthRecovery } from '../scripts/health-probe-policy.mjs';

async function fixture() {
  const SQL = await initSqlJs(),
    db = new SQL.Database();
  db.run(readFileSync('migrations/0002_deployment_identity.sql', 'utf8'));
  db.run('INSERT INTO deployment_identity VALUES(1,?,?,2,?)', [
    'staging',
    'astro-events-jp-staging',
    'original timestamp',
  ]);
  const query = async (sql, params = []) => {
    const statement = db.prepare(sql);
    statement.bind(params);
    const results = [];
    while (statement.step()) results.push(statement.getAsObject());
    statement.free();
    return [{ results, meta: { changes: db.getRowsModified() } }];
  };
  return { db, query };
}
describe('staging fault injection against the immutable actual schema', () => {
  it('preserves CHECK constraints and restores the complete marker after a real identity mismatch', async () => {
    const { db, query } = await fixture();
    try {
      expect(() =>
        db.run('UPDATE deployment_identity SET schema_version=1'),
      ).toThrow();
      const result = await verifyStagingHealthRecovery({
        target: 'staging',
        query,
        health: async () => {
          const row = (await query('SELECT * FROM deployment_identity'))[0]
            .results[0];
          return row.environment === 'staging'
            ? { httpStatus: 200, code: 'OK' }
            : {
                httpStatus: 503,
                code: 'DB_IDENTITY',
                collectionEnabled: false,
              };
        },
      });
      expect(result.success).toBe(true);
      expect(
        (await query('SELECT * FROM deployment_identity'))[0].results[0],
      ).toMatchObject({
        environment: 'staging',
        database_name: 'astro-events-jp-staging',
        schema_version: 2,
        initialized_at: 'original timestamp',
      });
    } finally {
      db.close();
    }
  });
  it('restores the original staging marker even when the HTTP probe fails', async () => {
    const { db, query } = await fixture();
    try {
      await expect(
        verifyStagingHealthRecovery({
          target: 'staging',
          query,
          health: async () => {
            throw new Error('probe network failure');
          },
        }),
      ).rejects.toThrow('probe network failure');
      expect(
        (await query('SELECT * FROM deployment_identity'))[0].results[0],
      ).toMatchObject({
        environment: 'staging',
        initialized_at: 'original timestamp',
      });
    } finally {
      db.close();
    }
  });
  it('rejects production before any query and does not overwrite a concurrent administrator change', async () => {
    let calls = 0;
    await expect(
      verifyStagingHealthRecovery({
        target: 'production',
        query: async () => {
          calls++;
        },
      }),
    ).rejects.toThrow();
    expect(calls).toBe(0);
    const { db, query } = await fixture();
    try {
      await expect(
        verifyStagingHealthRecovery({
          target: 'staging',
          query,
          health: async () => {
            db.run(
              "UPDATE deployment_identity SET initialized_at='concurrent administrator'",
            );
            throw new Error('stop');
          },
        }),
      ).rejects.toThrow('HEALTH_PROBE_RESTORE_FAILED');
      expect(
        (await query('SELECT initialized_at FROM deployment_identity'))[0]
          .results[0].initialized_at,
      ).toBe('concurrent administrator');
    } finally {
      db.close();
    }
  });
});
