# 무료 운영 정책

> DEV-01R 현재 결과(2026-11-13 JST): staging·production 원격 Worker/D1·마이그레이션·staging 복구/rollback·Health/Cron·실제 CPU·승인된 Actions 배포를 검증했다. [원격 검증 결과](DEV01R_REMOTE_REPORT.md)가 최신 근거이며 아래 DEV01~03 당시의 보류 기록은 이력이다. 수집·알림=false, active0, production Cron0. 최종 문서 PR/CI/병합/main SHA는 E 완료 보고서 기준이다.

DEV01 당시 기록(현재 실제 검증은 위 보고서): 아래 공식 한도는 유지된다. **사용자 계정의 실제 플랜/사용량은 인증 보류로 미확인**이며 Free라고 추정하지 않는다. 로컬 Health의 D1 identity SELECT는 rows_read=1, rows_written=0이었다. 실제 Cloudflare CPU·D1 비용/계정여유를 실측했다고 표시하지 않는다.

현재 staging 진단Cron1개/production0개다. 계정5개 제한과 기존스케줄을 함께 확인한다. 과거 환경별2개 계획은 현재 배포에 적용하지 않으며 미래 일일정리는 DEV09에서 검토한다. 배포/provision guard는 실제ID·Free/당일 계정usage·15분 이내 근거·추가Cron슬롯을 검사하고 불명/초과시 중단한다. CF_ACCOUNT_EVIDENCE는 인증된 Dashboard를 확인한 운영자 근거이며 자동증명으로 취급하지 않는다. 현재 Actions는 공식 API의 당일 구독·사용량·인벤토리 snapshot을 자동 생성한다. 프로젝트 자체지표와 계정전체예산을 혼동하지 않는다.

Cloudflare 제공 [CPU/Workers GraphQL](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/) 조회 도구를 준비했다. 수치가 없거나 API스키마/권한이 맞지 않으면 실패하고0으로 대체하지 않는다. raw cpuTimeP50/P99의 provider단위를 확인한 뒤에만 ms로 환산한다. Worker 로그 wallTimeMs 및 로컬 workerd 시간은 원격CPU 기준선이 아니다. 실제 CPU기준선·원격계정지표는 DEV01 재개시 필수이며 RSS/HTML 프로파일은 DEV03에 남긴다.

확인일: 2026-11-11 (JST). 공식 문서 기준이며 계정 전체 사용량을 공유한다. 배포 전/각 DEV09 재검증한다. 요금이나 할당량이 바뀌면 운영을 축소하고 사용자 검토 없이 유료플랜으로 전환하지 않는다.

| 항목            | Free 한도 / 설계 영향                                                                 |
| --------------- | ------------------------------------------------------------------------------------- |
| Workers 요청    | 100,000/일, UTC 자정 갱신                                                             |
| CPU             | HTTP 및 Cron 각10ms; 대기시간은 CPU와 별개                                            |
| 외부 subrequest | 호출당50, redirect도 포함; 내부서비스는 별도한도, D1 쿼리는50/호출 기준으로 보수 관리 |
| 메모리/연결     | isolate128MB / 동시 outgoing6                                                         |
| Cron            | 계정5개; staging1개·production0개, scheduled wall time15분과 CPU10ms를 혼동하지 않음  |
| D1              | 계정10DB, 단일DB500MB, 계정총5GB                                                      |
| D1 일일 처리    | 읽기500만행 / 쓰기10만행, 인덱스쓰기도 가산; UTC 자정 갱신                            |
| D1 쿼리/복구    | 호출당50쿼리, Time Travel7일                                                          |

근거: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/). Workers/Cron/D1 기능은 Free에서 제공된다. 플랫폼 한도와 프로젝트 자체 보수적 budget은 구분한다.

## 운영 판단

Cron8회/일 + 일일정리1회 자체 요청량은 작지만 CPU10ms가 핵심 제약이다. DEV01은 Health/DB 진단을, DEV03은 RSS 파싱·D1·검증·템플릿까지 포함해 프로파일링한다. 초기1소스/호출, 최대본문256KiB·동시1·외부요청총20·D1쿼리20·예상CPU5ms 목표(성능 보장이 아님). 전국47현의 완주속도는 등록량/변경빈도/실측CPU에 좌우된다. 이 구조에서 전국실시간 또는 전수조사 완료를 보장하지 않는다. 개선이 필요하면 작은 작업으로 분리하고 다음 Cron으로 이월하며 무료 범위에서만 재설계한다.

Workers 요청80,000/일·D1 read400만/write80,000·DB400MB를 프로젝트 수집 예산 상한으로 두고 계정 타작업 여유를 차감한다. 실측은 D1 응답 meta와 Cloudflare metrics를 대조한다. 알 수 없는 사용량은 fail closed한다. CPU는 Date.now로 정확히 측정할 수 없으므로 런타임CPU 지표를 활용한다. 80% 접근시 경고·중요도낮은수집유예, 중복조회중단, checkpoint, 관리자 private 보고. 정리와 경고용 예산을 예약한다. Free 한도 도달시 요청/쿼리가 실패하고 수집 일부 중단이 가능함을 운영 보고에 명시한다.

