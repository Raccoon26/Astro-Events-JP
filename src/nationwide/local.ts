import { withinBudget } from '../budget';
import type { Usage } from '../domain';

export async function assertLocal(db: D1Database) {
  const row = await db
    .prepare(`SELECT environment,database_name,schema_version,(SELECT version FROM nationwide_schema) AS feature
    FROM deployment_identity WHERE singleton=1`)
    .first<{
      environment: string;
      database_name: string;
      schema_version: number;
      feature: number;
    }>();
  if (
    row?.environment !== 'staging' ||
    row.database_name !== 'astro-events-jp-staging' ||
    row.schema_version !== 2 ||
    row.feature !== 1
  )
    throw new Error('DEV08_LOCAL_ONLY');
}

export function budget(
  usage: Usage | null,
  reads: number,
  writes: number,
  requests = 0,
) {
  return (
    usage !== null &&
    withinBudget(usage, {
      requests,
      reads,
      writes,
      databaseBytes: writes ? 65536 : 0,
    })
  );
}
