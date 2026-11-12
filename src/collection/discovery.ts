import type {
  CollectedPage,
  Collector,
  DiscoveryCandidate,
  SourceDiscovery,
} from '../contracts';
import type { Category, Source } from '../domain';
import { normalizeUrl } from '../registry';
import { digest } from './text';
import type { ParsedDocument } from './types';
/** Optional facade for the original DEV00 contract; the orchestrator uses equivalent atomic inserts. */
export class CollectionDiscovery implements SourceDiscovery {
  constructor(
    readonly db: D1Database,
    readonly collector: Collector,
    readonly parse: (page: CollectedPage) => Promise<ParsedDocument>,
    readonly category: Category = 'local',
  ) {}
  async discover(source: Source): Promise<DiscoveryCandidate[]> {
    const page = await this.collector.collect(
      source,
      AbortSignal.timeout(15000),
    );
    if (!page) return [];
    const parsed = await this.parse(page);
    return parsed.discoveries.map((d) => ({
      url: d.url,
      discoveredFrom: d.from,
      prefecture: source.prefecture,
      reason: d.relation,
    }));
  }
  async submit(candidate: DiscoveryCandidate) {
    const url = normalizeUrl(candidate.url);
    await this.db
      .prepare(
        'INSERT INTO discovery_candidates(candidate_id,canonical_url,discovered_from,prefecture,category,reason,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(canonical_url) DO NOTHING',
      )
      .bind(
        await digest(url),
        url,
        candidate.discoveredFrom,
        candidate.prefecture,
        this.category,
        candidate.reason.slice(0, 512),
        new Date().toISOString(),
      )
      .run();
  }
}
