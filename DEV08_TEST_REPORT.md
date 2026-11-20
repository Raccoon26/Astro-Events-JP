# DEV-08 검사와 한계

검증 기준은 DEV-07의 743개/52파일과 기존 0001~0009다. baseline 해시 검사와 R01~R32 및 DEV-08 1~20절 매핑으로 기존 테스트·fixture·migration 변경 여부를 확인한다. 일반 코드 번들, 일본어 X 공식 규칙과 DEV-06/07의 원문 복사·Reports 멱등·App 모의 인증 검사를 함께 실행한다.

- `nationwide.test.ts`는 장기 합성 데모와 재시작, 폭주·quota 분리, 47현 aging 및 JST 날짜 경계와 일본어·emoji·X 가중 길이를 확인한다.
- `nationwide-integration.test.mjs`는 로컬 native D1의 CAS/Collector lease, 승인·host backoff, 공식 분류·형식·실제 발견의 분리, 주말 기간과 취소 제외·복수 세션·별도 목적·Telegram 복사·중복과 실패·rollback을 재현한다.
- 실제 신규 정보원은 공식 원문 조사 항목에만 포함한다. 네트워크 없는 합성 Verified 행사, 모의 전달 및 공급자 영수증은 실수신이나 신규 발견 통계에 포함하지 않는다.

로컬 Windows workerd의 D1 metadata로 각 시험의 조회/쓰기 행을 기록한다. E 드라이브 reports 하위 `dev08-scheduler-meter.json`, `dev08-weekend-meter.json`을 참조한다. 수치에는 준비·재검증·재실행 등 시나리오별 여러 데이터베이스 호출이 포함된다. 수집기 외부 요청, 사이트 응답·공식 CPU·실제 장기 운영 성능은 이 측정에서 얻지 않았다.

`scripts/nationwide.mjs` 관리는 E 로컬의 registry와 `--apply --local-budget`을 사용한다. 원격 D1은 0004를 유지한다. 기존 staging 자동 배포는 Health 및 운영 상태 확인 범위에 있다. 최종 통과 수와 PR·main 증거는 E 완결 보고서 및 GitHub Actions 결과를 참조한다.
