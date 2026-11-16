import { readFileSync, writeFileSync } from 'node:fs';
import { assertMigrationIntegrity } from './cloudflare-policy.mjs';
import { meterD1 } from './d1-meter.mjs';
import { assertNoLinks, preflight } from './path-policy.mjs';

const state = preflight(),
  args = process.argv.slice(2),
  command = args.shift() ?? 'list';
const flags = new Set(['--apply', '--enable-posts', '--local-budget']);
const values = new Set([
  '--event',
  '--kind',
  '--post',
  '--cursor',
  '--limit',
  '--version',
  '--source',
  '--fingerprint',
  '--revision',
]);
const opts = new Map();
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (opts.has(key) || (!flags.has(key) && !values.has(key)))
    throw new Error(
      'Unsupported or duplicate posts option; local staging only',
    );
  const value = flags.has(key) ? true : args[++i];
  if (
    value === undefined ||
    (typeof value === 'string' && value.startsWith('--'))
  )
    throw new Error('Missing posts option');
  opts.set(key, value);
}
const get = (key, fallback = '') => opts.get(key) ?? fallback,
  apply = get('--apply', false);
if (
  !['init', 'list', 'preview', 'get', 'history'].includes(command) ||
  (apply && !['init', 'preview'].includes(command))
)
  throw new Error('Unsupported posts operation');
if (apply && (!get('--enable-posts', false) || !get('--local-budget', false)))
  throw new Error('Apply requires --enable-posts and --local-budget');
if (
  apply &&
  command === 'preview' &&
  (!get('--source') || !get('--fingerprint') || !get('--revision'))
)
  throw new Error(
    'Apply requires source, fingerprint and revision preconditions',
  );
const { build } = await import('esbuild'),
  { convertV4MiniflareOptions, Miniflare } = await import('miniflare');
const bundle = await build({
  entryPoints: ['src/posts/index.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
});
const api = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    compatibilityDate: '2026-11-11',
    script: 'export default {fetch(){return new Response("local posts only")}}',
    d1Databases: { DB: 'astro-registry-staging' },
    resourcePersistencePath: state.localDriveVerified
      ? `${state.root}/cache/registry/staging`
      : `${process.env.RUNNER_TEMP ?? state.root}/astro-registry-staging`,
    host: '127.0.0.1',
    port: 0,
  }),
);
try {
  const measured = meterD1(await mf.getD1Database('DB')),
    db = measured.db,
    store = new api.PostStore(db, { enabled: true, localOnly: true });
  let result;
  if (command === 'init') {
    assertMigrationIntegrity();
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
      throw new api.PostError('environment-mismatch');
    if (
      !(await db
        .prepare('SELECT name FROM registry_migrations WHERE name=?1')
        .bind('0005_verification.sql')
        .first())
    )
      throw new api.PostError('schema-unavailable');
    const migrations = [],
      pending = [];
    for (const file of ['0006_posts.sql', '0007_post_read_indexes.sql']) {
      const applied = Boolean(
        await db
          .prepare('SELECT name FROM registry_migrations WHERE name=?1')
          .bind(file)
          .first(),
      );
      const statements = readFileSync(`migrations/${file}`, 'utf8')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      migrations.push({
        migration: file,
        applied: applied || apply,
        changed: Boolean(apply && !applied),
        preview: statements,
      });
      if (!applied)
        pending.push(
          ...statements.map((s) => db.prepare(s)),
          db.prepare('INSERT INTO registry_migrations VALUES(?1)').bind(file),
        );
    }
    if (apply && pending.length) await db.batch(pending);
    if (apply || migrations.every((m) => m.applied)) await store.schema();
    result = {
      migrations,
      changed: Boolean(apply && pending.length),
      applied: migrations.every((m) => m.applied),
    };
  } else if (command === 'list')
    result = {
      scope: 'bounded hints; only preview/get provides current gated copy text',
      rows: await store.list(get('--cursor'), Number(get('--limit', 25))),
    };
  else if (command === 'history')
    result = {
      scope: 'audit metadata only; old text is not copyable output',
      rows: await store.history(
        get('--event'),
        get('--cursor'),
        Number(get('--limit', 25)),
      ),
    };
  else if (command === 'get') result = await store.get(get('--post'));
  else {
    if (!api.POST_KINDS.includes(get('--kind')))
      throw new api.PostError('kind-mismatch');
    result = apply
      ? await store.save(
          get('--event'),
          get('--kind'),
          { requests: 0, reads: 0, writes: 0, databaseBytes: 0 },
          get('--version', api.TEMPLATE_VERSION),
          {
            sourceId: get('--source'),
            fingerprint: get('--fingerprint'),
            revision: Number(get('--revision')),
          },
        )
      : await store.preview(
          get('--event'),
          get('--kind'),
          get('--version', api.TEMPLATE_VERSION),
        );
  }
  const report = {
    at: new Date().toISOString(),
    command,
    local: true,
    remote: false,
    environment: 'staging',
    mode: apply ? 'apply' : 'dry-run',
    externalRequests: 0,
    cloudflareCpuMs: null,
    result,
    d1: measured.usage,
  };
  if (state.localDriveVerified) {
    assertNoLinks(`${state.root}/reports`);
    writeFileSync(
      `${state.root}/reports/dev05-posts-${Date.now()}.json`,
      JSON.stringify(report, null, 2),
      { flag: 'wx' },
    );
  }
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  console.error(
    JSON.stringify({
      ok: false,
      code: e instanceof api.PostError ? e.code : 'local-posts-failed',
      remote: false,
    }),
  );
  process.exitCode = 1;
} finally {
  await mf.dispose();
}
