// All events and attestations in this file are synthetic. No real event/source was approved.
import type { PostKind } from '../src/domain';
import type { Field } from '../src/verification/types';
import {
  CandidateEventValidator,
  candidateToEvent,
} from '../src/verification/validator';
import { NOW } from './collection-fixtures';
import { verificationFixture } from './verification-fixtures';
export const POST_NOW = Date.parse(NOW);
export const examples: {
  kind: PostKind;
  fields: Partial<Record<Field, string | null>>;
}[] = [
  {
    kind: 'observation',
    fields: {
      title: '合成・北海道市民観望会',
      kind: '天体観望会',
      fee: '参加無料',
    },
  },
  {
    kind: 'open-day',
    fields: {
      title: '合成・JAXA研究施設公開',
      kind: '特別公開',
      organizer: '主催：JAXA',
      location: '会場：合成宇宙センター（茨城県つくば市）',
    },
  },
  {
    kind: 'space',
    fields: {
      title: '合成・JAMSTEC宇宙と地球の体験会',
      kind: '宇宙開発イベント',
      location: '会場：合成研究施設（神奈川県横須賀市）',
    },
  },
  {
    kind: 'lecture',
    fields: {
      title: '合成・NIPR大学公開講演',
      kind: '公開講演',
      location: 'オンライン開催',
      fee: '入場無料',
      reservation: null,
    },
  },
  {
    kind: 'exhibition',
    fields: {
      title: '合成・四国科学館企画展',
      kind: '特別展',
      schedule: '開催期間2026年11月1日〜11月30日',
      location: '会場：合成科学館（香川県高松市）',
    },
  },
  {
    kind: 'vtuber',
    fields: {
      title: '合成・星見まどか特別イベント',
      kind: 'ファンイベント',
      vtuberRelation: '合成公式VTuber 特別出演',
      location: '会場：合成ホール（大阪府大阪市）',
    },
  },
  {
    kind: 'merchandise',
    fields: {
      title: '合成・九州プラネタリウムグッズ',
      kind: 'グッズ予約販売',
      location: 'オンライン開催',
      schedule: null,
      applicationStart: '予約開始2026年11月15日',
      applicationDeadline: '予約締切2026年11月20日',
      fee: null,
    },
  },
  {
    kind: 'closure',
    fields: {
      title: '合成・東北天文台臨時休館',
      kind: '臨時休館',
      status: '臨時休館',
      schedule: '休館期間2026年11月20日〜11月30日',
      location: '会場：合成天文台（岩手県盛岡市）',
    },
  },
  {
    kind: 'reopening',
    fields: {
      title: '合成・中部天文台再開館',
      kind: '再開館',
      fee: '入館料 大人500円 / 小学生200円',
      reservation: null,
      location: '会場：合成天文台（長野県佐久市）',
    },
  },
  {
    kind: 'cancellation',
    fields: {
      title: '合成・沖縄図書館観測会',
      kind: '開催中止',
      status: '開催中止',
      schedule: null,
      location: null,
    },
  },
  {
    kind: 'postponement',
    fields: {
      title: '合成・NAOJ市民講座',
      kind: '開催を延期',
      status: '開催を延期。延期日未定',
      schedule: null,
      location: null,
    },
  },
  {
    kind: 'applications-open',
    fields: {
      title: '合成・中国地方公民館観測会',
      kind: '申込開始',
      applicationStart: '申込開始2026年11月15日',
      reservation: '要事前予約 抽選',
      location: '会場：合成公民館（岡山県津山市）',
    },
  },
  {
    kind: 'deadline',
    fields: {
      title: '合成・近畿大学星空講座',
      kind: '申込締切',
      applicationDeadline: '申込締切2026年11月20日',
      location: '会場：合成大学（京都府京都市）',
    },
  },
];
export async function postFixture(
  kind: PostKind = 'observation',
  overrides: Partial<Record<Field, string | null>> = {},
) {
  const sample = examples.find((e) => e.kind === kind)!;
  const f = await verificationFixture({ ...sample.fields, ...overrides });
  if (['closure', 'reopening'].includes(kind)) {
    f.ctx.facility = {
      id: 'fixture-facility',
      name: '合成施設',
      prefecture: 1,
      officialUrl: 'https://example.jp/facility',
      operatingStatus: 'unknown',
      closureStart: null,
      closureEnd: null,
      reopeningDate: null,
      statusSourceUrl: null,
      lastVerifiedAt: null,
    };
    f.ctx.facilityLinked = true;
    f.packet.facilityId = 'fixture-facility';
  }
  if (kind === 'vtuber') {
    f.packet.vtuberIds = ['synthetic'];
    f.ctx.vtubers = [{ id: 'synthetic', status: 'Verified', linked: true }];
  }
  const v = new CandidateEventValidator(f.ctx, f.packet, () => POST_NOW),
    result = await v.validate(await candidateToEvent(f.ctx)),
    event = v.verify(result);
  if (!event)
    throw new Error(
      JSON.stringify({ kind, reasons: result.reasons, fields: result.fields }),
    );
  return { ...f, result, event };
}
