# DEV 완료 체크리스트

DEV06 추가 조건: 기존597개 목적/0001~0007 hash, 13종 A/B copy 동등성, Private Issue fail-closed, callback actor/chat/message/버전/만료/CAS, 부분 전달·uncertain·lease·rollback·재조정, native D1/workerd, CLI Dry Run, 신규0008 로컬 ledger/FK/quick_check, 샘플 재현성과 전체 check를 확인한다. 실제 발송0/remote migration0/production 변경0을 감사한다. R17/R18의 실제 수신과 전체 CPU는 별도 승인 미검증으로 남긴다. complete:dev·최신 HEAD CI·보호 준수 squash·main fast-forward·clean 확인은 생략하지 않는다.

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

## DEV05 현재 구현

DEV05 gate: 기존350목적/25파일·0001~5 SHA, 13종샘플 자기검토, 공식길이fixture hash/conformance·Unicode, 현재Verified재검사/출력/원자저장/재실행0쓰기·실패/경쟁, 로컬0006/FK/무결성, 두환경/collector/verifier/posts build, 전체check·E정리·R01~32/0~21감사·최신PR HEAD quality/보호/병합/main clean을 확인한다. production/원격migration·실수집·발행은 금지한다. 실제staging CPU는 실행증거가 있을 때만 별도 기록한다.

DEV05 최종 결과는 [완료보고](DEV05_COMPLETION.md)를 따른다. 전체539개/32파일 검사·기존350목적을 보존했고0006/0007은 E 로컬/격리만 적용했다. 원격두DB0004·생성/수집/알림OFF이며 최신 소표본 CPU P99 16.958ms로10ms 충족을 보장하지 않는다. 마지막 증거 PR도 complete:dev의 전체검사·필수CI·보호준수병합·main동기화 대상이다.

## DEV05R CPU 조사

[측정 설계](CPU_PROFILE_DESIGN.md)·[원격 결과/미검증](DEV05R_CPU_REPORT.md)·[독립 실행/checkpoint 경계](FREE_EXECUTION_PIPELINE.md)를 따른다. 기존539목적·0001~0007·R01~R32/DEV06~10을 보존하며 원격0004/production불변·수집/알림OFF·SSRF fail-closed다. main/CI/Free 예산 후 고정340요청 비교와 의미 있는 순수 준비 변경의170요청 후속 실험을 완료했다. 중간404 실패3건도 보존하고 준비 marker 회귀 후 재검증했다. 각 실험은 정확한 finally rollback을 확인했고 지연 지표는 읽기 전용 재조회했다. 최신597개/39파일·실측의 범위와 누락은 [최종 보고](DEV05R_COMPLETION.md)를 따른다. 원격 실제 검증/저장 및 전체 운영 성능을 성공으로 추정하지 않는다.

## DEV-07 안전 게이트

현 main/PR #30·708개 기준, 0001~0008 해시, 0009 로컬 D1 FK/무결성·rollback·경합, 공식 일본어 표기·예약 창·Issue 재사용·오래된 본문 및 버튼 차단·Secret 검사·E Dry Run·최신 필수 CI와 protected merge를 확인한다. 합성 시험 수신은 사용자 확인 범위만 기록한다. GitHub App의 최소권한 설치·clock/만료/폐기·Free CPU·실수신은 DEV-09/10 운영 승인 게이트로 남긴다. DEV-08 자동 시작을 금지하고 원격 0004·실제 전송 0·production 변경 0을 유지한다.

## DEV-08 범위 확인

PR #31 기준·743개 회귀·0001~0009 checksum을 확인한다. 47현 aging·VTuber 독립·예산/429 cursor, 원문 URL과 review, JST·개별/모음 구분·현재 revision·X 길이·모의 Outbox/CAS·0010 로컬 FK/rollback을 확인한다. 운영 플래그와 원격 0004를 유지한다. E 정리 Dry Run, 전체 check, 최신 GitHub quality, 보호 준수 병합 및 main 동기화를 기록한다. DEV-09를 자동 시작하지 않는다.
