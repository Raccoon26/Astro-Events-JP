import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOwnedTemp, inspectOwned } from '../scripts/cleanup-policy.mjs';
import { assertLocal, assertNoLinks } from '../scripts/path-policy.mjs';

const roots = [];
function fixture() {
  const base =
    process.platform === 'win32'
      ? 'E:/Astro-Events-JP/temp'
      : process.env.RUNNER_TEMP || '/tmp';
  const root = mkdtempSync(path.join(base, 'astro-test-'));
  roots.push(root);
  mkdirSync(path.join(root, 'repo'));
  mkdirSync(path.join(root, 'temp'));
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    const base =
      process.platform === 'win32'
        ? 'E:/Astro-Events-JP/temp'
        : process.env.RUNNER_TEMP || '/tmp';
    if (
      path.dirname(path.resolve(root)) !== path.resolve(base) ||
      !path.basename(root).startsWith('astro-test-')
    )
      throw new Error('Unsafe fixture teardown');
    assertNoLinks(root);
    rmSync(root, { recursive: true, force: true });
  }
});
describe('isolated local safety', () => {
  it('rejects missing drives and wrong workspaces without creating them', () => {
    const root = fixture();
    expect(assertLocal(path.join(root, 'repo'), root)).toBe(root);
    expect(() => assertLocal(root, root)).toThrow();
    expect(() =>
      assertLocal(path.join(root, 'repo'), path.join(root, 'disconnected')),
    ).toThrow();
  });
  it('dry-runs then deletes only an unchanged, registered temporary file', () => {
    const root = fixture();
    const entry = createOwnedTemp(root, 'regenerable test data');
    expect(inspectOwned(root, entry).result).toBe('dry-run-eligible');
    expect(readFileSync(entry.path, 'utf8')).toBe('regenerable test data');
    expect(inspectOwned(root, entry, true).result).toBe('deleted');
    expect(() => readFileSync(entry.path)).toThrow();
  });
  it('blocks outside paths, changed contents and unproven ownership', () => {
    const root = fixture();
    const entry = createOwnedTemp(root, 'initial');
    expect(() =>
      inspectOwned(
        root,
        { ...entry, path: path.join(root, 'repo', 'important') },
        true,
      ),
    ).toThrow();
    expect(() =>
      inspectOwned(root, { ...entry, owner: 'other' }, true),
    ).toThrow();
    writeFileSync(entry.path, 'user data');
    expect(() => inspectOwned(root, entry, true)).toThrow();
    expect(readFileSync(entry.path, 'utf8')).toBe('user data');
  });
  it('blocks linked directories including junctions before access/deletion', () => {
    const root = fixture();
    const outside = fixture();
    const link = path.join(root, 'linked');
    symlinkSync(
      outside,
      link,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(() => assertLocal(path.join(link, 'repo'), root)).toThrow();
    const entry = createOwnedTemp(outside, 'preserve');
    expect(() =>
      inspectOwned(
        root,
        { ...entry, path: path.join(link, 'temp', path.basename(entry.path)) },
        true,
      ),
    ).toThrow();
    expect(readFileSync(entry.path, 'utf8')).toBe('preserve');
  });
  it('rejects a linked allowlist directory and multiply-linked files', () => {
    const root = fixture();
    const outside = fixture();
    const entry = createOwnedTemp(outside, 'keep');
    rmdirSync(path.join(root, 'temp'));
    symlinkSync(
      path.join(outside, 'temp'),
      path.join(root, 'temp'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(() =>
      inspectOwned(
        root,
        { ...entry, path: path.join(root, 'temp', path.basename(entry.path)) },
        true,
      ),
    ).toThrow();
    linkSync(entry.path, path.join(outside, 'temp', 'second-link'));
    expect(() => inspectOwned(outside, entry, true)).toThrow();
    expect(readFileSync(entry.path, 'utf8')).toBe('keep');
  });
});
