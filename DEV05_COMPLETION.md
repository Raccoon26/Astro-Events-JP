# DEV05 완료 보고 — 2026-11-16 JST

**로컬 기능 구현·전체 검사·구현 PR 병합 완료. 실제 제품 운영은 OFF이며 Free 10ms CPU 충족은 미확인이다.** 기준 DEV04 main은24b8880936a76167ad286f592620c51cdbd5e0ef, 최신 구현 main은d56ebbb676bdbc16c8a069f847ae288e3a46ec56이다. 마지막 증거 문서 PR의 실제 CI/병합/main 동기화는 E reports/github-completion 기록과 최종 대화 보고에서 제공한다. 아래 CPU 제한과 후속 검증을 삭제해 Production 준비 완료로 간주하지 않는다.

| 항목              | 실제 결과와 근거                                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 최종 상태      | DEV05 로컬 생성·영속화·관리 기능을 구현하고 GitHub PR18~21을 보호 조건에 따라 병합했다. 원격 CPU/전체 DB 파이프라인의 운영 성능 보장은 남아 있다.                                                                                                                               |
| 2. 13종           | observation/open-day/space/lecture/exhibition/vtuber/merchandise/closure/reopening/cancellation/postponement/applications-open/deadline 전부 구현. 각2개 결정적 문체와 짧은 대체 구성을 지원한다. [템플릿](POST_TEMPLATES.md).                                                  |
| 3. Verified 연결  | PostStore가 VerificationStore.capture/verified를 내부 호출하고 출력/저장 직전 재확인한다. 현재 후보·fingerprint·근거·규칙·승인·시설·VTuber·만료·revision을 검사하고 조건부 원자 쓰기로 경합/과거 입력을 거부한다. status 문자열이나 호출자가 만든 객체만 신뢰하지 않는다.       |
| 4. 일본어 품질    | 독립 합성13종을 자동 검사하고 문법·사실·날짜·조사·과장·반복·복사 본문을 개발자가 자기 검토했다. 원어민 실사용자 검수는 미실시다. [가이드](JAPANESE_STYLE_GUIDE.md).                                                                                                             |
| 5. 반복 완화      | event/revision/kind/templateVersion 기반 안정적 변형을 선택한다. 무작위/현재 시각에 따른 본문 변동을 피하고 제목·장소·날짜의 불필요한 중복을 줄였다.                                                                                                                            |
| 6. 정확성         | confirmed 필드만 확정 문장으로 사용한다. 입장/참가비·0엔 등급/전체무료·예약/선착순/추첨·신청/개최·조건부/확정 취소·정기/임시휴관을 구별한다. 미확인/충돌 정보와 상대 시점 주장을 보류한다. 기존 요금 버그 수정으로 검증규칙 dev04-3을 사용하며 이전 판정은 재검증이 필요하다.   |
| 7. 공식 가중길이  | twitter-text3.1.0/twemoji-parser11.0.2와 v3 설정을 고정했다. upstream30e2430d90cff3b46393ea54caf511441983c260의 변경하지 않은44개 공식 weighted/방향 fixture를 원본 구현과 native workerd에서 대조한다. [정책](X_WEIGHTED_LENGTH.md).                                           |
| 8. 280 초과       | 전체 문장 재구성→선택 정보 생략→두 번째 태그 생략 순서이며 제목·핵심 날짜/상태/예약·공식URL·태그1개를 유지한다. 그래도 초과하면 실패/수동 검토, 불완전한 글은 저장하지 않는다. slice 절단은 없다.                                                                               |
| 9. URL/태그       | 정확한 공식URL 하나와 관련 태그1~2개를 최종 전체 가중길이에 포함한다. URL은23가중자, 공식 태그는 근거가 있을 때만 우선하며 미검증 팬 태그를 공식 태그로 만들지 않는다. Unicode/HTML/제어/방향/위험URL/토큰 입력을 거부한다.                                                     |
| 10. 전체 샘플     | [POST_SAMPLES.md](POST_SAMPLES.md)에13종 본문·weightedLength·버전을 제공한다. 모두 명시적 합성이며 실제 공식 행사 수에 포함하지 않는다. npm run posts:samples로 E reports에 출력하며 --check는 저장된 샘플의 재현성을 검사한다.                                                 |
| 11. 저장/멱등     | 기존 generated_posts/UNIQUE를 보존하고 결정적 ID·현재 게이트·D1 batch/CAS·롤백/재시작을 검사했다. 같은 입력 반복 저장은0쓰기다. 이력은 현재 유효 본문 출력과 분리한다.                                                                                                          |
| 12. revision/버전 | event revision·decision ID·입력/content digest·규칙/템플릿/길이정책 버전·만료를 연결한다. ja-v1/ja-v1.1과 서로 다른 revision은 별도 결과이며 오래된 행의 현재 출력은 차단한다.                                                                                                  |
| 13. migration     | 새0006_posts.sql과0007_post_read_indexes.sql을 추가했다. 기존0001~0005는 SHA 감사로 보존한다. 0007은 Verified부분 covering index와 행사별 이력 커서 인덱스다.                                                                                                                   |
| 14. D1 상태       | E 로컬 staging/격리 D1만0001~0007 적용·FK/무결성·재실행을 검사했다. 원격 staging/production은0001~0004/identity2 그대로이며 새 기능 view0·Source/Event/Candidate0이다. 원격 migration/Seed Import는0이다.                                                                       |
| 15. Free 상태     | 실제 진단마다 기존 Actions 인증으로 Workers Free·계정 전체 예산·Cron 여유를 검사했다. 마지막 보고는 요청28/D1읽기226·쓰기0/저장778240B/Cron1이다. 지연 집계이며 월 비용/전국 처리량 보장이 아니다. 유료 전환/서비스 도입은 없다.                                                |
| 16. CPU/D1 측정   | 아래 공식 소표본 표와 로컬 비용을 구분한다. 최신 요청 CPU P50 4.453/P99 16.958ms·오류0, startup22ms이다. 10ms 충족·전13종·대형 입력·실제 검증/저장 전체 파이프라인 성능은 미확인이다.                                                                                           |
| 17. 기존350 보존  | 25파일의 원본 목적을 유지한다. 24파일/기존fixture는 원본 SHA 그대로, 1파일은 규칙버전 기대값 한 곳만 dev04-2→3으로 수정했다. audit-dev05는 이 치환만 역변환해 원본 SHA를 검사한다. 실패 시험 제거/skip은 없다.                                                                  |
| 18. 전체 검사     | 최신 구현 전체539개/32파일, typecheck/Biome·두Worker/collector/verifier/posts build·공식 conformance·nativeD1/workerd·보안/npm audit0·요구 감사·로컬D1에 통과했다. 마지막 문서 변경도 complete:dev에서 전체 재검사 후 CI/병합한다. [실패 및 재시험 이력](DEV05_TEST_REPORT.md). |
| 19. 보안          | 기존Secrets/최소 권한/production 승인/branch protection을 유지했다. 추가 토큰·OAuth 연결을 요구하지 않았다. 노출값 없이 기존 OAuth 갱신·읽기 전용 최종 검증을 수행했다. twitter-text의 구형 core-js2/punycode deprecation 경고는 남지만 보고된 의존성 취약점은0이다.            |
| 20. E/정리        | 실제 Windows E 경로·repo/cache/temp/auth/log/report를 preflight로 검사하고 전후 cleanup Dry Run을 저장했다. 지정 C:/Astro-Events-JP 및 D:/Astro-Events-JP 후보는 없음·삭제0. C/D 전체 무잔여나 외장하드 물리 분리 시험을 했다고 주장하지 않는다.                                |
| 21. 요구 감사     | R01~R32/DEV05 요청0~21 및 기존 DEV 범위를 dev05-coverage.json과 requirements-coverage.json으로 감사한다. 전국47현/지역소규모/기관/대학/시설/VTuber·이미지·후속 보고/중복/보관/균형/운영을 삭제하거나 완료로 위장하지 않았다.                                                    |
| 22. 남은 문제     | Free10ms 요청 CPU 보장, 원격0005~0007/전체 검증·저장 성능, 실제 사이트 승인/수집, Workers peer/TLS IP 보장, 원어민 실사용 검수는 미완료다. 猫谷ここな의 공식 교차링크도 미확인이다. 실제 행사0·수집승인0을 유지한다.                                                            |
| 23. 변경 파일     | 아래 전체 목록은 DEV04 기준부터 현재까지의 변경이다. 원문 공식 fixture는 라이선스/출처/hash를 기록했으며 외부 사이트 원문이나 이미지 바이너리는 없다.                                                                                                                           |
| 24. GitHub        | PR18~21은 아래 SHA 표의 필수 CI 성공 후 squash 병합했다. 마지막 증거 PR도 main 직접 push/force/보호 우회/브랜치 삭제 없이 complete:dev를 사용한다. 실제 최종 PR/개발SHA/mainSHA와 clean 일치는 최종 보고에 제공한다.                                                            |
| 25. DEV06 준비    | 복사용 본문과 관리 메타데이터를 분리한 PostDelivery 및 로컬 현재 게이트 인터페이스는 준비됐다. 실제 발행 전 현재 상태 재검사·원격 schema/성능·별도 단계 승인/검증이 필요하다. DEV06은 시작하지 않았다. 실제 수집/X/Telegram/Reports/이메일·자동삭제는 전부 OFF다.               |

