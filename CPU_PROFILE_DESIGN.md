# DEV05R CPU 조사·비교 설계

기준 main157aaab6eb284f3e65df85d5207ee6efcf8a60b8/기존539개·32파일/0001~0007을 보존한다. 이전 P99는 Health 포함4~5요청의 집계여서 cold/warm·입력별 원인을 확정하지 못했다. 이번에는 로컬 실제 workerd CDP 프로파일과 공식 원격 invocation 지표를 분리한다. 실제 자료·운영 성능 보장은 별도다.

## 조사 순서와 재현

Windows E repo에서 environment.ps1을 적용한다. `node scripts/profile-posts.mjs --baseline`은 Git의 고정 DEV05 코드를 번들링하며 `--cold`는 첫/후속 요청을 기록한다. 옵션 없이 실행하면 현재 코드를 사용한다. `node scripts/profile-post-store.mjs`는 격리 native D1과 실제 workerd에서 Verified gate/preview/save/replay를 각각 독립 invocation으로 실행한다. 어느 명령도 원격 DB/공식 사이트/게시 API에 접근하지 않는다. 모든 cpuprofile/보고서는 E reports에 기록한다.

로컬 CDP는 normalize·emoji·URL·가중길이·plain 보안·JSON·SHA·전체 생성과 DB 경로의 샘플 stack을 조사한다. CPU sample time에는 idle/GC를 구분하고 elapsed와 혼동하지 않는다. 로컬 기계 수치는 Cloudflare10ms/목표8ms 인증이 아니다. 초기 표본에서 반복 생성의 URL 파싱 비중이 컸고 첫 생성은 후속보다 느렸다. 기존 startup의 parseTweet1회는 공식 hashtag/mention 경로를 실행하지 않았다. 다만 이 관측만으로 원격 모든 tail latency 원인을 확정하지 않는다.

## 변경과 보존

- 원래 twitter-text3.1.0/v3·공식44 fixture·emoji/URL/NFC 의미는 유지한다. 제한된 고정 합성 문구로 hashtag/mention/emoji/URL과 보안 검사를 startup에서 초기화한다. 요청마다 실제 본문은 새로 검증한다. startup budget과 invocation budget은 별도다.
- scalar 입력을 UTF16 루프로 한 번 검사한다. NFC의 scalar 보존 성질을 이용해 내부의 두 번째 같은 검사를 생략하며 public officialMeasure의 검사는 유지한다. 기존 surrogate/길이 정책과 비교한다.
- PostStore marker3조회는 같은 조건의 SQL1문장으로 묶는다. 매 capture마다 환경·schema와 실제 Verified gate를 새로 검사한다. current 승인/후보/원문/시설/VTuber/만료/CAS 검사를 캐시하지 않는다.
- 단일 작업의 동일 snapshot proof/본문 SHA만 재사용한다. 다른 capture의 proof는 새로 계산하고 저장된 임의 본문은 현재 결정적 렌더링과 계속 대조한다. 전역 행사·승인·본문 캐시는 없다.
- alias는 기존23개 native compatibility import 그대로이며 의존성/요구사항/템플릿을 삭제하지 않는다. 무의미한 번들 경량화나 paid 서비스는 추가하지 않는다.

## 원격 실험 계획

기존 main CI·Free/account budget·staging-only·concurrency·정확한 finally rollback 절차를 사용한다. `profile-cpu-matrix`는 추가 Worker/DB/Cron을 만들지 않는다. baseline renderer를 고정 Git SHA에서 번들링하고 optimized renderer와 별도의 임시 Worker 버전으로 순차 배포한다. 각 버전에는 해당 구현만 포함해 전역 정규식 캐시/사전 초기화 오염을 피한다. 같은 데이터·시계·revision·expected 결과를 사용하며 시간대/배포 순서 차이의 한계는 남는다. 이는 한 계획 실험의 baseline/optimized 두 배포이며 같은 조건의 무의미한 반복 배포가 아니다.

