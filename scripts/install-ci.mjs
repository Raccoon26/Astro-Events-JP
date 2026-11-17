import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { preflight } from './path-policy.mjs';

export function installCi({ run, probe, unchanged, log = () => {} }) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const args = [
      'ci',
      '--include=optional',
      '--fetch-retries=1',
      '--fetch-timeout=30000',
    ];
    if (attempt === 2) args.push('--prefer-online');
    const result = run(args);
    unchanged(); // npm ci must never rewrite the reviewed manifests.
    if (result.error?.code === 'ETIMEDOUT') throw Error('CI_INSTALL_TIMEOUT');
    if (result.status !== 0) throw Error('CI_INSTALL_FAILED');
    const state = probe();
    if (state === 'ok') return { attempts: attempt, biome: 'verified' };
    if (state !== 'missing-biome-optional')
      throw Error('CI_NATIVE_TOOL_INVALID');
    if (attempt === 2) throw Error('CI_BIOME_OPTIONAL_BINARY_MISSING');
    log({
      phase: 'ci-native-repair',
      reason: 'BIOME_OPTIONAL_BINARY_MISSING',
      attempt: 2,
    });
  }
}

export function assertCiInstall(env, platform, arch) {
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    platform !== 'linux' ||
    arch !== 'x64' ||
    !env.RUNNER_TEMP ||
    env.npm_config_cache !== `${env.RUNNER_TEMP}/astro-events-jp/npm` ||
    env.BIOME_BINARY
  )
    throw Error('ISOLATED_LINUX_CI_INSTALL_REQUIRED');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  assertCiInstall(process.env, process.platform, process.arch);
  preflight();
  const files = ['package.json', 'package-lock.json'];
  const hashes = () =>
    files
      .map((f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex'))
      .join(':');
  const before = hashes();
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    .devDependencies['@biomejs/biome'];
  const result = installCi({
    run: (args) =>
      spawnSync('npm', args, { stdio: 'inherit', timeout: 240000 }),
    unchanged: () => {
      if (hashes() !== before) throw Error('CI_INSTALL_MANIFEST_CHANGED');
    },
    log: (record) => console.log(JSON.stringify(record)),
    probe: () => {
      const p = spawnSync(
        process.execPath,
        ['node_modules/@biomejs/biome/bin/biome', '--version'],
        { encoding: 'utf8', timeout: 10000, maxBuffer: 16384 },
      );
      if (p.status === 0 && p.stdout.trim() === `Version: ${version}`)
        return 'ok';
      return /Cannot find module ['"]@biomejs\/cli-linux-x64\/biome['"]/.test(
        p.stderr ?? '',
      )
        ? 'missing-biome-optional'
        : 'invalid';
    },
  });
  console.log(JSON.stringify({ phase: 'ci-install-complete', ...result }));
}