## 실제 staging 진단과 한계

| main / Actions run                                                                             | 공식 표본                                                                        | CPU P50 / P99(ms) | 결과                                                                                       |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------ |
| ff79092 / [43872693538](https://github.com/Raccoon26/Astro-Events-JP/actions/runs/43872693538) | Health 포함5요청, 212가중자 고정 합성 생성3회                                    | 3.041 / 19.583    | 오류0·원래 버전100% 복구                                                                   |
| 53dcd7a / [43875528015](https://github.com/Raccoon26/Astro-Events-JP/actions/runs/43875528015) | Health 포함4요청, 210가중자 고정 합성 생성3회                                    | 2.614 / 20.720    | 오류0·원래 버전100% 복구                                                                   |
| 714d01b / [43879903909](https://github.com/Raccoon26/Astro-Events-JP/actions/runs/43879903909) | Health 포함5요청, 210가중자 고정 합성 생성3회                                    | 5.293 / 23.064    | 오류0·원래 버전100% 복구                                                                   |
| d56ebbb / [43882405606](https://github.com/Raccoon26/Astro-Events-JP/actions/runs/43882405606) | 임시버전1d200e4d-842e-42e2-9b54-648ec687cf79, Health 포함4요청/210가중자 생성3회 | 4.453 / 16.958    | 오류/subrequests0·Wrangler startup22ms·원래bef3a3e4-0158-4e33-bee3-8409bf3b9d60을100% 복구 |

수치는 공식 GraphQL workersInvocationsAdaptive의 microseconds 단위를 introspection으로 확인한 뒤 ms로 변환했다. CPU는 경과시간이 아니며 P99는 평균도 아니다. 입력/포함 Health 수가 달라 엄밀한 동일조건 비교가 아니고 각4~5요청으로 신뢰구간/장기 안정성을 보장하지 않는다. 공식 메모리 P99 최신3236140B도 전체 입력의 최대치 보장이 아니다. 각 생성 요청은 Health D1 SELECT1 읽기/0쓰기만 사용했고 외부 수집·게시 요청/실제 검증 데이터 저장은0이었다.

Cloudflare는 드문 초과를 위한 유연성을 제공하지만 반복 CPU 초과는1102로 중단될 수 있다. [공식 CPU 한도](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)와 [별도 startup 한도](https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time)를 구분한다. 고정 순수 파서 초기화를 startup으로 옮겨도 실제 본문 검증은 요청마다 수행하며 최신 P99가10ms를 넘었으므로 성능 완료로 표시하지 않는다. 검증/생성/저장은 분리된 작은 실행 단위로 유지하고 운영 활성화 전 추가 진단·최적화가 필요하다.

실제 14:22UTC 읽기 전용 재검증에서 양쪽 Health200·/benchmark/posts404·D1 환경/바인딩 분리·0001~0004·새기능 view0·각Source/Event/Candidate0을 확인했다. staging Cron1, production Cron0·Collection/Notifications=false이다. production 버전e524cb3c-8714-4a6c-a529-1819b3c7f4e4는 변경하지 않았다. OAuth 읽기 검증은 각93행읽기/0쓰기였으며 원격 DB 복구/마이그레이션은 이번 DEV에서 실행하지 않았다. 기존 원격 복구 결과는 DEV01R 기록을 보존한다.

## 로컬 비용·검사 증거

- 저장 소표본33 API calls/statements·95행읽기·4행쓰기(인덱스 비용 포함), 반복0쓰기. preview/get/현재 재검사 비용을 생략하지 않는다.
- 2001개 ID 힌트 커서41페이지/최대50행·2044읽기/0쓰기. 초기 합성 등록14000쓰기·DB446464→1077248B. 실제2001건 Verified 저장/출력 시험은 아니다.
- 5000개 Review 행+1개 Verified 힌트의 조회2행읽기/0쓰기. 인덱스 부재는 전체 스캔 대신 fail-closed다.
- 2000개 순수 합성 생성은25개 단위로 검사했다. elapsed/heap delta는 로컬/GC 의존 수치이며 Cloudflare CPU나 최대 메모리로 보고하지 않는다. 최신값은 E reports/dev05-local-render-benchmark.json에 저장한다.
- E reports/dev05-{d1-measurement,cursor-benchmark,sparse-verified-cursor,startup-cpu-query-output,remote-final}.json, logs/dev05-_-github-completion.log 및 reports/github-completion-_.json에 재현 증거를 보존한다. Secrets는 포함하지 않는다.

## 구현 PR 이력

| PR                                                         | 개발 HEAD                                | 병합 main                                | 필수 검사                  |
| ---------------------------------------------------------- | ---------------------------------------- | ---------------------------------------- | -------------------------- |
| [18](https://github.com/Raccoon26/Astro-Events-JP/pull/18) | 16fd037523abcf4d55d50ed070b92acc2d8daf0d | ff79092d6620adb5a630921b556fe60842b5fdcc | 514개/30파일·전체 check/CI |
| [19](https://github.com/Raccoon26/Astro-Events-JP/pull/19) | d0868104306e260a27f0b206419f80b4746a475f | 53dcd7a12bd8e54e60e5f271039614db13f713ce | 519개/31파일·전체 check/CI |
| [20](https://github.com/Raccoon26/Astro-Events-JP/pull/20) | a239a069f405b5c5ae9c9fa59831747e8c4a8b79 | 714d01bafca05166b67a65fad2268fe410a402ed | 533개/31파일·전체 check/CI |
| [21](https://github.com/Raccoon26/Astro-Events-JP/pull/21) | e713b740009d7f8a68849acc7c210e030f3c37a1 | d56ebbb676bdbc16c8a069f847ae288e3a46ec56 | 539개/32파일·전체 check/CI |

## 전체 변경 파일

72개 파일(기준 DEV04 main 대비):

```text
.github/workflows/deploy.yml
ARCHITECTURE.md
DATA_MODEL.md
DEPLOYMENT.md
DEV05_COMPLETION.md
DEV05_TEST_REPORT.md
DEV_ROADMAP.md
DISASTER_RECOVERY.md
FREE_TIER_POLICY.md
GITHUB_WORKFLOW.md
JAPANESE_STYLE_GUIDE.md
LOCAL_DEVELOPMENT.md
POST_GENERATOR_DESIGN.md
POST_SAMPLES.md
POST_TEMPLATES.md
PROJECT_STATUS.md
README.md
RELEASE_CHECKLIST.md
REQUIREMENTS.md
SECURITY.md
TEST_PLAN.md
VERIFICATION_POLICY.md
X_WEIGHTED_LENGTH.md
biome.json
data/dev05-baseline.json
dev05-coverage.json
migrations/0006_posts.sql
migrations/0007_post_read_indexes.sql
package-lock.json
package.json
requirements-coverage.json
scripts/audit-dev05.mjs
scripts/build-posts.mjs
scripts/cloudflare-ci.mjs
scripts/cloudflare-policy.mjs
scripts/cloudflare.mjs
scripts/coverage.mjs
scripts/deployment-health.mjs
scripts/post-bundle-policy.mjs
scripts/post-samples.mjs
scripts/posts.mjs
scripts/staging-diagnostics.mjs
scripts/verifier.mjs
src/post-management-api.ts
src/posts/benchmark.ts
src/posts/index.ts
src/posts/length.ts
src/posts/native-compat.ts
src/posts/remote-benchmark.ts
src/posts/render.ts
src/posts/store.ts
src/posts/synthetic-profile.json
src/posts/temporal.ts
src/posts/types.ts
src/posts/x-v3.json
src/twitter-text.d.ts
src/verification/conditions.ts
src/verification/store.ts
src/verification/types.ts
tests/fixtures/twitter-text/LICENSE
tests/fixtures/twitter-text/origin.json
tests/fixtures/twitter-text/v3.json
tests/fixtures/twitter-text/validate.yml
tests/post-fixtures.ts
tests/post-length.test.ts
tests/post-render.test.ts
tests/posts-benchmark.test.ts
tests/posts-cli.test.mjs
tests/posts-integration.test.mjs
tests/posts-native-bundle.test.mjs
tests/posts-startup.test.mjs
tests/verification-policy.test.ts
```
