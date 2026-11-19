import { describe, expect, it } from 'vitest';
import {
  assertCopy,
  link,
  markdown,
  renderMessages,
  splitManagement,
} from '../src/notifications/messages';
import { POST_KINDS } from '../src/posts/types';
import { notificationFixture } from './notification-fixtures';

describe('synthetic Telegram copy and separate management/private report', () => {
  it.each(POST_KINDS)(
    '%s retains the complete Japanese post byte-for-byte',
    async (kind) => {
      const f = await notificationFixture(kind),
        before = new TextEncoder().encode(f.delivery.copyText);
      const report = await renderMessages(f.event, f.delivery);
      expect(new TextEncoder().encode(f.delivery.copyText)).toEqual(before);
      expect(report.issue.body).toContain(f.delivery.copyText);
      expect(report.management.join('\n')).not.toContain(f.delivery.copyText);
      expect(report.management.every((t) => t.length <= 4096)).toBe(true);
      expect(report.issue.body).toContain('Verified');
      for (const field of [
        '행사',
        '종류',
        '개최일',
        '장소',
        '도도부현',
        '주최자',
        '공식 URL',
        '예약',
        '요금',
        '신청 시작',
        '신청 마감',
        '검증 만료',
        'revision',
        '최초 발견',
        '게시 상태',
        'Telegram 전달 상태',
      ])
        expect(report.management.join('\n')).toContain(field);
    },
  );
  it('does not accept fake copy length or text alterations', async () => {
    const f = await notificationFixture();
    f.delivery.copyText += ' fake';
    expect(() => assertCopy(f.delivery)).toThrow('COPY_MISMATCH');
    f.delivery.copyText = f.delivery.metadata.post.text;
    f.delivery.metadata.post.weightedLength++;
    expect(() => assertCopy(f.delivery)).toThrow('COPY_MISMATCH');
  });
  it('splits only management lines, preserves emoji and rejects oversized single fields', () => {
    expect(splitManagement(['月'.repeat(2048), '星'.repeat(2048)])).toEqual([
      '月'.repeat(2048),
      '星'.repeat(2048),
    ]);
    expect(splitManagement(['x'.repeat(4096)])).toHaveLength(1);
    expect(() => splitManagement(['x'.repeat(4097)])).toThrow('FIELD_LIMIT');
    expect(
      splitManagement(['👨‍👩‍👧‍👦'.repeat(100), 'test'], 1500).join('\n'),
    ).toBe('👨‍👩‍👧‍👦'.repeat(100) + '\ntest');
  });
  it('escapes mentions/Markdown and blocks HTML and unsafe URLs without fetching', () => {
    expect(markdown('@everyone [click](https://example.jp)')).not.toContain(
      '@everyone',
    );
    expect(markdown('[title]')).toContain('\\[');
    for (const url of [
      'http://example.jp',
      'https://127.0.0.1',
      'https://localhost',
      'https://example.jp:8443',
      'https://user:pass@example.jp',
      'javascript:alert(1)',
      'https://example.jp/?token=secret',
    ])
      expect(() => link(url)).toThrow('UNSAFE_URL');
    expect(() => markdown('<script>alert(1)</script>')).toThrow('UNSAFE_TEXT');
  });
  it.each(['unknown', 'prohibited', 'permitted'] as const)(
    'keeps %s image rights as links, never bytes/upload instructions',
    async (rights) => {
      const f = await notificationFixture();
      f.event.verification.images = [
        {
          imageUrl: 'https://example.jp/poster.png',
          imageSourceUrl: 'https://example.jp/event',
          imageType: 'poster',
          imageRightsStatus: rights,
          rightsEvidenceUrl:
            rights === 'permitted' ? 'https://example.jp/license' : null,
          imageAttribution: '合成施設',
          imageLastCheckedAt: null,
          available: false,
        },
      ];
      f.delivery.metadata.images = f.event.verification.images;
      const r = await renderMessages(f.event, f.delivery);
      expect(r.issue.body).toContain(rights);
      expect(r.issue.body).toContain('<https://example.jp/poster.png>');
      expect(r.issue.body).not.toContain('![');
      expect(r.management.join('\n')).toContain('자동 첨부하지 않음');
    },
  );
  it('refuses permitted images without evidence while an image-free event remains supported', async () => {
    const f = await notificationFixture();
    const r = await renderMessages(f.event, f.delivery);
    expect(r.management.join(' ')).toContain('이미지');
    f.delivery.metadata.images = [
      {
        imageUrl: 'https://example.jp/p.png',
        imageSourceUrl: 'https://example.jp',
        imageType: 'poster',
        imageRightsStatus: 'permitted',
        rightsEvidenceUrl: null,
        imageAttribution: null,
        imageLastCheckedAt: null,
      },
    ];
    await expect(renderMessages(f.event, f.delivery)).rejects.toThrow(
      'RIGHTS_EVIDENCE_MISSING',
    );
  });
});
