import { normalizeUrl } from '../registry';
import { inScope, safeUrl } from './policy';
import { comparisonText, dateValue, digest, displayText } from './text';
import {
  type EventCandidate,
  type ImageCandidate,
  type ParseContext,
  RULE_VERSION,
} from './types';
export function relevant(text: string, vtuber = false) {
  return (
    (vtuber
      ? /(?:イベント|オフライン|記念|周年|誕生|特別.*(?:配信|放送)|コラボ|カフェ|ポップアップ|グッズ|予約|申込|延期|中止)/u
      : /(?:天文|天体|星空|観望|観測会|プラネタ|宇宙|ロケット|衛星|惑星|流星|日食|月食|JAXA|特別公開|一般公開|公開講演|休館|再開館|開館|臨時休業|リニューアル)/iu
    ).test(text) && !/(?:職員採用|入札公告|求人情報)/u.test(text)
  );
}
export function officialLink(
  raw: string,
  context: ParseContext,
): string | null {
  try {
    const url = safeUrl(
      new URL(raw, context.baseUrl ?? context.url).href,
      context.source.allowedHosts,
    );
    return inScope(url, context.approval.scopePaths) ? url.href : null;
  } catch {
    return null;
  }
}
export function discoverLink(raw: string, base: string): string | null {
  try {
    return normalizeUrl(new URL(raw, base).href);
  } catch {
    return null;
  }
}
export function imageCandidate(
  raw: string,
  label: string,
  context: ParseContext,
  relation: string,
): ImageCandidate | null {
  try {
    const url = safeUrl(new URL(raw, context.baseUrl ?? context.url).href, [
      ...context.source.allowedHosts,
      ...context.approval.imageHosts,
    ]);
    if (
      !inScope(url, context.approval.scopePaths) &&
      !context.approval.imageHosts.includes(url.hostname)
    )
      return null;
    return {
      url: url.href,
      sourceUrl: context.url,
      type: /ポスター|チラシ|poster/i.test(label)
        ? 'poster'
        : /キービジュアル|キビジュ|key.?visual/i.test(label)
          ? 'key-visual'
          : 'representative',
      relation,
      rightsStatus: 'unknown',
      rightsEvidenceUrl: null,
      attribution: null,
      lastCheckedAt: context.at,
      available: null,
    };
  } catch {
    return null;
  }
}
export async function candidate(
  context: ParseContext,
  input: {
    url: string;
    title: string;
    description: string;
    itemId?: string | null;
    published?: string;
    updated?: string;
    images?: ImageCandidate[];
    dateText?: string;
    venueText?: string;
    author?: string;
  },
): Promise<EventCandidate> {
  const title = displayText(input.title, 512),
    description = displayText(input.description, 600),
    comparisonTitle = comparisonText(title);
  const dateRaw = [
    ...new Set(
      (input.dateText ?? description).match(
        /(?:20\d{2}[年/.-])?\d{1,2}[月/.-]\d{1,2}日?(?:[（(][日月火水木金土][)）])?(?:\s*\d{1,2}[時:]\d{0,2}分?)?/gu,
      ) ?? [],
    ),
  ].slice(0, 10);
  const venueRaw = [
    ...new Set(
      (input.venueText ?? description).match(
        /(?:会場|場所|開催地)\s*[:：]?\s*[^。\n]{1,100}/gu,
      ) ?? [],
    ),
  ].slice(0, 3);
  const id = await digest(
    JSON.stringify([
      context.source.id,
      input.url,
      input.itemId ?? null,
      comparisonTitle,
      dateRaw,
    ]),
  );
  const images = [
    ...new Map(
      (input.images ?? []).map((image) => [image.url, image]),
    ).values(),
  ]
    .sort(
      (a, b) =>
        ['poster', 'key-visual', 'representative', 'facility'].indexOf(a.type) -
        ['poster', 'key-visual', 'representative', 'facility'].indexOf(b.type),
    )
    .slice(0, 2);
  const content = {
    title,
    url: input.url,
    description,
    dateRaw,
    venueRaw,
    published: input.published ?? null,
    updated: input.updated ?? null,
    images: images.map((i) => i.url),
  };
  return {
    id,
    sourceId: context.source.id,
    itemId: input.itemId ?? null,
    originalUrl: context.url,
    officialUrl: input.url,
    title,
    comparisonTitle,
    publishedAt: dateValue(input.published),
    updatedAt: dateValue(input.updated),
    publishedRaw: input.published ?? null,
    author: input.author ? displayText(input.author, 100) : null,
    dateRaw,
    venueRaw,
    description,
    images,
    collectedAt: context.at,
    fingerprint: await digest(JSON.stringify(content)),
    originalType: context.source.format,
    ruleVersion: RULE_VERSION,
    confidence: dateRaw.length ? 'medium' : 'low',
    reviewStatus: 'Review Required',
    evidence: {
      title: { url: context.url, text: title },
      dates: { url: context.url, text: dateRaw.join(' / ') },
      venue: { url: context.url, text: venueRaw.join(' / ') },
    },
  };
}
