import { WorkerEntrypoint } from 'cloudflare:workers';
import { D1Meter } from '../collection/meter';
import type { Transport } from '../collection/types';
import { pkcs8Signer, ReportsInstallation } from '../operations/github-app';
import { operationsPipeline } from '../operations/pipeline';
import {
  type AccountObservation,
  assess,
  CRON,
  STRUCTURAL,
  ZERO,
} from '../operations/policy';
import { reportsWire } from './reports-wire';

interface ReleaseBindings {
  RELEASE_JOB_DB?: D1Database;
  RELEASE_MODE?: string;
  RELEASE_ENV?: string;
  RELEASE_AUTH_APPROVED?: string;
  COLLECTION_ENABLED?: string;
  NOTIFICATIONS_ENABLED?: string;
  RELEASE_EVIDENCE?: string;
  RELEASE_FIXTURE_CLOCK?: string;
  RELEASE_FIXTURE_PAGES?: string;
  REPORTS_APP_CLIENT_ID?: string;
  REPORTS_APP_INSTALLATION_ID?: string;
  REPORTS_APP_REPOSITORY_ID?: string;
  REPORTS_APP_PRIVATE_KEY?: string;
}
type Mode = 'rehearsal' | 'reports-preflight';
const PURPOSE = {
  rehearsal: 'synthetic-rehearsal',
  'reports-preflight': 'staging-auth-validation',
} as const;
const denied = (code: string) => ({ state: 'deferred', code }) as const;
const parse = (text: string | undefined, limit: number): unknown =>
  text && text.length <= limit ? JSON.parse(text) : null;

/** Private service. The binding is an operator capability; request input never supplies URLs or evidence. */
export default class ReleaseOperations extends WorkerEntrypoint<ReleaseBindings> {
  fetch(): Response {
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  async schedule(cron: string, scheduledTime: number) {
    if (cron !== CRON || !Number.isSafeInteger(scheduledTime))
      return denied('schedule');
    return this.#rehearse((app, evidence) => app.tick(scheduledTime, evidence));
  }
  async scheduled(controller: ScheduledController) {
    await this.schedule(controller.cron, controller.scheduledTime);
  }
  async step() {
    return this.#rehearse((app, evidence) => app.advance(evidence));
  }

  async #prepare(mode: Mode) {
    const env = this.env,
      db = env.RELEASE_JOB_DB;
    if (env.RELEASE_MODE !== mode) return denied('mode');
    if (
      env.RELEASE_ENV !== 'staging' ||
      env.COLLECTION_ENABLED !== 'false' ||
      env.NOTIFICATIONS_ENABLED !== 'false' ||
      !db
    )
      return denied('environment');
    if (mode === 'reports-preflight' && env.RELEASE_AUTH_APPROVED !== 'true')
      return denied('authorization');
    const meter = new D1Meter(db);
    try {
      const isolated = await meter.db
        .prepare(`SELECT i.purpose FROM release_isolation i
        JOIN deployment_identity d ON d.singleton=i.singleton
        WHERE i.singleton=1 AND i.schema_version=1 AND d.environment='staging'
        AND d.database_name='astro-events-jp-staging' AND d.schema_version=2
        AND (SELECT version FROM automation_schema)=1 AND (SELECT version FROM nationwide_schema)=1`)
        .first('purpose');
      if (isolated !== PURPOSE[mode]) return denied('isolation');
    } catch {
      return denied('schema');
    }
    const now =
      mode === 'rehearsal'
        ? Date.parse(env.RELEASE_FIXTURE_CLOCK ?? '')
        : Date.now();
    try {
      const evidence = parse(
        env.RELEASE_EVIDENCE,
        4096,
      ) as AccountObservation | null;
      if (
        !Number.isSafeInteger(now) ||
        !evidence ||
        evidence.provenance !==
          (mode === 'rehearsal' ? 'fixture' : 'cloudflare') ||
        !assess(evidence, ZERO, { ...STRUCTURAL, subrequests: 3 }, now, true)
          .allowed
      )
        return denied('budget');
      return { db, evidence, now, meter };
    } catch {
      return denied('budget');
    }
  }

  async #rehearse(
    run: (
      app: ReturnType<typeof operationsPipeline>,
      evidence: AccountObservation,
    ) => Promise<unknown>,
  ) {
    const gate = await this.#prepare('rehearsal');
    if ('code' in gate) return gate;
    try {
      const transport = fixturePages(this.env.RELEASE_FIXTURE_PAGES);
      const app = operationsPipeline(gate.meter, {
        clock: () => gate.now,
        ...(transport ? { fixtureTransport: transport } : {}),
      });
      return {
        state: 'rehearsal',
        result: await run(app, gate.evidence),
        meter: app.meter.snapshot(),
        officialCpuMs: null,
      };
    } catch {
      return denied('rehearsal-failed');
    }
  }

  /** Separately approved staging credential probe. Never exposes a grant or writes an Issue. */
  async verifyReportsAccess() {
    const gate = await this.#prepare('reports-preflight');
    if ('code' in gate) return gate;
    const env = this.env;
    if (
      !env.REPORTS_APP_CLIENT_ID ||
      !env.REPORTS_APP_PRIVATE_KEY ||
      !/^\d{1,15}$/u.test(env.REPORTS_APP_INSTALLATION_ID ?? '') ||
      !/^\d{1,15}$/u.test(env.REPORTS_APP_REPOSITORY_ID ?? '')
    )
      return denied('credentials');
    try {
      const installationId = Number(env.REPORTS_APP_INSTALLATION_ID);
      const now = Date.now();
      const claimed = await gate.db
        .prepare(`UPDATE release_isolation SET auth_attempt_at=?
        WHERE singleton=1 AND purpose='staging-auth-validation' AND
        (auth_attempt_at IS NULL OR auth_attempt_at<=?) RETURNING singleton`)
        .bind(
          new Date(now).toISOString(),
          new Date(now - 15 * 60000).toISOString(),
        )
        .first();
      if (!claimed) return denied('reports-backoff');
      const service = new ReportsInstallation(
        {
          clientId: env.REPORTS_APP_CLIENT_ID,
          installationId,
          repositoryId: Number(env.REPORTS_APP_REPOSITORY_ID),
        },
        await pkcs8Signer(env.REPORTS_APP_PRIVATE_KEY),
        reportsWire(installationId),
        () => Date.now(),
      );
      await service.accessForReports();
      return { state: 'reports-access-verified' };
    } catch {
      return denied('reports-authentication');
    }
  }
}

function fixturePages(raw: string | undefined): Transport | undefined {
  if (!raw) return undefined;
  const document = parse(raw, 10240);
  if (!document || typeof document !== 'object' || Array.isArray(document))
    throw Error('FIXTURE_INVALID');
  const pages = new Map<string, string>();
  for (const [key, value] of Object.entries(document)) {
    const url = new URL(key);
    if (
      pages.size >= 4 ||
      url.origin !== 'https://example.jp' ||
      url.href !== key ||
      url.hash ||
      url.username ||
      typeof value !== 'string' ||
      value.length > 3072
    )
      throw Error('FIXTURE_INVALID');
    pages.set(key, value);
  }
  return {
    assurance: 'fixture',
    async request(url, _headers, signal) {
      if (signal.aborted) throw Error('FIXTURE_ABORTED');
      const text = pages.get(url.href);
      if (text === undefined && url.href !== 'https://example.jp/robots.txt')
        throw Error('FIXTURE_MISSING');
      return {
        response: new Response(text ?? null, {
          status: text === undefined ? 404 : 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
        decoded: true,
      };
    },
  };
}
