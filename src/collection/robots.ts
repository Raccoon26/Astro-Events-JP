import { CollectionError } from './types';

interface Group {
  agents: string[];
  rules: { allow: boolean; pattern: string }[];
  delay: number;
}
function octets(value: string) {
  try {
    return encodeURI(
      value.replace(/%[a-f\d]{2}/gi, (m) => {
        const code = Number.parseInt(m.slice(1), 16);
        return /[A-Za-z0-9._~-]/.test(String.fromCharCode(code))
          ? String.fromCharCode(code)
          : m.toUpperCase();
      }),
    ).replaceAll('%25', '%');
  } catch {
    throw new CollectionError('robots-denied');
  }
}
function matches(pattern: string, path: string) {
  const end = pattern.endsWith('$');
  const p = octets(end ? pattern.slice(0, -1) : pattern) + (end ? '' : '*');
  const s = octets(path);
  let i = 0,
    j = 0,
    star = -1,
    mark = 0;
  while (j < s.length) {
    if (p[i] === s[j]) {
      i++;
      j++;
    } else if (p[i] === '*') {
      star = i++;
      mark = j;
    } else if (star >= 0) {
      i = star + 1;
      j = ++mark;
    } else return false;
  }
  while (p[i] === '*') i++;
  return i === p.length;
}
export function robotsPolicy(
  text: string,
  url: string,
  agent = 'AstroEventsJP',
) {
  if (text.length > 65536) throw new CollectionError('robots-denied');
  const groups: Group[] = [];
  let current: Group | null = null,
    hasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase(),
      value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!current || hasRules) {
        current = { agents: [], rules: [], delay: 0 };
        groups.push(current);
        hasRules = false;
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (key === 'allow' || key === 'disallow')) {
      hasRules = true;
      if (value) {
        if (value.length > 2048 || current.rules.length >= 1000)
          throw new CollectionError('robots-denied');
        current.rules.push({ allow: key === 'allow', pattern: value });
      }
    } else if (
      current &&
      key === 'crawl-delay' &&
      /^\d+(?:\.\d+)?$/.test(value)
    ) {
      hasRules = true;
      current.delay = Math.max(current.delay, Math.ceil(Number(value) * 1000));
    }
  }
  const score = (g: Group) =>
    Math.max(
      -1,
      ...g.agents.map((a) =>
        a === '*' ? 0 : agent.toLowerCase().includes(a) ? a.length : -1,
      ),
    );
  const best = Math.max(-1, ...groups.map(score));
  const chosen = groups.filter((g) => score(g) === best && best >= 0);
  const path = new URL(url).pathname + new URL(url).search;
  const applicable = chosen
    .flatMap((g) => g.rules)
    .filter((r) => matches(r.pattern, path))
    .sort(
      (a, b) =>
        octets(b.pattern).replace(/[*$]/g, '').length -
          octets(a.pattern).replace(/[*$]/g, '').length ||
        Number(b.allow) - Number(a.allow),
    );
  return {
    allowed: applicable[0]?.allow ?? true,
    crawlDelayMs: Math.max(0, ...chosen.map((g) => g.delay)),
  };
}
