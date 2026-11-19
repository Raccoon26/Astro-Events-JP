# DEV06 合成通知サンプル / 실제 행사·수신자 아님

실제 Source 승인·행사·발송 건수에 포함하지 않는다. A는 복사 본문, B는 관리용이며 버튼은 게시완료/보류/재확인이다. Issue는 Private Reports 전용이다.

## observation — A / 212/280

```text
観望会「合成・北海道市民観望会」のご案内です。
開催日時：2026年11月23日 13:30〜15:00
会場：合成天文台（北海道合成町）
開催予定です。
事前申込が必要です。
参加無料
https://example.jp/events/synthetic
#天体観望会 #天文イベント
```

### B 管理

```text
【天文・宇宙イベント管理】
행사: 合成・北海道市民観望会
종류: observation
개최일/기간: {"precision":"datetime","startDate":"2026-11-23","endDate":"2026-11-23","startMonth":null,"endMonth":null,"startDatetime":"2026-11-23T13:30:00+09:00","endDatetime":"2026-11-23T15:00:00+09:00","doorsTime":null,"raw":"開催日2026年11月23日 13:30〜15:00"}
일정 기준: schedule
장소: 合成天文台（北海道合成町）
도도부현/시정촌: 1 / unknown
주최자: 合成天文台
공식 URL: https://example.jp/events/synthetic
예약: confirmed {"required":true,"method":"advance","selection":null,"capacity":null,"reception":null}
요금: confirmed {"participation":"free","entrance":"unknown","tiers":[]}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00.000Z
검증 만료: 2026-11-18T00:00:00.000Z
revision: 1
X 가중 길이: 212/280
태그: #天体観望会 #天文イベント
게시 상태: pending
Telegram 전달 상태(작성 시점): pending
최초 발견: 2026-11-12T00:00:00.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인
```

### Private Issue Markdown

````text
<!-- astro-events-jp:event:8ec22b9e5d0eb4b5ff5e537e978754fe2862d77afa3d83cf3ffb02d48ae10ace -->
보고서 버전: dev06-1
【天文・宇宙イベント管理】
행사: 合成・北海道市民観望会
종류: observation
개최일/기간: \{"precision":"datetime","startDate":"2026-11-23","endDate":"2026-11-23","startMonth":null,"endMonth":null,"startDatetime":"2026-11-23T13:30:00\+09:00","endDatetime":"2026-11-23T15:00:00\+09:00","doorsTime":null,"raw":"開催日2026年11月23日 13:30〜15:00"\}
일정 기준: schedule
장소: 合成天文台（北海道合成町）
도도부현/시정촌: 1 / unknown
주최자: 合成天文台
공식 URL: <https://example.jp/events/synthetic>
예약: confirmed \{"required":true,"method":"advance","selection":null,"capacity":null,"reception":null\}
요금: confirmed \{"participation":"free","entrance":"unknown","tiers":\[\]\}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00\.000Z
검증 만료: 2026-11-18T00:00:00\.000Z
revision: 1
X 가중 길이: 212/280
태그: \#天体観望会 \#天文イベント
게시 상태: pending
Telegram 전달 상태\(작성 시점\): pending
최초 발견: 2026-11-12T00:00:00\.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인

### X 복사용 본문

```text
観望会「合成・北海道市民観望会」のご案内です。
開催日時：2026年11月23日 13:30〜15:00
会場：合成天文台（北海道合成町）
開催予定です。
事前申込が必要です。
参加無料
https://example.jp/events/synthetic
#天体観望会 #天文イベント
```

### 검증 근거
- title: 合成・北海道市民観望会 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- kind: 天体観望会 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- organizer: 主催：合成天文台 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- location: 会場：合成天文台（北海道合成町） — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- schedule: 開催日2026年11月23日 13:30〜15:00 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- fee: 参加無料 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- reservation: 要事前予約 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- status: 開催予定 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
````

## open-day — A / 212/280

```text
「合成・JAXA研究施設公開」の公開イベント情報です。
開催日時：2026年11月23日 13:30〜15:00
会場：合成宇宙センター（茨城県つくば市）
開催予定です。
事前申込が必要です。
参加費 500円
https://example.jp/events/synthetic
#施設公開
```

### B 管理

```text
【天文・宇宙イベント管理】
행사: 合成・JAXA研究施設公開
종류: open-day
개최일/기간: {"precision":"datetime","startDate":"2026-11-23","endDate":"2026-11-23","startMonth":null,"endMonth":null,"startDatetime":"2026-11-23T13:30:00+09:00","endDatetime":"2026-11-23T15:00:00+09:00","doorsTime":null,"raw":"開催日2026年11月23日 13:30〜15:00"}
일정 기준: schedule
장소: 合成宇宙センター（茨城県つくば市）
도도부현/시정촌: 8 / unknown
주최자: JAXA
공식 URL: https://example.jp/events/synthetic
예약: confirmed {"required":true,"method":"advance","selection":null,"capacity":null,"reception":null}
요금: confirmed {"participation":"paid","entrance":"unknown","tiers":[{"label":"参加費","yen":500,"scope":"participation"}]}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00.000Z
검증 만료: 2026-11-18T00:00:00.000Z
revision: 1
X 가중 길이: 212/280
태그: #施設公開
게시 상태: pending
Telegram 전달 상태(작성 시점): pending
최초 발견: 2026-11-12T00:00:00.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인
```

### Private Issue Markdown

