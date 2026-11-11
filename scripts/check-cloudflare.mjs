import { readFileSync } from 'node:fs';
import {
  assertMigrationIntegrity,
  readConfig,
  validateBindings,
} from './cloudflare-policy.mjs';
import { preflight } from './path-policy.mjs';

preflight();
assertMigrationIntegrity();
validateBindings(
  readConfig(),
  JSON.parse(readFileSync('cloudflare-resources.json', 'utf8')),
);
console.log(
  'Cloudflare environment separation, collection/notification lock, cron config and DEV-00 migration integrity passed. Remote account/resources are not certified by this local check.',
);
