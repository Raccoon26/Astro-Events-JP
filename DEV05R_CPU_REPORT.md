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