````text
<!-- astro-events-jp:event:999b58bdc5e03883d7c4e3077e29c91f2a9c79d6e7082ac3f95721995a9dc865 -->
보고서 버전: dev06-1
【天文・宇宙イベント管理】
행사: 合成・JAXA研究施設公開
종류: open-day
개최일/기간: \{"precision":"datetime","startDate":"2026-11-23","endDate":"2026-11-23","startMonth":null,"endMonth":null,"startDatetime":"2026-11-23T13:30:00\+09:00","endDatetime":"2026-11-23T15:00:00\+09:00","doorsTime":null,"raw":"開催日2026年11月23日 13:30〜15:00"\}
일정 기준: schedule
장소: 合成宇宙センター（茨城県つくば市）
도도부현/시정촌: 8 / unknown
주최자: JAXA
공식 URL: <https://example.jp/events/synthetic>
예약: confirmed \{"required":true,"method":"advance","selection":null,"capacity":null,"reception":null\}
요금: confirmed \{"participation":"paid","entrance":"unknown","tiers":\[\{"label":"参加費","yen":500,"scope":"participation"\}\]\}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00\.000Z
검증 만료: 2026-11-18T00:00:00\.000Z
revision: 1
X 가중 길이: 212/280
태그: \#施設公開
게시 상태: pending
Telegram 전달 상태\(작성 시점\): pending
최초 발견: 2026-11-12T00:00:00\.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인

### X 복사용 본문

```text
「合成・JAXA研究施設公開」の公開イベント情報です。
開催日時：2026年11月23日 13:30〜15:00
会場：合成宇宙センター（茨城県つくば市）
開催予定です。
事前申込が必要です。
参加費 500円
https://example.jp/events/synthetic
#施設公開
```

### 검증 근거
- title: 合成・JAXA研究施設公開 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- kind: 特別公開 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- organizer: 主催：JAXA — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- location: 会場：合成宇宙センター（茨城県つくば市） — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- schedule: 開催日2026年11月23日 13:30〜15:00 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- fee: 参加費500円 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- reservation: 要事前予約 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- status: 開催予定 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
````

## space — A / 227/280

```text
宇宙イベント「合成・JAMSTEC宇宙と地球の体験会」のご案内です。
開催日時：2026年11月23日 13:30〜15:00
会場：合成研究施設（神奈川県横須賀市）
開催予定です。
事前申込が必要です。
参加費 500円
https://example.jp/events/synthetic
#宇宙開発 #宇宙
```

### B 管理

```text
【天文・宇宙イベント管理】
행사: 合成・JAMSTEC宇宙と地球の体験会
종류: space
개최일/기간: {"precision":"datetime","startDate":"2026-11-23","endDate":"2026-11-23","startMonth":null,"endMonth":null,"startDatetime":"2026-11-23T13:30:00+09:00","endDatetime":"2026-11-23T15:00:00+09:00","doorsTime":null,"raw":"開催日2026年11月23日 13:30〜15:00"}
일정 기준: schedule
장소: 合成研究施設（神奈川県横須賀市）
도도부현/시정촌: 14 / unknown
주최자: 合成天文台
공식 URL: https://example.jp/events/synthetic
예약: confirmed {"required":true,"method":"advance","selection":null,"capacity":null,"reception":null}
요금: confirmed {"participation":"paid","entrance":"unknown","tiers":[{"label":"参加費","yen":500,"scope":"participation"}]}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00.000Z
검증 만료: 2026-11-18T00:00:00.000Z
revision: 1
X 가중 길이: 227/280
태그: #宇宙開発 #宇宙
게시 상태: pending
Telegram 전달 상태(작성 시점): pending
최초 발견: 2026-11-12T00:00:00.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인
```

### Private Issue Markdown

````text
<!-- astro-events-jp:event:3d0b1f59f419d2b6d0572703fca7e52a442fa88fca1ed1f2e8406abc0a4ed37b -->
보고서 버전: dev06-1
【天文・宇宙イベント管理】
행사: 合成・JAMSTEC宇宙と地球の体験会
종류: space
개최일/기간: \{"precision":"datetime","startDate":"2026-11-23","endDate":"2026-11-23","startMonth":null,"endMonth":null,"startDatetime":"2026-11-23T13:30:00\+09:00","endDatetime":"2026-11-23T15:00:00\+09:00","doorsTime":null,"raw":"開催日2026年11月23日 13:30〜15:00"\}
일정 기준: schedule
장소: 合成研究施設（神奈川県横須賀市）
도도부현/시정촌: 14 / unknown
주최자: 合成天文台
공식 URL: <https://example.jp/events/synthetic>
예약: confirmed \{"required":true,"method":"advance","selection":null,"capacity":null,"reception":null\}
요금: confirmed \{"participation":"paid","entrance":"unknown","tiers":\[\{"label":"参加費","yen":500,"scope":"participation"\}\]\}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00\.000Z
검증 만료: 2026-11-18T00:00:00\.000Z
revision: 1
X 가중 길이: 227/280
태그: \#宇宙開発 \#宇宙
게시 상태: pending
Telegram 전달 상태\(작성 시점\): pending
최초 발견: 2026-11-12T00:00:00\.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인

### X 복사용 본문

```text
宇宙イベント「合成・JAMSTEC宇宙と地球の体験会」のご案内です。
開催日時：2026年11月23日 13:30〜15:00
会場：合成研究施設（神奈川県横須賀市）
開催予定です。
事前申込が必要です。
参加費 500円
https://example.jp/events/synthetic
#宇宙開発 #宇宙
```

### 검증 근거
- title: 合成・JAMSTEC宇宙と地球の体験会 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- kind: 宇宙開発イベント — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- organizer: 主催：合成天文台 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- location: 会場：合成研究施設（神奈川県横須賀市） — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- schedule: 開催日2026年11月23日 13:30〜15:00 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- fee: 参加費500円 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- reservation: 要事前予約 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- status: 開催予定 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
````

## lecture — A / 161/280

```text
講演・講座「合成・NIPR大学公開講演」のご案内です。
開催日時：2026年11月23日 13:30〜15:00
形式：オンライン
開催予定です。
入場無料
https://example.jp/events/synthetic
#講演会
```

### B 管理