17개 고정 합성 입력: 13종, emoji/ZWJ, 긴 공식URL, 초과 후 재구성,278가중자 경계. 10라운드·동일 순서·요청 간격1250ms·총340회(각170회)이다. body는 입력을 받지 않고 허용된 ID만 사용한다. 각 요청은 D1 marker SELECT1/쓰기0이며 구스키마0004에서 실행한다. 원격 Verified gate/저장 성능은 이 실험에 포함되지 않는다. 응답의 전체 post가 원래 expected와 다르면 즉시 실패하며3회 연속 HTTP 실패에도 중단/복구한다.

Health는 별도 경로·실험 시간 밖에서 실행한다. Worker가 관측한 요청 시작 시각과 HTTP Date/CF colo·버전·HTTP 상태를 저장해 공식 GraphQL datetime 단일 invocation과 대조한다. 동일 그룹 요청수가1이 아니거나 중복/누락/단위 불명은 제외하고 미관측 수를 보고한다. provider adaptive sampling·ingestion 지연·초 경계·다른 트래픽의 한계가 있으므로 전체 원격 최대치로 과장하지 않는다. 격리 ID/implementation별 sequence1은 해당 isolate에서 첫 생성이며, 전체 Worker cold-start와 동일한 개념은 아니다.

CPU P50/P95/P99·관측 최대·관측10ms 초과 건수/분모·입력별/첫·후속 cohort를 보고한다. 공식 wall/startup CPU 단위도 introspection으로 확인한 경우만 변환한다. client wall elapsed는 네트워크/DB 대기를 포함하는 별도 수치다. Error1102·HTTP 실패·provider 오류·D1행수·메모리·외부 요청을 구별한다. provider가 개별 표본을 제공하지 않으면 추정으로 채우지 않는다. 지연 시 새 배포 대신 저장된 실행 기록으로 읽기 전용 재조회를 한다.

원격 목표는 대표 입력 P99≤8ms이고10ms 초과가 반복되지 않는 것이다. 모든 입력/모든 isolate/향후 전체 파이프라인 보장은 아니다. 목표 미달·불완전 관측이면 운영 활성화를 차단하고 [독립 실행 계획](FREE_EXECUTION_PIPELINE.md)을 따른다. 실제 결과는 [CPU 보고](DEV05R_CPU_REPORT.md)에 기록한다.

## 공식 근거와 권한

[Workers CPU/startup 한도](https://developers.cloudflare.com/workers/platform/limits/), [공식 DevTools CPU profiling](https://developers.cloudflare.com/workers/observability/dev-tools/cpu-usage/), [GraphQL Workers metrics](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/), [원격 profile API](https://developers.cloudflare.com/workers/observability/profiling-in-production/)를 확인했다. 후자는 계정 profiling feature가 활성화되어 있어야 하며 현재 Free/기존 권한에서의 이용 가능성을 가정하거나 유료 feature를 켜지 않는다. 이 작업은 실제 local workerd CDP와 기존 공식 GraphQL을 사용한다. 추가 Observability Write/광범위 토큰을 기본 해결책으로 요청하지 않는다.

과거 실패 중 Health/rollback 전파와 deployment history 첫페이지 가정은 기존 bounded GET/latest1 회귀를 유지한다. 43452628109의 업로드 실패는 원래 원인이 비식별 GUARD 오류로만 기록되어 특정 원인을 확정할 수 없다. 이제 CLI 오류의 timeout/network/auth/startup/provider/exit와 숫자 code만 허용목록으로 보존하며 Secrets/원문 stderr는 출력하지 않는다. mutation 자동 재시도는0이고 실패를 재실행으로 숨기지 않는다.

## 첫 비교 이후의 한정 후속 실험

Actions43894888853의340회는 종료·원래 버전 복구됐고 pool P99는8ms 이하였지만 optimized의 첫 생성12.805ms는 남았다. [실제 결과](DEV05R_CPU_REPORT.md)를 따른다. preparePost를 순수 함수로 분리해 고정 합성 한 건을 startup에서 준비하고 요청별 WebCrypto/SHA를 유지했다. 후속 profile-cpu-optimized는 baseline 반복 없이 optimized170회만, 같은17입력/10라운드/1250ms를 사용한다. 새main/필수CI/Free예산·원래버전 복구는 동일하다. 아직 원격 목표 달성을 선언하지 않는다.
