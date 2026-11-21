import {
  normalizeUrl,
  type Registration,
  validateRegistration,
} from '../registry';
import { validateSourceUrl } from '../security';
import { type Approval, CollectionError, type Format } from './types';
export const USER_AGENT =
  'AstroEventsJP/0.3 (+https://github.com/Raccoon26/Astro-Events-JP)';
function checkSpelling(raw: string) {
  decodeURI(raw);
  if (
    raw.length > 4096 ||
    /[\u0000-\u0020\u007f\\]/u.test(raw) ||
    /%(?:2f|5c|25|0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw) ||
    /%(?![\da-f]{2})/i.test(raw) ||
    /%2e/i.test(raw.split(/[?#]/, 1)[0] ?? '')
  )
    throw new Error('Ambiguous URL spelling');
}
function checkAuthority(raw: string) {
  const authority = raw.match(/^(?:https:\/\/|\/\/)([^/?#]+)/)?.[1];
  if (!authority || !/^[a-z0-9.-]+(?::443)?$/i.test(authority))
    throw new Error('Ambiguous authority');
}
export function safeUrl(raw: string, hosts: readonly string[]): URL {
  try {
    if (!raw.startsWith('https://')) throw new Error();
    checkSpelling(raw);
    checkAuthority(raw);
    return validateSourceUrl(normalizeUrl(raw), hosts);
  } catch {
    throw new CollectionError('invalid-host');
  }
}
export function redirectUrl(
  location: string,
  base: URL,
  hosts: readonly string[],
) {
  checkSpelling(location);
  if (location.startsWith('//')) checkAuthority(location);
  if (/^[a-z][a-z\d+.-]*:/i.test(location)) return safeUrl(location, hosts);
  return safeUrl(new URL(location, base).href, hosts);
}
export function inScope(url: URL, paths: readonly string[]) {
  return paths.some(
    (path) =>
      path === '/' ||
      url.pathname === path ||
      url.pathname.startsWith(`${path.replace(/\/$/, '')}/`),
  );
}
export function assertApproval(
  source: Registration,
  approval: Approval,
  now: string,
  format: Format = source.format,
) {
  if (source.state !== 'active') throw new CollectionError('source-not-active');
  try {
    validateRegistration(source);
  } catch {
    throw new CollectionError('terms-unreviewed');
  }
  const sourceUrl = safeUrl(source.officialUrl, source.allowedHosts);
  if (
    approval.sourceId !== source.id ||
    approval.url !== sourceUrl.href ||
    !approval.operatorEvidenceUrl ||
    !approval.purpose ||
    approval.termsDecision !== 'allowed' ||
    !approval.termsEvidenceUrl ||
    !approval.testEvidence.passed ||
    approval.testEvidence.url !== approval.url ||
    !/^[a-f0-9]{64}$/.test(approval.testEvidence.digest) ||
    !approval.testEvidence.parserVersion ||
    !approval.formats.includes(format) ||
    !Number.isFinite(approval.minIntervalSeconds) ||
    approval.minIntervalSeconds < 3600 ||
    approval.minIntervalSeconds < (source.minIntervalSeconds ?? 86400) ||
    approval.requestGapMs < 1000 ||
    !Number.isFinite(approval.requestGapMs) ||
    approval.requestGapMs > 5000 ||
    !Number.isFinite(Date.parse(approval.reviewedAt)) ||
    Date.parse(approval.reviewedAt) > Date.parse(now) ||
    Date.parse(approval.expiresAt) <= Date.parse(now) ||
    !Number.isFinite(Date.parse(approval.expiresAt)) ||
    Date.parse(approval.expiresAt) - Date.parse(approval.reviewedAt) >
      7 * 86400000
  )
    throw new CollectionError('terms-unreviewed');
  for (const evidence of [
    approval.operatorEvidenceUrl,
    approval.termsEvidenceUrl,
  ])
    normalizeUrl(evidence);
  if (
    !approval.scopePaths.length ||
    approval.scopePaths.some(
      (p) => !p.startsWith('/') || /[?#%\\]/.test(p) || p.includes('..'),
    ) ||
    !inScope(sourceUrl, approval.scopePaths)
  )
    throw new CollectionError('terms-unreviewed');
}
// Only globally routable IPv4 is supported by the pinned local transport. IPv6 fails closed.
export function publicIPv4(address: string): boolean {
  const parts = address.split('.');
  if (
    parts.length !== 4 ||
    parts.some((p) => !/^(?:0|[1-9]\d{0,2})$/u.test(p) || Number(p) > 255)
  )
    return false;
  const [a = 0, b = 0, c = 0] = parts.map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 168 && b === 63 && c === 129 && parts[3] === '16') ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 &&
      ((b === 31 && c === 196) ||
        (b === 52 && c === 193) ||
        (b === 175 && c === 48))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
