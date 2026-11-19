import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { assertMigrationIntegrity } from './cloudflare-policy.mjs';
import { meterD1 } from './d1-meter.mjs';
import { assertNoLinks, preflight } from './path-policy.mjs';
import { nativeTwitterAliases } from './post-bundle-policy.mjs';

const state = preflight(),
  args = process.argv.slice(2),
  command = args.shift() ?? 'list',
  opts = new Map();
const flags = new Set(['--apply', '--simulation', '--local-budget']);
const values = new Set([
  '--post',
  '--delivery',
  '--owner',
  '--cursor',
  '--limit',
  '--state',
  '--source',
  '--fingerprint',
  '--revision',
  '--token',
  '--action',
  '--message',
  '--user',
  '--chat',
  '--update',
  '--external-id',
  '--reason',
  '--proof',
]);
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (opts.has(key) || (!flags.has(key) && !values.has(key)))
    throw Error('UNSUPPORTED_NOTIFICATION_OPTION_LOCAL_SIMULATION_ONLY');
  const value = flags.has(key) ? true : args[++i];
  if (
    value === undefined ||
    (typeof value === 'string' && value.startsWith('--'))
  )
    throw Error('MISSING_NOTIFICATION_OPTION');
  opts.set(key, value);
}
const get = (k, f = '') => opts.get(k) ?? f,
  apply = get('--apply', false),
  mutations = new Set([
    'init',
    'enqueue',
    'claim',
    'dispatch',
    'recover',
    'reconcile',
    'confirm',
    'callback',
    'update-status',
    'ack',
    'recover-update',
    'recover-ack',
    'confirm-status',
  ]);
if (
  ![
    ...mutations,
    'list',
    'candidates',
    'preview',
    'history',
    'updates',
    'email',
  ].includes(command)
)
  throw Error('UNSUPPORTED_NOTIFICATION_COMMAND');
if (apply && !mutations.has(command)) throw Error('READ_ONLY_COMMAND');
if (apply && (!get('--simulation', false) || !get('--local-budget', false)))
  throw Error('EXPLICIT_LOCAL_SIMULATION_AND_BUDGET_REQUIRED');
if (
  apply &&
  command === 'enqueue' &&
  (!get('--source') || !get('--fingerprint') || !get('--revision'))
)
  throw Error('EXPECTED_SOURCE_FINGERPRINT_REVISION_REQUIRED');
