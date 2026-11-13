# Astro-Events-JP

> DEV-01R 현재 결과(2026-11-13 JST): staging·production 원격 Worker/D1·마이그레이션·staging 복구/rollback·Health/Cron·실제 CPU·승인된 Actions 배포를 검증했다. [원격 검증 결과](DEV01R_REMOTE_REPORT.md)가 최신 근거이며 아래 DEV01~03 당시의 보류 기록은 이력이다. 수집·알림=false, active0, production Cron0. 최종 문서 PR/CI/병합/main SHA는 E 완료 보고서 기준이다.

일본 전국 천문·우주·연구기관·지역 소규모 행사, 시설 운영 정보, 관련 VTuber 소식을 공식 출처로 검증하고 일본어 X 복사용 완성 글과 이미지 출처를 전달하는 무료 운영 프로젝트입니다. X 게시자는 사용자입니다.

DEV-03의 RSS/Atom/HTML/Sitemap 수집·후보/이미지·Discovery 라이브러리와 DEV-01R의 실제 staging/production Workers·별도 D1 기반을 검증했습니다. 실제 정보원 수집 승인과 실전 Collector 시험은0개이며 수집/알림은 비활성화입니다. 행사 검증·일본어 게시글·Telegram 등은 후속 DEV 범위입니다. TypeScript / Workers Free·Cron / D1 / GitHub CI·Private Reports Issues / Telegram을 사용합니다.

```powershell
Set-Location E:\Astro-Events-JP\repo
. .\scripts\environment.ps1
npm ci
npm run d1:local
npm run check
npm run cleanup
```

| 문서                                                                              | 역할                          |
| --------------------------------------------------------------------------------- | ----------------------------- |
| [PROJECT_STATUS](PROJECT_STATUS.md)                                               | 실제진행·검증·차단·PR         |
| [REQUIREMENTS](REQUIREMENTS.md) / [DEV_ROADMAP](DEV_ROADMAP.md)                   | v1.0 기준선·DEV00~10 완료조건 |
| [ARCHITECTURE](ARCHITECTURE.md) / [DATA_MODEL](DATA_MODEL.md)                     | 모듈·흐름·스키마·보관         |
| [SOURCE_POLICY](SOURCE_POLICY.md) / [FREE_TIER_POLICY](FREE_TIER_POLICY.md)       | 공식출처·이미지권리·무료한도  |
| [SECURITY](SECURITY.md) / [TEST_PLAN](TEST_PLAN.md)                               | 보안·검증범위                 |
| [LOCAL_DEVELOPMENT](LOCAL_DEVELOPMENT.md) / [CLEANUP_POLICY](CLEANUP_POLICY.md)   | E드라이브·안전정리            |
| [GITHUB_WORKFLOW](GITHUB_WORKFLOW.md) / [RELEASE_CHECKLIST](RELEASE_CHECKLIST.md) | 자동commit/push/PR/CI/병합    |

Cloudflare 재개는 [CLOUDFLARE_SETUP](CLOUDFLARE_SETUP.md), 배포는 [DEPLOYMENT](DEPLOYMENT.md), 복구는 [DISASTER_RECOVERY](DISASTER_RECOVERY.md)를 참고합니다. 실제 ID/Free 계정/사용량이 미확인되면 원격 배포를 차단합니다. 월0엔은 목표이며 실측 전 전국조사 속도를 보장하지 않습니다.

전국 Seed·도도부현별 부족현황은 [SOURCE_COVERAGE](SOURCE_COVERAGE.md), 등록 API/공정성은 [SOURCE_REGISTRY](SOURCE_REGISTRY.md), 로컬 Import 명령은 [SEED_GUIDE](SEED_GUIDE.md), 4인 계정근거는 [VTUBER_VERIFICATION](VTUBER_VERIFICATION.md)를 참조합니다. 자동수집승인은0이며 공식성확인과수집허가를구분합니다.

수집 엔진은 [COLLECTOR_DESIGN](COLLECTOR_DESIGN.md), 형식은 [PARSER_SUPPORT](PARSER_SUPPORT.md), 보안 한계는 [SSRF_SECURITY_AUDIT](SSRF_SECURITY_AUDIT.md), 측정은 [COLLECTION_BENCHMARK](COLLECTION_BENCHMARK.md)를 참조합니다. 운영 Worker/Cron·알림에는 연결하지 않았습니다.

DEV-01R: 실제 OAuth/Free·두 D1·마이그레이션·staging Time Travel/Worker rollback·두 Worker Health·Cron·CPU·승인된 Actions 배포를 검증했습니다. [원격 검증 결과](DEV01R_REMOTE_REPORT.md)와 [현재 상태](PROJECT_STATUS.md)를 참조하세요. 수집·알림은 계속 비활성화이며 DEV04는 자동 시작하지 않습니다.

## DEV04 구현 경계

DEV04는 후보→필드근거 검증→현재버전 VerifiedEvent 게이트, 시설 영향/이미지 권리, 원자적 D1저장과 안전한 로컬 CLI를 제공한다. [검증 설계](VERIFICATION_DESIGN.md)·[관리 안내](VERIFICATION_POLICY.md)·[검사 보고](DEV04_TEST_REPORT.md). 실제Source active0·실제 검증행사0, 수집/알림OFF이며 원격0005 미적용이다. 일본어 게시글/Telegram은 후속DEV다.
