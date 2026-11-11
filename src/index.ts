import { type Env, validateConfig } from './config';
import { AppError } from './errors';
export default {
  async fetch(): Promise<Response> {
    return new Response('Astro-Events-JP foundation', { status: 200 });
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const config = validateConfig(env);
    if (config.collectionEnabled) throw new AppError('CONFIG', false);
    // DEV-00 deliberately has no collection or notification side effects.
  },
} satisfies ExportedHandler<Env>;
