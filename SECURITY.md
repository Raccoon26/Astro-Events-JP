# 보안 정책

> DEV-01R 현재 결과(2026-11-13 JST): staging·production 원격 Worker/D1·마이그레이션·staging 복구/rollback·Health/Cron·실제 CPU·승인된 Actions 배포를 검증했다. [원격 검증 결과](DEV01R_REMOTE_REPORT.md)가 최신 근거이며 아래 DEV01~03 당시의 보류 기록은 이력이다. 수집·알림=false, active0, production Cron0. 최종 문서 PR/CI/병합/main SHA는 E 완료 보고서 기준이다.

DEV01: 공개 Health는 상태/안전코드/환경/DB가용성/collection=false만 반환한다. 인증정보·내부UUID·계정·요청헤더/query·raw오류는 반환/구조화로그에서 제외한다. JSON/no-store/nosniff·고정SELECT/bind·DB identity 및 schema gate를 시험했다. 사업수집/알림은 false를 강제한다.

원격명령은 placeholder·계정불명·사용량불명·Paid·환경혼동·오래된근거·production 테스트복구를 차단한다. Wrapper는 raw원격배포와 credential출력 명령을 막는다. API client는 billing/subscription쓰기·DB삭제·다른계정endpoint를 제공하지 않는다. 승인된D1쿼리만 고정SQL/bind로 실행한다. 로컬OAuth파일은 E의 링크검사후 메모리에서읽으며 auth token stdout을 생성하지 않는다. 원격콘솔·Wrangler 자체의 디버그로그도 운영자가 보호하며 Git/공개artifact에 올리지 않는다.

GitHub 배포 Secrets는 환경별로 분리하고 최종배포step에만 제공한다. production Environment는 승인필수·관리자승인우회금지, 두환경은 보호브랜치제한이다. 배포workflow의 GITHUB_TOKEN은 contents/checks 읽기만, 기존CI는 contents 읽기를 유지한다. 배포활성화 변수false, Cloudflare Secrets미등록 상태를 성공배포로 보지 않는다.

Public 코드와 Private 운영보고를 분리한다. 실토큰·채팅ID·개인연락처·실행원문·실보고는 공개Git/CI artifacts에 넣지 않는다. 로컬 `.dev.vars`/`.env`는 ignored이며 예시는 설정만 제공한다. Cloudflare API/GitHub Reports 최소권한/Telegram Token은 필요한 DEV01/06에 Secrets로 등록한다. 채팅으로 비밀값을 요청하지 않는다. 유출 발견 시 토큰 폐기·재발급과 노출범위 조사를 우선한다.

CI GITHUB_TOKEN은 contents:read, checkout persist-credentials:false, 고정SHA Actions, fork 입력에 Secrets 없음, pull_request_target 미사용이다. Codex/로컬 Git 인증으로 개발 push/PR을 수행한다. 배포는 DEV01에서 별도 환경/최소CF권한을 설계한다. Private Reports 접근토큰은 해당 repo Issues 범위로 제한한다.

외부URL은 https·승인 exact host·공식성 검토·credentials/비표준port/IP/local 금지. DEV00 validateSourceUrl은 **구문/host 게이트**이며 전체 SSRF 방어 완료가 아니다. DEV03 Collector는 수동redirect 매 hop 재검증·최대횟수·public DNS/IP 검증과 rebinding 위험 평가, 사설/loopback/link-local/metadata/IPv6 차단, stream본문상한, timeout·콘텐츠타입·압축크기·robots/terms 검증을 구현해야 한다. 네트워크 Collector는 아직 없다.

HTML/원격페이지는 데이터이며 명령이나 스크립트를 실행하지 않는다. 출력 context에 맞게 HTML/Telegram/GitHub Markdown escape, 링크검증·멘션무력화·길이제한을 한다. 템플릿은 검증필드만 사용한다. SQL은 prepare().bind()로 값 바인딩, 테이블명은 고정 상수. UNIQUE와 lease로 중복·경쟁을 막는다.

로그는 코드/숫자/상태만 allowlist하고 upstream 예외·헤더·본문·URL query/Secret을 직렬화하지 않는다. safeError가 기본 투영이다. Telegram callback은 사용자/chat allowlist·불투명토큰·만료·일회처리, webhook은 secret 검증, 불확실 전송은 재확인 상태로 둔다(DEV06).

