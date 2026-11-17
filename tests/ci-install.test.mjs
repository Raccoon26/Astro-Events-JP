import { expect, it } from 'vitest';
import { assertCiInstall, installCi } from '../scripts/install-ci.mjs';

const env = {
  GITHUB_ACTIONS: 'true',
  RUNNER_TEMP: '/isolated',
  npm_config_cache: '/isolated/astro-events-jp/npm',
};
it('uses the frozen lock and explicit optional dependencies without retrying a healthy install', () => {
  const calls = [];
  let checks = 0;
  expect(
    installCi({
      run: (a) => {
        calls.push(a);
        return { status: 0 };
      },
      probe: () => 'ok',
      unchanged: () => checks++,
    }),
  ).toEqual({ attempts: 1, biome: 'verified' });
  expect(calls).toEqual([
    ['ci', '--include=optional', '--fetch-retries=1', '--fetch-timeout=30000'],
  ]);
  expect(checks).toBe(1);
});
it('repairs only the identified optional Biome binary omission once and records a safe reason', () => {
  const calls = [],
    logs = [];
  let n = 0;
  expect(
    installCi({
      run: (a) => {
        calls.push(a);
        return { status: 0 };
      },
      probe: () => (++n === 1 ? 'missing-biome-optional' : 'ok'),
      unchanged: () => {},
      log: (r) => logs.push(r),
    }).attempts,
  ).toBe(2);
  expect(calls[1]).toContain('--prefer-online');
  expect(logs).toEqual([
    {
      phase: 'ci-native-repair',
      reason: 'BIOME_OPTIONAL_BINARY_MISSING',
      attempt: 2,
    },
  ]);
});
it('fails after the second missing binary rather than skipping lint or continuing to deployment', () => {
  let n = 0;
  expect(() =>
    installCi({
      run: () => {
        n++;
        return { status: 0 };
      },
      probe: () => 'missing-biome-optional',
      unchanged: () => {},
    }),
  ).toThrow('CI_BIOME_OPTIONAL_BINARY_MISSING');
  expect(n).toBe(2);
});
it.each([
  [{ status: 1 }, 'CI_INSTALL_FAILED'],
  [{ status: null, error: { code: 'ETIMEDOUT' } }, 'CI_INSTALL_TIMEOUT'],
])('does not retry failed installation or timeouts %j', (result, code) => {
  let n = 0;
  expect(() =>
    installCi({
      run: () => {
        n++;
        return result;
      },
      probe: () => {
        throw Error('must not probe');
      },
      unchanged: () => {},
    }),
  ).toThrow(code);
  expect(n).toBe(1);
});
it('rejects unrelated native failures and manifest changes before retrying', () => {
  expect(() =>
    installCi({
      run: () => ({ status: 0 }),
      probe: () => 'invalid',
      unchanged: () => {},
    }),
  ).toThrow('CI_NATIVE_TOOL_INVALID');
  expect(() =>
    installCi({
      run: () => ({ status: 0 }),
      probe: () => 'ok',
      unchanged: () => {
        throw Error('CI_INSTALL_MANIFEST_CHANGED');
      },
    }),
  ).toThrow('CI_INSTALL_MANIFEST_CHANGED');
});
it('rejects local/non-isolated runs and executable overrides before mutation', () => {
  expect(() => assertCiInstall(env, 'linux', 'x64')).not.toThrow();
  for (const [e, p, a] of [
    [env, 'win32', 'x64'],
    [env, 'linux', 'arm64'],
    [{ ...env, GITHUB_ACTIONS: 'false' }, 'linux', 'x64'],
    [{ ...env, npm_config_cache: '/other' }, 'linux', 'x64'],
    [{ ...env, BIOME_BINARY: '/external' }, 'linux', 'x64'],
  ])
    expect(() => assertCiInstall(e, p, a)).toThrow(
      'ISOLATED_LINUX_CI_INSTALL_REQUIRED',
    );
});