```text
【天文・宇宙イベント管理】
행사: 合成・NIPR大学公開講演
종류: lecture
개최일/기간: {"precision":"datetime","startDate":"2026-11-23","endDate":"2026-11-23","startMonth":null,"endMonth":null,"startDatetime":"2026-11-23T13:30:00+09:00","endDatetime":"2026-11-23T15:00:00+09:00","doorsTime":null,"raw":"開催日2026年11月23日 13:30〜15:00"}
일정 기준: schedule
장소: オンライン
도도부현/시정촌: unknown / unknown
주최자: 合成天文台
공식 URL: https://example.jp/events/synthetic
예약: unknown null
요금: confirmed {"participation":"unknown","entrance":"free","tiers":[]}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00.000Z
검증 만료: 2026-11-18T00:00:00.000Z
revision: 1
X 가중 길이: 161/280
태그: #講演会
게시 상태: pending
Telegram 전달 상태(작성 시점): pending
최초 발견: 2026-11-12T00:00:00.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인
```

### Private Issue Markdown

````text
<!-- astro-events-jp:event:88aade2fb4a2e3c687e211d93d134917d61de808f9df838e94ad19d9bbf9fb23 -->
보고서 버전: dev06-1
【天文・宇宙イベント管理】
행사: 合成・NIPR大学公開講演
종류: lecture
개최일/기간: \{"precision":"datetime","startDate":"2026-11-23","endDate":"2026-11-23","startMonth":null,"endMonth":null,"startDatetime":"2026-11-23T13:30:00\+09:00","endDatetime":"2026-11-23T15:00:00\+09:00","doorsTime":null,"raw":"開催日2026年11月23日 13:30〜15:00"\}
일정 기준: schedule
장소: オンライン
도도부현/시정촌: unknown / unknown
주최자: 合成天文台
공식 URL: <https://example.jp/events/synthetic>
예약: unknown null
요금: confirmed \{"participation":"unknown","entrance":"free","tiers":\[\]\}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00\.000Z
검증 만료: 2026-11-18T00:00:00\.000Z
revision: 1
X 가중 길이: 161/280
태그: \#講演会
게시 상태: pending
Telegram 전달 상태\(작성 시점\): pending
최초 발견: 2026-11-12T00:00:00\.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인

### X 복사용 본문

```text
講演・講座「合成・NIPR大学公開講演」のご案内です。
開催日時：2026年11月23日 13:30〜15:00
形式：オンライン
開催予定です。
入場無料
https://example.jp/events/synthetic
#講演会
```

### 검증 근거
- title: 合成・NIPR大学公開講演 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- kind: 公開講演 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- organizer: 主催：合成天文台 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- location: オンライン開催 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- schedule: 開催日2026年11月23日 13:30〜15:00 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- fee: 入場無料 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- status: 開催予定 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
````

## exhibition — A / 204/280

```text
展示「合成・四国科学館企画展」のご案内です。
開催期間：2026年11月1日〜2026年11月30日
会場：合成科学館（香川県高松市）
開催予定です。
事前申込が必要です。
参加費 500円
https://example.jp/events/synthetic
#展示 #科学館
```

### B 管理

```text
【天文・宇宙イベント管理】
행사: 合成・四国科学館企画展
종류: exhibition
개최일/기간: {"precision":"date","startDate":"2026-11-01","endDate":"2026-11-30","startMonth":null,"endMonth":null,"startDatetime":null,"endDatetime":null,"doorsTime":null,"raw":"開催期間2026年11月1日〜11月30日"}
일정 기준: schedule
장소: 合成科学館（香川県高松市）
도도부현/시정촌: 37 / unknown
주최자: 合成天文台
공식 URL: https://example.jp/events/synthetic
예약: confirmed {"required":true,"method":"advance","selection":null,"capacity":null,"reception":null}
요금: confirmed {"participation":"paid","entrance":"unknown","tiers":[{"label":"参加費","yen":500,"scope":"participation"}]}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00.000Z
검증 만료: 2026-11-18T00:00:00.000Z
revision: 1
X 가중 길이: 204/280
태그: #展示 #科学館
게시 상태: pending
Telegram 전달 상태(작성 시점): pending
최초 발견: 2026-11-12T00:00:00.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인
```

### Private Issue Markdown

````text
<!-- astro-events-jp:event:68b0998656e960af0cb1bb88b28a1e2c61748431a01aab9a3279e2ad0ccf9715 -->
보고서 버전: dev06-1
【天文・宇宙イベント管理】
행사: 合成・四国科学館企画展
종류: exhibition
개최일/기간: \{"precision":"date","startDate":"2026-11-01","endDate":"2026-11-30","startMonth":null,"endMonth":null,"startDatetime":null,"endDatetime":null,"doorsTime":null,"raw":"開催期間2026年11月1日〜11月30日"\}
일정 기준: schedule
장소: 合成科学館（香川県高松市）
도도부현/시정촌: 37 / unknown
주최자: 合成天文台
공식 URL: <https://example.jp/events/synthetic>
예약: confirmed \{"required":true,"method":"advance","selection":null,"capacity":null,"reception":null\}
요금: confirmed \{"participation":"paid","entrance":"unknown","tiers":\[\{"label":"参加費","yen":500,"scope":"participation"\}\]\}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00\.000Z
검증 만료: 2026-11-18T00:00:00\.000Z
revision: 1
X 가중 길이: 204/280
태그: \#展示 \#科学館
게시 상태: pending
Telegram 전달 상태\(작성 시점\): pending
최초 발견: 2026-11-12T00:00:00\.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인

### X 복사용 본문

```text
展示「合成・四国科学館企画展」のご案内です。
開催期間：2026年11月1日〜2026年11月30日
会場：合成科学館（香川県高松市）
開催予定です。
事前申込が必要です。
参加費 500円
https://example.jp/events/synthetic
#展示 #科学館
```

