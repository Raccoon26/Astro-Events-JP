import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const patterns = [
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  /github_pat_[A-Za-z0-9_]{50,}/,
  /cf[ua]t_[A-Za-z0-9_-]{20,}/,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /\b\d{8,12}:[A-Za-z0-9_-]{35}\b/,
];
let failed = false;
for (const file of files) {
  if (
    (/(?:^|\/)(?:\.env|\.dev\.vars)(?:\.|$)/.test(file) &&
      !file.endsWith('.example')) ||
    /\.(?:pem|p12|key)$/.test(file) ||
    patterns.some((pattern) => pattern.test(readFileSync(file, 'utf8')))
  ) {
    console.error(`Potential secret: ${file}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log(
  `Secret pattern/forbidden-file scan passed (${files.length} files); manual review remains required.`,
);
