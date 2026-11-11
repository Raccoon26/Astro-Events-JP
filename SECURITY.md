# 보안 정책

DEV01: 공개 Health는 상태/안전코드/환경/DB가용성/collection=false만 반환한다. 인증정보·내부UUID·계정·요청헤더/query·raw오류는 반환/구조화로그에서 제외한다. JSON/no-store/nosniff·고정SELECT/bind·DB identity 및 schema gate를 시험했다. 사업수집/알림은 false를 강제한다.

원격명령은 placeholder·계정불명·사용량불명·Paid·환경혼동·오래된근거·production 테스트복구를 차단한다. Wrapper는 raw원격배포와 credential출력 명령을 막는다. API client는 billing/subscription쓰기·DB삭제·다른계정endpoint를 제공하지 않는다. 승인된D1쿼리만 고정SQL/bind로 실행한다. 로컬OAuth파일은 E의 링크검사후 메모리에서읽으며 auth token stdout을 생성하지 않는다. 원격콘솔·Wrangler 자체의 디버그로그도 운영자가 보호하며 Git/공개artifact에 올리지 않는다.

GitHub 배포 Secrets는 환경별로 분리하고 최종배포step에만 제공한다. production Environment는 승인필수·관리자승인우회금지, 두환경은 보호브랜치제한이다. 배포workflow의 GITHUB_TOKEN은 contents/checks 읽기만, 기존CI는 contents 읽기를 유지한다. 배포활성화 변수false, Cloudflare Secrets미등록 상태를 성공배포로 보지 않는다.

Public 코드와 Private 운영보고를 분리한다. 실토큰·채팅ID·개인연락처·실행원문·실보고는 공개Git/CI artifacts에 넣지 않는다. 로컬 `.dev.vars`/`.env`는 ignored이며 예시는 설정만 제공한다. Cloudflare API/GitHub Reports 최소권한/Telegram Token은 필요한 DEV01/06에 Secrets로 등록한다. 채팅으로 비밀값을 요청하지 않는다. 유출 발견 시 토큰 폐기·재발급과 노출범위 조사를 우선한다.

CI GITHUB_TOKEN은 contents:read, checkout persist-credentials:false, 고정SHA Actions, fork 입력에 Secrets 없음, pull_request_target 미사용이다. Codex/로컬 Git 인증으로 개발 push/PR을 수행한다. 배포는 DEV01에서 별도 환경/최소CF권한을 설계한다. Private Reports 접근토큰은 해당 repo Issues 범위로 제한한다.

외부URL은 https·승인 exact host·공식성 검토·credentials/비표준port/IP/local 금지. DEV00 validateSourceUrl은 **구문/host 게이트**이며 전체 SSRF 방어 완료가 아니다. DEV03 Collector는 수동redirect 매 hop 재검증·최대횟수·public DNS/IP 검증과 rebinding 위험 평가, 사설/loopback/link-local/metadata/IPv6 차단, stream본문상한, timeout·콘텐츠타입·압축크기·robots/terms 검증을 구현해야 한다. 네트워크 Collector는 아직 없다.

HTML/원격페이지는 데이터이며 명령이나 스크립트를 실행하지 않는다. 출력 context에 맞게 HTML/Telegram/GitHub Markdown escape, 링크검증·멘션무력화·길이제한을 한다. 템플릿은 검증필드만 사용한다. SQL은 prepare().bind()로 값 바인딩, 테이블명은 고정 상수. UNIQUE와 lease로 중복·경쟁을 막는다.

로그는 코드/숫자/상태만 allowlist하고 upstream 예외·헤더·본문·URL query/Secret을 직렬화하지 않는다. safeError가 기본 투영이다. Telegram callback은 사용자/chat allowlist·불투명토큰·만료·일회처리, webhook은 secret 검증, 불확실 전송은 재확인 상태로 둔다(DEV06).

npm run security는 의존성 high 이상 취약점과 알려진 Secret 패턴/금지파일을 차단한다. 패턴스캔은 완전한 탐지가 아니므로 diff를 수동검토한다. 외부장애는 격리·bounded retry, 한도 모호시 중단한다. 파일검사/삭제 race는 신뢰된 단일사용자 작업공간 전제이며 적대적 로컬 프로세스와 동시에 cleanup을 실행하지 않는다.
