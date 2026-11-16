import { describe, expect, it } from 'vitest';
import { validateLength } from '../src/posts/length';
import { renderPost } from '../src/posts/render';
import { formatTemporal } from '../src/posts/temporal';
import { parseFees } from '../src/verification/conditions';
import { examples, POST_NOW, postFixture } from './post-fixtures';

describe('all thirteen deterministic Japanese templates, synthetic facts only', () => {
  it('does not let a relative raw headline or unchecked free/booking claim bypass confirmed fields', async () => {
    for (const title of [
      '合成観望会 受付中',
      '明日の合成観望会',
      '参加無料 合成観望会',
      '予約不要 合成観望会',
    ]) {
      const f = await postFixture('observation', {
        title,
        fee: null,
        reservation: null,
      });
      await expect(
        renderPost(f.event, 1, 'observation', POST_NOW),
      ).rejects.toThrow();
    }
  });
  it('preserves separately labelled museum and event admission charges', async () => {
    const f = await postFixture('observation', {
        fee: '入館料500円 / 入場料200円',
      }),
      p = await renderPost(f.event, 1, 'observation', POST_NOW);
    expect(p.text).toContain('入館料 500円');
    expect(p.text).toContain('入場料 200円');
  });
  it.each(['大人500円 / 小学生0円', '小学生0円 / 大人500円'])(
    'retains paid/zero tiers without claiming universal free admission: %s',
    async (raw) => {
      expect(parseFees(raw)).toMatchObject({
        state: 'confirmed',
        value: { participation: 'paid' },
      });
      const f = await postFixture('observation', { fee: raw }),
        p = await renderPost(f.event, 1, 'observation', POST_NOW);
      expect(p.text).toContain('大人500円');
      expect(p.text).toContain('小学生0円');
      expect(p.text).not.toContain('参加無料');
    },
  );
  it('does not classify product prices as participation fees, and supports explicit colon scopes', () => {
    expect(parseFees('商品価格500円').state).toBe('ambiguous');
    expect(parseFees('参加費：500円')).toMatchObject({
      state: 'confirmed',
      value: {
        participation: 'paid',
        tiers: [{ label: '参加費', yen: 500, scope: 'participation' }],
      },
    });
  });
  it.each(examples)('$kind', async ({ kind }) => {
    const { event } = await postFixture(kind),
      p = await renderPost(event, 1, kind, POST_NOW);
    expect(p).toEqual(await renderPost(event, 1, kind, POST_NOW));
    expect(p.text).toContain(event.title);
    expect(p.text).toContain(event.officialUrl);
    expect(p.hashtags.length).toBeGreaterThanOrEqual(1);
    expect(p.hashtags.length).toBeLessThanOrEqual(2);
    expect(validateLength(p.text)).toMatchObject({
      valid: true,
      weightedLength: p.weightedLength,
    });
    expect(p.text).not.toMatch(
      /大人気|必見|貴重な機会|誰でも|残りわずか|開催決定/,
    );
    expect(p.text).not.toContain('管理');
  });
  it('never substitutes entrance-free for participation-free or guesses unknown booking', async () => {
    const { event } = await postFixture('lecture');
    const p = await renderPost(event, 1, 'lecture', POST_NOW);
    expect(p.text).toContain('入場無料');
    expect(p.text).not.toContain('参加無料');
    expect(p.text).not.toContain('予約不要');
    expect(p.text).toContain('オンライン');
  });
  it('keeps every confirmed participant tier together', async () => {
    const { event } = await postFixture('observation', {
      title: '合成会',
      fee: '大人500円 / 小学生200円',
      reservation: null,
    });
    const p = await renderPost(event, 1, 'observation', POST_NOW);
    expect(p.text).toContain('大人500円');
    expect(p.text).toContain('小学生200円');
  });
  it('uses application role instead of event date, without unproven urgency', async () => {
    const { event } = await postFixture('deadline'),
      p = await renderPost(event, 1, 'deadline', POST_NOW);
    expect(p.text).toContain('申込締切：2026年11月20日');
    expect(p.text).not.toMatch(/受付中|まもなく|開催日：2026年11月20日/);
    await expect(
      renderPost(event, 1, 'deadline', Date.parse('2026-11-21T00:00:00+09:00')),
    ).rejects.toThrow();
  });
  it('preserves date/month precision and explicit opening time', async () => {
    const f = await postFixture('exhibition', {
      schedule: '開催期間2026年11月',
    });
    expect(
      (await renderPost(f.event, 1, 'exhibition', POST_NOW)).text,
    ).toContain('開催時期：2026年11月');
    expect(
      (await renderPost(f.event, 1, 'exhibition', POST_NOW)).text,
    ).not.toContain('00:00');
    const d = await postFixture('observation', {
      schedule: '開催日2026年11月23日',
    });
    expect(
      (await renderPost(d.event, 1, 'observation', POST_NOW)).text,
    ).toContain('開催日：2026年11月23日\n');
  });
  it('does not turn conditional bad weather into confirmed cancellation', async () => {
    const { event } = await postFixture('observation', {
      status: '開催予定。雨天中止',
    });
    const p = await renderPost(event, 1, 'observation', POST_NOW);
    expect(p.text).toContain('雨天中止');
    expect(p.text).not.toContain('開催中止が発表');
    await expect(
      renderPost(event, 1, 'cancellation', POST_NOW),
    ).rejects.toThrow('kind-mismatch');
  });
  it('keeps unknown image rights out of the copy text', async () => {
    const { event } = await postFixture();
    event.verification.images.push({
      imageUrl: 'https://example.jp/image.jpg',
      imageSourceUrl: event.officialUrl,
      imageType: 'poster',
      imageRightsStatus: 'unknown',
      imageAttribution: null,
      rightsEvidenceUrl: null,
      imageLastCheckedAt: null,
    });
    expect(
      (await renderPost(event, 1, 'observation', POST_NOW)).text,
    ).not.toMatch(/画像|再投稿|image.jpg/);
  });
  it.each(['Review Required', 'Blocked'])('refuses %s', async (status) => {
    const { event } = await postFixture();
    Object.assign(event, { verificationStatus: status });
    await expect(
      renderPost(event, 1, 'observation', POST_NOW),
    ).rejects.toThrow();
  });
  it('refuses expiry, obsolete rules, unknown template versions and mismatched primary roles', async () => {
    const { event } = await postFixture();
    await expect(
      renderPost(
        event,
        1,
        'observation',
        Date.parse(event.verification.expiresAt),
      ),
    ).rejects.toThrow('time-expired');
    await expect(
      renderPost(event, 1, 'observation', POST_NOW, 'unregistered'),
    ).rejects.toThrow('unsupported-template');
    event.verification.ruleVersion = 'obsolete';
    await expect(
      renderPost(event, 1, 'observation', POST_NOW),
    ).rejects.toThrow();
  });
  it('reconstructs whole optional blocks and fails rather than truncate essential data', async () => {
    const { event } = await postFixture();
    event.title = '星'.repeat(180);
    event.verification.fields.title.value = event.title;
    await expect(renderPost(event, 1, 'observation', POST_NOW)).rejects.toThrow(
      'essential-info-too-long',
    );
    event.title = '合成観望会';
    event.verification.fields.title.value = event.title;
    event.verification.fields.fee.value!.tiers = [
      { label: '参加条件'.repeat(80), yen: 500, scope: 'participation' },
    ];
    const p = await renderPost(event, 1, 'observation', POST_NOW);
    expect(p.omitted).toContainEqual({
      field: 'fee',
      reason: 'weighted-length-budget',
    });
    expect(p.text).toContain('事前申込が必要');
    expect(p.text).toContain(event.officialUrl);
  });
  it('distinguishes template and event revisions without random output', async () => {
    const { event } = await postFixture(),
      a = await renderPost(event, 1, 'observation', POST_NOW),
      b = await renderPost(event, 2, 'observation', POST_NOW),
      c = await renderPost(event, 1, 'observation', POST_NOW, 'ja-v1.1');
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
  });
  it.each([
    ['予約不要', '予約不要です'],
    ['当日受付', '当日受付です'],
    ['先着順', '先着順です'],
    ['抽選', '抽選制です'],
    ['受付終了', '申込受付は終了しています'],
    ['満席', '満席と案内されています'],
    ['キャンセル待ち', 'キャンセル待ちと案内されています'],
  ])(
    'preserves confirmed reservation fact %s without guessing web booking',
    async (raw, expected) => {
      const f = await postFixture('observation', { reservation: raw });
      const p = await renderPost(f.event, 1, 'observation', POST_NOW);
      expect(p.text).toContain(expected);
      if (raw === '先着順' || raw === '抽選')
        expect(p.text).not.toContain('事前申込が必要');
    },
  );
  it('retains direct cancellation date only with its original-date role', async () => {
    const f = await postFixture('cancellation', {
      schedule: '当初の開催予定日2026年11月23日',
    });
    const p = await renderPost(f.event, 1, 'cancellation', POST_NOW);
    expect(p.text).toContain('当初の開催予定：2026年11月23日');
    expect(p.text).not.toContain('開催予定です');
  });
  it('rejects conditional postponement, unknown year and unconfirmed VTuber relations at verification', async () => {
    await expect(
      postFixture('postponement', { status: '延期の可能性' }),
    ).rejects.toThrow();
    await expect(
      postFixture('observation', { schedule: '11月23日' }),
    ).rejects.toThrow();
    const f = await postFixture('vtuber');
    f.event.verification.fields.vtuberRelation.state = 'unknown';
    await expect(renderPost(f.event, 1, 'vtuber', POST_NOW)).rejects.toThrow();
  });
  it('prioritizes only explicit official hashtag evidence and refuses embedded text injection', async () => {
    const f = await postFixture();
    const e = f.event.verification.fields.kind.evidence[0]!;
    f.event.verification.fields.kind.evidence.push({
      ...e,
      excerpt: '公式ハッシュタグ：#合成宇宙会',
    });
    const p = await renderPost(f.event, 1, 'observation', POST_NOW);
    expect(p.hashtags[0]).toBe('#合成宇宙会');
    f.event.verification.fields.title.value = '星空 #unrelated';
    f.event.title = '星空 #unrelated';
    await expect(
      renderPost(f.event, 1, 'observation', POST_NOW),
    ).rejects.toThrow('unsafe-input');
  });
  it('uses both deterministic prose variants over independent revisions without duplicate dates', async () => {
    const f = await postFixture();
    const outputs = await Promise.all(
      [1, 2, 3, 4].map((revision) =>
        renderPost(f.event, revision, 'observation', POST_NOW),
      ),
    );
    expect(new Set(outputs.map((p) => p.text.split('\n')[0])).size).toBe(2);
    for (const p of outputs)
      expect(p.text.split('2026年11月23日')).toHaveLength(2);
  });
  it('rejects invalid date precision and preserves cross-midnight dates in JST', () => {
    expect(() =>
      formatTemporal({
        precision: 'date',
        startDate: '2026-02-30',
        endDate: null,
        startMonth: null,
        endMonth: null,
        startDatetime: null,
        endDatetime: null,
        doorsTime: null,
        raw: '',
      }),
    ).toThrow();
    expect(
      formatTemporal({
        precision: 'datetime',
        startDatetime: '2026-11-23T14:30:00Z',
        endDatetime: '2026-11-23T16:00:00Z',
        startDate: null,
        endDate: null,
        startMonth: null,
        endMonth: null,
        doorsTime: null,
        raw: '',
      }),
    ).toBe('2026年11月23日 23:30〜2026年11月24日 01:00');
  });
  it('refuses credential-bearing URL parameters and unsupported URL recognition', async () => {
    const f = await postFixture();
    f.event.officialUrl = 'https://example.jp/events?access_token=synthetic';
    await expect(
      renderPost(f.event, 1, 'observation', POST_NOW),
    ).rejects.toThrow('unsafe-input');
    f.event.officialUrl = 'https://localhost/event';
    await expect(
      renderPost(f.event, 1, 'observation', POST_NOW),
    ).rejects.toThrow('length-uncertain');
  });
});
