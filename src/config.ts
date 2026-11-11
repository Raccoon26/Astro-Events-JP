export interface Env {
  APP_ENV: string;
  REPORTS_REPOSITORY: string;
  COLLECTION_ENABLED: string;
  DB: D1Database;
}
export function validateConfig(env: Env) {
  if (!['development', 'test', 'production'].includes(env.APP_ENV))
    throw new Error('Invalid APP_ENV');
  if (env.REPORTS_REPOSITORY !== 'Raccoon26/Astro-Events-JP-Reports')
    throw new Error(
      'Reports repository must be the approved private repository',
    );
  if (!['true', 'false'].includes(env.COLLECTION_ENABLED))
    throw new Error('Invalid collection flag');
  if (!env.DB || typeof env.DB.prepare !== 'function')
    throw new Error('D1 binding missing');
  return { collectionEnabled: env.COLLECTION_ENABLED === 'true' };
}
