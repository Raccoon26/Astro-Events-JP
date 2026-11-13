# 검증된 코드의 조건부 배포

> DEV-01R 현재 결과(2026-11-13 JST): staging·production 원격 Worker/D1·마이그레이션·staging 복구/rollback·Health/Cron·실제 CPU·승인된 Actions 배포를 검증했다. [원격 검증 결과](DEV01R_REMOTE_REPORT.md)가 최신 근거이며 아래 DEV01~03 당시의 보류 기록은 이력이다. 수집·알림=false, active0, production Cron0. 최종 문서 PR/CI/병합/main SHA는 E 완료 보고서 기준이다.

현재 staging/production 배포를 실제 검증했고 두 활성화 변수는 true이다. production은 main workflow_dispatch·정확한 확인문구·Raccoon26 Environment 승인을 매번 요구하며 자동 main 배포 대상은 staging뿐이다. skipped를 배포 성공으로 계산하지 않는다.

`.github/workflows/ci.yml`의 기존 quality 게이트를 보존했다. deploy.yml은 main의 CI push 실행 성공 이후 staging에만 자동 배포할 수 있다. production은 main에서 workflow_dispatch, target=production, 확인문구 astro-events-jp-production, GitHub Environment 승인 모두 필요하다. 모든 단계는 고정 SHA Actions와 contents:read, 추가 CI검증에 필요한 checks:read만 사용한다. Cloudflare 토큰은 검사/설치 단계에 주지 않고 최종 배포 단계에만 전달한다. 외부 fork의 workflow_run/PR은 배포하지 않는다.

배포 시 checkout SHA와 origin/main이 같고 작업트리가 깨끗해야 한다. verify-deployment-ci는 해당 SHA의 GitHub Actions 앱 quality 성공을 재확인한다. 오래된 main이나 다른 브랜치를 배포하지 않는다. 로컬 수동 배포도 먼저 전체 check와 main CI를 확인해야 한다.

`cloudflare.mjs deploy staging`은 실제 ID/계정·Free/15분 이내 계정사용량·대상 DB의 provider ID/이름·내부 환경 marker·schema version을 확인한다. 같은 이름의 기존 Worker가 있으면 동일 프로젝트 DB binding인지 검사하며 다른 DB를 참조하면 덮어쓰지 않는다. 신규 배포에서 이름충돌 확인과 자원변경 사이의 race는 단일 운영자 전제로 제한한다. 직접 Wrangler 원격 명령은 wrapper가 차단하며 애플리케이션 guard를 사용한다. 이는 실수방지이며 계정 소유자의 직접 API 사용 자체를 차단하는 장치는 아니다.

배포는 마이그레이션/초기화/테스트삭제와 분리한다. production confirmation flag는 `--confirm-astro-events-jp-production`이다. 배포 후 실제 workers.dev /health의 HTTP 상태·환경·collection=false를 검사한다. 데이터 수집·알림은 모든 환경에서 false를 코드/설정으로 강제한다. staging Cron1개는 읽기 전용 진단만 수행하고 production Cron은0개다. Secrets는 환경별로 자동상속되지 않으므로 각 GitHub 환경/Worker에서 독립 관리한다. Telegram Secrets는 DEV06 이전에 요구하지 않는다.

실패시 안전한 코드와 target을 E reports에 기록하며 raw API 오류/헤더/Secrets는 출력하지 않는다. 자동 재시도는 **0회**, 전체 Actions15분·개별 Wrangler180초·API15초·Health 요청당5초/최대8회로 제한한다. 경로 전파 확인은5초 간격, rollback version GET은1초 간격 최대8회이며 mutation 자체는 재시도하지 않는다. 일부 단계 실패 전 이미 버전/스케줄 변경이 적용됐을 수 있으므로 "실패=아무 변경 없음"으로 단정하지 않는다. 이전 버전·현재 deployment를 조회하고 staging에서 검증한 절차로 복구한다. 실패를 해결하려고 DB를 삭제/초기화하지 않는다. production rollback은 자동 실행하지 않는다.

원격 API 스키마·권한·실제 배포/실패/rollback은 인증 후 통합 검증할 항목이다. 실제 배포·staging 오류/복구·rollback·CPU 검증은 DEV01R_REMOTE_REPORT를 따른다. 인증 완료 전 production 활성화·실수집은 금지한다.

## DEV-01R 원격 기반

mode=validate를 추가해 배포 활성화 false 상태에서도 main CI/환경 보호를 거쳐 API 인증·구독/예산·실제 DB binding/marker를 읽기 전용으로 시험한다. 성공 뒤에만 환경별 활성화 변수를 변경한다. 고정 만료 CF_ACCOUNT_EVIDENCE Secret 대신 cloudflare-ci.mjs가 실행 시 공식 API로 당일 계정전체 근거를 갱신한다. Secret은 최종 단계에만 전달한다.

main-only·clean tree·quality·기존 production 리뷰 보호를 유지한다. staging 성공 후 production은 명시적 확인문구와 GitHub Environment의 사용자 승인을 거친다. 권한 오류나 API 스키마 불명은 배포를 중단한다. 최초 코드/설정 통합 PR 후 main 배포를 검증하고, 실제 원격 결과는 후속 문서 PR에 반영한다. 코드 병합 자체를 배포 성공으로 표시하지 않는다.

benchmark staging은 CI 검증된 main에서만 고정 합성 입력을 제공하는 임시 staging 버전을 배포한다. production은 거부한다. 초기 정상 version ID를 기록하고 시험 후 그 버전으로 rollback해 Health를 다시 확인한다. 새 Worker·유료 프록시·실제 사이트 요청·Source 승인을 만들지 않는다.

## DEV04 구현 경계

DEV04 검증 라이브러리는 배포 진입점에 연결하지 않아 OFF다. main 병합 후 기존 staging 자동배포는 Health/Cron만 보존하며0005를 자동 적용하지 않는다. 원격0004에서 verifier 조회/쓰기는 schema-unavailable/null로 fail-closed다. production의 새 배포/0005는 기존 승인 게이트와 별도 승인 절차를 유지한다. 수집/알림false·productionCron0은 고정이다.

DEV04 배포 이력11개 이후 회귀: 현재traffic 확인은 공식 최신배포1개 전용 쿼리를 사용한다. 계정전체 Worker/D1 인벤토리의 pagination 거부는 유지한다. 최초실패 run43450938834/43451095505는 실제실패 이력으로 보존하고 수정 후재검증한다.
