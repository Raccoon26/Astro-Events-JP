import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { assertMigrationIntegrity } from './cloudflare-policy.mjs';
import { assertNoLinks, preflight } from './path-policy.mjs';

const state = preflight();
const args = process.argv.slice(2);
const command = args.shift() ?? 'pending';
const commands = [
  'init',
  'pending',
  'review',
  'images',
  'stats',
  'history',
  'facility',
  'notice',
  'notices',
  'notice-history',
];
const flags = new Set(['--apply', '--enable-verifier', '--local-budget']);
const values = new Set([
  '--candidate',
  '--source',
  '--fingerprint',
  '--file',
  '--facility',
  '--notice',
  '--cursor',
  '--limit',
  '--group',
  '--after',
]);
const options = new Map();
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (options.has(key) || (!flags.has(key) && !values.has(key)))
    throw new Error(
      'Unsupported or duplicate verifier option; local staging only',
    );
  const value = flags.has(key) ? true : args[++i];
  if (
    value === undefined ||
    (typeof value === 'string' && value.startsWith('--'))
  )
    throw new Error('Missing verifier option');
  options.set(key, value);
}
const get = (key, fallback = '') => options.get(key) ?? fallback;
const apply = get('--apply', false);
if (
  !commands.includes(command) ||
  (apply && !['init', 'review', 'notice'].includes(command))
)
  throw new Error('Unsupported verifier operation');
if (
  apply &&
  (!get('--enable-verifier', false) || !get('--local-budget', false))
)
  throw new Error(
    'Apply requires --enable-verifier and --local-budget; no remote budget is inferred',
  );
const bundle = await build({
  entryPoints: ['src/verifier-management-api.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const api = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script:
      'export default {fetch(){return new Response("local verifier only")}}',
    d1Databases: { DB: 'astro-registry-staging' },
    resourcePersistencePath: state.localDriveVerified
      ? `${state.root}/cache/registry/staging`
      : `${process.env.RUNNER_TEMP ?? state.root}/astro-registry-staging`,
    host: '127.0.0.1',
    port: 0,
  }),
);
try {
  const db = await mf.getD1Database('DB');
  const identity = await db
    .prepare(
      'SELECT environment,database_name,schema_version FROM deployment_identity WHERE singleton=1',
    )
    .first();
  if (
    identity?.environment !== 'staging' ||
    identity.database_name !== 'astro-events-jp-staging' ||
    identity.schema_version !== 2
  )
    throw new api.VerificationError('environment-mismatch');
  const store = new api.VerificationStore(db, {
    enabled: get('--enable-verifier', false),
    localOnly: true,
  });
  let result;
  const budget = { requests: 0, reads: 0, writes: 0, databaseBytes: 0 }; // Explicit local-only attestation; never an account usage estimate.
  if (command === 'init') {
    assertMigrationIntegrity();
    const filename = '0005_verification.sql';
    const prior = await db
      .prepare('SELECT name FROM registry_migrations WHERE name=?1')
      .bind('0004_collection.sql')
      .first();
    if (!prior) throw new api.VerificationError('schema-unavailable');
    const applied = await db
      .prepare('SELECT name FROM registry_migrations WHERE name=?1')
      .bind(filename)
      .first();
    const sql = readFileSync(`migrations/${filename}`, 'utf8')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    if (apply && !applied)
      await db.batch([
        ...sql.map((s) => db.prepare(s)),
        db.prepare('INSERT INTO registry_migrations VALUES(?1)').bind(filename),
      ]);
    if (applied || apply) await store.schema();
    result = {
      migration: filename,
      alreadyApplied: Boolean(applied),
      statements: sql,
      changed: apply && !applied,
    };
  } else if (command === 'pending') {
    const group = get('--group', 'general');
    if (!['general', 'vtuber'].includes(group))
      throw new api.VerificationError('invalid-input');
    result = await store.pending(
      get('--cursor'),
      Number(get('--limit', '25')),
      group,
    );
  } else if (command === 'stats') result = await store.stats();
  else if (command === 'history')
    result = await store.history(
      get('--candidate'),
      Number(get('--after', '0')),
      Number(get('--limit', '25')),
    );
  else if (command === 'notices')
    result = await store.notices(
      get('--facility'),
      get('--cursor'),
      Number(get('--limit', '25')),
    );
  else if (command === 'notice-history')
    result = await store.noticeHistory(
      get('--notice'),
      Number(get('--after', '0')),
      Number(get('--limit', '25')),
    );
  else {
    let packet = null;
    const fileArg = get('--file');
    if (fileArg) {
      const file = path.resolve(fileArg);
      if (
        state.localDriveVerified &&
        !file
          .toLowerCase()
          .startsWith((path.resolve(state.root) + path.sep).toLowerCase())
      )
        throw new api.VerificationError('invalid-input');
      assertNoLinks(file);
      if (statSync(file).size > 24576)
        throw new api.VerificationError('invalid-input');
      packet = JSON.parse(readFileSync(file, 'utf8'));
      api.bounded(packet, 24576);
    }
    const preview = await store.preview(get('--candidate'), packet);
    const { loaded } = preview;
    if (
      apply &&
      (!packet ||
        loaded.context.source.id !== get('--source') ||
        loaded.context.candidate.fingerprint !== get('--fingerprint'))
    )
      throw new api.VerificationError('stale-candidate');
    if (command === 'notice') {
      if (!packet) throw new api.VerificationError('invalid-input');
      result = apply
        ? await store.applyNotice(loaded, budget)
        : {
            notice: await api.verifyFacilityNotice(loaded.context, packet),
            impacts: preview.result.impacts,
          };
    } else if (command === 'facility') {
      if (!loaded.context.facility)
        throw new api.VerificationError('invalid-input');
      result = await new api.D1FacilityMonitor(db).inspect(
        loaded.context.facility,
      );
    } else if (command === 'images')
      result = {
        images: preview.result.images,
        recommendations: api.recommendedImages(preview.result.images),
      };
    else
      result = {
        validation: preview.result,
        persistence: apply
          ? await store.commit(loaded, preview.result, budget)
          : null,
      };
  }
  const report = {
    at: new Date().toISOString(),
    environment: 'staging',
    local: true,
    remote: false,
    mode: apply ? 'apply' : 'dry-run',
    command,
    networkRequests: 0,
    cloudflareCpuMs: null,
    result,
    d1: store.meter.snapshot(),
  };
  if (state.localDriveVerified)
    writeFileSync(
      `${state.root}/reports/dev04-verifier-${Date.now()}.json`,
      JSON.stringify(report, null, 2),
      { flag: 'wx' },
    );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  // Do not print SQL, excerpts, tokens, arbitrary exception messages or stacks.
  console.error(
    JSON.stringify({
      ok: false,
      code:
        error instanceof api.VerificationError
          ? error.code
          : 'local-verifier-failed',
      remote: false,
    }),
  );
  process.exitCode = 1;
} finally {
  await mf.dispose();
}
