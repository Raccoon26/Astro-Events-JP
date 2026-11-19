import prefectures from '../../data/prefectures.json';
import type { PublicationStatus } from '../domain';
import { formatTemporal } from '../posts/temporal';
import type { TrackedChange, TrackedValue } from '../tracking/changes';
import type {
  DetailedVerifiedEvent,
  Fees,
  Judgement,
  Reservation,
} from '../verification/types';
import { text } from './messages';

export const MANAGEMENT_VERSION = 'dev07-1';
const MISSING = '미확인';
const states = {
  unknown: MISSING,
  ambiguous: '불명확',
  conflicting: '공식 정보 간 불일치',
};
function read<T>(item: Judgement<T>, format: (value: T) => string) {
  return item.state === 'confirmed'
    ? item.value === null
      ? MISSING
      : format(item.value)
    : states[item.state];
}
function display(value: string | null | undefined) {
  return value ? text(value) : MISSING;
}
function fee(value: Fees, scope: 'participation' | 'entrance') {
  const tiers = value.tiers.filter((tier) => tier.scope === scope);
  if (tiers.length)
    return tiers
      .map(
        (tier) =>
          `${text(tier.label, 120)} ${tier.yen.toLocaleString('ja-JP')}엔`,
      )
      .join(' / ');
  return value[scope] === 'free'
    ? '무료'
    : value[scope] === 'paid'
      ? '유료 (금액 미확인)'
      : MISSING;
}
function reservation(value: Reservation) {
  const parts = [];
  if (value.required !== null)
    parts.push(value.required ? '사전 신청 필수' : '예약 불필요');
  if (value.method === 'walk-in') parts.push('당일 접수');
  else if (value.method === 'advance' && value.required !== true)
    parts.push('사전 신청 안내');
  if (value.selection)
    parts.push(value.selection === 'lottery' ? '추첨' : '선착순');
  if (value.capacity !== null) parts.push(`정원 ${value.capacity}명`);
  if (value.reception)
    parts.push(
      {
        open: '접수 중으로 공지',
        'not-yet-open': '접수 예정',
        closed: '접수 종료',
        full: '만석',
        waitlist: '취소 대기',
      }[value.reception],
    );
  return parts.join(' / ') || MISSING;
}
const statuses = {
  scheduled: '개최 예정',
  postponed: '연기',
  cancelled: '취소',
  ended: '종료',
  unknown: MISSING,
};
const kinds = {
  observation: '천체 관측회',
  'open-day': '특별 공개',
  space: '우주 행사',
  lecture: '강연',
  exhibition: '전시',
  vtuber: 'VTuber 행사',
  merchandise: '굿즈·팝업',
  closure: '시설 휴관',
  reopening: '개관 공지',
  cancellation: '행사 취소',
  postponement: '행사 연기',
  'applications-open': '신청 시작',
  deadline: '신청 마감',
};
export function managementLines(
  event: DetailedVerifiedEvent,
  lines: string[],
  publication: PublicationStatus,
) {
  const { fields, kind, primaryDateField } = event.verification;
  const prefecture = prefectures.find((p) => p.code === event.prefecture);
  const replacements: Record<string, string[]> = {
    종류: [`종류: ${kinds[kind]}`],
    '개최일/기간': [`개최일/기간: ${read(fields.schedule, formatTemporal)}`],
    '일정 기준': [
      `일정 기준: ${
        primaryDateField === 'applicationStart'
          ? '신청 시작'
          : primaryDateField === 'applicationDeadline'
            ? '신청 마감'
            : primaryDateField === 'schedule'
              ? '개최 일정'
              : MISSING
      }`,
    ],
    '도도부현/시정촌': [
      `도도부현: ${prefecture?.name ?? MISSING}`,
      `시정촌: ${display(event.municipality)}`,
    ],
    장소: [`장소: ${display(event.venue)}`],
    주최자: [`주최자: ${display(event.organizer)}`],
    예약: [`예약: ${read(fields.reservation, reservation)}`],
    요금: [
      `참가비: ${read(fields.fee, (value) => fee(value, 'participation'))}`,
      `입장료: ${read(fields.fee, (value) => fee(value, 'entrance'))}`,
    ],
    '신청 시작': [
      `신청 시작: ${read(fields.applicationStart, formatTemporal)}`,
    ],
    '신청 마감': [
      `신청 마감: ${read(fields.applicationDeadline, formatTemporal)}`,
    ],
    '행사 상태': [
      `행사 상태: ${
        fields.status.state === 'conflicting' ||
        fields.status.state === 'ambiguous'
          ? states[fields.status.state]
          : statuses[event.status]
      }`,
    ],
    // The stable machine value is retained for the existing callback/status editing contract.
    '게시 상태': [
      `게시 상태: ${publication} (${{ pending: '미게시', posted: '게시 확인', held: '보류', recheck: '재확인 대기' }[publication]})`,
    ],
    '시설 영향': event.verification.impacts.map(
      (impact) =>
        `시설 영향: ${impact.impact === 'overlap' ? '운영 변경과 일정이 겹침' : '운영 변경 영향 미확인'} (행사 취소는 별도 확인)`,
    ),
  };
  return lines
    .flatMap((line) => {
      const label = line.split(': ', 1)[0]!;
      return label === '시설 영향' ? [] : (replacements[label] ?? [line]);
    })
    .concat(replacements['시설 영향'] ?? []);
}

export function formatChange(change: TrackedChange) {
  const labels: Record<string, string> = {
    title: '행사명',
    organizer: '주최자',
    schedule: '개최 일정',
    location: '장소',
    fee: '요금',
    reservation: '예약',
    applicationStart: '신청 시작',
    applicationDeadline: '신청 마감',
    status: '행사 상태',
    kind: '종류',
    officialUrl: '공식 URL',
    images: '이미지·권리',
    facilityImpact: '시설 영향',
  };
  const side = (field: string, fact: TrackedValue | null) => {
    if (!fact || fact.value === null)
      return fact && fact.state !== 'confirmed' ? states[fact.state] : MISSING;
    if (
      field === 'schedule' ||
      field === 'applicationStart' ||
      field === 'applicationDeadline'
    )
      return formatTemporal(
        fact.value as NonNullable<
          DetailedVerifiedEvent['verification']['fields']['schedule']['value']
        >,
      );
    if (field === 'fee')
      return `참가비 ${fee(fact.value as Fees, 'participation')}, 입장료 ${fee(fact.value as Fees, 'entrance')}`;
    if (field === 'reservation') return reservation(fact.value as Reservation);
    if (field === 'status')
      return statuses[(fact.value as { status: keyof typeof statuses }).status];
    if (field === 'location') {
      const loc = fact.value as { online: boolean; venue: string | null };
      return loc.online ? '온라인' : display(loc.venue);
    }
    if (field === 'kind') return kinds[fact.value as keyof typeof kinds];
    if (field === 'images' || field === 'facilityImpact')
      return Array.isArray(fact.value) ? `${fact.value.length}건` : MISSING;
    return typeof fact.value === 'string' ? display(fact.value) : MISSING;
  };
  return `${labels[change.field] ?? '공식 정보'} ${side(change.field, change.before)} → ${side(change.field, change.after)}`;
}
