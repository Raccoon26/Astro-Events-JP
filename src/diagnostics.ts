import {
  type DeploymentEnvironment,
  type Env,
  validateRuntimeConfig,
} from './config';
export type DiagnosticCode =
  | 'OK'
  | 'CONFIG'
  | 'DB_UNAVAILABLE'
  | 'DB_IDENTITY'
  | 'DB_TIMEOUT';
export interface DiagnosticResult {
  code: DiagnosticCode;
  environment: DeploymentEnvironment | 'unknown';
  dbQueries: number;
  rowsRead: number | null;
  rowsWritten: number | null;
  databaseBytes: number | null;
}
interface Identity {
  environment: string;
  database_name: string;
  schema_version: number;
}
export async function diagnose(env: Env): Promise<DiagnosticResult> {
  const state: DiagnosticResult = {
    code: 'CONFIG',
    environment: 'unknown',
    dbQueries: 0,
    rowsRead: null,
    rowsWritten: null,
    databaseBytes: null,
  };
  try {
    state.environment = validateRuntimeConfig(env);
  } catch {
    return state;
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    state.dbQueries = 1;
    const result = await Promise.race([
      env.DB.prepare(
        'SELECT environment, database_name, schema_version FROM deployment_identity WHERE singleton = ?1',
      )
        .bind(1)
        .all<Identity>(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('DB_TIMEOUT')), 3000);
      }),
    ]);
    if (!result.success) throw new Error('DB_UNAVAILABLE');
    const row = result.results[0];
    state.rowsRead = finiteMetric(result.meta.rows_read);
    state.rowsWritten = finiteMetric(result.meta.rows_written);
    state.databaseBytes = finiteMetric(result.meta.size_after);
    state.code =
      row?.environment === state.environment &&
      row.database_name === env.DATABASE_NAME &&
      row.schema_version === 2
        ? 'OK'
        : 'DB_IDENTITY';
  } catch (error) {
    state.code =
      error instanceof Error && error.message === 'DB_TIMEOUT'
        ? 'DB_TIMEOUT'
        : 'DB_UNAVAILABLE';
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
  return state;
}
function finiteMetric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
export function logDiagnostic(
  kind: 'health' | 'cron',
  result: DiagnosticResult,
  wallTimeMs: number,
  scheduledAt?: number,
) {
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      kind,
      environment: result.environment,
      success: result.code === 'OK',
      code: result.code,
      invocationRequests: 1,
      externalSubrequests: 0,
      dbQueries: result.dbQueries,
      rowsRead: result.rowsRead,
      rowsWritten: result.rowsWritten,
      databaseBytes: result.databaseBytes,
      processedTasks: 0,
      collectionEnabled: false,
      notificationsEnabled: false,
      accountUsage: 'unknown',
      mode: 'diagnostic-only',
      wallTimeMs,
      cpuTimeMs: null,
      cpuSource: 'cloudflare-metrics-required',
      ...(Number.isFinite(scheduledAt)
        ? { scheduledAt: new Date(scheduledAt as number).toISOString() }
        : {}),
    }),
  );
}
