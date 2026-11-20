# DEV-10 Free 비용 및 CPU

2026-11-20 13:30 UTC 인증된 Cloudflare GraphQL과 자원 목록으로 계정 전체 **요청 19, D1 읽기 575행·쓰기 0행, 저장 778,240바이트, DB 2개·Worker 3개, Cron 1슬롯**을 보고받았다. Lifetime 또는 최대치 보장이 없으며 집계 지연·샘플링이 가능하다. 현재 OAuth로 구독 목록 접근은 제한됐다. 승인된 기존 staging 배포의 계정 검사가 Free를 별도로 확인한다.

기존 staging 진단 Cron의 72시간 버전별 공식 집계는 다음과 같다. 단위는 GraphQL introspection의 마이크로초를 ms로 변환했다.

| 버전 접두 | 제공 요청 | P50 ms | P95 ms | P99 ms |
| --------- | --------: | -----: | -----: | -----: |
| 01625f9d  |         1 |  3.674 |  3.674 |  3.674 |
| b489379f  |        15 |  2.036 |  4.728 |  4.728 |
| 16b9bcef  |         7 |  1.439 |  3.021 |  3.021 |

집계 23건의 개별 CPU와 최대는 제공되지 않았다. 오류와 외부 subrequest 집계는 0이다. 원격 새 Cron 예약, Scheduler, Collector, Verification, Dedup/Change, Post, Weekend, Outbox, GitHub App, Telegram 준비, Recovery, Retention의 P50/P95/P99·최대는 각각 미측정이다. 경로별 원격 표본 0, 개별 표본 누락 수는 새 경로 요청이 없으므로 산출 대상이 없다. 로컬 workerd는 한 invocation마다 경과 시간과 D1 meter, Cloudflare CPU에는 null을 기록한다.

DEV-10R에서는 승인 뒤 stage마다 독립 호출을 발급하고 P50/P95/P99·최대·호출 수/관측 수/누락·cold/warm·D1·subrequest를 기록한다. 작업 묶음이 10ms 또는 D1 Free 호출 상한 내에 들어오는지 검증한다. 한 RPC 안에서 함수를 나눈 경우 동일 호출 예산으로 처리한다. 8ms 사전 보류와 10ms 예산은 검증 없이 완화하지 않는다. [Workers 한도](https://developers.cloudflare.com/workers/platform/limits/) · [Workers RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)

스테이징/프로덕션 로그·트레이스 샘플링은 100%이고 계정 수집량은 아직 미확인이다. 2026-12-01부터 Free는 공유 0.5GB/일·보존 7일이며 추가 수집 한도 초과분은 수집이 중단된다. D1 체크포인트·30일 실행 기록은 Observability 보존에 종속되지 않는다. [Observability 요금](https://developers.cloudflare.com/observability/pricing/)

## 로컬 workerd D1 비용

6개 합성 슬롯에서 95개의 독립 작업 RPC를 관찰했다. 초기 Outbox 최대치는 D1 바인딩 52회·SQL 64개였다. 재파싱 중복을 줄이고 같은 검증 결정·snapshot·발행 원문을 원자적 SQL proof로 다시 검사했다. 콜백 토큰 세 개는 한 문장에 기록한다. 보완 후 격리 마커 검사까지 포함한 단계별 최대는 바인딩 43회·SQL 48개였고, 전체 10,623행 읽기·1,219행 쓰기를 관찰했다. 바인딩 호출수와 batch 내부 SQL 문장 수는 각각 집계한다. 큰 행 크기, 여러 Source, 범위가 큰 운영 보고서의 원격 결과는 별도 실증 항목이다.
