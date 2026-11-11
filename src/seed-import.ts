import {
  D1SourceRegistry,
  normalizeUrl,
  type Registration,
  validateRegistration,
} from './registry';
import { RegistryManagement } from './registry-management';
export interface FacilitySeed {
  id: string;
  name: string;
  prefecture: number;
  municipality: string | null;
  officialUrl: string;
  operator: string | null;
  kind: string;
  sourceIds: string[];
}
export interface VtuberSeed {
  id: string;
  name: string;
  aliases: string[];
  accounts: { url: string; evidenceUrl: string; verified: boolean }[];
  sourceIds: string[];
}
export interface CandidateSeed {
  url: string;
  discoveredFrom: string;
  prefecture: number | null;
  category: string;
  state: 'rejected' | 'unsupported';
  reason?: string;
}
export function validateSeed(
  sources: Registration[],
  facilities: FacilitySeed[],
  vtubers: VtuberSeed[],
) {
  const unique = (values: string[]) => {
    if (new Set(values).size !== values.length)
      throw new Error('Duplicate seed identifier/URL');
  };
  unique(sources.map((s) => s.id));
  unique(sources.map((s) => normalizeUrl(s.officialUrl)));
  unique(facilities.map((f) => f.id));
  unique(facilities.map((f) => normalizeUrl(f.officialUrl)));
  unique(vtubers.map((v) => v.id));
  unique(vtubers.flatMap((v) => v.accounts.map((a) => normalizeUrl(a.url))));
  for (const s of sources) validateRegistration(s);
  for (const f of facilities) {
    normalizeUrl(f.officialUrl);
    if (!f.id || !f.name || !f.kind)
      throw new Error('Invalid facility metadata');
    if (
      !Number.isInteger(f.prefecture) ||
      f.prefecture < 1 ||
      f.prefecture > 47
    )
      throw new Error('Invalid facility prefecture');
  }
  for (const v of vtubers) {
    if (!v.id || !v.name || v.aliases.some((a) => typeof a !== 'string'))
      throw new Error('Invalid VTuber metadata');
    for (const a of v.accounts) {
      normalizeUrl(a.evidenceUrl);
      if (typeof a.verified !== 'boolean')
        throw new Error('Invalid account verification');
    }
  }
  for (const entity of [...facilities, ...vtubers])
    for (const id of entity.sourceIds)
      if (!sources.some((s) => s.id === id))
        throw new Error('Missing source reference');
}
/** Local-only orchestration. Each new source and its facility link is an atomic D1 batch.
 * Completed units survive a later failure; retry inserts only missing units, never overwrites operational rows. */
