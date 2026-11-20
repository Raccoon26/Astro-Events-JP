/** Isolated workerd test entry. No reference from wrangler.jsonc or the deployed Worker. */
import { operationsPipeline } from './pipeline';
import { type AccountObservation, CRON, iso, ZERO } from './policy';

interface FixtureBindings {
  DB: D1Database;
  OPS_ISOLATED_FIXTURE: string;
  OPS_FIXTURE_CLOCK: string;
}
function fixture(env: FixtureBindings) {
  const now = Date.parse(env.OPS_FIXTURE_CLOCK);
  if (env.OPS_ISOLATED_FIXTURE !== 'true' || !Number.isSafeInteger(now))
    throw Error('OPS_ISOLATED_FIXTURE_REQUIRED');
  const evidence: AccountObservation = {
    ...ZERO,
    plan: 'free',
    provenance: 'fixture',
    checkedAt: iso(now),
    cronTriggers: 0,
    cpuP99Ms: 3,
    projectDatabaseBytes: 0,
    telemetryUnit: iso(now) < '2026-12-01' ? 'records' : 'bytes',
  };
  return { engine: operationsPipeline(env.DB, { clock: () => now }), evidence };
}
export default {
  async scheduled(controller: ScheduledController, env: FixtureBindings) {
    if (controller.cron !== CRON) throw Error('OPS_CRON_BOUNDARY');
    const { engine, evidence } = fixture(env);
    await engine.tick(controller.scheduledTime, evidence);
  },
  async fetch(request: Request, env: FixtureBindings) {
    if (
      request.method !== 'POST' ||
      new URL(request.url).pathname !== '/fixture/step'
    )
      return new Response(null, { status: 404 });
    const { engine, evidence } = fixture(env);
    const result = await engine.advance(evidence);
    return Response.json({
      result,
      meter: engine.meter.snapshot(),
      synthetic: true,
      officialCpuMs: null,
    });
  },
} satisfies ExportedHandler<FixtureBindings>;
