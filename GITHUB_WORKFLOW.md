# GitHub 자동 완료

DEV01도 검증된 complete:dev를 그대로 사용한다. 작업브랜치는 dev/dev-01-cloudflare-foundation이며 기존main quality/보호는 완화하지 않는다. 원격인증차단은 검사실패와 구분하여 문서/PR에 명시하고 안전한로컬코드는 기존PR/CI절차로 통합한다. 운영환경DEV01완료판정은 별도이다.

main CI성공후 조건부staging 배포 및 승인기반production 배포를 추가했다. 활성화변수false와 환경별Secret미등록으로 현재실배포는 수행하지 않는다. Workflow가 skipped이면 배포성공이 아니다. 배포자체는DB마이그레이션/삭제를 실행하지 않는다. 상세조건은 DEPLOYMENT 참조.

기반 등록 후에는 Windows PowerShell에서 `npm.cmd run complete:dev -- --reviewed` (Linux는 npm)로 품질검사부터 commit/push/PR/CI대기/안전병합/main동기화까지 실행할 수 있다. npm.ps1 래퍼가 --reviewed를 누락시키는 환경에서는 npm.cmd를 사용한다. --reviewed는 요구사항·회귀·공개diff·상태문서를 검토한 운영자 표시이며 검토를 자동대체하지 않는다. 최대12분 대기 후 조건미충족이면 PR을 남기고 중단한다. Push 직후 API가 이전조상 head를 반환하면 최대60초 전파를 기다리되, 예상SHA 일치전에는 병합하지 않는다. 기존비대화형 Git인증이 없으면 Codex GitHub 연결로 같은 절차를 수행하며 토큰입력을 강요하지 않는다. 최초 DEV00 CI등록/보호설정은 별도부트스트랩한다.

대상은 Astro-Events-JP(public, main)와 Astro-Events-JP-Reports(private, Issues)뿐이다. 기존변경/커밋/브랜치/보호를 읽고 보존한다. DEV00은 dev/dev-00-foundation이다. 최초초기화외 main직접개발push, force push, 브랜치자동삭제는 금지한다.

1. diff·전체REQUIREMENTS·coverage·회귀·누락을 검토한다.
2. npm run check 전부통과, 문서/PROJECT_STATUS 갱신, 공개diff 비밀/실보고를 검토한다.
3. DEV브랜치 commit/push. 기존Codex/로컬Git 인증을 쓰며 CI에 불필요한쓰기권한을 주지 않는다.
4. main PR 자동생성/갱신. 결과·요구ID·검증·제약을 기록한다. 본문은 structured API나 body-file로 전달한다.
5. 최신head SHA의 모든필수CI/status·기존승인·충돌·미해결검토·보호조건을 조회/대기한다. 실패는 수정/재검증/새commit. 이전head 결과는 재사용하지 않는다.
6. 조건충족시 AutoMerge 또는 expected head SHA 지정 merge. 권한/승인/충돌/보호 차단시 PR유지·정확한원인보고. admin우회 금지.
7. 실제merged/merge SHA·main ref를 조회하고 fetch/fast-forward. 최종보고 후 다음DEV 자동진입 금지.

CI는 contents:read, immutable Action SHA, credentials 비보존. Actions는 CI/배포만 담당하고 PR생성은 Codex/로컬인증이 하므로 Actions PR쓰기설정이 필요없다. allow_auto_merge=true를 유지한다.

기존보호는 완화하지 않는다. 신규보호는 quality가 실제1회 성공한 후 main PR필수·required quality + up-to-date·enforce_admins=true·forcepush/삭제금지. 기존리뷰요구는 보존하며 신규승인수0은 사용자 자동병합 요구와 맞춘다. 보호해제/우회는 없다. owner의 설정변경권한까지 영구차단한다고 주장하지 않는다.

초기: c353a19·main만·Actions0·rulesets0·보호없음. connector admin endpoint는403이었다. 기존로컬 Git credential을 메모리에서만 사용하는 관리API인증이 가능했다. Reports private생성/재조회, 실제PR/CI/보호/병합결과는 PROJECT_STATUS에 기록한다.

DEV02도기존complete:dev -- --reviewed를사용한다. check에Seed검증과로컬D1시험을추가하고CI권한·quality필수·보호·배포비활성변수는변경하지않는다. DEV01원격보류는PR에명시하되로컬DEV02통합과분리한다. Seed/공식근거는공개데이터지만실제행사보고/비밀은Public에기록하지않는다.
