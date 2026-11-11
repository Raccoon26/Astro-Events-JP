import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prefectures } from '../src/prefectures';
import { normalizeUrl } from '../src/registry';

const sources = JSON.parse(readFileSync('data/sources.json', 'utf8')) as {
  id: string;
  url: string;
  prefecture: number | null;
  officialStatus: string;
  state: string;
  evidenceUrl: string;
  checkedAt: string;
  verificationMethod: string;
  allowedHosts: string[];
  facilityId?: string;
  vtuberId?: string;
}[];
describe('production seed evidence and references', () => {
  it('covers every prefecture with a primary-verified real official facility source', () => {
    for (const p of prefectures)
      expect(
        sources.some(
          (s) => s.prefecture === p.code && s.officialStatus === 'Verified',
        ),
      ).toBe(true);
    expect(sources.every((s) => s.state !== 'active')).toBe(true);
    for (const s of sources) {
      expect(s.evidenceUrl).toMatch(/^https?:/);
      expect(Number.isFinite(Date.parse(s.checkedAt))).toBe(true);
      if (s.officialStatus === 'Verified')
        expect(s.verificationMethod).not.toBe('official-directory-only');
    }
  });
  it('maintains explicit immutable IDs and exact reviewed host allowlists', () => {
    expect(new Set(sources.map((s) => normalizeUrl(s.url))).size).toBe(
      sources.length,
    );
    for (const s of sources) {
      expect(s.id).toMatch(/^src-[a-f0-9]{24}$/);
      expect(s.allowedHosts).toEqual([new URL(s.url).hostname]);
    }
  });
  it('has explicit many-to-many facility associations and four extensible VTuber identities', () => {
    const facilities = JSON.parse(
      readFileSync('data/facilities.json', 'utf8'),
    ) as { id: string; sourceIds: string[]; operatingStatus: string }[];
    const vtubers = JSON.parse(readFileSync('data/vtubers.json', 'utf8')) as {
      id: string;
      name: string;
      sourceIds: string[];
      accounts: { verified: boolean; evidenceUrl: string }[];
    }[];
    expect(vtubers.map((v) => v.name)).toEqual([
      '宇推くりあ',
      '月女神イチ',
      '猫谷ここな',
      '星見まどか',
    ]);
    for (const s of sources) {
      if (s.facilityId)
        expect(
          facilities.find((f) => f.id === s.facilityId)?.sourceIds,
        ).toContain(s.id);
      if (s.vtuberId)
        expect(vtubers.find((v) => v.id === s.vtuberId)?.sourceIds).toContain(
          s.id,
        );
    }
    expect(facilities.every((f) => f.operatingStatus === 'unknown')).toBe(true);
    expect(
      vtubers
        .find((v) => v.name === '猫谷ここな')
        ?.accounts.every((a) => a.verified),
    ).toBe(false);
  });
  it('keeps generated coverage synchronized with evidence without requiring network in CI', () => {
    const coverage = JSON.parse(readFileSync('data/coverage.json', 'utf8'));
    expect(coverage.sources).toBe(sources.length);
    expect(coverage.verified).toBe(
      sources.filter((s) => s.officialStatus === 'Verified').length,
    );
    for (const p of coverage.prefectures) {
      expect(p.sources).toBe(
        sources.filter((s) => s.prefecture === p.code).length,
      );
    }
  });
});
