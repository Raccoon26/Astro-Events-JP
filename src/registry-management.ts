import { D1SourceRegistry, normalizeUrl, type Registration } from './registry';
export class RegistryManagement {
  constructor(readonly db: D1Database) {}
  async getFacility(id: string) {
    return this.db
      .prepare('SELECT * FROM facilities WHERE facility_id=?1')
      .bind(id)
      .first();
  }
  async listFacilities(prefecture: number) {
    return (
      await this.db
        .prepare(
          'SELECT * FROM facilities WHERE prefecture=?1 ORDER BY facility_id LIMIT 100',
        )
        .bind(prefecture)
        .all()
    ).results;
  }
  async setOperatingStatus(
    id: string,
    status: 'open' | 'closed' | 'renovation' | 'unknown',
    evidenceUrl: string,
  ) {
    normalizeUrl(evidenceUrl);
    await this.db
      .prepare(
        'UPDATE facilities SET operating_status=?1,status_source_url=?2,last_verified_at=?3 WHERE facility_id=?4',
      )
      .bind(status, evidenceUrl, new Date().toISOString(), id)
      .run();
  }
  async linkVtuber(vtuberId: string, sourceId: string) {
    await this.db
      .prepare(
        'INSERT INTO vtuber_sources VALUES(?1,?2) ON CONFLICT DO NOTHING',
      )
      .bind(vtuberId, sourceId)
      .run();
  }
  async facility(
    id: string,
    name: string,
    prefecture: number,
    url: string,
    metadata: Record<string, unknown>,
  ) {
    if (!Number.isInteger(prefecture) || prefecture < 1 || prefecture > 47)
      throw new Error('Invalid prefecture');
    url = normalizeUrl(url);
    const owner = await this.db
      .prepare(
        "SELECT record_id FROM registry_urls WHERE kind='facility' AND url=?1",
      )
      .bind(url)
      .first<string>('record_id');
    if (owner && owner !== id) throw new Error('Duplicate facility');
    await this.db.batch([
      this.db
        .prepare(
          'INSERT INTO facilities(facility_id,facility_name,prefecture,official_url) VALUES(?1,?2,?3,?4) ON CONFLICT(facility_id) DO UPDATE SET facility_name=excluded.facility_name,official_url=excluded.official_url,prefecture=excluded.prefecture',
        )
        .bind(id, name, prefecture, url),
      this.db
        .prepare(
          'INSERT INTO registry_metadata VALUES(?1,?2,?3) ON CONFLICT(kind,record_id) DO UPDATE SET payload=excluded.payload',
        )
        .bind('facility', id, JSON.stringify(metadata)),
      this.db
        .prepare(
          "INSERT INTO registry_urls VALUES('facility',?1,?2) ON CONFLICT DO NOTHING",
        )
        .bind(url, id),
    ]);
  }
  async linkFacility(facilityId: string, sourceId: string) {
    await this.db
      .prepare(
        'INSERT INTO facility_sources VALUES(?1,?2) ON CONFLICT DO NOTHING',
      )
      .bind(facilityId, sourceId)
      .run();
  }
  async candidate(
    url: string,
    from: string,
    prefecture: number | null,
    category: string,
  ) {
    url = normalizeUrl(url);
    if (
      prefecture !== null &&
      (!Number.isInteger(prefecture) || prefecture < 1 || prefecture > 47)
    )
      throw new Error('Invalid prefecture');
    if (
      ![
        'astronomy',
        'space-development',
        'research',
        'local',
        'facility',
        'vtuber',
      ].includes(category)
    )
      throw new Error('Invalid category');
    await this.db
      .prepare(
        'INSERT INTO discovery_candidates(candidate_id,canonical_url,discovered_from,prefecture,category,reason,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(canonical_url) DO NOTHING',
      )
      .bind(
        url,
        url,
        from,
        prefecture,
        category,
        'Await official/access review',
        new Date().toISOString(),
      )
      .run();
  }
  async decide(
    url: string,
    state: 'approved' | 'rejected' | 'unsupported',
    source?: Registration,
    reason = source?.reason ?? `Manual ${state}`,
  ) {
    if (
      !(await this.db
        .prepare(
          'SELECT candidate_id FROM discovery_candidates WHERE canonical_url=?1',
        )
        .bind(normalizeUrl(url))
        .first())
    )
      throw new Error('Unknown candidate');
    if (state === 'approved') {
      if (!source || normalizeUrl(source.officialUrl) !== normalizeUrl(url))
        throw new Error('Reviewed source required');
      if (source.state !== 'active')
        throw new Error('Approval requires complete collection review');
      const registry = new D1SourceRegistry(this.db);
      await registry.register(source);
      const approved = await registry.get(source.id);
      if (
        approved?.state !== 'active' ||
        normalizeUrl(approved.officialUrl) !== normalizeUrl(url)
      )
        throw new Error(
          'Existing source requires explicit manual update before approval',
        );
    }
    await this.db
      .prepare(
        'UPDATE discovery_candidates SET state=?1,reviewed_at=?2,reason=?4 WHERE canonical_url=?3',
      )
      .bind(state, new Date().toISOString(), normalizeUrl(url), reason)
      .run();
  }
  async vtuber(
    id: string,
    name: string,
    accounts: { url: string; evidenceUrl: string; verified: boolean }[],
    aliases: string[],
  ) {
    for (const account of accounts) {
      normalizeUrl(account.url);
      normalizeUrl(account.evidenceUrl);
      const owner = await this.db
        .prepare(
          "SELECT record_id FROM registry_urls WHERE kind='vtuber' AND url=?1",
        )
        .bind(normalizeUrl(account.url))
        .first<string>('record_id');
      if (owner && owner !== id) throw new Error('Duplicate VTuber account');
    }
    const verified = accounts.length > 0 && accounts.every((a) => a.verified);
    await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO vtubers(vtuber_id,name,official_accounts_json,verification_status,enabled,last_verified_at) VALUES(?1,?2,?3,?4,0,?5) ON CONFLICT(vtuber_id) DO UPDATE SET name=excluded.name,official_accounts_json=excluded.official_accounts_json,verification_status=excluded.verification_status,last_verified_at=excluded.last_verified_at,enabled=CASE WHEN excluded.verification_status='Verified' THEN vtubers.enabled ELSE 0 END",
        )
        .bind(
          id,
          name,
          JSON.stringify(accounts),
          verified ? 'Verified' : 'Review Required',
          new Date().toISOString(),
        ),
      this.db
        .prepare(
          'INSERT INTO registry_metadata VALUES(?1,?2,?3) ON CONFLICT(kind,record_id) DO UPDATE SET payload=excluded.payload',
        )
        .bind('vtuber', id, JSON.stringify({ aliases, accounts })),
      ...accounts.map((account) =>
        this.db
          .prepare(
            "INSERT INTO registry_urls VALUES('vtuber',?1,?2) ON CONFLICT DO NOTHING",
          )
          .bind(normalizeUrl(account.url), id),
      ),
    ]);
  }
}
