# DEV05R 결과와 운영 제한

## 1. 병목과 적용 변경

기존 4~5건의 Health 혼합 P99만으로 원인을 확정할 수 없었다. 실제 local workerd CDP에서 URL/emoji 파싱·가중길이·첫 실행의 비용과 JSON/SHA/GC·native D1 단계를 구분했다. 과거 원격 첫 생성 CPU16.958ms/startupCPU22.176ms와 후속 두 생성 집계P99 4.794ms도 분리 조회했다. 첫 경로 비용은 확인했지만 모든 원격 tail latency의 단일 원인을 증명한 것은 아니다.

공식 twitter-text3.1.0/v3를 유지하면서 중복 scalar 검사 제거, 제한된 고정 합성 startup 준비, 요청별 SHA 유지, 동일 snapshot proof/body digest 재사용, D1 marker3쿼리→1쿼리를 적용했다. 실제 입력의 현재 Verified·문서/fingerprint/revision/만료/시설/VTuber/CAS 게이트는 매번 다시 검사한다. 사실·신뢰 결정의 무효화 가능한 캐시는 추가하지 않았다.

## 2. 원격 실측과 표본 한계

[CPU 상세 보고](DEV05R_CPU_REPORT.md)는 각 실험의 실제 전송/관측/누락, 첫 생성/후속, 시작 CPU와 upload startup, wall time, provider sampling을 구분한다. [설계](CPU_PROFILE_DESIGN.md)의 고정17개 합성 입력과 기준 Git 코드를 사용한다. 공식 GraphQL의 단일 요청과 일치한 표본만 경험적 P50/P95/P99/관측최대·10ms 초과율에 포함하며 누락을0ms로 추정하지 않는다.

1차 Actions43894888853: baseline170전송/167관측 CPU P50/P95/P99=1.628/3.603/5.182ms, 관측최대15.220ms·초과1/167. 초기 optimized170/168 CPU1.687/3.421/7.423ms, 최대12.805ms·초과1/168. 후속167관측은 P99 6.427ms·최대7.423ms·초과0. baseline PDX와 optimized SEA의 조건 차이가 있어 수치만으로 인과적 개선을 주장하지 않는다. Health는 집계 창에서 제외했다.

후속43900596338은 HTTP404 세 건으로 중단했고 생성 성공으로 집계하지 않았다. 원래 staging 버전을 복구했다. 배포별 공개 marker의 bounded 준비 검사를 추가한 PR25의 CI 이후 새로운 진단을 실행했다. 최종 후속 실측 결과와 목표 달성 범위는 상세 보고의 마지막 절을 따른다.

## 3. 무료 운영·남은 구조적 한계

P99≤8ms와 cold/전체 pipeline의 안정성은 서로 다른 판정이다. 작은 합성 표본으로 모든 입력·3시간 Cron·최대 데이터량의10ms 충족을 보장하지 않는다. 원격0004에는 verification/post 저장 구조가 없으므로 전체 gate/저장 원격 CPU는 미측정이다. 실제 운영은 계속 차단한다.

[무료 독립 실행 계획](FREE_EXECUTION_PIPELINE.md)은 기존 checkpoint/CAS를 다음 작은 Cron invocation이 소비하도록 연결한다. 함수 분리·await·waitUntil만으로 CPU 한도가 새로 생기지 않는다. 필요하면 pending draft→별도 가중길이 검사→최신 gate CAS 저장으로 분리하되 새 migration/lease/실패 복구·실제 독립 invocation의 무료 한도 실증 전까지 완료로 표시하지 않는다. 별도 서비스·유료 자원은 만들지 않았다.

## 4. 보존·검사·데이터 상태

- 기존539개/32파일의 검증 목적과 fixture/migration0001~0007을47파일 SHA 감사로 보존했다. 현재 전체589개/38파일 통과. 공식44 weighted conformance·17고정 결과의 JSON 바이트 동등성·13종 문장·Unicode/URL/emoji·native workerd·현재 gate/CAS/rollback/멱등/0불필요쓰기 시험을 포함한다.
- 타입·Biome·두 Worker/collector/verifier/posts build·보안/Secret·npm audit0·R01~R32·로컬 D1 migration/FK/무결성 검사를 통과했다. DEV06~10 요구사항은 미구현 후속 범위로 보존했다.
- migration 추가/수정0. 로컬/격리0001~0007, 원격 staging/production0001~0004. native D1 save33→27문장·95읽기/4쓰기, replay0쓰기. 이 표본은 로컬이며 실제 Cloudflare CPU나 원격 전체 저장 비용으로 보고하지 않는다.
- Source96/공식성77/47현/시설92/VTuber4·active0·실제 사이트/검증행사/게시/알림0 유지. 猫谷ここな 관계 미확인, 이미지 unknown, Workers peer/TLS fail-closed를 보존한다.

## 5. 안전·비용·환경

각 원격 실험은 기존 Free 계정의 사용량/512요청·1024읽기 여유와 현재 main CI를 확인하고 고정 합성만 실행한다. 본문 생성 한 건의 진단 D1 SELECT는 읽기1/쓰기0·외부 subrequest0이다. staging만 임시 변경하고 finally에서 캡처한 정확한 원래 버전100%/Health200을 확인한다. production은 변경하지 않으며 Cron0·Collection/Notifications=false·원격 migration 자동 적용 금지를 유지한다.

