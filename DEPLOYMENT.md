# 검증된 코드의 조건부 배포

DEV01 현재 실제 Cloudflare 배포는 **인증 보류로 미수행**이다. GitHub staging/production 환경은 생성했다. 두 환경 모두 보호 브랜치만 허용하며 production은 Raccoon26 승인 필수, 관리자 승인우회 금지다. 계정 권한의 영구 변경불가를 보장하는 것은 아니다. 배포활성화 repo 변수 CF_STAGING_DEPLOY_ENABLED / CF_PRODUCTION_DEPLOY_ENABLED는 false이다. 건너뛴 배포 workflow를 원격 배포 성공으로 계산하지 않는다.

`.github/workflows/ci.yml`의 기존 quality 게이트를 보존했다. deploy.yml은 main의 CI push 실행 성공 이후 staging에만 자동 배포할 수 있다. production은 main에서 workflow_dispatch, target=production, 확인문구 astro-events-jp-production, GitHub Environment 승인 모두 필요하다. 모든 단계는 고정 SHA Actions와 contents:read, 추가 CI검증에 필요한 checks:read만 사용한다. Cloudflare 토큰은 검사/설치 단계에 주지 않고 최종 배포 단계에만 전달한다. 외부 fork의 workflow_run/PR은 배포하지 않는다.

배포 시 checkout SHA와 origin/main이 같고 작업트리가 깨끗해야 한다. verify-deployment-ci는 해당 SHA의 GitHub Actions 앱 quality 성공을 재확인한다. 오래된 main이나 다른 브랜치를 배포하지 않는다. 로컬 수동 배포도 먼저 전체 check와 main CI를 확인해야 한다.

`cloudflare.mjs deploy staging`은 실제 ID/계정·Free/15분 이내 계정사용량·대상 DB의 provider ID/이름·내부 환경 marker·schema version을 확인한다. 같은 이름의 기존 Worker가 있으면 동일 프로젝트 DB binding인지 검사하며 다른 DB를 참조하면 덮어쓰지 않는다. 신규 배포에서 이름충돌 확인과 자원변경 사이의 race는 단일 운영자 전제로 제한한다. 직접 Wrangler 원격 명령은 wrapper가 차단하며 애플리케이션 guard를 사용한다. 이는 실수방지이며 계정 소유자의 직접 API 사용 자체를 차단하는 장치는 아니다.

배포는 마이그레이션/초기화/테스트삭제와 분리한다. production confirmation flag는 `--confirm-astro-events-jp-production`이다. 배포 후 실제 workers.dev /health의 HTTP 상태·환경·collection=false를 검사한다. 데이터 수집·알림은 모든 환경에서 false를 코드/설정으로 강제한다. 두 Cron도 읽기 전용 진단만 수행한다. Secrets는 환경별로 자동상속되지 않으므로 각 GitHub 환경/Worker에서 독립 관리한다. Telegram Secrets는 DEV06 이전에 요구하지 않는다.

실패시 안전한 코드와 target을 E reports에 기록하며 raw API 오류/헤더/Secrets는 출력하지 않는다. 자동 재시도는 **0회**, 전체 Actions15분·개별 Wrangler180초·API15초·Health10초로 제한한다. 일부 단계 실패 전 이미 버전/스케줄 변경이 적용됐을 수 있으므로 "실패=아무 변경 없음"으로 단정하지 않는다. 이전 버전·현재 deployment를 조회하고 staging에서 검증한 절차로 복구한다. 실패를 해결하려고 DB를 삭제/초기화하지 않는다. production rollback은 자동 실행하지 않는다.

원격 API 스키마·권한·실제 배포/실패/rollback은 인증 후 통합 검증할 항목이다. 현재 테스트는 정책·API 오류 격리·로컬 런타임과 두 환경 bundle 검증이다. 인증 완료 전 production 활성화·실수집은 금지한다.