큰HTML·PDF/OCR·JS렌더링·브라우저자동화·AI추론은 기본 실행경로에 넣지 않는다. 검증안된 외부서비스/Queues/KV/R2 등을 무료라고 가정해 추가하지 않는다. 미지원 소스는 별도검토 상태로 남기며 핵심 수집범위를 삭제하지 않는다. GitHub Public Actions는 CI/배포만 사용하고 수집용 개인서버로 사용하지 않는다. Reports private Actions는 계획하지 않는다. Telegram Bot API 및 GitHub Issues 알림만 사용하며 유료 이메일·검색·AI 호출은 없다. DEV00에서 실제 Cloudflare 계정사용량·배포/CPU 성능은 미검증이다.

## DEV02 로컬 측정

2026-11-11 위공식Workers/D1 limits·pricing을재확인했다. 계정인증/전체사용량/실CPU는여전히미확인이다. reports/dev02-benchmark.json은로컬workerd/D1의응답meta(rows_read/rows_written/size_after)와경과시간을기록한다. cpuTimeMs=null이며경과시간을CPU라고표시하지않는다. 96개실제Seed/92시설/4인물과별도2000개합성fixture를검증했다. 반복Import와DryRun의rows_written=0,25행검색1쿼리/25읽기를확인했다. 이수치는원격할당량/과금실측이아니다.

Import는Node관리도구에서여러작은batch를순차실행하므로50쿼리/Worker호출제한내처리량을보장하지않는다. Seed전체를Cron1회에서Import/조사하지않는다. 커서페이지최대100/정보원별간격을제공하고후속실행기가더작은무료예산을적용한다. 전국동시/실시간수집속도·원격CPU/대규모운영가능성은미검증이다. 인덱스쓰기비용을포함한실제로컬값은최종보고를따르며무료플랜자동전환/외부유료서비스는없다.

## DEV03 재확인과 처리 단위

2026-11-12 JST에 Workers/D1 공식 limits를 다시 확인했다. Workers Free의 CPU10ms/128MB/외부요청50·계정Cron5, D1 Free의호출50/DB500MB/계정5GB 기준을 유지한다. D1 batch는 statement별 비용과 API query 횟수를 구분한다. 실제 계정 플랜/여유·원격CPU는 계속미확인이다.

요청8·본문256KiB·동시1·5초/요청·30초 HTTP 단계·후보10·발견20·sitemap depth1/자식3으로 줄인 작은 단위를 사용한다. 후보 저장을 다음 step으로 나누고 긴 목록은 offset으로 이월한다. 일반/VTuber 예산을 분리하고 계정usage불명은거부한다. 로컬 CLI의명시적 local-budget는 Cloudflare를사용하지않는개발시험용이며 계정여유증거가아니다. Workers 기본전송기는peer보장불명으로차단하므로유료서비스를추가해해결하지않았다. 로컬 wall time을CPU라고표시하지않으며 [벤치마크](COLLECTION_BENCHMARK.md)를기준으로향후원격프로파일링한다.

## DEV-01R 원격 기반

계정 Free는 사용자 화면뿐 아니라 로그인된 공식 대시보드를 직접 확인했다. 구독 API403을 Free 성공으로 해석하지 않았다. 현재 계획은 staging 읽기 전용 진단Cron1개(0 */3 * * *), production0개다. 미래 일일정리 Cron은 DEV09에 별도로 검토한다. 이번 실제 시험은 기존3시간 Cron의 성공 지표를 확인해 매분 임시 Trigger를 설치하지 않았다. 향후 진단 도구를 사용하면 같은1개 슬롯만 임시 변경하고20분 안에 복원한다. 다른 프로젝트의 Cron은 조회만 한다.

CPU GraphQL의 cpuTimeP50/P99 단위는 실제 schema introspection에서 microseconds임을 확인했다. cloudflare-metrics.mjs는 단위를 재확인해1000으로 나눈 ms와 raw값을 함께 기록한다. 메모리 지표는 provider가 제공할 때만 기록한다. 로컬 경과시간/합성시험을 원격 CPU로 바꾸지 않는다.

Workers Logs Free의 현재200,000 events/day·3일 보관과 Traces를 확인했다. 2026-12-01부터 [Observability 요금](https://developers.cloudflare.com/observability/pricing/)의 Free0.5GB/day·7일 보관/한도 후 수집중단으로 변경 예정이며 유료 업그레이드/외부 export는 하지 않는다. 계정전체 허용량을 공유하므로 운영 재개 전 재확인한다.

## DEV04 구현 경계

DEV04도 Workers Free CPU10ms/128MB·외부subrequest50·D1쿼리50과 계정 전체 한도를 전제로 한다. 2026-11-13 공식 Workers limits/D1 pricing 및 D1.batch transaction 문서를 재확인했다. 후보 커서≤50/검증1후보 단위/최대8이미지·공지 pagination·조회 인덱스·로컬 D1 meter를 사용한다. 수천건 검증은 Node관리 도구의 여러 작업이며1Worker 호출 처리량이 아니다. unknown 계정 예산은 commit 차단, --local-budget은 로컬에만 유효하다. DEV01R CPU는 DEV04 성능 보장이 아니다. [측정](DEV04_TEST_REPORT.md).
