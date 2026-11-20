import { describe, expect, it } from 'vitest';
import {
  candidateOrder,
  municipalityKey,
  ready,
  regionOrder,
  surveyKind,
} from '../src/nationwide/policy';
import { simulateSurvey } from '../src/nationwide/simulator';
import { buildWeekend, type Member, weekend } from '../src/nationwide/weekend';
import { validateLength } from '../src/posts/length';
import { sourceFixture } from './collection-fixtures';

const now = Date.parse('2026-11-20T23:30:00+09:00');
describe('bounded nationwide selection and source evidence', () => {
  it('rotates all 47 regions despite Tokyo/Kanagawa/Osaka skew, starvation risk, rate limits and restarts', () => {
    const a = simulateSurvey(410),
      b = simulateSurvey(410, { restart: false });
    expect(a).toEqual(b);
    expect(a.starved).toEqual([]);
    expect(a.regionalVisits).toHaveLength(47);
    expect(
      Math.max(...a.regionalVisits) - Math.min(...a.regionalVisits),
    ).toBeLessThanOrEqual(1);
    expect(a.maximumGapHours).toBeLessThan(180);
    expect(a.backoffs).toBeGreaterThan(0);
    expect(a.budgetDeferredTicks).toBeGreaterThan(0);
    expect(Object.values(a.categories).every((n) => n > 0)).toBe(true);
    expect(a.vtuberSelections).toBeGreaterThan(0);
    expect(a.externalRequests).toBe(0);
  });
  it('increases opportunity with region age and uses scarcity only as a tie break', () => {
    const base = {
      registered: 47,
      official: 7,
      municipalities: 5,
      recentFinds: 1,
      lastOpportunity: now,
    };
    expect(
      regionOrder(
        [
          { ...base, code: 13, lastOpportunity: now - 86400000 },
          { ...base, code: 47, official: 1 },
        ],
        0,
        now,
      )[0]!.code,
    ).toBe(13);
    expect(
      regionOrder(
        [
          { ...base, code: 13 },
          { ...base, code: 47, official: 1 },
        ],
        0,
        now,
      )[0]!.code,
    ).toBe(47);
  });
  it('reports an empty region and category rather than synthesizing coverage', () => {
    const run = simulateSurvey(165, { emptyRegion: 47, emptyKind: 'lecture' });
    expect(run.starved).toEqual([47]);
    expect(run.regionalVisits[46]).toBeGreaterThan(0);
    expect(run.regionalSelections[46]).toBe(0);
    expect(run.categoryLane.lecture).toBe(0);
    expect(run.categoryEmpty).toBeGreaterThan(0);
  });
  it.each([
    ['9:益子町', 9, ' 益子 '],
    ['25:甲賀市', 25, '甲賀市水口町'],
    ['13:益子', 13, '益子'],
    ['15:柏崎市', 15, '柏崎市'],
  ])('scopes Japanese aliases to the prefecture (%s)', (key, code, alias) => {
    expect(municipalityKey(code as number, alias as string)).toBe(key);
  });
  it('keeps public review/unsupported outside planning and waits for due dates and minimum intervals', () => {
    const source = sourceFixture();
    expect(ready(source, now)).toBe(true);
    for (const state of ['review', 'unsupported', 'paused'] as const)
      expect(ready({ ...source, state }, now)).toBe(false);
    expect(
      ready({ ...source, nextCrawlAt: new Date(now + 1).toISOString() }, now),
    ).toBe(false);
    expect(
      ready(
        { ...source, lastCrawledAt: new Date(now - 1000).toISOString() },
        now,
      ),
    ).toBe(false);
  });
  it('prioritizes official changes within a band, then near deadlines, and uses stable ties', () => {
    const base = {
      id: 'z',
      municipality: null,
      kind: 'observatory',
      category: 'astronomy' as const,
      lastCrawledAt: null,
      deadline: null,
      officialChange: false,
      failures: 0,
    };
    expect(
      candidateOrder(
        [
          base,
          { ...base, id: 'b', deadline: new Date(now + 1000).toISOString() },
          { ...base, id: 'c', officialChange: true },
          { ...base, id: 'a' },
        ],
        now,
        null,
      ).map((x) => x.id),
    ).toEqual(['c', 'b', 'a', 'z']);
    expect(surveyKind({ category: 'local', kind: 'photo-course' })).toBe(
      'practice',
    );
    expect(surveyKind({ category: 'research', kind: 'university' })).toBe(
      'lecture',
    );
    expect(surveyKind({ category: 'vtuber', kind: 'observatory' })).toBe(
      'vtuber',
    );
  });
});
describe('JST weekends and X text policy', () => {
  it.each([
    ['2026-11-20T14:59:59Z', '2026-11-21', '2026-11-28'],
    ['2026-11-22T14:59:59Z', '2026-11-21', '2026-11-28'],
    ['2026-11-22T15:00:00Z', '2026-11-28', '2026-12-05'],
    ['2026-12-31T18:00:00Z', '2027-01-02', '2027-01-09'],
  ])(
    'computes this and next weekend in Asia/Tokyo across boundaries (%s)',
    (iso, thisSat, nextSat) => {
      expect(weekend(Date.parse(iso), 0).saturday).toBe(thisSat);
      expect(weekend(Date.parse(iso), 1).saturday).toBe(nextSat);
    },
  );
  const m: Member = {
    eventId: 'a',
    revision: 1,
    decisionId: 'd',
    fingerprint: 'x',
    validUntil: '2026-11-22T15:00:00Z',
    date: '2026年11月21日',
    duration: false,
    days: '土',
    title: '合成星空観察会 🌌',
    venue: '合成公民館',
    url: 'https://example.jp/test',
    prefecture: 1,
    category: 'local',
    terms: ['要事前申込'],
  };
  it('packs independent messages with official weighted length, stable event keys and intact URL/emoji', () => {
    const extra = Array.from({ length: 7 }, (_, i) => ({
      ...m,
      eventId: 'b' + i,
      url: 'https://example.jp/weekend/' + i,
      title: '星を観察する会' + 'あ'.repeat(46),
    }));
    const plan = buildWeekend([m, m, ...extra], 'nationwide');
    expect(plan.parts).toHaveLength(3);
    expect(
      plan.parts.flatMap((p) => p.members).filter((x) => x.eventId === 'a'),
    ).toHaveLength(1);
    for (const p of plan.parts) {
      expect(validateLength(p.body)).toMatchObject({
        valid: true,
        weightedLength: p.weightedLength,
      });
      expect(p.weightedLength).toBeLessThanOrEqual(280);
      expect(p.members.every((n) => p.body.includes(n.url))).toBe(true);
    }
    expect(plan.omitted.length).toBeGreaterThan(0);
  });
  it('omits a too-large essential notice without shortening facts or URLs', () => {
    expect(
      buildWeekend(
        [{ ...m, title: '字'.repeat(250), terms: ['参加費500円'] }],
        'local',
      ),
    ).toEqual({ parts: [], omitted: ['a'] });
  });
});
