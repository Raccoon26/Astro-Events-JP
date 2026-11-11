// Explicit one-shot registry audit, not a collector: only seed URLs, no recursive navigation.

import { lookup } from 'node:dns/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { preflight } from './path-policy.mjs';

preflight();
if (!process.argv.includes('--allow-listed-research'))
  throw new Error('Explicit research invocation required');
const rows = JSON.parse(readFileSync('data/sources.json', 'utf8'));
async function request(url) {
  const host = new URL(url).hostname;
  const ips = await lookup(host, { all: true });
  if (
    ips.some(
      (ip) =>
        ip.family !== 4 ||
        /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
          ip.address,
        ),
    )
  )
    throw new Error('Unreviewed address');
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
    headers: { 'User-Agent': 'Astro-Events-JP-DEV02-SourceReview' },
  });
  const reader = response.body?.getReader();
  let text = '',
    size = 0;
  while (reader) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 262144) {
      await reader.cancel();
      break;
    }
    text += new TextDecoder().decode(part.value);
  }
  return { status: response.status, text };
}
for (const row of rows) {
  if (!row.url.startsWith('https:')) {
    row.state = 'unsupported';
    row.reason =
      'HTTP-only directory URL; HTTPS/canonical verification pending';
    continue;
  }
  try {
    const robots = await request(new URL('/robots.txt', row.url).href);
    row.robotsHttpStatus = robots.status;
    row.robotsStatus =
      robots.status === 404
        ? 'absent'
        : robots.status === 200
          ? 'review-required'
          : 'unavailable';
    if (
      robots.status !== 404 &&
      (robots.status !== 200 || /^\s*Disallow\s*:\s*\/\s*$/im.test(robots.text))
    ) {
      row.reason = 'robots unavailable or root disallow; no original fetch';
      continue;
    }
    const page = await request(row.url);
    row.httpStatus = page.status;
    row.checkedAt = new Date().toISOString();
    row.pageTitle =
      page.text
        .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
        .replace(/\s+/g, ' ')
        .slice(0, 180) ?? '';
    row.eventLinks = [
      ...page.text.matchAll(/href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
    ]
      .filter((m) => /イベント|お知らせ|観望|公開|event|news/i.test(m[0]))
      .flatMap((m) => {
        try {
          const u = new URL(m[1], row.url);
          return u.hostname === new URL(row.url).hostname ? [u.href] : [];
        } catch {
          return [];
        }
      })
      .slice(0, 5);
    row.termsLinks = [
      ...page.text.matchAll(/href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
    ]
      .filter((m) => /利用規約|利用条件|ポリシー|著作権/.test(m[0]))
      .flatMap((m) => {
        try {
          return [new URL(m[1], row.url).href];
        } catch {
          return [];
        }
      })
      .slice(0, 3);
    if (
      page.status === 200 &&
      row.pageTitle &&
      page.text.includes(row.name.replace(/「.*$/, ''))
    ) {
      row.officialStatus = 'Verified';
      row.reason =
        'Official directory link and original facility name confirmed; collection policy/parser review pending';
    }
  } catch {
    row.reason =
      'Original access unavailable in bounded audit; retain directory evidence';
  }
  writeFileSync('data/sources.json', JSON.stringify(rows, null, 2) + '\n');
}
console.log(
  JSON.stringify({
    sources: rows.length,
    verified: rows.filter((r) => r.officialStatus === 'Verified').length,
  }),
);
