// DEV00's config-only fixtures may omit deployment fields; remote validation below requires them.
type RequiredBindings =
  | 'APP_ENV'
  | 'REPORTS_REPOSITORY'
  | 'COLLECTION_ENABLED'
  | 'DB';
export type Env = Pick<WranglerBindings, RequiredBindings> &
  Partial<Omit<WranglerBindings, RequiredBindings>>;
export function validateConfig(env: Env) {
  if (!['development', 'test', 'staging', 'production'].includes(env.APP_ENV))
    throw new Error('Invalid APP_ENV');
  if (env.REPORTS_REPOSITORY !== 'Raccoon26/Astro-Events-JP-Reports')
    throw new Error(
      'Reports repository must be the approved private repository',
    );
  if (env.COLLECTION_ENABLED !== 'false')
    throw new Error('CONFIG: collection must remain disabled until DEV-09');
  if (!env.DB || typeof env.DB.prepare !== 'function')
    throw new Error('D1 binding missing');
  return { collectionEnabled: false };
}
export type DeploymentEnvironment = 'staging' | 'production';
export function validateRuntimeConfig(env: Env): DeploymentEnvironment {
  validateConfig(env);
  if (env.DEPLOYMENT_ENV !== 'staging' && env.DEPLOYMENT_ENV !== 'production')
    throw new Error('CONFIG');
  if (
    env.APP_ENV !== env.DEPLOYMENT_ENV ||
    env.DATABASE_ENVIRONMENT !== env.DEPLOYMENT_ENV ||
    env.DATABASE_NAME !== `astro-events-jp-${env.DEPLOYMENT_ENV}` ||
    env.NOTIFICATIONS_ENABLED !== 'false'
  )
    throw new Error('CONFIG');
  return env.DEPLOYMENT_ENV;
}