### 검증 근거
- title: 合成・四国科学館企画展 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- kind: 特別展 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- organizer: 主催：合成天文台 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- location: 会場：合成科学館（香川県高松市） — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- schedule: 開催期間2026年11月1日〜11月30日 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- fee: 参加費500円 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- reservation: 要事前予約 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- status: 開催予定 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
````

## vtuber — A / 216/280

```text
VTuber関連イベント「合成・星見まどか特別イベント」のご案内です。
開催日時：2026年11月23日 13:30〜15:00
会場：合成ホール（大阪府大阪市）
開催予定です。
事前申込が必要です。
参加費 500円
https://example.jp/events/synthetic
#VTuber
```

### B 管理

```text
【天文・宇宙イベント管理】
행사: 合成・星見まどか特別イベント
종류: vtuber
개최일/기간: {"precision":"datetime","startDate":"2026-11-23","endDate":"2026-11-23","startMonth":null,"endMonth":null,"startDatetime":"2026-11-23T13:30:00+09:00","endDatetime":"2026-11-23T15:00:00+09:00","doorsTime":null,"raw":"開催日2026年11月23日 13:30〜15:00"}
일정 기준: schedule
장소: 合成ホール（大阪府大阪市）
도도부현/시정촌: 27 / unknown
주최자: 合成天文台
공식 URL: https://example.jp/events/synthetic
예약: confirmed {"required":true,"method":"advance","selection":null,"capacity":null,"reception":null}
요금: confirmed {"participation":"paid","entrance":"unknown","tiers":[{"label":"参加費","yen":500,"scope":"participation"}]}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00.000Z
검증 만료: 2026-11-18T00:00:00.000Z
revision: 1
X 가중 길이: 216/280
태그: #VTuber
게시 상태: pending
Telegram 전달 상태(작성 시점): pending
최초 발견: 2026-11-12T00:00:00.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인
```

### Private Issue Markdown

````text
<!-- astro-events-jp:event:205b8af1d309477d3a885c6bfb85e8ec20f988caa94bee617aec67dd3d144155 -->
보고서 버전: dev06-1
【天文・宇宙イベント管理】
행사: 合成・星見まどか特別イベント
종류: vtuber
개최일/기간: \{"precision":"datetime","startDate":"2026-11-23","endDate":"2026-11-23","startMonth":null,"endMonth":null,"startDatetime":"2026-11-23T13:30:00\+09:00","endDatetime":"2026-11-23T15:00:00\+09:00","doorsTime":null,"raw":"開催日2026年11月23日 13:30〜15:00"\}
일정 기준: schedule
장소: 合成ホール（大阪府大阪市）
도도부현/시정촌: 27 / unknown
주최자: 合成天文台
공식 URL: <https://example.jp/events/synthetic>
예약: confirmed \{"required":true,"method":"advance","selection":null,"capacity":null,"reception":null\}
요금: confirmed \{"participation":"paid","entrance":"unknown","tiers":\[\{"label":"参加費","yen":500,"scope":"participation"\}\]\}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00\.000Z
검증 만료: 2026-11-18T00:00:00\.000Z
revision: 1
X 가중 길이: 216/280
태그: \#VTuber
게시 상태: pending
Telegram 전달 상태\(작성 시점\): pending
최초 발견: 2026-11-12T00:00:00\.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인

### X 복사용 본문

```text
VTuber関連イベント「合成・星見まどか特別イベント」のご案内です。
開催日時：2026年11月23日 13:30〜15:00
会場：合成ホール（大阪府大阪市）
開催予定です。
事前申込が必要です。
参加費 500円
https://example.jp/events/synthetic
#VTuber
```

### 검증 근거
- title: 合成・星見まどか特別イベント — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- kind: ファンイベント — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- organizer: 主催：合成天文台 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- location: 会場：合成ホール（大阪府大阪市） — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- schedule: 開催日2026年11月23日 13:30〜15:00 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- fee: 参加費500円 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- reservation: 要事前予約 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- status: 開催予定 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- vtuberRelation: 合成公式VTuber 特別出演 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
````

## merchandise — A / 191/280

```text
「合成・九州プラネタリウムグッズ」のグッズ関連情報です。
申込開始：2026年11月15日
形式：オンライン
実施予定です。
事前予約が必要です。
申込締切：2026年11月20日
https://example.jp/events/synthetic
#グッズ
```

### B 管理

```text
【天文・宇宙イベント管理】
행사: 合成・九州プラネタリウムグッズ
종류: merchandise
개최일/기간: {"precision":"unknown","startDate":null,"endDate":null,"startMonth":null,"endMonth":null,"startDatetime":null,"endDatetime":null,"doorsTime":null,"raw":"2026年11月15日 / 2026年11月20日"}
일정 기준: applicationStart
장소: オンライン
도도부현/시정촌: unknown / unknown
주최자: 合成天文台
공식 URL: https://example.jp/events/synthetic
예약: confirmed {"required":true,"method":"advance","selection":null,"capacity":null,"reception":null}
요금: unknown null
신청 시작: confirmed {"precision":"date","startDate":"2026-11-15","endDate":null,"startMonth":null,"endMonth":null,"startDatetime":null,"endDatetime":null,"doorsTime":null,"raw":"予約開始2026年11月15日"}
신청 마감: confirmed {"precision":"date","startDate":"2026-11-20","endDate":null,"startMonth":null,"endMonth":null,"startDatetime":null,"endDatetime":null,"doorsTime":null,"raw":"予約締切2026年11月20日"}
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00.000Z
검증 만료: 2026-11-18T00:00:00.000Z
revision: 1
X 가중 길이: 191/280
태그: #グッズ
게시 상태: pending
Telegram 전달 상태(작성 시점): pending
최초 발견: 2026-11-12T00:00:00.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인
```

