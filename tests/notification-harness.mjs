import { readdirSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { nativeTwitterAliases } from '../scripts/post-bundle-policy.mjs';
import { NOW, usage } from './collection-fixtures';
import { verificationFixture } from './verification-fixtures';

export async function notificationHarness(script) {
  const built = await build({
    entryPoints: ['src/notification-management-api.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    alias: nativeTwitterAliases(),
  });
  const api = await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  );
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-11-11',
      script:
        script ??
        'export default{fetch(){return new Response("isolated synthetic DEV06 DB")}}',
      d1Databases: ['DB'],
      host: '127.0.0.1',
      port: 0,
    }),
  );
  const db = await mf.getD1Database('DB');
  for (const file of readdirSync('migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const sql of readFileSync('migrations/' + file, 'utf8')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(sql).run();
  await db
    .prepare(
      "INSERT INTO deployment_identity VALUES(1,'staging','astro-events-jp-staging',2,?)",
    )
    .bind(NOW)
    .run();
  let now = Date.parse(NOW);
  const options = {
    enabled: true,
    localOnly: true,
    mode: 'simulation',
    chatId: '10001',
    userIds: ['20001'],
    clock: () => now,
  };
  async function reset() {
    now = Date.parse(NOW);
    const tables = [
      'notification_status_receipts',
      'notification_action_provenance',
      'notification_request_reservations',
      'notification_request_budgets',
      'notification_callback_acks',
      'notification_updates',
      'notification_callbacks',
      'notification_attempts',
      'notification_manual_receipts',
      'notification_context',
      'notification_deliveries',
      'notification_issue_links',
      'notification_issue_claims',
      'notification_reviews',
      'notification_publications',
      'notification_groups',
      'publication_records',
      'posted_fingerprints',
      'generated_posts',
      'event_changes',
      'event_images',
      'events',
      'verification_decisions',
      'candidate_versions',
      'event_candidates',
      'collection_documents',
      'source_approvals',
      'registry_history',
      'registry_urls',
      'registry_metadata',
      'sources',
    ];
    await db.batch(tables.map((t) => db.prepare('DELETE FROM ' + t)));
  }
  async function seed(overrides = {}) {
    const f = await verificationFixture(overrides),
      c = f.ctx.candidate;
    await new api.D1SourceRegistry(db).register(f.ctx.source);
    await db
      .prepare('INSERT INTO source_approvals VALUES(?,?,?)')
      .bind(f.ctx.source.id, JSON.stringify(f.ctx.approval), NOW)
      .run();
    await db
      .prepare(
        'INSERT INTO event_candidates(candidate_id,source_id,official_url,fingerprint,payload,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?)',
      )
      .bind(
        c.id,
        c.sourceId,
        c.officialUrl,
        c.fingerprint,
        JSON.stringify(c),
        NOW,
        NOW,
      )
      .run();
    await db
      .prepare('INSERT INTO candidate_versions VALUES(?,?,?,?)')
      .bind(c.id, c.fingerprint, JSON.stringify(c), NOW)
      .run();
    await db
      .prepare(
        'INSERT INTO collection_documents(source_id,url,digest,succeeded_at,changed_at,complete) VALUES(?,?,?,?,?,1)',
      )
      .bind(c.sourceId, c.originalUrl, 'a'.repeat(64), NOW, NOW)
      .run();
    const verifier = new api.VerificationStore(db, {
        enabled: true,
        localOnly: true,
        clock: options.clock,
      }),
      p = await verifier.preview(c.id, f.packet);
    await verifier.commit(p.loaded, p.result, usage);
    const eventId = p.result.event.stableEventId,
      posts = new api.PostStore(db, {
        enabled: true,
        localOnly: true,
        clock: options.clock,
      });
    const saved = await posts.save(eventId, 'observation', usage),
      postId = saved.delivery.metadata.post.id;
    const store = new api.NotificationStore(db, options);
    const plan = await store.preview(postId),
      m = plan.delivery.metadata,
      expected = {
        sourceId: m.sourceId,
        fingerprint: m.fingerprint,
        revision: m.eventRevision,
      };
    return { ...f, eventId, postId, posts, store, plan, expected };
  }
  async function enqueue(f) {
    let cursor = 0,
      done;
    do {
      done = await f.store.enqueue(f.postId, usage, f.expected, cursor);
      cursor = done.nextCursor;
    } while (!done.complete);
    return done;
  }
  async function rows() {
    return (
      await db
        .prepare(
          "SELECT d.delivery_id,d.state,d.external_id,c.part_index,CASE WHEN d.channel='github-issue' THEN 'issue' WHEN d.message_part='post' THEN 'copy' ELSE 'management' END AS part FROM notification_deliveries d JOIN notification_context c ON c.delivery_id=d.delivery_id ORDER BY c.part_index",
        )
        .all()
    ).results;
  }
  async function send(f, row, wire) {
    const claim = await f.store.claim(row.delivery_id, usage);
    if (!claim) return null;
    const result = await f.store.dispatch(
      row.delivery_id,
      claim.owner,
      wire,
      usage,
    );
    now += 1000;
    return result;
  }
  return {
    api,
    mf,
    db,
    options,
    usage,
    reset,
    seed,
    enqueue,
    rows,
    send,
    advance: (ms) => {
      now += ms;
    },
    get now() {
      return now;
    },
  };
}
