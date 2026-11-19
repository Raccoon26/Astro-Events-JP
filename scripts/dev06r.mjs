import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  unlinkSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { assertNoLinks, preflight } from './path-policy.mjs';
import { nativeTwitterAliases } from './post-bundle-policy.mjs';

const command = process.argv[2] ?? 'preview';
const approval = process.argv[4] ?? '';
const requiresApproval = command === 'send' || command === 'poll';
const allowed = [
  'preview',
  'preflight',
  'send',
  'poll',
  'status',
  'reconcile',
  'observe',
];
const valid =
  allowed.includes(command) &&
  (requiresApproval
    ? process.argv.length === 5 &&
      process.argv[3] === '--approve' &&
      /^[a-f0-9]{64}$/u.test(approval)
    : command === 'observe'
      ? process.argv.length === 7
      : process.argv.length <= 3);

async function main() {
  if (!valid) throw Error('INVALID_DEV06R_COMMAND');
  const state = preflight();
  if (!state.localDriveVerified || process.env.GITHUB_ACTIONS || process.env.CI)
    throw Error('DEV06R_INTERACTIVE_LOCAL_WINDOWS_ONLY');
  const savedSecrets = process.env.ASTRO_DEV06R_SECRET;
  delete process.env.ASTRO_DEV06R_SECRET;
  const bundle = await build({
    stdin: {
      contents:
        "export * from './src/notifications/live-plan';export * from './src/notifications/live-providers';export * from './src/notifications/live-session';export {DeliveryFault} from './src/notifications/types';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    alias: nativeTwitterAliases(),
  });
  const api = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
  );
  if (command === 'preview')
    return {
      scope: 'synthetic-only',
      ...(await api.trialContent()),
      requiresSeparateApproval: true,
      secretsAvailable: !!savedSecrets,
      externalWriteRequests: 0,
    };
  const budgets = {
    preflight: 9,
    send: 13,
    poll: 8,
    status: 0,
    reconcile: 6,
    observe: 0,
  };
  if (!savedSecrets || savedSecrets.length > 4096)
    throw Error('PROTECTED_TRIAL_SECRET_NOT_INSTALLED');
  let secret;
  try {
    secret = JSON.parse(savedSecrets);
  } catch {
    throw Error('PROTECTED_TRIAL_SECRET_INVALID');
  }
  const providers = new api.LiveTrialProviders(secret, budgets[command]);
  const directory = resolve(state.root, 'cache', 'dev06r-live-validation');
  assertNoLinks(resolve(state.root, 'cache'));
  if (!existsSync(directory)) mkdirSync(directory);
  assertNoLinks(directory);
  const lock = resolve(directory, 'operation.lock');
  let descriptor;
  try {
    descriptor = openSync(lock, 'wx');
  } catch {
    throw Error('TRIAL_LEDGER_LOCKED');
  }
  let mf;
  try {
    mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        compatibilityDate: '2026-11-11',
        script:
          'export default {fetch(){return new Response(null,{status:404})}}',
        d1Databases: { DB: 'astro-events-jp-dev06r-live-only' },
        host: '127.0.0.1',
        port: 0,
        resourcePersistencePath: directory,
      }),
    );
    const db = await mf.getD1Database('DB');
    const journal = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='trial_live_identity'",
      )
      .first('name');
    if (!journal) {
      const occupied = await db
        .prepare(
          "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%'",
        )
        .first('n');
      if (occupied !== 0) throw Error('TRIAL_LEDGER_NOT_EMPTY');
      const migrations = readdirSync('migrations')
        .filter((f) => /^000[1-8]_.*\.sql$/u.test(f))
        .sort();
      if (migrations.length !== 8) throw Error('TRIAL_BASE_MIGRATIONS_MISSING');
      const statements = [];
      for (const file of [
        ...migrations.map((file) => `migrations/${file}`),
        'scripts/dev06r-local-ledger.sql',
      ]) {
        for (const sql of readFileSync(file, 'utf8')
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean))
          statements.push(db.prepare(sql));
      }
      await db.batch(statements);
    }
    const session = new api.LiveTrialSession(db, providers);
    try {
      if (command === 'observe')
        return await session.observe(...process.argv.slice(3));
      return await session[command](approval);
    } catch (error) {
      if (error instanceof api.DeliveryFault) throw Error(error.code);
      throw error;
    }
  } finally {
    try {
      await mf?.dispose();
    } finally {
      closeSync(descriptor);
      unlinkSync(lock);
    }
  }
}

try {
  console.log(JSON.stringify(await main(), null, 2));
} catch (error) {
  const unaudited = error instanceof Error ? error.message : '';
  const code = /^[A-Z][A-Z0-9_]{5,90}$/u.test(unaudited)
    ? unaudited
    : 'DEV06R_OPERATION_FAILED';
  console.error(JSON.stringify({ error: code }));
  process.exitCode = 1;
}
