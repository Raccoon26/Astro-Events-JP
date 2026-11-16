import { digest } from '../collection/text';
import type { PostKind } from '../domain';
import {
  type DetailedVerifiedEvent,
  type Judgement,
  VERIFICATION_RULE,
} from '../verification/types';
import {
  extractHashtags,
  extractUrls,
  LENGTH_POLICY,
  plain,
  validateLength,
} from './length';
import { formatTemporal, temporalEnd } from './temporal';
import {
  POST_KINDS,
  type PostDraft,
  PostError,
  TEMPLATE_VERSION,
  TEMPLATE_VERSIONS,
} from './types';

const names: Record<PostKind, readonly [string, string]> = {
  observation: ['天体観望会', '星空観察のご案内'],
  'open-day': ['施設公開', '公開イベントのご案内'],
  space: ['宇宙イベント', '宇宙関連イベントのご案内'],
  lecture: ['講演会・公開講座', '講演・講座のご案内'],
  exhibition: ['展示のご案内', '企画展・展示情報'],
  vtuber: ['VTuberイベント', 'VTuber関連イベントのご案内'],
  merchandise: ['グッズ・販売情報', 'グッズ関連のご案内'],
  closure: ['施設運営のお知らせ', '施設からのご案内'],
  reopening: ['開館のお知らせ', '開館に関するご案内'],
  cancellation: ['開催中止のお知らせ', '開催中止のご案内'],
  postponement: ['開催延期のお知らせ', '開催延期のご案内'],
  'applications-open': ['申込開始のお知らせ', '申込受付のご案内'],
  deadline: ['申込締切のご案内', '申込期限のお知らせ'],
};
const tags: Record<PostKind, readonly string[]> = {
  observation: ['天体観望会', '星空観察'],
  'open-day': ['施設公開', '宇宙'],
  space: ['宇宙開発', '宇宙'],
  lecture: ['講演会', '天文イベント'],
  exhibition: ['展示', '科学館'],
  vtuber: ['VTuber'],
  merchandise: ['グッズ'],
  closure: ['施設情報'],
  reopening: ['施設情報'],
  cancellation: ['イベント情報'],
  postponement: ['イベント情報'],
  'applications-open': ['イベント情報'],
  deadline: ['イベント情報'],
};
const leads: Record<PostKind, readonly [string, string]> = {
  observation: ['「%s」の観望会情報です。', '観望会「%s」のご案内です。'],
  'open-day': [
    '「%s」の公開イベント情報です。',
    '公開イベント「%s」のご案内です。',
  ],
  space: [
    '「%s」の宇宙関連イベント情報です。',
    '宇宙イベント「%s」のご案内です。',
  ],
  lecture: ['「%s」の講演・講座情報です。', '講演・講座「%s」のご案内です。'],
  exhibition: ['「%s」の展示情報です。', '展示「%s」のご案内です。'],
  vtuber: [
    '「%s」のイベント情報です。',
    'VTuber関連イベント「%s」のご案内です。',
  ],
  merchandise: ['「%s」のグッズ関連情報です。', 'グッズ関連のご案内：「%s」'],
  closure: [
    '「%s」について、施設からお知らせが出ています。',
    '施設のお知らせ：「%s」',
  ],
  reopening: ['「%s」の開館に関するご案内です。', '開館のお知らせ：「%s」'],
  cancellation: [
    '「%s」の開催中止が発表されました。',
    '開催中止のお知らせ：「%s」',
  ],
  postponement: [
    '「%s」の開催延期が発表されました。',
    '開催延期のお知らせ：「%s」',
  ],
  'applications-open': [
    '「%s」の申込開始に関するお知らせです。',
    '申込開始のご案内：「%s」',
  ],
  deadline: ['「%s」の申込締切のご案内です。', '申込期限のお知らせ：「%s」'],
};
function confirmed<T>(j: Judgement<T>): T | null {
  return j.state === 'confirmed' ? j.value : null;
}
export function variant(key: string) {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function semanticEvent(event: DetailedVerifiedEvent) {
  // capture preserves the persisted attestation clock: no caller edits are exempt.
  return JSON.stringify(event);
}
function hashtags(event: DetailedVerifiedEvent, kind: PostKind) {
  const found: string[] = [];
  for (const judgement of Object.values(event.verification.fields)) {
    if (judgement.state !== 'confirmed') continue;
    for (const e of judgement.evidence) {
      for (const match of e.excerpt.matchAll(
        /^公式(?:ハッシュ)?タグ\s*[:：]\s*([#＃][\p{L}\p{M}\p{N}_]{1,24})\s*$/gmu,
      )) {
        const value = match[1]!.replace(/^＃/, '#');
        const parsed = extractHashtags(value);
        if (
          parsed.length === 1 &&
          `#${parsed[0]}` === value &&
          [...parsed[0]!].length <= 24
        )
          found.push(parsed[0]!);
      }
    }
  }
  const fallback = [...tags[kind]];
  if (
    kind === 'observation' &&
    !/星空|夜/.test(event.title + event.verification.fields.kind.raw.join(' '))
  )
    fallback[1] = '天文イベント';
  // Generic tags describe the actual event, never an inferred institution or fan tag.
  if (
    kind === 'exhibition' &&
    !/科学館/.test(confirmed(event.verification.fields.location)?.venue ?? '')
  )
    fallback.splice(1);
  if (
    kind === 'lecture' &&
    !['astronomy', 'research', 'space-development'].includes(event.category)
  )
    fallback.splice(1);
  if (
    kind === 'open-day' &&
    !['space-development', 'astronomy', 'research'].includes(event.category)
  )
    fallback.splice(1);
  return [...new Set([...found, ...fallback])].slice(0, 2).map((t) => `#${t}`);
}
/** Pure kernel. Its input is NOT a trust boundary: production/CLI callers must use PostStore. */
export async function renderPost(
  event: DetailedVerifiedEvent,
  revision: number,
  kind: PostKind,
  now: number,
  templateVersion: string = TEMPLATE_VERSION,
): Promise<PostDraft> {
  if (!TEMPLATE_VERSIONS.some((v) => v === templateVersion))
    throw new PostError('unsupported-template');
  if (
    !POST_KINDS.includes(kind) ||
    event.verificationStatus !== 'Verified' ||
    !event.verification ||
    event.verification.ruleVersion !== VERIFICATION_RULE
  )
    throw new PostError('not-currently-verified');
  const v = event.verification,
    f = v.fields;
  if (v.kind !== kind || confirmed(f.kind) !== kind)
    throw new PostError('kind-mismatch');
  if (
    !Number.isInteger(revision) ||
    revision < 1 ||
    !Number.isFinite(now) ||
    Date.parse(v.checkedAt) > now ||
    !(Date.parse(v.expiresAt) > now)
  )
    throw new PostError('time-expired');
  if (JSON.stringify(event).length > 120000)
    throw new PostError('unsafe-input');
  const title = plain(confirmed(f.title) ?? ''),
    status = confirmed(f.status);
  // A confirmed raw headline must not bypass structured conditions or carry stale relative claims.
  if (
    /今日|本日|明日|今週末|受付中|締切間近|まもなく締切|残りわずか/u.test(title)
  )
    throw new PostError('date-role-ambiguous');
  if (/無料/u.test(title)) {
    const fees = confirmed(f.fee),
      entranceOnly =
        /入場無料|入館無料/u.test(title) && !/参加無料/u.test(title);
    if (!fees || (entranceOnly ? fees.entrance : fees.participation) !== 'free')
      throw new PostError('not-currently-verified');
  }
  if (/予約不要/u.test(title) && confirmed(f.reservation)?.required !== false)
    throw new PostError('not-currently-verified');
  if (!status || title !== plain(event.title))
    throw new PostError('not-currently-verified');
  const url = new URL(event.officialUrl);
  if (
    [...url.searchParams.keys()].some((key) =>
      /^(?:access_token|api[_-]?key|authorization|auth|token|password|secret)$/i.test(
        key.normalize('NFKC'),
      ),
    )
  )
    throw new PostError('unsafe-input');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    url.href !== event.officialUrl ||
    extractUrls(url.href).length !== 1 ||
    extractUrls(url.href)[0]?.url !== url.href
  )
    throw new PostError('length-uncertain');
  const omitted: PostDraft['omitted'] = [],
    optional: { field: string; text: string }[] = [];
  let validUntil = Date.parse(v.expiresAt);
  const lines: string[] = [],
    shortLines: string[] = [];
  const rawKind = f.kind.raw.join(' '),
    rawStatus = f.status.raw.join(' ');
  let heading =
    names[kind][
      variant(`${event.stableEventId}/${revision}/${kind}/${templateVersion}`) %
        2
    ]!;
  if (kind === 'closure') {
    if (
      /毎週|通常休館|定期休館/.test(rawKind + ' ' + rawStatus) &&
      !/臨時|特別/.test(rawKind + ' ' + rawStatus)
    )
      throw new PostError('kind-mismatch');
    heading = /改修|工事/.test(rawKind)
      ? '改修工事のお知らせ'
      : /臨時休館/.test(rawKind)
        ? '臨時休館のお知らせ'
        : /設備点検/.test(rawKind)
          ? '設備点検のお知らせ'
          : heading;
  }
  if (kind === 'reopening' || kind === 'open-day') {
    if (/夜間開館/.test(rawKind)) heading = '夜間開館のご案内';
    else if (/特別開館/.test(rawKind)) heading = '特別開館のご案内';
    else if (kind === 'reopening')
      heading = /リニューアル/.test(rawKind)
        ? 'リニューアルオープンのお知らせ'
        : '再開館のお知らせ';
  }
  const exceptional = kind === 'cancellation' || kind === 'postponement';
  if (exceptional) {
    if (status.status !== (kind === 'cancellation' ? 'cancelled' : 'postponed'))
      throw new PostError('kind-mismatch');
    lines.push(
      kind === 'cancellation'
        ? '公式に開催中止が発表されました。'
        : '公式に開催延期が発表されました。',
    );
    shortLines.push(
      kind === 'cancellation'
        ? '開催中止が発表されました。'
        : '開催延期が発表されました。',
    );
  } else if (
    ['cancelled', 'postponed', 'ended', 'unknown'].includes(status.status)
  )
    throw new PostError('kind-mismatch');
  const primary = v.primaryDateField;
  if (
    (kind === 'applications-open' && primary !== 'applicationStart') ||
    (kind === 'deadline' && primary !== 'applicationDeadline')
  )
    throw new PostError('date-role-ambiguous');
  const dateField = primary ? f[primary] : null;
  const t = dateField ? confirmed(dateField) : null;
  if (!exceptional && !t) throw new PostError('date-role-ambiguous');
  if (t) {
    let label =
      primary === 'applicationStart'
        ? '申込開始'
        : primary === 'applicationDeadline'
          ? '申込締切'
          : kind === 'closure'
            ? '対象期間'
            : kind === 'reopening'
              ? '開館日'
              : '開催日';
    if (primary === 'schedule' && t.precision === 'month') label = '開催時期';
    else if (primary === 'schedule' && t.precision === 'datetime')
      label = '開催日時';
    else if (primary === 'schedule' && t.endDate) label = '開催期間';
    if (kind === 'merchandise' && primary === 'schedule')
      label = t.endDate || t.endDatetime ? '実施期間' : '実施日';
    if (kind === 'closure')
      label =
        t.endDate || t.endDatetime || t.endMonth ? '対象期間' : '対象開始日';
    if (kind === 'reopening') label = '開館日';
    let use = true;
    if (kind === 'cancellation') {
      use = /当初|変更前|中止対象|開催予定日/.test(t.raw);
      label = '当初の開催予定';
    }
    if (kind === 'postponement') {
      use = /新日程|変更後|延期後|振替/.test(t.raw);
      label = '新たな開催日';
      if (!use && !/未定|調整中/.test(t.raw + ' ' + rawStatus))
        throw new PostError('date-role-ambiguous');
    }
    if (use) {
      const dateText = `${label}：${formatTemporal(t)}`;
      lines.push(dateText);
      shortLines.push(dateText);
      if (!exceptional) {
        validUntil = Math.min(validUntil, temporalEnd(t));
        if (!(validUntil > now)) throw new PostError('time-expired');
      }
    }
    if (t.doorsTime && !exceptional) {
      if (!/^\d{2}:\d{2}$/.test(t.doorsTime))
        throw new PostError('unsafe-input');
      optional.push({ field: 'doorsTime', text: `開場：${t.doorsTime}` });
    }
  }
  if (!exceptional)
    for (const field of [
      'schedule',
      'applicationStart',
      'applicationDeadline',
    ] as const) {
      if (field === primary) continue;
      const extra = confirmed(f[field]);
      if (extra) {
        const label =
          field === 'schedule'
            ? extra.precision === 'datetime'
              ? '開催日時'
              : extra.precision === 'month'
                ? '開催時期'
                : '開催日'
            : field === 'applicationStart'
              ? '申込開始'
              : '申込締切';
        optional.push({ field, text: `${label}：${formatTemporal(extra)}` });
      } else omitted.push({ field, reason: 'not-confirmed' });
    }
  if (
    kind === 'postponement' &&
    /延期日未定|新(?:たな)?(?:開催)?日(?:程)?(?:は)?未定|開催日調整中/.test(
      rawStatus + ' ' + (t?.raw ?? ''),
    )
  ) {
    lines.push('新たな開催日は未定です。');
    shortLines.push('新たな開催日は未定です。');
  }
  const location = confirmed(f.location);
  if (!exceptional) {
    if (!location || (!location.online && !location.venue))
      throw new PostError('not-currently-verified');
    const place = location.online ? 'オンライン' : plain(location.venue!);
    const placeLine = `${location.online ? '形式' : ['closure', 'reopening'].includes(kind) ? '施設' : '会場'}：${place}`;
    lines.push(placeLine);
    shortLines.push(placeLine);
  }
  for (const condition of status.conditional) {
    const line = plain(condition);
    lines.push(line);
    shortLines.push(line);
  }
  if (status.tentative && !exceptional) {
    const planned =
      kind === 'reopening'
        ? '開館予定です。'
        : kind === 'merchandise'
          ? '実施予定です。'
          : '開催予定です。';
    lines.push(planned);
    shortLines.push(planned);
  }
  const reservation = confirmed(f.reservation);
  if (!exceptional && kind !== 'closure' && reservation) {
    const parts: string[] = [];
    if (reservation.required === true)
      parts.push(
        kind === 'merchandise' ? '事前予約が必要です' : '事前申込が必要です',
      );
    else if (reservation.required === false) parts.push('予約不要です');
    if (reservation.method === 'walk-in') parts.push('当日受付です');
    if (reservation.selection === 'first-come') parts.push('先着順です');
    if (reservation.selection === 'lottery') parts.push('抽選制です');
    const reception = reservation.reception;
    if (reception === 'closed') parts.push('申込受付は終了しています');
    if (reception === 'full') parts.push('満席と案内されています');
    if (reception === 'waitlist')
      parts.push('キャンセル待ちと案内されています');
    // Never emit time-dependent "受付中" from a stale optional fact.
    if (parts.length) {
      lines.push(parts.join('。') + '。');
      shortLines.push(parts.join('。') + '。');
    }
    if (reservation.capacity !== null) {
      if (
        !Number.isSafeInteger(reservation.capacity) ||
        reservation.capacity < 1
      )
        throw new PostError('unsafe-input');
      optional.push({
        field: 'capacity',
        text: `定員：${reservation.capacity}名`,
      });
    }
  } else
    omitted.push({
      field: 'reservation',
      reason:
        exceptional || kind === 'closure' ? 'not-relevant' : 'not-confirmed',
    });
  const fee = confirmed(f.fee);
  if (fee && !exceptional && kind !== 'closure') {
    const parts: string[] = [];
    const entranceLabel = /入館/.test(f.fee.raw.join(' '))
      ? '入館料'
      : '入場料';
    if (
      fee.participation === 'free' &&
      !fee.tiers.some((t) => t.scope === 'participation')
    )
      parts.push('参加無料');
    if (
      fee.entrance === 'free' &&
      !fee.tiers.some((t) => t.scope === 'entrance')
    )
      parts.push(entranceLabel === '入館料' ? '入館無料' : '入場無料');
    for (const tier of fee.tiers) {
      if (!Number.isSafeInteger(tier.yen) || tier.yen < 0)
        throw new PostError('unsafe-input');
      parts.push(
        `${tier.scope === 'entrance' ? (['入館料', '入場料'].includes(tier.label) ? tier.label : entranceLabel) : '参加費'} ${['参加費', '入場料', '入館料'].includes(tier.label) ? '' : plain(tier.label)}${tier.yen}円`,
      );
    }
    if (parts.length) optional.push({ field: 'fee', text: parts.join('／') });
    else
      omitted.push({ field: 'fee', reason: 'no-displayable-confirmed-price' });
  } else
    omitted.push({
      field: 'fee',
      reason:
        exceptional || kind === 'closure' ? 'not-relevant' : 'not-confirmed',
    });
  if (kind === 'vtuber' && f.vtuberRelation.state !== 'confirmed')
    throw new PostError('not-currently-verified');
  const selected = hashtags(event, kind);
  const detail =
    (kind === 'closure' ||
      kind === 'reopening' ||
      (kind === 'open-day' && /夜間開館|特別開館/.test(rawKind))) &&
    !title.includes(heading.replace(/のお知らせ|のご案内/gu, ''))
      ? heading
      : '';
  if (detail) shortLines.unshift(detail);
  const compose = (
    compact: boolean,
    blocks: typeof optional,
    selectedTags: string[],
  ) =>
    [
      compact
        ? title
        : `${leads[kind][variant(`${event.stableEventId}/${revision}/${kind}/${templateVersion}`) % 2]!.replace('%s', title)}${detail ? `\n${detail}` : ''}`,
      ...(compact
        ? shortLines
        : exceptional
          ? lines.filter((_, i) => i !== 0)
          : lines),
      ...blocks.map((b) => b.text),
      url.href,
      selectedTags.join(' '),
    ]
      .join('\n')
      .normalize('NFC');
  let text = compose(false, optional, selected),
    compact = false;
  if (!validateLength(text).valid) {
    compact = true;
    text = compose(true, optional, selected);
  }
  while (!validateLength(text).valid && optional.length) {
    const priority: Record<string, number> = {
      doorsTime: 0,
      capacity: 1,
      fee: 2,
      applicationStart: 3,
      schedule: 4,
      applicationDeadline: 5,
    };
    const index = optional.reduce(
      (best, item, i) =>
        (priority[item.field] ?? 0) < (priority[optional[best]!.field] ?? 0)
          ? i
          : best,
      0,
    );
    const removed = optional.splice(index, 1)[0]!;
    omitted.push({ field: removed.field, reason: 'weighted-length-budget' });
    text = compose(compact, optional, selected);
  }
  if (!validateLength(text).valid && selected.length > 1) {
    selected.pop();
    text = compose(compact, optional, selected);
  }
  const length = validateLength(text);
  if (!length.valid || length.remaining === null)
    throw new PostError('essential-info-too-long');
  if (
    extractUrls(text).length !== 1 ||
    extractUrls(text)[0]?.url !== url.href ||
    JSON.stringify(extractHashtags(text).map((t) => `#${t}`)) !==
      JSON.stringify(selected)
  )
    throw new PostError('length-uncertain');
  const id =
    'post-' +
    (await digest(
      JSON.stringify([event.stableEventId, revision, kind, templateVersion]),
    ));
  return {
    id,
    eventId: event.stableEventId,
    eventRevision: revision,
    kind,
    text,
    weightedLength: length.weightedLength,
    remaining: length.remaining,
    hashtags: selected,
    templateVersion,
    lengthPolicy: LENGTH_POLICY,
    omitted,
    validUntil: new Date(validUntil).toISOString(),
  };
}