export async function importRegistrySeed(
  db: D1Database,
  sources: Registration[],
  facilities: FacilitySeed[],
  vtubers: VtuberSeed[],
  apply = false,
  candidates: CandidateSeed[] = [],
) {
  validateSeed(sources, facilities, vtubers);
  for (const candidate of candidates) {
    normalizeUrl(candidate.url);
    if (
      candidate.prefecture !== null &&
      (!Number.isInteger(candidate.prefecture) ||
        candidate.prefecture < 1 ||
        candidate.prefecture > 47)
    )
      throw new Error('Invalid candidate prefecture');
    if (
      ![
        'astronomy',
        'space-development',
        'research',
        'local',
        'facility',
        'vtuber',
      ].includes(candidate.category)
    )
      throw new Error('Invalid candidate category');
    if (!['rejected', 'unsupported'].includes(candidate.state))
      throw new Error('Candidates cannot be auto approved');
  }
  const identity = await db
    .prepare(
      'SELECT environment,database_name FROM deployment_identity WHERE singleton=1',
    )
    .first<{ environment: string; database_name: string }>();
  if (
    identity?.environment !== 'staging' ||
    identity.database_name !== 'astro-events-jp-staging'
  )
    throw new Error('Seed import requires explicit local staging identity');
  const registry = new D1SourceRegistry(db);
  const management = new RegistryManagement(db);
  const preview: {
    id: string;
    url: string;
    state: string;
    operation: string;
  }[] = [];
  let inserted = 0,
    existing = 0;
  // No writes, including metadata/identity changes, in dry-run mode.
  for (const s of sources) {
    if (
      await db
        .prepare('SELECT source_id FROM sources WHERE source_id=?1')
        .bind(s.id)
        .first()
    ) {
      existing++;
      continue;
    }
    if (
      await db
        .prepare('SELECT source_id FROM sources WHERE official_url=?1')
        .bind(normalizeUrl(s.officialUrl))
        .first()
    )
      throw new Error(
        'Existing URL belongs to another ID; manual reconciliation required',
      );
    preview.push({
      id: s.id,
      url: s.officialUrl,
      state: s.state,
      operation: 'insert',
    });
    await registry.assertUnique(s);
  }
  const relatedPreview: { kind: string; id: string; operation: string }[] = [];
  for (const f of facilities) {
    const existingFacility = await db
      .prepare('SELECT facility_id FROM facilities WHERE official_url=?1')
      .bind(normalizeUrl(f.officialUrl))
      .first<string>('facility_id');
    if (existingFacility && existingFacility !== f.id)
      throw new Error('Existing facility URL belongs to another ID');
    if (
      !(await db
        .prepare('SELECT facility_id FROM facilities WHERE facility_id=?1')
        .bind(f.id)
        .first())
    )
      relatedPreview.push({
        kind: 'facility',
        id: f.id,
        operation: 'insert-with-source',
      });
  }
  for (const v of vtubers)
    if (
      !(await db
        .prepare('SELECT vtuber_id FROM vtubers WHERE vtuber_id=?1')
        .bind(v.id)
        .first())
    )
      relatedPreview.push({
        kind: 'vtuber',
        id: v.id,
        operation: 'insert-disabled',
      });
  for (const candidate of candidates)
    if (
      !(await db
        .prepare(
          'SELECT candidate_id FROM discovery_candidates WHERE canonical_url=?1',
        )
        .bind(normalizeUrl(candidate.url))
        .first())
    )
      relatedPreview.push({
        kind: 'candidate',
        id: candidate.url,
        operation: candidate.state,
      });
  if (!apply)
    return { mode: 'dry-run', inserted, existing, preview, relatedPreview };
  for (const candidate of candidates) {
    if (
      !(await db
        .prepare(
          'SELECT candidate_id FROM discovery_candidates WHERE canonical_url=?1',
        )
        .bind(normalizeUrl(candidate.url))
        .first())
    ) {
      await management.candidate(
        candidate.url,
        candidate.discoveredFrom,
        candidate.prefecture,
        candidate.category,
      );
      await management.decide(
        candidate.url,
        candidate.state,
        undefined,
        candidate.reason ?? 'Seed review decision',
      );
    }
  }
  for (const v of vtubers)
    if (
      !(await db
        .prepare('SELECT vtuber_id FROM vtubers WHERE vtuber_id=?1')
        .bind(v.id)
        .first())
    )
      await management.vtuber(v.id, v.name, v.accounts, v.aliases);
  for (const s of sources) {
    const related: D1PreparedStatement[] = [];
    for (const f of facilities.filter((f) => f.sourceIds.includes(s.id))) {
      related.push(
        db
          .prepare(
            'INSERT INTO facilities(facility_id,facility_name,prefecture,municipality,official_url) VALUES(?1,?2,?3,?4,?5) ON CONFLICT DO NOTHING',
          )
          .bind(
            f.id,
            f.name,
            f.prefecture,
            f.municipality,
            normalizeUrl(f.officialUrl),
          ),
      );
      related.push(
        db
          .prepare(
            "INSERT INTO registry_metadata VALUES('facility',?1,?2) ON CONFLICT DO NOTHING",
          )
          .bind(f.id, JSON.stringify(f)),
      );
      related.push(
        db
          .prepare(
            "INSERT INTO registry_urls VALUES('facility',?1,?2) ON CONFLICT DO NOTHING",
          )
          .bind(normalizeUrl(f.officialUrl), f.id),
      );
      related.push(
        db
          .prepare(
            'INSERT INTO facility_sources VALUES(?1,?2) ON CONFLICT DO NOTHING',
          )
          .bind(f.id, s.id),
      );
    }
    for (const v of vtubers.filter((v) => v.sourceIds.includes(s.id)))
      related.push(
        db
          .prepare(
            'INSERT INTO vtuber_sources VALUES(?1,?2) ON CONFLICT DO NOTHING',
          )
          .bind(v.id, s.id),
      );
    if (await registry.register(s, true, related)) inserted++;
  }
  return { mode: 'apply', inserted, existing, preview, relatedPreview };
}
