import type { PostKind } from '../domain';
import { prefectures } from '../prefectures';
import { parseStatus } from './conditions';
import { judgement } from './temporal';
import type { Location } from './types';

export function parseKind(raw: string) {
  const rules: [RegExp, PostKind][] = [
    [/中止/u, 'cancellation'],
    [/延期/u, 'postponement'],
    [/再開館|リニューアルオープン/u, 'reopening'],
    [/臨時休館|改修工事|休館期間|設備点検/u, 'closure'],
    [/予約開始|募集開始|申込開始/u, 'applications-open'],
    [/申込締切|締切間近/u, 'deadline'],
    [/グッズ|予約販売|物販/u, 'merchandise'],
    [/観望会|星空観察|天体観測/u, 'observation'],
    [/特別公開|一般公開|特別開館|夜間開館/u, 'open-day'],
    [/展示|特別展/u, 'exhibition'],
    [/講演|講座|セミナー/u, 'lecture'],
    [/宇宙開発|ロケット|衛星/u, 'space'],
    [
      /ファンイベント|コラボ|特別配信|記念|周年|誕生|ポップアップ|カフェ/u,
      'vtuber',
    ],
  ];
  const status = parseStatus(raw).value?.status;
  const match = rules.find(
    ([r, k]) =>
      (k === 'cancellation'
        ? status === 'cancelled'
        : k === 'postponement'
          ? status === 'postponed'
          : true) && r.test(raw),
  );
  return judgement<PostKind>(
    raw,
    match?.[1] ?? null,
    match ? 'confirmed' : 'ambiguous',
    match ? [] : ['kind-unsupported'],
  );
}
export function parseLocation(raw: string) {
  if (
    /未定|調整中|後日発表|オンライン.{0,6}(?:ではありません|ではない)|配信なし|ハイブリッド|現地とオンライン/u.test(
      raw,
    )
  )
    return judgement<Location>(raw, null, 'ambiguous', [
      'online-location-ambiguous',
    ]);
  if (/オンライン|配信のみ|ウェビナー/u.test(raw))
    return judgement<Location>(raw, {
      online: true,
      venue: null,
      prefecture: null,
      municipality: null,
    });
  const pref = prefectures.find((p) => raw.includes(p.name));
  const venue = raw.replace(/^(会場|場所|開催地)\s*[:：]?\s*/u, '').trim();
  if (!venue) return judgement<Location>(raw, null);
  return judgement<Location>(
    raw,
    {
      online: false,
      venue,
      prefecture: pref?.code ?? null,
      municipality: null,
    },
    pref ? 'confirmed' : 'ambiguous',
    pref ? [] : ['physical-region-missing'],
  );
}
export function parseNamed(raw: string, type: 'title' | 'organizer') {
  const text = raw
    .replace(
      type === 'organizer'
        ? /^(主催|運営|発表主体)\s*[:：]?\s*/u
        : /^(行事名|イベント名|名称)\s*[:：]?\s*/u,
      '',
    )
    .trim();
  return judgement(raw, text || null);
}