### Private Issue Markdown

````text
<!-- astro-events-jp:event:7d6611bc28519aa4831a0f54f70d4ebe570e03322982822533d056f2eee9b10e -->
보고서 버전: dev06-1
【天文・宇宙イベント管理】
행사: 合成・九州プラネタリウムグッズ
종류: merchandise
개최일/기간: \{"precision":"unknown","startDate":null,"endDate":null,"startMonth":null,"endMonth":null,"startDatetime":null,"endDatetime":null,"doorsTime":null,"raw":"2026年11月15日 / 2026年11月20日"\}
일정 기준: applicationStart
장소: オンライン
도도부현/시정촌: unknown / unknown
주최자: 合成天文台
공식 URL: <https://example.jp/events/synthetic>
예약: confirmed \{"required":true,"method":"advance","selection":null,"capacity":null,"reception":null\}
요금: unknown null
신청 시작: confirmed \{"precision":"date","startDate":"2026-11-15","endDate":null,"startMonth":null,"endMonth":null,"startDatetime":null,"endDatetime":null,"doorsTime":null,"raw":"予約開始2026年11月15日"\}
신청 마감: confirmed \{"precision":"date","startDate":"2026-11-20","endDate":null,"startMonth":null,"endMonth":null,"startDatetime":null,"endDatetime":null,"doorsTime":null,"raw":"予約締切2026年11月20日"\}
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00\.000Z
검증 만료: 2026-11-18T00:00:00\.000Z
revision: 1
X 가중 길이: 191/280
태그: \#グッズ
게시 상태: pending
Telegram 전달 상태\(작성 시점\): pending
최초 발견: 2026-11-12T00:00:00\.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인

### X 복사용 본문

```text
「合成・九州プラネタリウムグッズ」のグッズ関連情報です。
申込開始：2026年11月15日
形式：オンライン
実施予定です。
事前予約が必要です。
申込締切：2026年11月20日
https://example.jp/events/synthetic
#グッズ
```

### 검증 근거
- title: 合成・九州プラネタリウムグッズ — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- kind: グッズ予約販売 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- organizer: 主催：合成天文台 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- location: オンライン開催 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- applicationStart: 予約開始2026年11月15日 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- applicationDeadline: 予約締切2026年11月20日 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- reservation: 要事前予約 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- status: 開催予定 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
````

## closure — A / 176/280

```text
「合成・東北天文台臨時休館」について、施設からお知らせが出ています。
対象期間：2026年11月20日〜2026年11月30日
施設：合成天文台（岩手県盛岡市）
https://example.jp/events/synthetic
#施設情報
```

### B 管理

```text
【天文・宇宙イベント管理】
행사: 合成・東北天文台臨時休館
종류: closure
개최일/기간: {"precision":"date","startDate":"2026-11-20","endDate":"2026-11-30","startMonth":null,"endMonth":null,"startDatetime":null,"endDatetime":null,"doorsTime":null,"raw":"休館期間2026年11月20日〜11月30日"}
일정 기준: schedule
장소: 合成天文台（岩手県盛岡市）
도도부현/시정촌: 3 / unknown
주최자: 合成天文台
공식 URL: https://example.jp/events/synthetic
예약: confirmed {"required":true,"method":"advance","selection":null,"capacity":null,"reception":null}
요금: confirmed {"participation":"paid","entrance":"unknown","tiers":[{"label":"参加費","yen":500,"scope":"participation"}]}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00.000Z
검증 만료: 2026-11-18T00:00:00.000Z
revision: 1
X 가중 길이: 176/280
태그: #施設情報
게시 상태: pending
Telegram 전달 상태(작성 시점): pending
최초 발견: 2026-11-12T00:00:00.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인
```

### Private Issue Markdown

````text
<!-- astro-events-jp:event:24218df6d199cf5dadebb11a77f2bff0da343310a4756c3d33ec252af7a71d58 -->
보고서 버전: dev06-1
【天文・宇宙イベント管理】
행사: 合成・東北天文台臨時休館
종류: closure
개최일/기간: \{"precision":"date","startDate":"2026-11-20","endDate":"2026-11-30","startMonth":null,"endMonth":null,"startDatetime":null,"endDatetime":null,"doorsTime":null,"raw":"休館期間2026年11月20日〜11月30日"\}
일정 기준: schedule
장소: 合成天文台（岩手県盛岡市）
도도부현/시정촌: 3 / unknown
주최자: 合成天文台
공식 URL: <https://example.jp/events/synthetic>
예약: confirmed \{"required":true,"method":"advance","selection":null,"capacity":null,"reception":null\}
요금: confirmed \{"participation":"paid","entrance":"unknown","tiers":\[\{"label":"参加費","yen":500,"scope":"participation"\}\]\}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00\.000Z
검증 만료: 2026-11-18T00:00:00\.000Z
revision: 1
X 가중 길이: 176/280
태그: \#施設情報
게시 상태: pending
Telegram 전달 상태\(작성 시점\): pending
최초 발견: 2026-11-12T00:00:00\.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인

### X 복사용 본문

```text
「合成・東北天文台臨時休館」について、施設からお知らせが出ています。
対象期間：2026年11月20日〜2026年11月30日
施設：合成天文台（岩手県盛岡市）
https://example.jp/events/synthetic
#施設情報
```

### 검증 근거
- title: 合成・東北天文台臨時休館 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- kind: 臨時休館 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- organizer: 主催：合成天文台 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- location: 会場：合成天文台（岩手県盛岡市） — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- schedule: 休館期間2026年11月20日〜11月30日 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- fee: 参加費500円 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- reservation: 要事前予約 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- status: 臨時休館 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
````

## reopening — A / 197/280

