# DEV 완료 체크리스트

> DEV-01R 현재 결과(2026-11-13 JST): staging·production 원격 Worker/D1·마이그레이션·staging 복구/rollback·Health/Cron·실제 CPU·승인된 Actions 배포를 검증했다. [원격 검증 결과](DEV01R_REMOTE_REPORT.md)가 최신 근거이며 아래 DEV01~03 당시의 보류 기록은 이력이다. 수집·알림=false, active0, production Cron0. 최종 문서 PR/CI/병합/main SHA는 E 완료 보고서 기준이다.

DEV01 추가 gate: Free플랜/계정전체여유, 두DB실ID·provider/내부marker, 원격migration·staging CRUD/TimeTravel·Worker rollback·Health/Cron·실CPU·조건부배포를 실제검증해야 **운영환경완료**다. 인증이 보류되면 local구현/테스트만 명시하여 merge할 수 있지만 DEV01 운영완료로 표시하지 않는다. 사용자 지시로 DEV02/03 로컬개발은 분리할 수 있지만 실운영 선행조건은 유지한다. production에는 테스트삭제/복구를 수행하지 않는다. 상세 현재상태는 PROJECT_STATUS 및 외부최종보고서가 기준이다.

- [ ] 원격/로컬·현재DEV·기존변경/보호 검토
- [ ] R01~R32·원요청0~24와 구현/후속조건 대조
- [ ] 변경파일·회귀·비밀/public-private 검토
- [ ] E preflight·cache/temp경로·전후DryRun보고
- [ ] test/type/lint/format/build/schema/security/requirements 통과
- [ ] 문서·PROJECT_STATUS 완료/미완료/버그/사용자조치 갱신
- [ ] DEV commit/push·main PR·최신head CI/승인/충돌/보호 확인
- [ ] 안전병합/AutoMerge 또는 차단PR유지·증거
- [ ] merge SHA·main최신·작업트리 확인·최종보고
- [ ] 다음DEV 자동진입 없음

매 DEV 실행 양식이다. 실제 DEV00 결과는 PROJECT_STATUS와 PR/CI를 기준으로 한다.

DEV02 gate: 원본0001/0002보존, Seed검증/현별커버리지/공식성-수집승인분리, 로컬D1 Import/DryRun/반복0쓰기/rollback/환경격리, 기존48회귀, 전체check 및 최신head CI/안전병합을확인한다. 47코드지원과47현공식출처확보 및active개수는별도보고한다. 未確認계정은Verified에포함하지않는다.

DEV03 gate: 원본0001~0003보존·4형식파서·HTTP/정책/SSRF경계·리다이렉트robots·크기/인코딩·캐시/429·후보/이미지unknown·Discoveryreview·원자적복구/커서/소규모배치·벤치마크·기존79회귀·전요구감사·E/DryRun·최신PR HEAD CI/안전병합을확인한다. 실제공식수집0/승인0과Workers peer보장미확인·DEV01원격보류를성공으로바꾸지않는다.

## DEV-01R 원격 기반

DEV01R 게이트: Free 직접확인/OAuth·계정사용량·자원충돌, 두D1/ID/0001~4/marker·CRUD/원격복구는 실증한다. staging 배포/Health/오류·Cron 실제실행·공식CPU/메모리·D1카운터·별도CI토큰 검증/배포·production 승인/배포·rollback·사용량 재조회·기존178회귀·E/DryRun·최신PR quality/보호/병합/main동기화까지 확인해야 전체완료다. 아직 실행하지 않은 항목은 보고서에서 pending으로 남긴다.

## DEV04 구현 경계

DEV04: 기존206 목적/0001~0004 checksum·신규0005 로컬FK/무결성·원자성/경쟁·현재Verified게이트·도구DryRun/원격거부·제한크기/secret·두환경/collector/verifier build·전체check·원본요구R01~32와DEV04감사·E정리를 확인한다. production migration은 별도 사용자승인 전 금지다. 실제active/수집0·Collection/Notifications=false·productionCron0과 기존Health를 보존한다. CPU 로컬/원격은 별도 보고한다.
