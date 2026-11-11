import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { externalCandidates, inspectOwned } from './cleanup-policy.mjs';
import { assertNoLinks, preflight } from './path-policy.mjs';

const state = preflight();
if (!state.localDriveVerified)
  throw new Error('Cleanup requires the actual Windows E drive');
const manifest = `${state.root}/reports/owned-files.json`;
if (existsSync(manifest)) assertNoLinks(manifest);
const entries = existsSync(manifest)
  ? JSON.parse(readFileSync(manifest, 'utf8'))
  : [];
if (!Array.isArray(entries)) throw new Error('Invalid manifest');
const report = {
  at: new Date().toISOString(),
  mode: process.argv.includes('--apply')
    ? 'apply-owned-e-temp-only'
    : 'dry-run',
  entries: entries.map((entry) => {
    try {
      return inspectOwned(state.root, entry, process.argv.includes('--apply'));
    } catch (error) {
      return { path: entry.path, result: 'blocked', reason: error.message };
    }
  }),
  externalCandidates: externalCandidates(),
};
assertNoLinks(`${state.root}/reports`);
writeFileSync(
  `${state.root}/reports/cleanup-${Date.now()}.json`,
  JSON.stringify(report, null, 2),
  { flag: 'wx' },
);
console.log(JSON.stringify(report, null, 2));