```text
開館のお知らせ：「合成・中部天文台再開館」
開館日：2026年11月23日 13:30〜15:00
施設：合成天文台（長野県佐久市）
開館予定です。
入館料 大人500円／入館料 小学生200円
https://example.jp/events/synthetic
#施設情報
```

### B 管理

```text
【天文・宇宙イベント管理】
행사: 合成・中部天文台再開館
종류: reopening
개최일/기간: {"precision":"datetime","startDate":"2026-11-23","endDate":"2026-11-23","startMonth":null,"endMonth":null,"startDatetime":"2026-11-23T13:30:00+09:00","endDatetime":"2026-11-23T15:00:00+09:00","doorsTime":null,"raw":"開催日2026年11月23日 13:30〜15:00"}
일정 기준: schedule
장소: 合成天文台（長野県佐久市）
도도부현/시정촌: 20 / unknown
주최자: 合成天文台
공식 URL: https://example.jp/events/synthetic
예약: unknown null
요금: confirmed {"participation":"unknown","entrance":"paid","tiers":[{"label":"大人","yen":500,"scope":"entrance"},{"label":"小学生","yen":200,"scope":"entrance"}]}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00.000Z
검증 만료: 2026-11-18T00:00:00.000Z
revision: 1
X 가중 길이: 197/280
태그: #施設情報
게시 상태: pending
Telegram 전달 상태(작성 시점): pending
최초 발견: 2026-11-12T00:00:00.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인
```

### Private Issue Markdown

````text
<!-- astro-events-jp:event:b5b09dc4a2c16cadcf094a4eff021a0a797609b3d07ab6ef7472335d83e8f577 -->
보고서 버전: dev06-1
【天文・宇宙イベント管理】
행사: 合成・中部天文台再開館
종류: reopening
개최일/기간: \{"precision":"datetime","startDate":"2026-11-23","endDate":"2026-11-23","startMonth":null,"endMonth":null,"startDatetime":"2026-11-23T13:30:00\+09:00","endDatetime":"2026-11-23T15:00:00\+09:00","doorsTime":null,"raw":"開催日2026年11月23日 13:30〜15:00"\}
일정 기준: schedule
장소: 合成天文台（長野県佐久市）
도도부현/시정촌: 20 / unknown
주최자: 合成天文台
공식 URL: <https://example.jp/events/synthetic>
예약: unknown null
요금: confirmed \{"participation":"unknown","entrance":"paid","tiers":\[\{"label":"大人","yen":500,"scope":"entrance"\},\{"label":"小学生","yen":200,"scope":"entrance"\}\]\}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00\.000Z
검증 만료: 2026-11-18T00:00:00\.000Z
revision: 1
X 가중 길이: 197/280
태그: \#施設情報
게시 상태: pending
Telegram 전달 상태\(작성 시점\): pending
최초 발견: 2026-11-12T00:00:00\.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인

### X 복사용 본문

```text
開館のお知らせ：「合成・中部天文台再開館」
開館日：2026年11月23日 13:30〜15:00
施設：合成天文台（長野県佐久市）
開館予定です。
入館料 大人500円／入館料 小学生200円
https://example.jp/events/synthetic
#施設情報
```

### 검증 근거
- title: 合成・中部天文台再開館 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- kind: 再開館 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- organizer: 主催：合成天文台 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- location: 会場：合成天文台（長野県佐久市） — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- schedule: 開催日2026年11月23日 13:30〜15:00 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- fee: 入館料 大人500円 / 小学生200円 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- status: 開催予定 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
````

## cancellation — A / 84/280

```text
開催中止のお知らせ：「合成・沖縄図書館観測会」
https://example.jp/events/synthetic
#イベント情報
```

### B 管理

```text
【天文・宇宙イベント管理】
행사: 合成・沖縄図書館観測会
종류: cancellation
개최일/기간: null
일정 기준: schedule
장소: unknown
도도부현/시정촌: unknown / unknown
주최자: 合成天文台
공식 URL: https://example.jp/events/synthetic
예약: confirmed {"required":true,"method":"advance","selection":null,"capacity":null,"reception":null}
요금: confirmed {"participation":"paid","entrance":"unknown","tiers":[{"label":"参加費","yen":500,"scope":"participation"}]}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: cancelled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00.000Z
검증 만료: 2026-11-18T00:00:00.000Z
revision: 1
X 가중 길이: 84/280
태그: #イベント情報
게시 상태: pending
Telegram 전달 상태(작성 시점): pending
최초 발견: 2026-11-12T00:00:00.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인
```

### Private Issue Markdown

````text
<!-- astro-events-jp:event:9319f414ffcd69814936e013b3a6c538a3d5efc9194c377468cd66638565b7c2 -->
보고서 버전: dev06-1
【天文・宇宙イベント管理】
행사: 合成・沖縄図書館観測会
종류: cancellation
개최일/기간: null
일정 기준: schedule
장소: unknown
도도부현/시정촌: unknown / unknown
주최자: 合成天文台
공식 URL: <https://example.jp/events/synthetic>
예약: confirmed \{"required":true,"method":"advance","selection":null,"capacity":null,"reception":null\}
요금: confirmed \{"participation":"paid","entrance":"unknown","tiers":\[\{"label":"参加費","yen":500,"scope":"participation"\}\]\}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: cancelled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00\.000Z
검증 만료: 2026-11-18T00:00:00\.000Z
revision: 1
X 가중 길이: 84/280
태그: \#イベント情報
게시 상태: pending
Telegram 전달 상태\(작성 시점\): pending
최초 발견: 2026-11-12T00:00:00\.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인

### X 복사용 본문

```text
開催中止のお知らせ：「合成・沖縄図書館観測会」
https://example.jp/events/synthetic
#イベント情報
```

### 검증 근거
- title: 合成・沖縄図書館観測会 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- kind: 開催中止 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- organizer: 主催：合成天文台 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- fee: 参加費500円 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- reservation: 要事前予約 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- status: 開催中止 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
````