const { build } = await import('esbuild'),
  bundle = await build({
    entryPoints: ['src/notifications/index.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    alias: nativeTwitterAliases(),
  });
const api = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
if (command === 'email') {
  let proof = {
    repositoryPrivate: null,
    repositoryAccess: null,
    issuesEnabled: null,
    watchSubscribed: null,
    issueSubscribed: null,
    ignored: null,
    verifiedEmail: null,
    emailNotificationsEnabled: null,
  };
  if (get('--proof')) {
    if (!state.localDriveVerified) throw Error('E_REPORT_PROOF_REQUIRED');
    const file = path.resolve(String(get('--proof'))),
      relative = path.relative(state.root + '/reports', file);
    if (relative.startsWith('..') || path.isAbsolute(relative))
      throw Error('E_REPORT_PROOF_REQUIRED');
    assertNoLinks(file);
    if (readFileSync(file).byteLength > 4096) throw Error('EMAIL_PROOF_LIMIT');
    proof = JSON.parse(readFileSync(file, 'utf8'));
  }
  console.log(
    JSON.stringify(
      {
        local: true,
        simulation: true,
        externalRequests: 0,
        ...api.emailReadiness(proof),
      },
      null,
      2,
    ),
  );
} else {
  const { convertV4MiniflareOptions, Miniflare } = await import('miniflare');
  const persist = state.localDriveVerified
    ? state.root + '/cache/registry/staging'
    : `${process.env.RUNNER_TEMP}/astro-registry-staging`;
  if (existsSync(persist)) assertNoLinks(persist);
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-11-11',
      script:
        'export default{fetch(){return new Response("isolated notification management")}}',
      d1Databases: { DB: 'astro-registry-staging' },
      resourcePersistencePath: persist,
      host: '127.0.0.1',
      port: 0,
    }),
  );
  try {
    const measured = meterD1(await mf.getD1Database('DB')),
      db = measured.db,
      usage = { requests: 0, reads: 0, writes: 0, databaseBytes: 0 };
    const store = new api.NotificationStore(db, {
      enabled: true,
      localOnly: true,
      mode: 'simulation',
      chatId: '10001',
      userIds: ['20001'],
    });
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
        throw new api.NotificationError('SCHEMA_OR_ENVIRONMENT_UNAVAILABLE');
      if (
        (await db
          .prepare('SELECT version FROM post_generation_schema')
          .first('version')) !== 1 ||
        !(await db
          .prepare('SELECT name FROM registry_migrations WHERE name=?')
          .bind('0007_post_read_indexes.sql')
          .first())
      )
        throw new api.NotificationError('POSTS_LEDGER_PREREQUISITE');
      const migration = '0008_notification_outbox.sql',
        applied = Boolean(
          await db
            .prepare('SELECT name FROM registry_migrations WHERE name=?')
            .bind(migration)
            .first(),
        ),
        statements = readFileSync('migrations/' + migration, 'utf8')
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean);
      const present = Boolean(
        await db
          .prepare(
            "SELECT name FROM sqlite_master WHERE name='notification_schema'",
          )
          .first(),
      );
      if (present !== applied)
        throw new api.NotificationError('MIGRATION_LEDGER_MISMATCH');
      if (apply && !applied)
        await db.batch([
          ...statements.map((s) => db.prepare(s)),
          db
            .prepare('INSERT INTO registry_migrations VALUES(?)')
            .bind(migration),
        ]);
      result = {
        migration,
        changed: Boolean(apply && !applied),
        applied: applied || apply,
        preview: statements,
      };
    } else if (command === 'list')
      result = await store.list(
        get('--cursor'),
        Number(get('--limit', 25)),
        get('--state') || undefined,
      );
    else if (command === 'candidates')
      result = await store.candidates(get('--cursor'));
    else if (command === 'preview') result = await store.preview(get('--post'));
    else if (command === 'history')
      result = await store.history(get('--delivery'));
    else if (command === 'updates') result = await store.updates();
    else if (!apply) {
      result = {
        operation: command,
        mode: 'dry-run',
        state: get('--delivery')
          ? await store.receipt(get('--delivery'))
          : null,
        plan: get('--post') ? await store.preview(get('--post')) : null,
        reason:
          'No D1 changes; --apply --simulation --local-budget required. Live send flags are unsupported.',
      };
    } else {
      let wire;
      async function fakeWire() {
        if (wire) return wire;
        const fake = new api.FakeNotificationWire(),
          dir = state.localDriveVerified
            ? state.root + '/cache/notifications/staging'
            : process.env.RUNNER_TEMP + '/astro-events-jp/notifications',
          file = dir + '/provider.json';
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        assertNoLinks(dir);
        if (existsSync(file)) {
          assertNoLinks(file);
          const bytes = readFileSync(file);
          if (bytes.byteLength > 2 * 1024 * 1024)
            throw new api.NotificationError('FAKE_PROVIDER_LIMIT');
          const saved = JSON.parse(bytes.toString('utf8'));
          if (
            saved.project !== 'Astro-Events-JP' ||
            saved.mode !== 'simulation' ||
            !Array.isArray(saved.messages) ||
            !Array.isArray(saved.issues)
          )
            throw new api.NotificationError('FAKE_PROVIDER_OWNER_MISMATCH');
          fake.restore(saved);
        }
        wire = {
          mode: 'isolated-fake',
          request: async (request) => {
            try {
              return await fake.request(request);
            } finally {
              const json = JSON.stringify({
                project: 'Astro-Events-JP',
                mode: 'simulation',
                messages: [...fake.messages],
                issues: [...fake.issues],
              });
              if (json.length > 2 * 1024 * 1024)
                throw new api.NotificationError('FAKE_PROVIDER_LIMIT');
              assertNoLinks(dir);
              if (existsSync(file)) assertNoLinks(file);
              const temp = dir + '/owned-' + randomUUID() + '.json';
              writeFileSync(temp, json, { flag: 'wx' });
              renameSync(temp, file);
            }
          },
        };
        return wire;
      }
      if (command === 'enqueue')
        result = await store.enqueue(
          get('--post'),
          usage,
          {
            sourceId: get('--source'),
            fingerprint: get('--fingerprint'),
            revision: Number(get('--revision')),
          },
          Number(get('--cursor', 0)),
        );
      if (command === 'claim')
        result = await store.claim(get('--delivery'), usage);
      if (command === 'dispatch')
        result = await store.dispatch(
          get('--delivery'),
          get('--owner'),
          await fakeWire(),
          usage,
        );
      if (command === 'recover')
        result = await store.recover(get('--delivery'), usage);
      if (command === 'reconcile')
        result = await store.reconcileIssue(
          get('--delivery'),
          await fakeWire(),
          usage,
        );
      if (command === 'confirm')
        result = await store.confirmTelegram(
          get('--delivery'),
          get('--external-id'),
          get('--reason'),
          usage,
        );
      if (command === 'callback')
        result = await store.callback(
          get('--token'),
          get('--action'),
          {
            chatId: get('--chat'),
            userId: get('--user'),
            messageId: get('--message'),
            updateId: get('--update'),
          },
          usage,
        );
      if (command === 'update-status')
        result = await store.updateManagement(
          get('--update'),
          await fakeWire(),
          usage,
        );
      if (command === 'ack')
        result = await store.processCallbackAck(
          get('--update'),
          await fakeWire(),
          usage,
        );
      if (command === 'recover-update')
        result = await store.recoverUpdate(get('--update'));
      if (command === 'confirm-status')
        result = await store.confirmStatusReceipt(
          get('--update'),
          get('--reason'),
        );
      if (command === 'recover-ack')
        result = await store.recoverCallbackAck(get('--update'));
    }
    const report = {
      at: new Date().toISOString(),
      command,
      local: true,
      simulation: true,
      mode: apply ? 'apply-simulation' : 'dry-run',
      externalNotificationRequests: 0,
      cloudflareCpuMs: null,
      result,
      d1: measured.usage,
    };
    if (state.localDriveVerified) {
      assertNoLinks(state.root + '/reports');
      writeFileSync(
        state.root + '/reports/dev06-notifications-' + Date.now() + '.json',
        JSON.stringify(report, null, 2),
        { flag: 'wx' },
      );
    }
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({
        ok: false,
        code:
          error instanceof api.NotificationError
            ? error.code
            : 'LOCAL_NOTIFICATION_FAILED',
        simulation: true,
        externalRequests: 0,
      }),
    );
    process.exitCode = 1;
  } finally {
    await mf.dispose();
  }
}
