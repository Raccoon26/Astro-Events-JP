import { judgement } from './temporal';
import type { Fees, Reservation, StatusFact } from './types';

export function parseFees(raw: string) {
  const text = raw.normalize('NFKC');
  const value: Fees = {
    participation: 'unknown',
    entrance: 'unknown',
    tiers: [],
  };
  if (!text.trim()) return judgement<Fees>(raw, null);
  if (
    /\.\d+\s*円|[-−]\s*\d+\s*円|約\s*\d|円(?:以上|以下|から)|程度|予定|別料金|別途|割引|会員|無料.{0,4}(?:ではありません|ではない|でない)|未定|調整中|(?:費|料)\s*-\s*\d/u.test(
      text,
    )
  )
    return judgement(raw, value, 'ambiguous', ['fee-negated-or-undecided']);
  if (/参加(?:費)?無料/u.test(text)) value.participation = 'free';
  if (/入(?:場|館)(?:料)?無料/u.test(text)) value.entrance = 'free';
  for (const match of text.matchAll(
    /(参加費|入場料|入館料|大人|小学生|中学生|高校生|子ども|子供|一般|学生)?\s*([\d,]+)円/gu,
  )) {
    const label = match[1] ?? '未分類';
    if (/入(?:場|館)(?:料)?無料/u.test(text) && !/参加費/u.test(label))
      return judgement(raw, value, 'ambiguous', ['fee-scope-unclear']);
    const entranceContext = /入場料|入館料|入場料金|入館料金/u.test(text);
    if (
      entranceContext &&
      /参加費/u.test(text) &&
      !/参加費|入場料|入館料/u.test(label)
    )
      return judgement(raw, value, 'ambiguous', ['fee-scope-unclear']);
    const scope =
      /入場料|入館料/u.test(label) ||
      (entranceContext && !/参加費/u.test(label))
        ? 'entrance'
        : 'participation';
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(match[2] ?? ''))
      return judgement(raw, value, 'ambiguous', ['unsupported-fee']);
    const yen = Number(match[2]?.replaceAll(',', ''));
    if (!Number.isSafeInteger(yen) || yen > 10000000)
      return judgement(raw, value, 'ambiguous', ['unsupported-fee']);
    if (
      value.tiers.some(
        (t) => t.label === label && t.scope === scope && t.yen !== yen,
      )
    )
      return judgement(raw, value, 'conflicting', ['fee-tier-conflict']);
    value.tiers.push({ label, yen, scope });
    if (value[scope] === 'free' && yen > 0)
      return judgement(raw, value, 'conflicting', ['free-and-paid-conflict']);
    value[scope] = yen > 0 ? 'paid' : 'free';
  }
  if (value.participation === 'unknown' && value.entrance === 'unknown')
    return judgement(raw, value, 'ambiguous', ['fee-scope-unclear']);
  return judgement(raw, value);
}
export function parseReservation(raw: string) {
  const text = raw.normalize('NFKC');
  const value: Reservation = {
    required: null,
    method: null,
    selection: null,
    capacity: null,
    reception: null,
  };
  if (!text.trim()) return judgement<Reservation>(raw, null);
  if (
    /不要では|必須では|必要では|要(?:事前)?予約では|抽選.{0,6}(?:しない|行いません|なし)|未定|調整中/u.test(
      text,
    )
  )
    return judgement(raw, value, 'ambiguous', [
      'reservation-negated-or-undecided',
    ]);
  const required = /要(?:事前)?予約|事前予約(?:が)?必要|予約必須/u.test(text),
    unnecessary = /予約不要|予約(?:は)?必要ありません/u.test(text);
  if (required && unnecessary)
    return judgement(raw, value, 'conflicting', ['reservation-conflict']);
  if (required) {
    value.required = true;
    value.method = 'advance';
  }
  if (unnecessary) value.required = false;
  if (/当日受付/u.test(text)) value.method = 'walk-in';
  const first = /先着順/u.test(text),
    lottery = /抽選/u.test(text);
  if (first && lottery)
    return judgement(raw, value, 'conflicting', ['selection-conflict']);
  value.selection = first ? 'first-come' : lottery ? 'lottery' : null;
  const capacities = [...text.matchAll(/定員\s*(\d+)\s*名/gu)].map((m) =>
    Number(m[1]),
  );
  if (capacities.some((n) => !Number.isSafeInteger(n) || n < 1 || n > 1000000))
    return judgement(raw, value, 'ambiguous', ['invalid-capacity']);
  if (new Set(capacities).size > 1)
    return judgement(raw, value, 'conflicting', ['capacity-conflict']);
  value.capacity = capacities[0] ?? null;
  const states: Reservation['reception'][] = [];
  if (/キャンセル待ち/u.test(text)) states.push('waitlist');
  else if (/満席/u.test(text)) states.push('full');
  else if (/受付終了|申込終了/u.test(text)) states.push('closed');
  if (/申込受付中|受付中/u.test(text) && !/受付終了/u.test(text))
    states.push('open');
  if (/申込開始前|受付開始前/u.test(text)) states.push('not-yet-open');
  if (states.length > 1)
    return judgement(raw, value, 'conflicting', ['reception-conflict']);
  value.reception = states[0] ?? null;
  return judgement(
    raw,
    value,
    Object.values(value).every((v) => v === null) ? 'ambiguous' : 'confirmed',
  );
}
export function parseStatus(raw: string) {
  if (!raw.trim()) return judgement<StatusFact>(raw, null);
  const conditional =
    raw.match(
      /(?:雨天|荒天|悪天候|天候不良)(?:時)?(?:は)?(?:中止|延期|決行)|(?:延期|中止).{0,8}(?:可能性|検討|場合)/gu,
    ) ?? [];
  let text = raw;
  for (const clause of conditional) text = text.replace(clause, '');
  text = text.replace(/受付終了|申込終了|募集終了/gu, '');
  text = text.replace(
    /中止ではありません|中止しません|延期ではありません|延期しません/gu,
    '',
  );
  const cancelled =
    text.trim() === '中止' ||
    /中止(?:いた|し|と|に|です|しました)|開催中止|は中止|を中止/u.test(text);
  const postponed =
    text.trim() === '延期' ||
    /開催(?:を)?延期|延期(?:いた|し|と|に|です)|延期日未定|は延期|を延期/u.test(
      text,
    );
  if ((cancelled || postponed) && /一部|プログラムのみ/u.test(text))
    return judgement<StatusFact>(raw, null, 'ambiguous', [
      'partial-status-change',
    ]);
  if (cancelled && postponed)
    return judgement<StatusFact>(raw, null, 'conflicting', ['status-conflict']);
  const status = cancelled
    ? 'cancelled'
    : postponed
      ? 'postponed'
      : /(?:イベント|観望会|本催し|展示|会期).*(?:終了しました|終了いたしました)/u.test(
            text,
          )
        ? 'ended'
        : /開催日調整中|開催日未定/u.test(text)
          ? 'unknown'
          : /開催|実施|開演|予定|臨時休館|休館期間|改修工事|再開館|特別開館|夜間開館/u.test(
                text,
              )
            ? 'scheduled'
            : 'unknown';
  return judgement<StatusFact>(
    raw,
    { status, conditional, tentative: /予定|可能性/u.test(raw) },
    status === 'unknown' && conditional.length === 0
      ? 'ambiguous'
      : 'confirmed',
  );
}
