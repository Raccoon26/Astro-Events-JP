# DEV05R 첫 비교 실증 및 남은 첫 실행 비용

main17b5122af2e8502d0eab1cac84d57beab76ed3ba/PR23·576개/37파일·main CI/정상staging 배포를 확인했다. Actions43894888853의 고정340요청(각170회)은 실제 성공했고, 원래bf55b4cf-592c-49a5-bf77-72de0cea425f를100% 복구/Health200 확인했다. 실제 사이트/외부요청0·각D1읽기1/쓰기0·production불변·원격0004이다.

기존 DEV05 고CPU 요청도 공식 시간별 지표로 다시 조회했다. 첫 생성에 CPU16.958ms/startupCPU22.176ms가 함께 보고됐고 다음 두 생성의 집계P99는4.794ms였다. 경과시간과 CPU를 혼동하지 않으며 단일 원인이 모두 입증됐다고 하지 않는다.

| 1차 비교           | 전송 | 단일 요청 관측  | 관측 P50/P95/P99(ms) | 관측최대/10ms초과 | 공식startup |
| ------------------ | ---- | --------------- | -------------------- | ----------------- | ----------- |
| 고정DEV05 baseline | 170  | 167, 누락/모호3 | 1.628/3.603/5.182    | 15.220,1/167      | 13ms        |
| 초기optimized      | 170  | 168, 누락/모호2 | 1.687/3.421/7.423    | 12.805,1/168      | 18ms        |

전체 pool P99는8ms 이하지만 첫 생성의12.805ms는 남아 있다. 평균/전체 P99만으로3시간 Cron의 cold 실행 안정성을 선언하지 않는다. Provider adaptive sampling의 가중수는 전송170회와 다르며 누락을0ms로 채우지 않았다. baseline은PDX, optimized는SEA에서 관측돼 환경 차이도 남는다. 초기optimized의 후속167관측은 P50 1.687/P95 3.339/P99 6.427ms·관측최대7.423ms/10ms초과0이다. 원격 pprof 기능을 켜거나 권한을 늘리지 않았으며 실제 local workerd CDP와 공식 GraphQL을 사용했다.

남은 첫 실행 비용에 대응해 renderPost의 순수 preparePost를 분리하고 고정 합성1건을 startup에서 준비한다. WebCrypto/SHA ID는 요청 안에 유지하며 모든 실제 입력의 사실/길이 검사를 계속 수행한다. 결과를 real event 캐시로 재사용하지 않는다. 로컬 첫 elapsed는 약26→19ms였고 원격 CPU 개선은 아직 미검증이다. 동일baseline을 다시 배포하지 않고 새main/CI/Free예산 후 profile-cpu-optimized의170요청만 추가검증할 계획이다. 이 결과가 없으면 첫 실행 목표를 달성했다고 하지 않는다.

읽기 전용 분석 보강 중 새 집계 쿼리에 닫는 괄호 누락이 있어 HTTP200/GraphQL오류가 발생했다. 원격 배포나 데이터 변경은 없었고, 수정 후 실제 재조회 및 grouped/version 쿼리 구조 회귀를 추가했다. OAuth 만료401은 기존 Wrangler 인증 갱신 후 해소했고 새연결/토큰은 요구하지 않았다.

## 이전 조사 기록 (현재 결과와 구별)

# DEV05R CPU 조사 기록

현재 상태: **로컬 조사·최적화·진단 기반 구현, 원격 비교는 아직 미실행**. 기준 main157aaab6eb284f3e65df85d5207ee6efcf8a60b8/539개·32파일/0001~0007을 보존한다. 실제 원격 결과가 없으므로8ms 목표 달성을 선언하지 않는다. [조사 설계](CPU_PROFILE_DESIGN.md)와 [독립 실행 경계](FREE_EXECUTION_PIPELINE.md)를 따른다.

## 현재 확인한 원인과 변경

로컬 실제 workerd CDP는 normalize·emoji·URL·길이·JSON·SHA·전체 생성 및 native D1 gate/preview/save/replay를 각각 조사했다. 반복 생성에서 URL 파싱 비용이 컸고 첫 요청/후속 비용 차이가 있었다. 기존 한 번의 parseTweet 초기화는 hashtag/mention 경로를 실행하지 않았다. 이 때문에 제한된 순수 startup 초기화·중복 scalar 검사 제거를 적용했다. 공식 X 알고리즘/13종/URL/emoji 의미를 바꾸지 않았다. 원격 지연의 단일 원인이 확정된 것은 아니다.

