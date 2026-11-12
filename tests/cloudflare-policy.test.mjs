import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertMigrationIntegrity,
  checkFreeAccount,
  guardStagingWrite,
  isAdditiveMigration,
  parseAccountEvidence,
  readConfig,
  validateBindings,
  validateWranglerOperation,
} from '../scripts/cloudflare-policy.mjs';

const resources = () =>
  JSON.parse(readFileSync('cloudflare-resources.json', 'utf8'));
describe('deployment safety policy', () => {
  it('does not expose a misconfigured secret through JSON parsing errors', () => {
    expect(() => parseAccountEvidence('sensitive-not-json')).toThrow(
      'ACCOUNT_EVIDENCE_INVALID',
    );
    try {
      parseAccountEvidence('sensitive-not-json');
    } catch (error) {
      expect(error.message).not.toContain('sensitive');
    }
  });
  it('blocks unguarded remote commands and ambiguous local/dry-run flags', () => {
    for (const args of [
      ['deploy', '--env', 'production'],
      ['deploy', '--dry-run', 'false'],
      ['d1', 'execute', 'DB', '--remote', '--local'],
      ['dev', '--remote'],
      ['auth', 'token'],
    ])
      expect(() => validateWranglerOperation(args)).toThrow();
    expect(() =>
      validateWranglerOperation(['deploy', '--dry-run', '--env', 'staging']),
    ).not.toThrow();
  });
  it('accepts additive schema with FK ON DELETE but refuses destructive statements', () => {
    expect(
      isAdditiveMigration(
        readFileSync('migrations/0001_foundation.sql', 'utf8'),
      ),
    ).toBe(true);
    expect(
      isAdditiveMigration('CREATE TABLE a(id INTEGER); DROP TABLE events;'),
    ).toBe(false);
    expect(isAdditiveMigration('DELETE FROM events')).toBe(false);
  });
  it('keeps separate local bindings and rejects unprovisioned remote resources', () => {
    expect(validateBindings(readConfig(), resources())).toBe(true);
    const placeholder = resources();
    placeholder.staging.databaseId = null;
    expect(() => validateBindings(readConfig(), placeholder, true)).toThrow();
    const config = readConfig();
    config.env.production.d1_databases[0].database_id =
      config.env.staging.d1_databases[0].database_id;
    expect(() => validateBindings(config, resources())).toThrow();
  });
  it.each([
    'COLLECTION_ENABLED',
    'NOTIFICATIONS_ENABLED',
    'DATABASE_ENVIRONMENT',
  ])('blocks unsafe environment variable %s', (key) => {
    const config = readConfig();
    config.env.staging.vars[key] = 'unsafe';
    expect(() => validateBindings(config, resources())).toThrow();
  });
  it('preserves the DEV-00 migration and restricts test writes/restore to staging', () => {
    expect(() => assertMigrationIntegrity()).not.toThrow();
    expect(() => guardStagingWrite('staging')).not.toThrow();
    expect(() => guardStagingWrite('production')).toThrow();
  });
  it('blocks unknown, paid, stale or exhausted account evidence', () => {
    const now = Date.now();
    const snapshot = {
      accountId: 'a'.repeat(32),
      plan: 'free',
      checkedAt: new Date(now).toISOString(),
      requests: 0,
      reads: 0,
      writes: 0,
      databaseBytes: 0,
      cronTriggers: 0,
    };
    expect(() => checkFreeAccount(snapshot, 'staging', now)).not.toThrow();
    for (const evidence of [
      null,
      { ...snapshot, plan: 'paid' },
      { ...snapshot, reads: null },
      { ...snapshot, writes: 80000 },
      { ...snapshot, checkedAt: new Date(now - 900001).toISOString() },
    ])
      expect(() => checkFreeAccount(evidence, 'staging', now)).toThrow();
  });
});
