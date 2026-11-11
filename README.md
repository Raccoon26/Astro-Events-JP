# Astro-Events-JP

일본 전국 천문·우주·연구기관·지역 소규모 행사, 시설 운영 정보, 관련 VTuber 소식을 공식 출처로 검증하고 일본어 X 복사용 완성 글과 이미지 출처를 전달하는 무료 운영 프로젝트입니다. X 게시자는 사용자입니다.

현재 DEV-00 기반 구축 단계입니다. 실제 수집·게시글 생성·Telegram Bot은 후속 DEV에서 구현합니다. TypeScript / Workers Free·Cron / D1 / GitHub CI·Private Reports Issues / Telegram을 사용합니다.

```powershell
Set-Location E:\Astro-Events-JP\repo
. .\scripts\environment.ps1
npm ci
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

초기 README 프로젝트명/소개를 유지해 안내를 확장했습니다. 월0엔은 목표이며 무료CPU/쿼리한도로 수집이 지연·중단될 수 있습니다. 실측 전 전국전수조사 속도를 보장하지 않습니다.
