# DEV-09 3시간 작업 예약과 장애 복구

기준 main `7dd75ce4297e7df3ef6e28d3109af3e3c8fdd7da`와 PR #32를 사용했다. DEV-08까지의 회귀 시험 766개, 마이그레이션 0001~0010, Active 0 및 기존 배포 보호를 유지한다.

- UTC `0 */3 * * *`는 JST 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00이다. JST 00:00 슬롯에서 전일 운영 보고와 정리를 추가 예약한다.
- 슬롯 기록 후 작업 한 단계마다 독립 호출한다. 지역·범주·VTuber 조사기, 합성 Collector, 후보 검토, 공식 변경 및 예약 창, 일본어 게시 준비, 합성 Outbox, 주말 모음을 연결한다. 증거가 부족한 후보는 기존 검토 경로를 사용한다.
- 장부의 소유자·만료·세대·D1 CAS, 예산 직렬화, 현재 revision 재검사와 배송 증거를 복구에 사용한다. Local CLI는 E 격리 DB만 지원한다. 운영자 보고는 일일 자료를 저장하고 두 채널의 초안을 생성할 수 있다.
- 보관 정리와 GitHub 인증은 별도 계약으로 유지한다. Private Issue 연결 자료를 보호한다. App JWT/installation token 모의 교환과 폐기를 검증하며 실제 App·키·Secret 변경은 후속 승인 대상이다.

[복구](DEV09_RECOVERY_REPORT.md) · [보관](DEV09_RETENTION_REPORT.md) · [Free 예산](DEV09_FREE_BUDGET_REPORT.md) · [회귀](DEV09_TEST_REPORT.md)

양쪽 원격 D1은 0004이고 0011은 로컬/격리에서 적용한다. 원격 staging 기존 Cron은 진단 전용이다. Collection/Notifications=false, production Cron 0, Source active 0, Worker SSRF fail-closed를 유지한다. 실전 수집·발송·X·Private Issue 변경·데이터 삭제는 0건이다. 실제 승인된 전송기, 파서부터 Outbox까지의 공식 CPU, 전체 Observability 사용량, GitHub App 설치와 장기 토큰 순환은 DEV-10 운영 승인 게이트다. DEV-10은 자동 시작하지 않는다.