## postponement — A / 105/280

```text
開催延期のお知らせ：「合成・NAOJ市民講座」
新たな開催日は未定です。
https://example.jp/events/synthetic
#イベント情報
```

### B 管理

```text
【天文・宇宙イベント管理】
행사: 合成・NAOJ市民講座
종류: postponement
개최일/기간: null
일정 기준: schedule
장소: unknown
도도부현/시정촌: unknown / unknown
주최자: 合成天文台
공식 URL: https://example.jp/events/synthetic
예약: confirmed {"required":true,"method":"advance","selection":null,"capacity":null,"reception":null}
요금: confirmed {"participation":"paid","entrance":"unknown","tiers":[{"label":"参加費","yen":500,"scope":"participation"}]}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: postponed / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00.000Z
검증 만료: 2026-11-18T00:00:00.000Z
revision: 1
X 가중 길이: 105/280
태그: #イベント情報
게시 상태: pending
Telegram 전달 상태(작성 시점): pending
최초 발견: 2026-11-12T00:00:00.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인
```

### Private Issue Markdown

````text
<!-- astro-events-jp:event:bea5eb56e92f90bb524937b07d2261d1938eec7c9cc2d9ed96b709c6cc8884d3 -->
보고서 버전: dev06-1
【天文・宇宙イベント管理】
행사: 合成・NAOJ市民講座
종류: postponement
개최일/기간: null
일정 기준: schedule
장소: unknown
도도부현/시정촌: unknown / unknown
주최자: 合成天文台
공식 URL: <https://example.jp/events/synthetic>
예약: confirmed \{"required":true,"method":"advance","selection":null,"capacity":null,"reception":null\}
요금: confirmed \{"participation":"paid","entrance":"unknown","tiers":\[\{"label":"参加費","yen":500,"scope":"participation"\}\]\}
신청 시작: unknown null
신청 마감: unknown null
행사 상태: postponed / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00\.000Z
검증 만료: 2026-11-18T00:00:00\.000Z
revision: 1
X 가중 길이: 105/280
태그: \#イベント情報
게시 상태: pending
Telegram 전달 상태\(작성 시점\): pending
최초 발견: 2026-11-12T00:00:00\.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인

### X 복사용 본문

```text
開催延期のお知らせ：「合成・NAOJ市民講座」
新たな開催日は未定です。
https://example.jp/events/synthetic
#イベント情報
```

### 검증 근거
- title: 合成・NAOJ市民講座 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- kind: 開催を延期 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- organizer: 主催：合成天文台 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- fee: 参加費500円 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- reservation: 要事前予約 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- status: 開催を延期。延期日未定 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
````

## applications-open — A / 243/280

```text
申込開始のご案内：「合成・中国地方公民館観測会」
申込開始：2026年11月15日
会場：合成公民館（岡山県津山市）
開催予定です。
事前申込が必要です。抽選制です。
開催日時：2026年11月23日 13:30〜15:00
参加費 500円
https://example.jp/events/synthetic
#イベント情報
```

### B 管理

```text
【天文・宇宙イベント管理】
행사: 合成・中国地方公民館観測会
종류: applications-open
개최일/기간: {"precision":"datetime","startDate":"2026-11-23","endDate":"2026-11-23","startMonth":null,"endMonth":null,"startDatetime":"2026-11-23T13:30:00+09:00","endDatetime":"2026-11-23T15:00:00+09:00","doorsTime":null,"raw":"開催日2026年11月23日 13:30〜15:00"}
일정 기준: applicationStart
장소: 合成公民館（岡山県津山市）
도도부현/시정촌: 33 / unknown
주최자: 合成天文台
공식 URL: https://example.jp/events/synthetic
예약: confirmed {"required":true,"method":"advance","selection":"lottery","capacity":null,"reception":null}
요금: confirmed {"participation":"paid","entrance":"unknown","tiers":[{"label":"参加費","yen":500,"scope":"participation"}]}
신청 시작: confirmed {"precision":"date","startDate":"2026-11-15","endDate":null,"startMonth":null,"endMonth":null,"startDatetime":null,"endDatetime":null,"doorsTime":null,"raw":"申込開始2026年11月15日"}
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00.000Z
검증 만료: 2026-11-18T00:00:00.000Z
revision: 1
X 가중 길이: 243/280
태그: #イベント情報
게시 상태: pending
Telegram 전달 상태(작성 시점): pending
최초 발견: 2026-11-12T00:00:00.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인
```

### Private Issue Markdown

````text
<!-- astro-events-jp:event:c07a0cff8829c4ee57102ad97883ffc6b7027a7fb11d3c958230ae9aaf6c0b4c -->
보고서 버전: dev06-1
【天文・宇宙イベント管理】
행사: 合成・中国地方公民館観測会
종류: applications-open
개최일/기간: \{"precision":"datetime","startDate":"2026-11-23","endDate":"2026-11-23","startMonth":null,"endMonth":null,"startDatetime":"2026-11-23T13:30:00\+09:00","endDatetime":"2026-11-23T15:00:00\+09:00","doorsTime":null,"raw":"開催日2026年11月23日 13:30〜15:00"\}
일정 기준: applicationStart
장소: 合成公民館（岡山県津山市）
도도부현/시정촌: 33 / unknown
주최자: 合成天文台
공식 URL: <https://example.jp/events/synthetic>
예약: confirmed \{"required":true,"method":"advance","selection":"lottery","capacity":null,"reception":null\}
요금: confirmed \{"participation":"paid","entrance":"unknown","tiers":\[\{"label":"参加費","yen":500,"scope":"participation"\}\]\}
신청 시작: confirmed \{"precision":"date","startDate":"2026-11-15","endDate":null,"startMonth":null,"endMonth":null,"startDatetime":null,"endDatetime":null,"doorsTime":null,"raw":"申込開始2026年11月15日"\}
신청 마감: unknown null
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00\.000Z
검증 만료: 2026-11-18T00:00:00\.000Z
revision: 1
X 가중 길이: 243/280
태그: \#イベント情報
게시 상태: pending
Telegram 전달 상태\(작성 시점\): pending
최초 발견: 2026-11-12T00:00:00\.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인

