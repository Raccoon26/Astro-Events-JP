# 무료 운영 정책

확인일: 2026-11-11 (JST). 공식 문서 기준이며 계정 전체 사용량을 공유한다. 배포 전/각 DEV09 재검증한다. 요금이나 할당량이 바뀌면 운영을 축소하고 사용자 검토 없이 유료플랜으로 전환하지 않는다.

| 항목            | Free 한도 / 설계 영향                                                                 |
| --------------- | ------------------------------------------------------------------------------------- |
| Workers 요청    | 100,000/일, UTC 자정 갱신                                                             |
| CPU             | HTTP 및 Cron 각10ms; 대기시간은 CPU와 별개                                            |
| 외부 subrequest | 호출당50, redirect도 포함; 내부서비스는 별도한도, D1 쿼리는50/호출 기준으로 보수 관리 |
| 메모리/연결     | isolate128MB / 동시 outgoing6                                                         |
| Cron            | 계정5개; 조사·정리2개 사용 계획, scheduled wall time15분과 CPU10ms를 혼동하지 않음    |
| D1              | 계정10DB, 단일DB500MB, 계정총5GB                                                      |
| D1 일일 처리    | 읽기500만행 / 쓰기10만행, 인덱스쓰기도 가산; UTC 자정 갱신                            |
| D1 쿼리/복구    | 호출당50쿼리, Time Travel7일                                                          |

근거: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/). Workers/Cron/D1 기능은 Free에서 제공된다. 플랫폼 한도와 프로젝트 자체 보수적 budget은 구분한다.

## 운영 판단

Cron8회/일 + 일일정리1회 자체 요청량은 작지만 CPU10ms가 핵심 제약이다. DEV01/03에서 작은 RSS 하나도 파싱·D1·검증·템플릿까지 포함하여 프로파일링한다. 초기1소스/호출, 최대본문256KiB·동시1·외부요청총20·D1쿼리20·예상CPU5ms 목표(성능 보장이 아님). 전국47현의 완주속도는 등록량/변경빈도/실측CPU에 좌우된다. 이 구조에서 전국실시간 또는 전수조사 완료를 보장하지 않는다. 개선이 필요하면 작은 작업으로 분리하고 다음 Cron으로 이월하며 무료 범위에서만 재설계한다.

Workers 요청80,000/일·D1 read400만/write80,000·DB400MB를 프로젝트 수집 예산 상한으로 두고 계정 타작업 여유를 차감한다. 실측은 D1 응답 meta와 Cloudflare metrics를 대조한다. 알 수 없는 사용량은 fail closed한다. CPU는 Date.now로 정확히 측정할 수 없으므로 런타임CPU 지표를 활용한다. 80% 접근시 경고·중요도낮은수집유예, 중복조회중단, checkpoint, 관리자 private 보고. 정리와 경고용 예산을 예약한다. Free 한도 도달시 요청/쿼리가 실패하고 수집 일부 중단이 가능함을 운영 보고에 명시한다.

큰HTML·PDF/OCR·JS렌더링·브라우저자동화·AI추론은 기본 실행경로에 넣지 않는다. 검증안된 외부서비스/Queues/KV/R2 등을 무료라고 가정해 추가하지 않는다. 미지원 소스는 별도검토 상태로 남기며 핵심 수집범위를 삭제하지 않는다. GitHub Public Actions는 CI/배포만 사용하고 수집용 개인서버로 사용하지 않는다. Reports private Actions는 계획하지 않는다. Telegram Bot API 및 GitHub Issues 알림만 사용하며 유료 이메일·검색·AI 호출은 없다. DEV00에서 실제 Cloudflare 계정사용량·배포/CPU 성능은 미검증이다.
