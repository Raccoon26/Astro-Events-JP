import { describe, expect, it } from 'vitest';
import { parseDocument } from '../src/collection/parse';
import { decodeDocument } from '../src/collection/text';
import { context, htmlFixture } from './collection-fixtures';

const rss = (body: string) =>
  `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>fixture</title>${body}</channel></rss>`;
const item =
  '<item><title>星空観望会</title><link>https://example.jp/event/1</link><guid>id1</guid><description><![CDATA[<b>宇宙</b>を見よう 2026年12月1日]]></description><pubDate>Sun, 01 Nov 2026 00:00:00 GMT</pubDate><media:thumbnail url="/poster.jpg"/></item>';
const atom = (body: string) =>
  `<feed xmlns="http://www.w3.org/2005/Atom">${body}</feed>`;
const entry =
  '<entry><id>unique</id><title>宇宙公開講演</title><link rel="self" href="/api"/><link rel="alternate" type="text/html" href="/lecture"/><published>2026-11-01T12:00:00+09:00</published><updated>2026-11-02T00:00:00Z</updated><summary>宇宙の話</summary></entry>';
it('resolves approved HTML base paths and ignores a hostile base without changing original provenance', async () => {
  const safe = await parseDocument(
    '<base href="https://example.jp/events/"><li><a href="one">星空観望会</a></li>',
    context('html'),
  );
  expect(safe.candidates[0]?.officialUrl).toBe('https://example.jp/events/one');
  expect(safe.candidates[0]?.originalUrl).toBe(context('html').url);
  const hostile = await parseDocument(
    '<base href="https://attacker.test/"><li><a href="/events/one">星空観望会</a></li>',
    context('html'),
  );
  expect(hostile.candidates[0]?.officialUrl).toBe(
    'https://example.jp/events/one',
  );
});
describe('bounded RSS and Atom candidates', () => {
  it('parses RSS items, namespaces, enclosure, dates and deduplicates guid', async () => {
    const parsed = await parseDocument(
      rss(
        item +
          item +
          item.replaceAll('id1', 'id2').replaceAll('/event/1', '/event/2'),
      ),
      context('rss'),
    );
    expect(parsed.candidates).toHaveLength(2);
    expect(parsed.candidates[0]).toMatchObject({
      itemId: 'id1',
      publishedAt: '2026-11-01T00:00:00.000Z',
      reviewStatus: 'Review Required',
      dateRaw: ['2026年12月1日'],
    });
    expect(parsed.candidates[0]?.images[0]?.rightsStatus).toBe('unknown');
  });
  it('does not turn publication time into event time; missing links and bad dates are safe', async () => {
    const result = await parseDocument(
      rss(
        item.replace(/<link>.*?<\/link>/, '') +
          item
            .replace(/<pubDate>.*?<\/pubDate>/, '<pubDate>invalid</pubDate>')
            .replace('2026年12月1日', ''),
      ),
      context('rss'),
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.publishedAt).toBeNull();
    expect(result.candidates[0]?.dateRaw).toEqual([]);
    expect(result.candidates[0]?.description).not.toContain('<b>');
  });
  it('caps feed output and description without dropping original Japanese titles', async () => {
    const text = item.replace('を見よう', 'あ'.repeat(4000));
    const ctx = context('rss');
    ctx.limits.maxItems = 1;
    const result = await parseDocument(
      rss(text + item.replace('id1', 'id2')),
      ctx,
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(result.candidates[0]?.description.length).toBeLessThanOrEqual(600);
  });
  it('parses Atom alternate links, published/updated and duplicate IDs', async () => {
    const result = await parseDocument(atom(entry + entry), context('atom'));
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      officialUrl: 'https://example.jp/lecture',
      publishedAt: '2026-11-01T03:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
    });
  });
  it('supports namespace prefixes and XHTML content without running anything', async () => {
    const xml = atom(
      entry.replace(
        '<summary>宇宙の話</summary>',
        '<content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">星空のお話</div></content>',
      ),
    )
      .replaceAll('<entry>', '<a:entry xmlns:a="http://www.w3.org/2005/Atom">')
      .replaceAll('</entry>', '</a:entry>');
    expect(
      (await parseDocument(xml, context('atom'))).candidates[0]?.description,
    ).toContain('星空');
  });
  it.each([
    '<rss><channel><item></rss>',
    '<!DOCTYPE rss [<!ENTITY x "boom">]><rss>&x;</rss>',
    '<!DOCTYPE rss SYSTEM "https://example.jp/private"><rss/>',
    '<feed xmlns="http://www.w3.org/2005/Atom"><entry>&unknown;</entry></feed>',
  ])('rejects malformed XML/entities %s', async (xml) => {
    await expect(parseDocument(xml, context('rss'))).rejects.toMatchObject({
      code: 'parse-error',
    });
  });
  it('rejects excessive XML nesting and oversized documents', async () => {
    await expect(
      parseDocument(
        rss(
          '<item>' + '<x>'.repeat(60) + '星空' + '</x>'.repeat(60) + '</item>',
        ),
        context('rss'),
      ),
    ).rejects.toMatchObject({ code: 'parse-error' });
    const ctx = context('rss');
    ctx.limits.maxBytes = 50;
    await expect(parseDocument(rss(item), ctx)).rejects.toMatchObject({
      code: 'body-too-large',
    });
  });
});
describe('HTML extraction and official image provenance', () => {
  it('finds multiple event cards, raw dates/venue and never executes scripts', async () => {
    const result = await parseDocument(htmlFixture, context());
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.title).toBe('星空観望会 & 宇宙講座');
    expect(result.candidates[0]?.venueRaw[0]).toContain('市民天文台');
    expect(
      (globalThis as Record<string, unknown>).unsafeExecuted,
    ).toBeUndefined();
    expect(result.discoveries.some((d) => d.format === 'rss')).toBe(true);
  });
  it('supports configurable selectors for tables and malformed cards', async () => {
    const ctx = context();
    ctx.rules = {
      itemSelector: 'tr',
      linkSelector: 'a',
      titleSelector: '.title',
      dateSelector: '.date',
      venueSelector: '.venue',
    };
    const result = await parseDocument(
      '<table><tr><td class="title">宇宙講演</td><td><a href="/one">詳細</a><td class="date">12月2日<td class="venue">会場：公民館</table>',
      ctx,
    );
    expect(result.candidates[0]).toMatchObject({
      title: '宇宙講演',
      dateRaw: ['12月2日'],
    });
  });
  it('supports a detail-page adapter and ranks poster before metadata images', async () => {
    const ctx = context();
    ctx.rules = { detailPage: true };
    const result = await parseDocument(
      htmlFixture.replace('<ul>', '<h1>星空観望会</h1><ul>'),
      ctx,
    );
    expect(result.candidates[0]?.images[0]).toMatchObject({
      type: 'poster',
      url: 'https://example.jp/poster.jpg',
      rightsStatus: 'unknown',
      available: null,
    });
    expect(
      result.candidates[0]?.images.some((i) => i.relation === 'page-metadata'),
    ).toBe(true);
  });
  it('extracts twitter cards, relative poster links and retains events without images', async () => {
    const ctx = context();
    ctx.rules = { detailPage: true };
    const result = await parseDocument(
      '<h1>星空観察会</h1><meta name="twitter:image" content="/twitter.jpg"><a href="/flyer.png">ポスター</a><img src="http://127.0.0.1/a">',
      ctx,
    );
    expect(result.candidates[0]?.images).toHaveLength(2);
    expect(
      (await parseDocument('<h1>星空観察会</h1>', ctx)).candidates[0]?.images,
    ).toEqual([]);
  });
  it('filters ordinary VTuber streams while retaining anniversaries and goods', async () => {
    const ctx = context();
    ctx.source.category = 'vtuber';
    const output = await parseDocument(
      '<ul><li><a href="/normal">今日も雑談配信</a><li><a href="/special">周年記念グッズ予約</a></ul>',
      ctx,
    );
    expect(output.candidates).toHaveLength(1);
  });
  it('uses separate comparison normalization and preserves editions', async () => {
    const ctx = context();
    const output = await parseDocument(
      '<li><a href="/same">２０２６年　星空観察会</a></li><li><a href="/same">２０２７年　星空観察会</a></li>',
      ctx,
    );
    expect(output.candidates).toHaveLength(2);
    expect(output.candidates[0]?.title).toContain('２０２６');
    expect(output.candidates[0]?.comparisonTitle).toContain('2026');
    expect(output.candidates[0]?.id).not.toBe(output.candidates[1]?.id);
  });
  it('rejects untrusted selector complexity, oversized/deep HTML and JS-only shells', async () => {
    const ctx = context();
    ctx.rules = { itemSelector: 'a:has(a)' };
    await expect(parseDocument(htmlFixture, ctx)).rejects.toMatchObject({
      code: 'parse-error',
    });
    await expect(
      parseDocument('<div>'.repeat(60), context()),
    ).rejects.toMatchObject({ code: 'parse-error' });
    await expect(
      parseDocument(
        '<div id="app"></div><script src="app.js"></script>',
        context(),
      ),
    ).rejects.toMatchObject({ code: 'unsupported-format' });
  });
});
describe('bounded sitemap and Japanese decoding', () => {
  it('parses urlsets and lastmod as advisory metadata, filtering unrelated URLs', async () => {
    const result = await parseDocument(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.jp/events/宇宙</loc><lastmod>2026-12-01</lastmod></url><url><loc>https://example.jp/shop</loc></url></urlset>',
      context('sitemap'),
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.publishedAt).toBeNull();
  });
  it('deduplicates sitemap indexes and caps output without following any URLs', async () => {
    const ctx = context('sitemap');
    ctx.limits.maxLinks = 2;
    const row =
      '<sitemap><loc>https://example.jp/sitemap.xml</loc><lastmod>2026-01-01</lastmod></sitemap>';
    const result = await parseDocument(
      '<sitemapindex>' + row.repeat(10) + '</sitemapindex>',
      ctx,
    );
    expect(result.sitemaps).toEqual([
      { url: 'https://example.jp/sitemap.xml', lastmod: '2026-01-01' },
    ]);
    expect(result.truncated).toBe(true);
  });
  it('decodes UTF8, Shift_JIS, meta/XML labels and rejects damaged bytes/unsupported encodings', () => {
    expect(
      decodeDocument(
        new Uint8Array([0x93, 0x56, 0x95, 0xb6]),
        'text/html; charset=Shift_JIS',
      ),
    ).toBe('天文');
    expect(
      decodeDocument(
        new TextEncoder().encode('<meta charset="UTF-8">星空'),
        'text/html',
      ),
    ).toContain('星空');
    expect(() => decodeDocument(new Uint8Array([0xff]), 'text/html')).toThrow();
    expect(() =>
      decodeDocument(new Uint8Array([0xc3, 0x28]), 'text/html'),
    ).toThrow();
    expect(() =>
      decodeDocument(new Uint8Array([65]), 'text/html; charset=made-up'),
    ).toThrow();
  });
});
