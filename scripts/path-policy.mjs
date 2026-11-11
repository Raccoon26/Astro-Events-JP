import { lstatSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
export const ROOT = 'E:/Astro-Events-JP';
export function assertNoLinks(target) {
  let current = path.resolve(target);
  for (;;) {
    if (lstatSync(current).isSymbolicLink())
      throw new Error('Linked path blocked');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
export function assertLocal(cwd = process.cwd(), root = ROOT) {
  // Existence is checked before any directory creation: never recreate a missing drive.
  if (!statSync(root).isDirectory())
    throw new Error('Project drive unavailable');
  assertNoLinks(root);
  assertNoLinks(cwd);
  if (
    realpathSync(cwd).toLowerCase() !==
    realpathSync(path.join(root, 'repo')).toLowerCase()
  ) {
    throw new Error('Run from E:/Astro-Events-JP/repo only');
  }
  return root;
}
export function preflight() {
  if (
    process.platform !== 'win32' &&
    (process.env.GITHUB_ACTIONS === 'true' ||
      process.env.ASTRO_CLOUD_WORKSPACE === '1')
  ) {
    return { mode: 'cloud', root: process.cwd(), localDriveVerified: false };
  }
  return {
    mode: 'windows-e-drive',
    root: assertLocal(),
    localDriveVerified: true,
  };
}
