# DEV-09 Free 사용량과 공식 CPU

공식 한도는 Workers 일일 100,000요청, HTTP/Cron CPU 10ms, 외부 subrequest 50, 계정 Cron 5슬롯이다. D1 Free는 계정 5GB, DB별 500MB, 일일 500만 행 읽기·10만 행 쓰기, Free Worker당 D1 쿼리 50회다. D1 일일 한도는 UTC 자정에 리셋된다. [Workers 한도](https://developers.cloudflare.com/workers/platform/limits/) · [D1 한도](https://developers.cloudflare.com/d1/platform/limits/) · [D1 계산](https://developers.cloudflare.com/d1/platform/pricing/)

기존 보수적 계정 예산은 일일 80,000요청·400만 읽기·80,000쓰기 및 저장량 4GB, 프로젝트 저장량 400MB를 사용한다. 이 예산의 80%에서 일반 작업과 재시도를 유예하고 복구·정리·보고 여유를 확보한다. 계정 자료의 현재 UTC 날짜·15분 유효기간·Free·CPU·텔레메트리를 확인한다. 빈 응답, 누락, 한도 거절에는 일반 작업을 시작하지 않는다. D1 예약은 잠재 사용량을 보수적으로 더하며 실측 Cloudflare 청구 집계와 분리한다.

2026-11-20 12:46 UTC의 인증된 계정 보고는 Worker 3개, D1 2개, 요청 14건, D1 읽기 384행·쓰기 0행, 저장 778,240바이트, Cron 1슬롯이다. 지연·샘플링이 있을 수 있다. 이번 OAuth의 구독 조회 제한, Observability 사용량 미확인을 별도로 기록했다. 최신 승인된 staging 배포의 기존 Free 검사를 GitHub에서 확인한다.

## 공식 staging 진단 Cron 표본

2026-11-17 12:46 UTC부터 72시간 동안 기존 진단 Cron의 공식 Workers GraphQL 집계다. CPU 단위는 introspection에서 마이크로초를 확인해 ms로 변환했다.

| 버전 접두 | 집계 요청 | P50 ms | P95 ms | P99 ms |
| --------- | --------: | -----: | -----: | -----: |
| 01625f9d  |         1 |  3.674 |  3.674 |  3.674 |
| b489379f  |        15 |  2.036 |  4.728 |  4.728 |
| 16b9bcef  |         7 |  1.439 |  3.021 |  3.021 |

세 집계의 오류와 외부 subrequest는 0이다. 실행별 CPU가 조회되지 않아 집계 23건의 개별 CPU와 전체 최대는 미확인이다. DEV-09의 스케줄러, D1 쓰기, 수집 파서, Verification, Dedup/Change, Post, 주말 모음, Outbox, Telegram 준비, App 갱신, 복구, cold 및 emoji는 원격 장부 0011 미적용과 운영 비활성 상태에서 경로별 P50/P95/P99·최대·표본을 확보하지 못했다. 로컬 workerd 시간이나 과거 DEV05R 통계를 이 값에 합산하지 않는다.

## Observability

Cloudflare의 2026-12-01 정책에서 Free는 공유 로그·트레이스 수집량 **계정 0.5GB/일**, 보존 7일이다. 추가 Free 수집은 제공되지 않는다. 그 전 Workers Logs Free는 20만 로그/일과 3일 보존 정책을 적용한다. 인증된 실제 settings에서 staging·production 로그와 트레이스 샘플링은 각각 100%였다. 초기 장애 진단 관측을 유지했으며, 사용량과 누락률은 미확인이다. D1 완료·재시도 장부로 30일 이상 기록을 유지해 수집 중단 시에도 복구한다. 유료 전환 또는 샘플링 설정 변경은 없었다. [Cloudflare Observability 요금](https://developers.cloudflare.com/observability/pricing/) · [Workers Logs 전환](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
