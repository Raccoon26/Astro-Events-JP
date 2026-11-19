import { safeUrl } from '../collection/policy';
import { digest } from '../collection/text';
import type { Report } from '../domain';
import {
  containsPostSecret,
  hasSafeJoiners,
  scalarText,
  validateLength,
} from '../posts/length';
import type { PostDelivery } from '../posts/types';
import type { DetailedVerifiedEvent } from '../verification/types';
import { MANAGEMENT_VERSION, managementLines } from './management';
import { NotificationError, REPORT_VERSION } from './types';

export function bounded(value: unknown, max = 65536) {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    throw new NotificationError('INVALID_INPUT');
  }
  if (!text || text.length > max) throw new NotificationError('INPUT_LIMIT');
  return text;
}
export function text(value: unknown, max = 1200) {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value !== 'string') value = JSON.stringify(value);
  if (typeof value !== 'string' || value.length > max)
    throw new NotificationError('FIELD_LIMIT');
  try {
    scalarText(value);
    const cleaned = value
      .normalize('NFC')
      .replace(/[\s\u00a0\u3000]+/gu, ' ')
      .trim();
    if (
      !cleaned ||
      cleaned.length > max ||
      /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u00ad\u061c\u200b\u200c\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/u.test(
        value,
      ) ||
      containsPostSecret(cleaned) ||
      !hasSafeJoiners(cleaned)
    )
      throw Error();
    return cleaned.replaceAll('@', '＠');
  } catch {
    throw new NotificationError('UNSAFE_TEXT');
  }
}
export function link(value: string) {
  try {
    safeUrl(value, [new URL(value).hostname]);
    if (!hasSafeJoiners(decodeURIComponent(value))) throw Error();
    return new URL(value).href;
  } catch {
    throw new NotificationError('UNSAFE_URL');
  }
}
export function markdown(value: string) {
  return text(value, 8192)
    .replaceAll('@', '＠')
    .replace(/[\\`*_{}\[\]()#+.!|~<>]/g, '\\$&');
}
export function splitManagement(lines: string[], limit = 4096) {
  if (!Number.isInteger(limit) || limit < 128 || limit > 4096)
    throw new NotificationError('MESSAGE_LIMIT');
  const out: string[] = [];
  let current = '';
  for (const line of lines) {
    if (line.length > limit) throw new NotificationError('FIELD_LIMIT');
    if (current && current.length + 1 + line.length > limit) {
      out.push(current);
      current = '';
    }
    current += (current ? '\n' : '') + line;
  }
  if (current) out.push(current);
  if (out.length > 8 || !out.length)
    throw new NotificationError('MESSAGE_LIMIT');
  return out;
}
function issueTitle(value: string) {
  const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
  let result = '';
  for (const { segment } of segmenter.segment(value)) {
    if (result.length + segment.length > 200) break;
    result += segment;
  }
  return result;
}
export function assertCopy(delivery: PostDelivery) {
  bounded(delivery);
  const copy = delivery.copyText,
    p = delivery.metadata.post;
  const measured = validateLength(copy);
  if (
    !measured.valid ||
    measured.weightedLength > 280 ||
    copy !== p.text ||
    measured.weightedLength !== p.weightedLength ||
    copy.length > 4096
  )
    throw new NotificationError('COPY_MISMATCH');
}
export function makeReport(
  event: DetailedVerifiedEvent,
  delivery: PostDelivery,
  publicationStatus: Report['publicationStatus'] = 'pending',
  changes: readonly string[] = [],
): Report {
  return {
    event,
    post: delivery.metadata.post,
    images: event.verification.images,
    evidence: evidenceOf(event),
    changes,
    publicationStatus,
  };
}
function evidenceOf(event: DetailedVerifiedEvent) {
  const all = Object.values(event.verification.fields).flatMap(
    (f) => f.evidence,
  );
  return [...new Map(all.map((e) => [JSON.stringify(e), e])).values()];
}
export async function renderMessages(
  event: DetailedVerifiedEvent,
  delivery: PostDelivery,
  publicationStatus: Report['publicationStatus'] = 'pending',
  telegramState = 'pending',
  changes: readonly string[] = [],
  version = REPORT_VERSION,
) {
  assertCopy(delivery);
  const m = delivery.metadata,
    v = event.verification;
  const evidence = evidenceOf(event);
  if (changes.length > 5) throw new NotificationError('INPUT_LIMIT');
  link(m.officialUrl);
  if (m.images.length > 16 || evidence.length > 64)
    throw new NotificationError('INPUT_LIMIT');
  const lines = [
    '【天文・宇宙イベント管理】',
    `행사: ${text(event.title)}`,
    `종류: ${m.post.kind}`,
    `개최일/기간: ${text(JSON.stringify(v.fields.schedule.value))}`,
    `일정 기준: ${v.primaryDateField ?? 'unknown'}`,
    `장소: ${text(event.venue)}`,
    `도도부현/시정촌: ${event.prefecture ?? 'unknown'} / ${text(event.municipality)}`,
    `주최자: ${text(event.organizer)}`,
    `공식 URL: ${link(event.officialUrl)}`,
    `예약: ${v.fields.reservation.state} ${text(JSON.stringify(v.fields.reservation.value))}`,
    `요금: ${v.fields.fee.state} ${text(JSON.stringify(v.fields.fee.value))}`,
    `신청 시작: ${v.fields.applicationStart.state} ${text(JSON.stringify(v.fields.applicationStart.value))}`,
    `신청 마감: ${v.fields.applicationDeadline.state} ${text(JSON.stringify(v.fields.applicationDeadline.value))}`,
    `행사 상태: ${event.status} / ${v.fields.status.state}`,
    `검증: Verified`,
    `확인 시각: ${m.checkedAt}`,
    `검증 만료: ${m.expiresAt}`,
    `revision: ${m.eventRevision}`,
    `X 가중 길이: ${m.post.weightedLength}/280`,
    `태그: ${m.post.hashtags.join(' ')}`,
    `게시 상태: ${publicationStatus}`,
    `Telegram 전달 상태(작성 시점): ${telegramState}`,
    `최초 발견: ${event.firstSeenAt}`,
    `변경 정보: 현재 검증 revision ${m.eventRevision}`,
    '재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음',
  ];
  for (const change of changes)
    lines.push('공식 변경 이력: ' + text(change, 1800));
  for (const image of m.images) {
    lines.push(
      `이미지: ${link(image.imageUrl)}`,
      `출처: ${link(image.imageSourceUrl)}`,
      `이미지 유형/생존: ${image.imageType} / ${image.available ?? 'unknown'}`,
      `사용 권리: ${image.imageRightsStatus}`,
      `크레딧: ${text(image.imageAttribution)}`,
      `권리 근거: ${image.rightsEvidenceUrl ? link(image.rightsEvidenceUrl) : 'unknown'}`,
      '재업로드: 자동 첨부하지 않음; 구체적인 이용 범위는 사람의 재확인 필요',
    );
    if (image.imageRightsStatus === 'permitted' && !image.rightsEvidenceUrl)
      throw new NotificationError('RIGHTS_EVIDENCE_MISSING');
  }
  if (!m.images.length) lines.push('이미지: 없음; 공식 출처 링크 확인');
  for (const impact of m.impacts)
    lines.push(
      `시설 영향: ${text(JSON.stringify(impact))} (행사 취소 추정 금지)`,
    );
  const marker = `<!-- astro-events-jp:event:${await digest(event.stableEventId)} -->`;
  const fence = '`'.repeat(
    Math.max(
      3,
      ...[...delivery.copyText.matchAll(/`+/g)].map((x) => x[0].length + 1),
    ),
  );
  const issueLines = [
    marker,
    `보고서 버전: ${REPORT_VERSION}`,
    ...lines.map((l) => {
      const url = /^(공식 URL|이미지|출처|권리 근거): (https:\/\/.*)$/.exec(l);
      return url ? `${markdown(url[1]!)}: <${link(url[2]!)}>` : markdown(l);
    }),
    '',
    '### X 복사용 본문',
    '',
    fence + 'text',
    delivery.copyText,
    fence,
    '',
    '### 검증 근거',
  ];
  for (const e of evidence)
    issueLines.push(
      `- ${markdown(text(e.field))}: ${markdown(text(e.excerpt, 1600))} — <${link(e.sourceUrl)}> (${markdown(text(e.checkedAt))})`,
    );
  const body = issueLines.join('\n');
  if (body.length > 50000) throw new NotificationError('ISSUE_LIMIT');
  return {
    management: splitManagement(
      version === MANAGEMENT_VERSION
        ? managementLines(event, lines, publicationStatus)
        : lines,
      3800,
    ),
    issue: {
      title: issueTitle('天文・宇宙 ' + text(event.title)),
      body,
    },
    marker,
  };
}
