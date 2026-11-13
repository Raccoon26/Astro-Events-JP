import type { SourceRegistry } from './contracts';
import type { Source } from './domain';
import { validateSourceUrl } from './security';
export interface Registration extends Source {
  parserApproved?: boolean;
  minIntervalSeconds?: number;
  deadlineAt?: string | null;
  distinctVariantEvidenceUrl?: string;
  name: string;
  operator: string | null;
  officialStatus: string;
  evidenceUrl: string;
  checkedAt: string;
  robotsStatus: string;
  termsStatus: string;
  reason: string;
  kind: string;
}
export function normalizeUrl(raw: string): string {
  const url = new URL(raw);
  validateSourceUrl(url.href.replace(/^http:/, 'https:'), [url.hostname]);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('Unsafe URL');
  url.hash = '';
  if (
    [...url.searchParams.keys()].some((key) =>
      /^(token|access_token|api_key|password|secret|authorization)$/i.test(key),
    )
  )
    throw new Error('Sensitive URL parameter');
  for (const key of [...url.searchParams.keys()])
    if (/^utm_|^(fbclid|gclid)$/.test(key)) url.searchParams.delete(key);
  return url.href;
}
export async function stableId(url: string, prefix = 'src'): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalizeUrl(url)),
  );
  return `${prefix}-${Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24)}`;
}
export function validateRegistration(s: Registration) {
  if (
    !Number.isInteger(s.prefecture) ||
    Number(s.prefecture) < 1 ||
    Number(s.prefecture) > 47
  ) {
    if (s.prefecture !== null) throw new Error('Invalid prefecture');
  }
  if (
    !s.id ||
    !s.name ||
    !s.reason ||
    !s.evidenceUrl ||
    !Number.isFinite(Date.parse(s.checkedAt)) ||
    !Number.isFinite(Date.parse(s.nextCrawlAt))
  )
    throw new Error('Evidence required');
  normalizeUrl(s.officialUrl);
  normalizeUrl(s.evidenceUrl);
  if (s.distinctVariantEvidenceUrl) normalizeUrl(s.distinctVariantEvidenceUrl);
  if (
    s.minIntervalSeconds !== undefined &&
    (!Number.isInteger(s.minIntervalSeconds) || s.minIntervalSeconds < 3600)
  )
    throw new Error('Invalid minimum interval');
  if (!s.allowedHosts.includes(new URL(s.officialUrl).hostname))
    throw new Error('Unapproved host');
  for (const host of s.allowedHosts)
    validateSourceUrl(`https://${host}/`, [host]);
  if (!Number.isFinite(s.priority)) throw new Error('Invalid priority');
  if (
    s.state === 'active' &&
    (s.officialStatus !== 'Verified' ||
      s.parserApproved !== true ||
      s.robotsStatus !== 'allowed' ||
      s.termsStatus !== 'allowed' ||
      !s.officialUrl.startsWith('https:') ||
      !Number.isFinite(Date.parse(s.robotsCheckedAt ?? '')) ||
      !Number.isFinite(Date.parse(s.termsReviewedAt ?? '')))
  )
    throw new Error('Collection approval incomplete');
  if (
    !['active', 'review', 'unsupported', 'paused'].includes(s.state) ||
    !['html', 'rss', 'atom', 'sitemap'].includes(s.format) ||
    ![
      'astronomy',
      'space-development',
      'research',
      'local',
      'facility',
      'vtuber',
    ].includes(s.category)
  )
    throw new Error('Invalid registry classification');
}
export interface RegistryRow {
  source_id: string;
  name: string;
  official_url: string;
  allowed_hosts_json: string;
  category: Source['category'];
  prefecture: number | null;
  municipality: string | null;
  format: Source['format'];
  priority: number;
  state: Source['state'];
  state_reason: string | null;
  last_crawled_at: string | null;
  next_crawl_at: string;
  etag: string | null;
  last_modified: string | null;
  robots_checked_at: string | null;
  terms_reviewed_at: string | null;
  min_interval_seconds: number;
  payload: string | null;
}
export function hydrate(row: RegistryRow): Registration {
  const metadata = row.payload
    ? JSON.parse(row.payload)
    : {
        operator: null,
        officialStatus: 'Review Required',
        evidenceUrl: row.official_url,
        checkedAt: '1970-01-01T00:00:00.000Z',
        robotsStatus: 'not-checked',
        termsStatus: 'not-reviewed',
        kind: 'legacy',
      };
  return {
    ...metadata,
    id: row.source_id,
    name: row.name,
    officialUrl: row.official_url,
    allowedHosts: JSON.parse(row.allowed_hosts_json),
    category: row.category,
    prefecture: row.prefecture,
    municipality: row.municipality,
    format: row.format,
    priority: row.priority,
    state: !row.payload && row.state === 'active' ? 'review' : row.state,
    reason: row.state_reason ?? 'Legacy source requires metadata review',
    lastCrawledAt: row.last_crawled_at,
    nextCrawlAt: row.next_crawl_at,
    etag: row.etag,
    lastModified: row.last_modified,
    robotsCheckedAt: row.robots_checked_at,
    termsReviewedAt: row.terms_reviewed_at,
    minIntervalSeconds: row.min_interval_seconds,
  };
}
export class D1SourceRegistry implements SourceRegistry {
  constructor(readonly db: D1Database) {}
  async get(id: string): Promise<Registration | null> {
    const row = await this.db
      .prepare(
        "SELECT s.*,m.payload FROM sources s LEFT JOIN registry_metadata m ON m.kind='source' AND m.record_id=s.source_id WHERE s.source_id=?1",
      )
      .bind(id)
      .first<RegistryRow>();
    return row ? hydrate(row) : null;
  }
  async save(source: Source | Registration) {
    const old = await this.get(source.id);
    const s = { ...old, ...source } as Registration;
    validateRegistration(s);
    await this.register(s, false);
  }
  async register(
    s: Registration,
    insertOnly = true,
    related: D1PreparedStatement[] = [],
  ) {
    validateRegistration(s);
    const url = normalizeUrl(s.officialUrl);
    const old = await this.get(s.id);
    if (
      insertOnly &&
      (old ||
        (await this.db
          .prepare('SELECT source_id FROM sources WHERE source_id=?1')
          .bind(s.id)
          .first()))
    )
      return false;
    await this.assertUnique(s);
    const statements = [
      this.db
        .prepare(
          `INSERT INTO sources(source_id,name,official_url,allowed_hosts_json,category,prefecture,municipality,format,priority,state,state_reason,next_crawl_at,robots_checked_at,terms_reviewed_at,min_interval_seconds) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15) ON CONFLICT(source_id) DO UPDATE SET name=excluded.name,official_url=excluded.official_url,allowed_hosts_json=excluded.allowed_hosts_json,category=excluded.category,prefecture=excluded.prefecture,municipality=excluded.municipality,format=excluded.format,priority=excluded.priority,state=excluded.state,state_reason=excluded.state_reason,robots_checked_at=excluded.robots_checked_at,terms_reviewed_at=excluded.terms_reviewed_at,min_interval_seconds=excluded.min_interval_seconds`,
        )
        .bind(
          s.id,
          s.name,
          url,
          JSON.stringify(s.allowedHosts),
          s.category,
          s.prefecture,
          s.municipality,
          s.format,
          s.priority,
          s.state,
          s.reason,
          s.nextCrawlAt,
          s.robotsCheckedAt,
          s.termsReviewedAt,
          s.minIntervalSeconds ?? 86400,
        ),
      this.db
        .prepare(
          'INSERT INTO registry_urls VALUES(?1,?2,?3) ON CONFLICT(kind,url) DO NOTHING',
        )
        .bind('source', url, s.id),
      this.db
        .prepare(
          'INSERT INTO registry_metadata VALUES(?1,?2,?3) ON CONFLICT(kind,record_id) DO UPDATE SET payload=excluded.payload',
        )
        .bind('source', s.id, JSON.stringify({ ...s, officialUrl: url })),
      this.db
        .prepare(
          'INSERT INTO registry_history(source_id,changed_at,before_json,after_json) VALUES(?1,?2,?3,?4)',
        )
        .bind(
          s.id,
          new Date().toISOString(),
          old ? JSON.stringify(old) : null,
          JSON.stringify(s),
        ),
    ];
    await this.db.batch([...statements, ...related]);
    return true;
  }
  async assertUnique(s: Registration) {
    const url = normalizeUrl(s.officialUrl);
    const owner = await this.db
      .prepare('SELECT record_id FROM registry_urls WHERE kind=?1 AND url=?2')
      .bind('source', url)
      .first<string>('record_id');
    if (owner && owner !== s.id)
      throw new Error('Duplicate URL: review canonical relationship');
    const variants = await this.duplicateCandidates(url);
    if (variants.some((id) => id !== s.id)) {
      if (!s.distinctVariantEvidenceUrl)
        throw new Error(
          'Possible URL variant duplicate; explicit distinct-content evidence required',
        );
      normalizeUrl(s.distinctVariantEvidenceUrl);
    }
  }
  async list(
    filter: {
      prefecture?: number;
      category?: string;
      state?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ) {
    const limit = Math.min(100, Math.max(1, filter.limit ?? 50));
    if (!Number.isInteger(limit)) throw new Error('Invalid limit');
    if (
      filter.prefecture !== undefined &&
      (!Number.isInteger(filter.prefecture) ||
        filter.prefecture < 1 ||
        filter.prefecture > 47)
    )
      throw new Error('Invalid prefecture');
    const conditions = ['s.source_id>?'];
    const values: (string | number)[] = [filter.cursor ?? ''];
    for (const [column, value] of [
      ['prefecture', filter.prefecture],
      ['category', filter.category],
      ['state', filter.state],
    ] as const) {
      if (value !== undefined) {
        conditions.push(`s.${column}=?`);
        values.push(value);
      }
    }
    const rows = await this.db
      .prepare(
        `SELECT s.*,m.payload FROM sources s LEFT JOIN registry_metadata m ON m.kind='source' AND m.record_id=s.source_id WHERE ${conditions.join(' AND ')} ORDER BY s.source_id LIMIT ?`,
      )
      .bind(...values, limit)
      .all<RegistryRow>();
    return rows.results.map(hydrate);
  }
  async listPrefecture(code: number, cursor: string | null) {
    if (!Number.isInteger(code) || code < 1 || code > 47)
      throw new Error('Invalid prefecture');
    return this.list({ prefecture: code, cursor: cursor ?? '' });
  }
  async pause(id: string, reason: string) {
    const s = await this.get(id);
    if (!s) throw new Error('Unknown source');
    await this.register({ ...s, state: 'paused', reason }, false);
  }
  async schedule(id: string, next: string) {
    if (!Number.isFinite(Date.parse(next))) throw new Error('Invalid schedule');
    await this.db
      .prepare('UPDATE sources SET next_crawl_at=?1 WHERE source_id=?2')
      .bind(next, id)
      .run();
  }
  async duplicateCandidates(raw: string) {
    const u = new URL(normalizeUrl(raw));
    const paths = new Set([
      u.pathname,
      u.pathname.replace(/\/$/, ''),
      `${u.pathname.replace(/\/$/, '')}/`,
    ]);
    const urls = [...paths].flatMap((path) =>
      ['http:', 'https:'].map((protocol) => {
        const candidate = new URL(u);
        candidate.protocol = protocol;
        candidate.pathname = path;
        return candidate.href;
      }),
    );
    const found = await this.db
      .prepare(
        `SELECT DISTINCT record_id FROM registry_urls WHERE kind='source' AND url IN (${urls.map(() => '?').join(',')})`,
      )
      .bind(...urls)
      .all<{ record_id: string }>();
    return found.results.map((row) => row.record_id);
  }
}
export function selectFair(
  sources: Registration[],
  now: string,
  cursor = 0,
  generalBudget = 1,
  vtuberBudget = 0,
  categoryMinimums: Partial<Record<Source['category'], number>> = { local: 1 },
) {
  const due = sources.filter(
    (s) => s.state === 'active' && Date.parse(s.nextCrawlAt) <= Date.parse(now),
  );
  const general: Registration[] = [];
  for (let step = 1; step <= 47 && general.length < generalBudget; step++) {
    const pref = ((cursor + step - 1) % 47) + 1;
    const candidates = due
      .filter((s) => s.prefecture === pref && s.category !== 'vtuber')
      .sort(
        (a, b) =>
          Date.parse(a.lastCrawledAt ?? '1970-01-01') -
            Date.parse(b.lastCrawledAt ?? '1970-01-01') ||
          Date.parse(a.deadlineAt ?? '9999-01-01') -
            Date.parse(b.deadlineAt ?? '9999-01-01') ||
          b.priority - a.priority,
      );
    if (candidates[0]) general.push(candidates[0]);
  }
  // Category floors replace only within an already selected prefecture, preserving geographic rotation.
  for (const [category, minimum] of Object.entries(categoryMinimums)) {
    if (category === 'vtuber') continue;
    let count = general.filter((s) => s.category === category).length;
    for (let i = general.length - 1; i >= 0 && count < (minimum ?? 0); i--) {
      const current = general[i];
      if (!current || current.category === category) continue;
      const replacement = due
        .filter(
          (s) => s.prefecture === current.prefecture && s.category === category,
        )
        .sort((a, b) => b.priority - a.priority)[0];
      if (replacement) {
        general[i] = replacement;
        count++;
      }
    }
  }
  return {
    general,
    vtubers: due
      .filter((s) => s.category === 'vtuber')
      .slice(0, Math.max(0, vtuberBudget)),
    cursor: general.at(-1)?.prefecture ?? cursor,
  };
}
