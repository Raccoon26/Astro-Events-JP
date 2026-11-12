# 로컬 수집기 벤치마크

측정 기준일2026-11-12 JST. 합성 fixture, Node/workerd/D1 로컬 실행이다. 실제 Cloudflare CPU는 모든 행에서null이며 10ms 준수를 증명하지 않는다. 아래 값은 검토 시점 표본이고 최신 재실행 결과는 E reports/dev03-parser-benchmark.json 및 dev03-d1-measurement.json이다.

| HTML fixture | 입력 bytes | 항목 | 페이지 출력 | 로컬 중앙 경과ms | 로컬 최대 경과ms |
| ------------ | ---------: | ---: | ----------: | ---------------: | ---------------: |
| small        |        154 |    1 |           1 |            1.475 |           12.942 |
| medium       |       5899 |   40 |          10 |            9.517 |           11.925 |
| complex      |      44979 |  300 |          10 |           10.463 |           16.533 |

CSS/DOM 처리와 지문 생성 비용 때문에 cold run·GC·호스트 상태에 따라 시간이 달라진다. 출력 한도 후 불필요한 HTML 후보 처리를 멈춰 복잡한 fixture의 비용을 줄였고 nextOffset으로 다음 항목을 이어서 처리한다. 256KiB 전체 처리나 실제 CPU10ms 준수를 보장하지 않는다. 원격 검증 전 보수적으로 더 작은 Source 페이지/공식 RSS/전용 adapter를 사용해야 한다.

RSS/Atom/HTML/Sitemap4형식을 실제 workerd에서 실행했다. 별도 로컬 D1 시험은 후보2개·이미지unknown·Discovery review를 저장하고 응답meta의 rows_read/rows_written/size_after를 기록한다. 바깥 측정기의 queries는 SQL statement 수이며 collection_run_metrics.calls는 D1 API 호출 수, statements는 statement 수다. DB batch1회가 Worker query budget1개로 계산된다는 [공식 문서](https://developers.cloudflare.com/d1/platform/limits/)와 구분한다. 실행 기록의 계측 저장 batch 자체는 카운터에서 제외했음을 payload에 표시한다.

기존 DEV02의2000개 fixture 조회·원자적 Seed/반복0쓰기 검사도 계속 실행한다. 어떤 로컬 시간이나 카운터도 계정 전체 무료 여유/과금/원격 CPU의 증거가 아니다. [무료 정책](FREE_TIER_POLICY.md)·[보안 감사](SSRF_SECURITY_AUDIT.md)의 미검증 조건을 유지한다.
