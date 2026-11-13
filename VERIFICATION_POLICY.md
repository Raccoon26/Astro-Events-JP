# 행사 검증·관리 정책

## 판정

Verified는 현재 공식 출처의 승인·후보 버전·주체 관계와 필수 사실이 확인되고 모순이 없는 경우만 가능하다. 일반 현장 행사는 제목/유형/개최일/주최자/장소/도도부현을 요구한다. 온라인 명시 근거가 있으면 물리 장소/지역은 필요 없다. 월 단위 전시는 월 정밀도로 허용하지만 관측회는 정확한 날이 필요하다. 취소/연기 공지는 직접적인 공식 상태 근거가 핵심이며 새 개최일·현장 장소가 없다는 이유로 이를 정상 개최 행사처럼 거절하지 않는다. 날짜 미정 연기는 미정으로 유지한다.

신청 개시/마감과 굿즈 예약은 primaryDateField가 신청 창을 가리킬 수 있다. 이 날짜를 Event 개최일로 복사하지 않는다. 요금/예약 미기재는 unknown/null이고 무료·예약 불필요로 채우지 않는다. 상충/모호한 선택 필드를 확정 문장으로 노출하지 않는다. 권리 unknown은 행사 사실의 Verified를 차단하지 않는다.

Review Required: 연도/장소/공식 관계 부족, 요일/날짜/요금 충돌, 낡은 근거, 변경된 원문, 미지원 표현, 시설 영향 불명. Blocked: 위험 URL, 손상/위조 digest, 잘못된 검토 입력 등 명시적 보안 위반. 일반 누락을 Blocked로 처리하지 않는다. 수동 검토도 Verified를 강제로 지정할 수 없다.

## 일본어 지원 범위

명시적 연도 포함 연월일·슬래시 날짜, 시간, 開場/開始 분리, 명시적 기간/翌日, 월 정밀도, 요일 검사를 지원한다. 표시는 원문/JST(+09:00), 비교·DB의 실제 datetime은 UTC ISO다. 날짜-only/month는 별도 date/month 열과 메타데이터에 저장하며 00:00/23:59를 만들지 않는다. 연도 미기재·서로 구분되지 않은 여러 날짜·역전 기간·잘못된 날짜·연도 없는 연말연초 기간·공휴일 상대 표현·해석 불명 문장은 보류한다. 현재 연도/게시일로 보충하지 않는다.

참가 무료/입장 무료/참가자별 엔화 요금, 예약 필수/불필요/당일, 선착순/추첨/정원, 접수중/개시전/종료/만석/대기를 구별한다. 입장 무료와 불명확한 금액의 혼합·부정형 표현은 보류한다. 할인/회원/복잡한 조건부 가격은 범용 추론으로 단순화하지 말고 검토한다. 신청 마감/만석은 행사 취소·종료가 아니다.

雨天中止/荒天時は延期/延期の可能性는 조건이며 확정 취소/연기가 아니다. 직접 공식 中止/延期/새 일정은 revision 근거로 남긴다. 404/날씨/검색 누락/시설 휴관만으로 상태를 바꾸지 않는다. 다른 Source 간 의미적 중복/연례 회차·변경 탐지는 DEV07이다.

## 수동 CLI: 네트워크0, 로컬 staging만

PowerShell에서 scripts/environment.ps1을 먼저 적용한다. npm run verifier:init는 migration 미리보기, -- --apply --enable-verifier --local-budget은 전용 로컬 registry의0005 적용이다. 기존0004 ledger/identity를 요구하고 원격/production 옵션은 거부한다.

npm run verifier:pending -- --limit 25 --cursor ID --group general (또는 vtuber), verifier:stats, verifier:history -- --candidate ID, verifier:notices -- --facility ID, verifier:notice-history -- --notice ID를 제공한다. 모든 목록은 최대50행, 이력은 --after revision 커서다. stats는 저장된 판정 수이며 현재 게이트 통과 수가 아니다.

npm run verifier:review -- --candidate ID --file E:/Astro-Events-JP/reports/review.json 은 필드·근거·이유 Dry Run이다. 파일은24KiB 이하 E 전용 경로·링크 없음 검사를 통과해야 한다. 적용하려면 --apply --enable-verifier --local-budget --source SOURCE --fingerprint CURRENT_SHA256를 추가한다. reviewedAt/reason/relationship/documents/assertions는 src/verification/types.ts의 ReviewPacket을 따른다. 현재 후보와 맞지 않거나 근거가 오래되면 거부/보류된다.

verifier:images는 권리·추천 미리보기, verifier:facility는 패킷의 연결 시설 영향, verifier:notice는 공지 미리보기/동일한 명시적 적용 장치를 제공한다. 승인되지 않은 사이트를 방문하거나 Source를 active로 전환하는 명령은 없다. 보고서는 E reports/dev04-verifier-*.json, 에러는 안전한 코드만 기록한다. 실제 행사 적용0, 합성 자료는 격리 시험 DB에만 넣는다.