단일 PostStore 작업에서 schema3문장을1문장으로 합치고 동일 snapshot proof/본문 hash를 재사용했다. 새 snapshot·현재 Verified gate·CAS·만료·위조/오래된 본문 차단은 유지한다. native D1 저장 표본은33→27문장·읽기95/쓰기4·반복0쓰기였다. 공식 fixture·본문 및 native runtime 회귀와 현재 gate/CAS/rollback 시험을 통과했다. 최신 전체 검사 수는 완료 증거에 갱신한다.

## 측정 구분

| 항목           | 실제 범위                                                      | 현재 판단                                               |
| -------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| 기존 원격      | 4~5요청/Health 혼합, 마지막 P50 4.453/P99 16.958ms/startup22ms | 역사적 소표본, 원인 확정/8ms 보장 아님                  |
| 로컬 순수 단계 | 실제 workerd CDP sampled profile·elapsed·GC/idle 구분          | Cloudflare CPU로 대체하지 않음                          |
| 로컬 DB 단계   | 격리0001~0007·별도 invocation gate/preview/save/replay         | 원격 schema0004에서는 미실행                            |
| 예정 원격 비교 | 고정17입력×2구현×10회=340요청, request간1250ms                 | main CI/Free 예산 통과 후1회 실험·정확한 원래 버전 복구 |

## 안전·회귀·실패 이력

기존539개/32파일 및 fixture·migration0001~0007의47개 baseline 파일 SHA를 감사한다. R01~R32/DEV00~05와 DEV06~10·47현/Source96/공식성77/시설92/VTuber4·active0·猫谷ここな 관계 미확인을 보존한다. Collection/Notifications=false·productionCron0·SSRF fail-closed·실제 사이트/게시/알림0·원격0004를 유지한다.

과거 업로드 실패43452628109의 상세 원인이 기존 로그에서 비식별 일반 오류로 숨겨졌음을 확인했다. 원인을 추측하거나 같은 커밋을 무작정 재실행하지 않았다. 이제 숫자 provider code/안전한 실패 범주만 보존하고 기존 전파·latest-deployment GET 회귀를 유지한다. 실패를 skipped/성공으로 바꾸지 않는다.

실제 E preflight·전후 Dry Run/보고서를 사용한다. C/D 전체를 탐색/삭제하지 않으며 지정 후보만 검사하고 인증 파일은 기존 E 경로다. 새 토큰/권한·유료 기능·production 변경·원격 DDL은 없다. DEV06을 시작하지 않는다. 구현 PR을 먼저 최신 main/CI로 통합해야 승인된 staging 진단을 실행할 수 있으므로, 원격 결과는 후속 증거 PR에서 갱신한다.

## PR24 CI 환경 경계 회귀 수정

로컬582개 통과 뒤 CI43898593066은581통과/1실패로 병합을 차단했다. 새 read-cpu-matrix CLI는 Linux에서 E 전용 환경 검사로 먼저 거부하는 것이 맞지만, 새 테스트가 Windows의 C 경로 거부 메시지만 기대했다. 도구의 보안 정책을 바꾸지 않고 preflight의 실제 localDriveVerified에 따른 정확한 오류 코드를 각 사례에 명시하도록 수정했다. 상태 실패·인증 전 거부·토큰 비노출 검사는 그대로 유지한다. 실패한 기존 커밋을 재실행하거나 체크를 생략하지 않고 새 HEAD로 전체 검사한다.

## 후속 진단 43900596338과 배포 준비 검사

PR24/main068a91dfd1eeeb23dab525b5596df9d5225d1208의 optimized-only 진단은 3건의 HTTP404로 중단됐다. 생성 성공/CPU 표본으로 계산하지 않았다. 원래 staging1279a229-f3c5-44cd-8f64-2657373a66fd를100% 복구하고 Health200을 확인했다. production은 변경하지 않았다. 관리 API의100% 버전과 공통 Health200만으로 진단 경로의 준비를 입증하지 못하는 관측 공백을 확인했다. 전파 지연인지 다른 경로 문제인지는 아직 확정하지 않는다.

이제 매 임시 빌드에 공개 UUID(profileMarker)를 삽입하고 별도 ready 경로가 구현/marker를 모두 반환할 때만 측정을 시작한다. 이 경로는 본문 생성·D1·외부 요청을 하지 않으며 측정 창에서 제외한다. 최대12회·3초 간격·각5초 timeout·1KiB stream 제한이고 잘못된 환경/설정은 즉시 실패한다. 오래된404·잘못된 marker·공통Health만 반환하는 경우·production·응답 크기의 회귀를 추가했다. 같은 실패 커밋을 재실행하지 않고 새 main의 필수 CI 후 한 번의 제한된 optimized 검증을 수행한다. 실패 원인 자체와 성능 목표는 검증되기 전까지 미해결이다.