npm run security는 의존성 high 이상 취약점과 알려진 Secret 패턴/금지파일을 차단한다. 패턴스캔은 완전한 탐지가 아니므로 diff를 수동검토한다. 외부장애는 격리·bounded retry, 한도 모호시 중단한다. 파일검사/삭제 race는 신뢰된 단일사용자 작업공간 전제이며 적대적 로컬 프로세스와 동시에 cleanup을 실행하지 않는다.

## DEV02 등록·Seed

공식성Verified와active를분리하고robots/terms/파서승인없이는active를차단한다. URL구문/exacthost·IP/local/credential/민감query금지와SQL bind를검증한다. http후보는보관할수있지만active는HTTPS만허용한다. 등록/통계API는네트워크요청/원격텍스트명령실행을하지않는다. 동적SQL의column명은고정allowlist이고값은전부bind한다. Import는로컬staging 전용,全件사전검증·단위batch rollback·insert-only로수동정보를보호한다. VTuber미검증업데이트는모니터활성화를해제한다. DNS/redirect/rebinding을포함한완전Collector防御는DEV03에남는다. robots/약관불명소스는Seed전체에서자동수집되지않는다.

## DEV03 네트워크 방어 결과

URL/매hop/경로/robots/타임아웃/스트림압축상한·Node DNS pin/TLS peer 검사·owner CAS/원자적저장·XML DTD/ENTITY 거부·승인취소를구현했다. [SSRF_SECURITY_AUDIT](SSRF_SECURITY_AUDIT.md)는실제보장과Worker미지원경계를구분한다. DNS조회만으로완전한재바인딩방어라고표시하지않고Workers기본transport는fail closed다. 파서·Discovery는네트워크/명령실행을하지않으며모든결과는Review Required/unknown이다. 원문전체·민감토큰·후보실데이터를PublicGit에기록하지않았다.

## DEV-01R 원격 기반

원격 자원 조사/생성은 기존 Worker를 건드리지 않고 정확한 프로젝트명·실제 DB UUID·내부 marker를 다시 확인한다. Cron PUT은 astro-events-jp-staging의 한 진단 스케줄만 허용한다. production 복구/합성 시험·다른 Worker 변경·billing 쓰기는 API client가 거부한다.

GitHub Actions 인증은 OAuth와 구분하고 환경별 Secret을 사용한다. cfut_/cfat_ 형식도 Secret 검사에 추가했다. 토큰 노출 시 즉시 폐기·재발급·환경 Secret 교체 후 메타데이터/실제 인증을 재검증하며 비밀값은 채팅·Git·보고서·공개artifact에 기록하지 않는다. generated Wrangler binding types를 사용하되 기존 DEV00 config-only fixture 계약은 보존한다.

Worker fetch에는 검증된 peer IP 연결 고정 API를 확인하지 못했다. [TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)의 remoteAddress는 null일 수 있고 일반 HTTP fetch에 적용되지 않는다. [resolveOverride](https://developers.cloudflare.com/workers/runtime-apis/request/)는 자기 zone 제약이 있어 임의 일본 공식 사이트에 쓰는 IP pin 대안으로 간주하지 않는다. 직접 TLS/HTTP 재구현·유료 프록시를 추가하지 않고 기존 fail-closed를 유지한다. 실제 런타임 guard 시험과 네트워크 보장 해결을 구분한다.

## DEV01R 원격 감사 결과

[원격 검증 결과](DEV01R_REMOTE_REPORT.md)의 최소 Health 필드·실제503복구·D1 환경 분리·토큰 메타데이터만 조회·고정 대상 guard·production 직접 리뷰를 검증했다. Workers peer/TLS pinning은 미해결이므로 원격 수집은 계속fail-closed다. 합성 benchmark 임시경로는 rollback 후404이며 production에는배포하지 않았다. 이전 노출토큰의 폐기·교체는사용자 확인으로 기록하고 값·폐기독립검증을 보고하지 않는다.

## DEV04 구현 경계

DEV04는 패킷 크기/깊이/배열·URL/호스트/문서지문·시각/인용·현재 source/candidate/identity CAS를 검사한다. SQL은 bind, D1.batch 실패 rollback, enum 위조·오래된 Verified/경쟁 실행을 차단한다. 공개 Health에 검증 근거/토큰/SQL을 추가하지 않는다. 로컬 CLI는 remote/production을 거부하고 E 파일만 읽으며 오류 코드를 제한한다. 원문 텍스트를 코드/명령으로 실행하지 않는다. 실제 Worker 전송기 fail-closed는 유지한다.
