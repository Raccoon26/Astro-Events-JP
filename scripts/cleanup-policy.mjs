import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { assertNoLinks } from './path-policy.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
export function createOwnedTemp(root, content) {
  const folder = path.join(root, 'temp');
  assertNoLinks(folder);
  const file = path.join(folder, `astro-${randomUUID()}.tmp`);
  writeFileSync(file, content, { flag: 'wx' });
  return {
    path: file,
    sha256: hash(content),
    owner: 'astro-events-jp',
    regenerable: true,
  };
}
export function inspectOwned(root, entry, apply = false) {
  const allowed = path.resolve(root, 'temp');
  const target = path.resolve(entry.path);
  if (
    path.dirname(target) !== allowed ||
    !/^astro-[\da-f-]{36}\.tmp$/.test(path.basename(target))
  )
    throw new Error('Outside cleanup allowlist');
  if (entry.owner !== 'astro-events-jp' || entry.regenerable !== true)
    throw new Error('Unproven ownership');
  assertNoLinks(target);
  const stat = lstatSync(target);
  if (
    !stat.isFile() ||
    stat.nlink !== 1 ||
    path.dirname(realpathSync(target)) !== realpathSync(allowed)
  )
    throw new Error('Unsafe file');
  if (hash(readFileSync(target)) !== entry.sha256)
    throw new Error('File changed since registration');
  if (apply) unlinkSync(target); // Individual verified file only; never recursive deletion.
  return { path: target, result: apply ? 'deleted' : 'dry-run-eligible' };
}
export function externalCandidates() {
  return ['C:/Astro-Events-JP', 'D:/Astro-Events-JP'].map((target) => ({
    path: target,
    exists: existsSync(target),
    action: 'report-only; approval required',
  }));
}
