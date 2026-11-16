# 무료 운영의 독립 invocation과 영속 checkpoint

단순 함수 분리는 CPU 예산을 초기화하지 않는다. `await`, waitUntil 또는 같은 요청의 여러 함수도 같은 invocation의 한도 안이다. 본 프로젝트는 현재 수집·생성·알림을 운영 진입점에서 호출하지 않으며 이 문서는 DEV06~09 통합 전에 검증할 실행 경계다. 새 유료 자원/서비스를 도입하지 않는다.

| 단계          | 기존 영속 checkpoint                                                       | 다음 invocation에서 다시 검사할 것                                                           | 현재 상태                                               |
| ------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 수집          | collection_documents·event_candidates·candidate_versions·source checkpoint | 현재 승인/robots/약관/host·문서/fingerprint·예산·claim                                       | 로컬 DEV03, Workers 전송 fail-closed                    |
| 검증          | verification_decisions·events·근거/규칙/만료·revision                      | 현재 후보/공식 관계·문서/시설/VTuber snapshot·만료                                           | 로컬 DEV04, 원격0005 미적용                             |
| 생성·가중길이 | 생성 전 현재 Verified capture, 완료된 generated_posts                      | 현재 verification decision/fingerprint/revision·template/length version·유효시간·결정적 내용 | 로컬 DEV05, 둘을 같은 invocation에서 실행하면 예산 공유 |
| 최종 저장     | generated_posts의 CAS·UNIQUE·input/content digest                          | 현재 gate+조건부 SQL, 충돌 시 새 capture                                                     | 로컬0006/0007, 원격 OFF                                 |
| 전달          | notification_deliveries·publication_records·posted_fingerprints            | 전송 직전 최신 gate·게시 상태·outbox 멱등·불확실 전송 복구                                   | DEV06/07 미구현                                         |

현재 별도의 공개/운영 API나 모든 단계의 실제 Cron 분산 실행이 구현된 것은 아니다. 로컬 프로파일의 `/verified`, `/preview`, `/save`, `/replay`는 각각 실제 별도 workerd invocation이지만 preview/save 내부의 여러 gate는 동일 invocation이다. 이를 여러 예산인 것처럼 보고하지 않는다. 구스키마의 원격 진단은 독립 HTTP 생성 요청과 marker SELECT만 검증하며 실제 검증/저장을 포함하지 않는다.

운영에서 기존 완료 checkpoint를 다음 Cron의 작은 커서 배치가 소비하는 구조를 기본으로 한다. 검증 결과가 변하면 이후 생성/전달은 재시작하고 오래된 결과는 보류한다. 저장 실패는 UNIQUE/CAS·기존 checkpoint로 재시도하며 전 단계의 신뢰 결정을 캐시로 대신하지 않는다. 모든 Source를 한 Cron에 처리하지 않고 일반/VTuber 예산과 전국 공정성·3시간 간격을 유지한다. 실제 분산 lease/outbox·행 단위 비용 예약/중복 invocation 복구는 DEV06~09의 완료 조건이다.

생성+길이 검사만으로도8ms 목표를 충족하지 못한다면 다음 후보는 **미완성 draft checkpoint→별도 길이검사 invocation→현재 상태 CAS 최종 저장**이다. 이 경우 pending/draft는 복사용 완성글이 아니며 입력·후보·검증·템플릿·길이정책 버전, 문서 digest·만료·단계 generation을 보존해야 한다. 새 checkpoint migration·전환/경쟁/장애 회귀와 실제 remote CPU 증거 없이는 이 대안을 완료로 표시하거나 활성화하지 않는다. 원격 schema0004에 자동 DDL을 적용하지 않는다.

실제 계정의 전체 request/subrequest·D1읽기/쓰기/저장·Cron 슬롯을 live 근거로 확인하고 불명/여유 부족이면 이월한다. invocation 분할은 CPU를 나누지만 요청·D1읽기/쓰기와 운영 복잡성을 늘리므로 무료 비용을 자동으로 줄인다고 가정하지 않는다. 별도 자원이 필요해지면 Free 지원·계정 여유·사용자 승인 필요 여부를 먼저 검토한다. Workers Paid·유료 프록시/VPS·AI/API 자동 전환은 없다.

Workers DNS 조회는 fetch의 실제 TLS peer를 고정하지 못하고 TCP socket의 remoteAddress는 nullable이다. 공식 fetch/DNS/TCP API의 peer/SNI/인증서/리다이렉트 결합을 무료 환경에서 검증하기 전까지 기존 unavailableTransport를 유지한다. DNS resolve만 추가하거나 보안 정책을 낮춰 해결됐다고 하지 않는다. 후속 안전 실증은 승인 호스트·robots/약관·요청 예산을 별도로 통과한 경우에만 가능하며 이번 작업의 실제 사이트 요청은0이다.

DEV05R 추가 조사: 현재 고정 Workers types에는 Socket.startTls({expectedServerHostname})와 literal SocketAddress가 존재한다. 공개 IP로 직접 connect→원래 hostname으로 TLS 업그레이드→인증서/peer 검증을 결합하는 무료 후보 경로를 후속 실증 대상으로 삼을 수 있다. 그러나 문서/타입 존재는 실제 원격 인증서 검증·IP pinning 성공 증거가 아니다. Cloudflare IP/사설 주소 제한·remoteAddress 부재·HTTP framing/chunked/압축/body 제한·redirect마다 재검증·IPv4/IPv6/혼합DNS·wrong-host/잘못된 인증서 거부를 독립 fixture와 승인된 통제 endpoint에서 검증해야 한다. 이번에는 실제 외부 사이트 연결이나 해당 전송기 활성화를 하지 않는다. [TCP 공식 문서](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)를 따르며 node:https의 lookup/Agent 옵션이 그대로 작동한다고 가정하지 않는다.