유료 제품·Paid 전환·새 자원/광범위 권한·추가 토큰·외부 유료 API를 사용하지 않았다. Free 계정 사용량은 provider 지연/샘플링이 있어 요청 로그와 다를 수 있다. 이 작업에서 결제 설정을 변경하지 않았으며 청구서 전체나 다른 프로젝트 비용까지0이라고 검증한 것은 아니다.

실제 Windows E 경로/캐시/temp/auth/log/reports 검사와 cleanup Dry Run을 수행했다. 삭제0·정의된 C/D 후보만 검사하며 전체 C/D 무잔여나 물리적 외장하드 분리 시험을 했다고 주장하지 않는다. 보고서는 E:/Astro-Events-JP/reports와 logs에 있다.

## 6. GitHub·다음 단계

PR23(main17b5122), PR24(main068a91d), PR25(main041a662)는 complete:dev로 전체검사·최신 HEAD CI·기존 관리자 포함 보호·expected HEAD squash·main fast-forward를 수행했다. PR24의 Linux 메시지 기대값 실패는 보안 동작을 유지한 회귀 수정 후 새 HEAD로 통과했다. 실패를 제거/skip/무작정 재실행하지 않았다. 후속 최종 근거 PR의 실제 SHA/병합/clean 상태는 E reports/github-completion과 최종 대화 보고에 기록한다.

DEV06의 로컬 개발 기반은 유지되지만 실제 수집·보고 운영은 CPU 전체 경로, 원격 schema 승인, 사이트 승인, peer/TLS 보안, 후속 lease/outbox 실증 전까지 차단한다. DEV06은 시작하지 않았다. 즉시 필요한 새 사용자 토큰/권한은 없다.

## 전체 변경 파일

기준157aaab6 이후 변경 52개. 변경 상세와 테스트 연결은 dev05r-coverage.json을 따른다.

- `.github/workflows/deploy.yml`
- `ARCHITECTURE.md`
- `CPU_PROFILE_DESIGN.md`
- `DATA_MODEL.md`
- `DEPLOYMENT.md`
- `DEV05R_COMPLETION.md`
- `DEV05R_CPU_REPORT.md`
- `DEV_ROADMAP.md`
- `FREE_EXECUTION_PIPELINE.md`
- `FREE_TIER_POLICY.md`
- `GITHUB_WORKFLOW.md`
- `POST_GENERATOR_DESIGN.md`
- `PROJECT_STATUS.md`
- `README.md`
- `RELEASE_CHECKLIST.md`
- `REQUIREMENTS.md`
- `SECURITY.md`
- `SSRF_SECURITY_AUDIT.md`
- `TEST_PLAN.md`
- `X_WEIGHTED_LENGTH.md`
- `data/dev05r-baseline.json`
- `data/dev05r-remote-summary.json`
- `dev05r-coverage.json`
- `package.json`
- `scripts/audit-dev05r.mjs`
- `scripts/cloudflare-ci.mjs`
- `scripts/cloudflare.mjs`
- `scripts/complete-dev.mjs`
- `scripts/coverage.mjs`
- `scripts/cpu-metrics.mjs`
- `scripts/cpu-readiness.mjs`
- `scripts/deployment-health.mjs`
- `scripts/post-profile-build.mjs`
- `scripts/post-profile-corpus.mjs`
- `scripts/profile-post-store.mjs`
- `scripts/profile-posts.mjs`
- `scripts/read-cpu-matrix.mjs`
- `scripts/staging-cpu-matrix.mjs`
- `scripts/wrangler-failure.mjs`
- `scripts/wrangler-runner.mjs`
- `src/posts/cpu-benchmark.ts`
- `src/posts/length.ts`
- `src/posts/profile-baseline.d.ts`
- `src/posts/profile-corpus.json`
- `src/posts/render.ts`
- `src/posts/store.ts`
- `tests/cpu-cli.test.mjs`
- `tests/cpu-metrics.test.mjs`
- `tests/cpu-native.test.mjs`
- `tests/cpu-optimization.test.ts`
- `tests/cpu-readiness.test.mjs`
- `tests/wrangler-failure.test.mjs`

## 최종 실측 판정

Actions44095339230의 고정170생성은 전부 성공했다. 공식 단일 CPU140관측/누락30에서 P50/P95/P99=2.407/4.689/6.364ms·최대8.770ms·10ms초과0/140. 첫 생성1관측은5.224ms, upload startup19ms, provider memoryP99 5,342,808bytes·wallP50/P99 187.951/228.895ms·오류0·1102없음·170읽기/0쓰기·외부요청0이다. 제공자 집계CPU P99도6.364ms다. 실제 전송170과 adaptive 가중requests178을 구분한다. 이 관측 범위에서는 목표를 충족했으나 모든 cold/원격 전체 저장/3시간 Cron은 미보장이다. 이전과 colo·시각이 달라 개선률을 확정하지 않는다.

원래 staging3c12380a-d4b5-4ccc-b864-9a717a53b99e를100% 복구/Health200했다. production e524cb3c-8714-4a6c-a529-1819b3c7f4e4 불변·두 원격DB0004·flagsfalse·prodCron0을 재조회했다. Free 유지·결제/새자원/토큰 변경0, D1 검사 각93읽기/0쓰기. 원본과 계정 보고/누락/첫 실행의 상세는 DEV05R_CPU_REPORT.md 마지막 절 및 E reports에 있다.
