import { describe, expect, it } from 'vitest';
import { digest } from '../src/collection/text';
import { parseFees } from '../src/verification/conditions';
import { bounded } from '../src/verification/evidence';
import {
  CandidateEventValidator,
  candidateToEvent,
} from '../src/verification/validator';
import { verificationFixture } from './verification-fixtures';

async function run(f: Awaited<ReturnType<typeof verificationFixture>>) {
  const v = new CandidateEventValidator(f.ctx, f.packet, () =>
    Date.parse(f.ctx.now),
  );
  const result = await v.validate(await candidateToEvent(f.ctx));
  return { result, verified: v.verify(result) };
}
describe('synthetic independent institutional and local event attestations; zero real events', () => {
  it.each([
    [
      'JAXA 合成一般公開',
      '一般公開',
      '茨城県合成宇宙センター',
      'JAXA（合成テスト）',
    ],
    [
      '国立天文台 合成講演',
      '公開講演',
      '東京都合成会場',
      '国立天文台（合成テスト）',
    ],
    [
      'NIPR 合成公開',
      '研究施設一般公開',
      '東京都合成研究棟',
      'NIPR（合成テスト）',
    ],
    [
      'JAMSTEC 合成セミナー',
      '公開セミナー',
      'オンライン開催',
      'JAMSTEC（合成テスト）',
    ],
    ['合成大学 惑星科学講座', '惑星科学講座', '新潟県合成大学', '合成大学'],
    ['町立合成天文台 観望会', '天体観望会', '長野県合成町', '合成町教育委員会'],
    ['合成科学館 宇宙特別展', '宇宙特別展', '愛媛県合成科学館', '合成科学館'],
    ['合成図書館 星空講座', '星空講座', '鳥取県合成図書館', '合成図書館'],
    [
      '合成公民館 市民観望会',
      '市民天体観望会',
      '宮崎県合成公民館',
      '合成市民天文同好会',
    ],
  ])(
    '%s preserves its own organizer, place and evidence',
    async (title, kind, location, organizer) => {
      const f = await verificationFixture({ title, kind, location, organizer });
      const r = await run(f);
      expect(r.result.reasons).toEqual([]);
      expect(r.verified?.organizer).toBe(organizer);
      expect(
        r.verified?.verification.fields.location.evidence[0]?.excerpt,
      ).toBe(location);
    },
  );
  it('allows a verified VTuber special fan event but keeps unverified Koko and ordinary streams pending', async () => {
    for (const id of ['宇推くりあ', '月女神イチ', '星見まどか', '猫谷ここな']) {
      const f = await verificationFixture({
        title: `${id} 合成記念ファンイベント`,
        kind: 'ファンイベント',
        vtuberRelation: `${id} 公式出演（合成）`,
      });
      f.ctx.source.category = 'vtuber';
      f.packet.vtuberIds = [id];
      f.ctx.vtubers = [
        {
          id,
          linked: true,
          status: id === '猫谷ここな' ? 'Review Required' : 'Verified',
        },
      ];
      expect((await run(f)).result.event.verificationStatus).toBe(
        id === '猫谷ここな' ? 'Review Required' : 'Verified',
      );
    }
    const daily = await verificationFixture({
      title: '合成VTuber 雑談定期配信',
      kind: 'ファンイベント',
      vtuberRelation: '合成公式出演',
    });
    daily.ctx.source.category = 'vtuber';
    daily.packet.vtuberIds = ['synthetic'];
    daily.ctx.vtubers = [{ id: 'synthetic', linked: true, status: 'Verified' }];
    expect((await run(daily)).result.reasons).toContain(
      'ordinary-stream-out-of-scope',
    );
  });
});
describe('current document and evidence boundaries', () => {
  it('requires the VTuber relationship even when the announcement comes from a general facility source', async () => {
    const f = await verificationFixture({
      kind: '特別配信',
      vtuberRelation: '宇推くりあ 公式特別出演（合成）',
    });
    expect((await run(f)).result.reasons).toContain(
      'vtuber-official-relationship-unconfirmed',
    );
    f.packet.vtuberIds = ['synthetic-clear'];
    f.ctx.vtubers = [
      { id: 'synthetic-clear', linked: true, status: 'Verified' },
    ];
    expect((await run(f)).verified).not.toBeNull();
    f.ctx.vtubers[0]!.status = 'Review Required';
    expect((await run(f)).verified).toBeNull();
  });
  it('cannot reapprove an orphaned old candidate after a new document version omits it', async () => {
    const f = await verificationFixture();
    f.ctx.documents[0]!.changedAt = '2026-11-12T00:00:01.000Z';
    expect((await run(f)).result.reasons).toContain(
      'candidate-not-observed-in-current-document',
    );
    f.ctx.documents[0]!.changedAt = f.ctx.candidate.collectedAt;
    expect((await run(f)).verified).not.toBeNull();
  });
  it('stores confirmed timestamps in UTC while preserving Japanese date and date-only precision', async () => {
    const f = await verificationFixture({
      schedule: '開催日2026年11月23日 00:30〜01:30',
      applicationDeadline: '申込締切2026年11月20日 12:00',
    });
    const { result } = await run(f);
    expect(result.event.startDatetime).toBe('2026-11-22T15:30:00.000Z');
    expect(result.event.startDate).toBe('2026-11-23');
    expect(result.event.applicationDeadline).toBe('2026-11-20T03:00:00.000Z');
    expect(result.fields.schedule.value?.startDatetime).toContain('+09:00');
  });
  it('separates application opening and deadlines from the underlying event date', async () => {
    for (const [kind, field] of [
      ['募集開始', 'applicationStart'],
      ['申込締切', 'applicationDeadline'],
    ] as const) {
      const f = await verificationFixture({
        kind,
        schedule: null,
        [field]: `${kind}2026年11月20日`,
      });
      const r = await run(f);
      expect(r.verified).not.toBeNull();
      expect(r.result.primaryDateField).toBe(field);
      expect(r.result.event.startDatetime).toBeNull();
      expect(r.result.fields[field].value?.startDate).toBe('2026-11-20');
    }
  });
  it('rejects oversize, recursive, prototype-bearing, control-character and deep JSON', () => {
    const circular: unknown[] = [];
    circular.push(circular);
    let deep: unknown = 1;
    for (let i = 0; i < 16; i++) deep = { deep };
    for (const value of [
      circular,
      deep,
      'x'.repeat(9000),
      '\u0000',
      JSON.parse('{"__proto__":1}'),
      Array(101).fill(1),
    ])
      expect(() => bounded(value)).toThrow('invalid-input');
  });
  it('does not assign ambiguous admission price tiers to event participation', () => {
    expect(parseFees('入場無料 大人500円').state).toBe('ambiguous');
    expect(parseFees('入場無料 参加費500円').value?.participation).toBe('paid');
  });
  it('requires current, contextual excerpts, not only an official-looking URL', async () => {
    const f = await verificationFixture();
    f.packet.relationship.confirmed = false;
    expect((await run(f)).verified).toBeNull();
    f.packet.relationship.confirmed = true;
    f.packet.documents[0]!.text = 'unrelated';
    f.packet.documents[0]!.digest = await digest('unrelated');
    expect((await run(f)).result.event.verificationStatus).toBe('Blocked');
  });
});