### X 복사용 본문

```text
申込開始のご案内：「合成・中国地方公民館観測会」
申込開始：2026年11月15日
会場：合成公民館（岡山県津山市）
開催予定です。
事前申込が必要です。抽選制です。
開催日時：2026年11月23日 13:30〜15:00
参加費 500円
https://example.jp/events/synthetic
#イベント情報
```

### 검증 근거
- title: 合成・中国地方公民館観測会 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- kind: 申込開始 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- organizer: 主催：合成天文台 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- location: 会場：合成公民館（岡山県津山市） — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- schedule: 開催日2026年11月23日 13:30〜15:00 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- applicationStart: 申込開始2026年11月15日 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- fee: 参加費500円 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- reservation: 要事前予約 抽選 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- status: 開催予定 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
````

## deadline — A / 231/280

```text
「合成・近畿大学星空講座」の申込締切のご案内です。
申込締切：2026年11月20日
会場：合成大学（京都府京都市）
開催予定です。
事前申込が必要です。
開催日時：2026年11月23日 13:30〜15:00
参加費 500円
https://example.jp/events/synthetic
#イベント情報
```

### B 管理

```text
【天文・宇宙イベント管理】
행사: 合成・近畿大学星空講座
종류: deadline
개최일/기간: {"precision":"datetime","startDate":"2026-11-23","endDate":"2026-11-23","startMonth":null,"endMonth":null,"startDatetime":"2026-11-23T13:30:00+09:00","endDatetime":"2026-11-23T15:00:00+09:00","doorsTime":null,"raw":"開催日2026年11月23日 13:30〜15:00"}
일정 기준: applicationDeadline
장소: 合成大学（京都府京都市）
도도부현/시정촌: 26 / unknown
주최자: 合成天文台
공식 URL: https://example.jp/events/synthetic
예약: confirmed {"required":true,"method":"advance","selection":null,"capacity":null,"reception":null}
요금: confirmed {"participation":"paid","entrance":"unknown","tiers":[{"label":"参加費","yen":500,"scope":"participation"}]}
신청 시작: unknown null
신청 마감: confirmed {"precision":"date","startDate":"2026-11-20","endDate":null,"startMonth":null,"endMonth":null,"startDatetime":null,"endDatetime":null,"doorsTime":null,"raw":"申込締切2026年11月20日"}
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00.000Z
검증 만료: 2026-11-18T00:00:00.000Z
revision: 1
X 가중 길이: 231/280
태그: #イベント情報
게시 상태: pending
Telegram 전달 상태(작성 시점): pending
최초 발견: 2026-11-12T00:00:00.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인
```

### Private Issue Markdown

````text
<!-- astro-events-jp:event:0ae084145dfc8db117c7433f4ccc999f11caebd782345c645cea427a5df5b203 -->
보고서 버전: dev06-1
【天文・宇宙イベント管理】
행사: 合成・近畿大学星空講座
종류: deadline
개최일/기간: \{"precision":"datetime","startDate":"2026-11-23","endDate":"2026-11-23","startMonth":null,"endMonth":null,"startDatetime":"2026-11-23T13:30:00\+09:00","endDatetime":"2026-11-23T15:00:00\+09:00","doorsTime":null,"raw":"開催日2026年11月23日 13:30〜15:00"\}
일정 기준: applicationDeadline
장소: 合成大学（京都府京都市）
도도부현/시정촌: 26 / unknown
주최자: 合成天文台
공식 URL: <https://example.jp/events/synthetic>
예약: confirmed \{"required":true,"method":"advance","selection":null,"capacity":null,"reception":null\}
요금: confirmed \{"participation":"paid","entrance":"unknown","tiers":\[\{"label":"参加費","yen":500,"scope":"participation"\}\]\}
신청 시작: unknown null
신청 마감: confirmed \{"precision":"date","startDate":"2026-11-20","endDate":null,"startMonth":null,"endMonth":null,"startDatetime":null,"endDatetime":null,"doorsTime":null,"raw":"申込締切2026年11月20日"\}
행사 상태: scheduled / confirmed
검증: Verified
확인 시각: 2026-11-12T00:00:00\.000Z
검증 만료: 2026-11-18T00:00:00\.000Z
revision: 1
X 가중 길이: 231/280
태그: \#イベント情報
게시 상태: pending
Telegram 전달 상태\(작성 시점\): pending
최초 발견: 2026-11-12T00:00:00\.000Z
변경 정보: 현재 검증 revision 1
재확인: 전송/조작 직전 현재 게이트 재검사; 불명확한 선택 필드는 확정 안내하지 않음
이미지: 없음; 공식 출처 링크 확인

### X 복사용 본문

```text
「合成・近畿大学星空講座」の申込締切のご案内です。
申込締切：2026年11月20日
会場：合成大学（京都府京都市）
開催予定です。
事前申込が必要です。
開催日時：2026年11月23日 13:30〜15:00
参加費 500円
https://example.jp/events/synthetic
#イベント情報
```

### 검증 근거
- title: 合成・近畿大学星空講座 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- kind: 申込締切 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- organizer: 主催：合成天文台 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- location: 会場：合成大学（京都府京都市） — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- schedule: 開催日2026年11月23日 13:30〜15:00 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- applicationDeadline: 申込締切2026年11月20日 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- fee: 参加費500円 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- reservation: 要事前予約 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
- status: 開催予定 — <https://example.jp/events/synthetic> (2026-11-12T00:00:00\.000Z)
````
