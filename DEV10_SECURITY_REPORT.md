# DEV-10 보안 감사

| 검토 경계                         | 검증 또는 남은 조건                                                                                                                                                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DNS, peer, TLS, IPv4/IPv6         | 현재 Workers 외부 수집 fail-closed. DNS 조회와 실제 연결 peer, 원래 SNI 및 HTTPS 인증서의 동시 원격 실증이 남았다. 로컬 IPv4 거부 범위에 192.88.99/24와 불명확한 선행 0 주소를 포함하고 TLS 검증을 명시적으로 강제했다.                                        |
| robots, 약관, redirect, 응답 제한 | 매 이동마다 기존 호스트/경로/robots/횟수 검사를 유지한다. 크기·timeout·429는 기존 수집기에 둔다. 증거 미검토/만료/승인 철회와 redirect/본문 실패는 차단한다.                                                                                                   |
| GitHub 인증과 Public/Private 경계 | 고정 api.github.com과 지정 설치·Reports 저장소에만 접근한다. Workers에 맞춰 manual redirect 후 3xx를 직접 거부한다. 1회 최대 세 요청, staging 승인과 별도 DB 마커, 15분 예산 증거와 DB 재호출 잠금이 필요하다. 토큰·키·응답 본문을 반환하거나 저장하지 않는다. |
| Telegram, Callback, Outbox        | 기존 개인 허용목록·revision·현재 검증·DB 멱등성을 보존한다. 공급자 시작 이후 응답 누락은 uncertain이다. 합성 차단/재개 시험과 DEV-06R 사용자 확인 이력을 구분한다.                                                                                             |
| XML/HTML, Unicode, JSON/CSV       | 기존 바이트 제한·파서·DTD/ENTITY 거부·최소 스키마 및 NFC·제어문자 검사를 회귀로 확인했다. GitHub/Telegram 렌더 escaping을 유지한다. 현재 CSV 입출력 경로는 없다. RPC 인자는 작업 종류와 슬롯으로 제한한다.                                                     |
| SQL, 경합과 retention             | 기존 D1 bind/결정과 최신 후보의 CAS/lease를 사용한다. 원자적 rollback·FK와 uncertain/Private Issue 보호를 기존 및 새 시험에서 확인한다.                                                                                                                        |
| 활성화·로그·권한                  | 기본 off 및 새 Worker CLI dry-run, 원격 스키마 미적용, production 구성·Cron 동일, OAuth 최소 접근, 토큰·개인키 스캔을 검사한다. 운영용 전송·실제 정리·새 Secret은 승인 절차와 분리되어 있다.                                                                   |

## SSRF 기술 판정

Workers `fetch`는 요청 호스트를 해석해 연결하지만 최종 피어를 증명하는 필드를 제공하지 않는다. DoH 검사 뒤 같은 호스트에 다시 fetch하면 플랫폼의 별도 해석 시점에 주소가 달라질 수 있다. `resolveOverride`는 자신의 zone 호스트 제약이 있고 외부 사이트의 공인 DNS/TLS 피어를 증명하지 않는다. Node HTTPS 호환은 `servername` 등 필요한 옵션을 지원하지 않는다. TCP 소켓의 remoteAddress는 미설정 상태가 허용되고 Cloudflare IP 도달 제약이 있다. `startTls`의 hostname 옵션이 타입에 있더라도 HTTPS에 필요한 전체 지원과 원격 인증서·피어 동시 보장은 입증되지 않았다. [Request API](https://developers.cloudflare.com/workers/runtime-apis/request/) · [TCP 소켓](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/) · [Node HTTPS 호환](https://developers.cloudflare.com/workers/runtime-apis/nodejs/https/)

| 대안                                      | 비용과 조건                                                                                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기존 Windows Node 전송기                  | 추가 Cloudflare 서비스 없이 로컬에서 승인된 Source를 운영자가 시험할 수 있다. TLS 및 고정 IP를 검증하고 IPv6/혼합/사설 답변은 차단한다. 신뢰된 장치 가용성과 승인 범위는 별도다.              |
| 별도 신뢰 egress와 Cloudflare 내부 바인딩 | 연결 peer 및 원래 SNI를 실제 브로커에서 고정하고 증명해야 한다. RPC 자체는 연결 대상 검증을 추가하지 않는다.                                                                                  |
| Cloudflare Containers나 관리형 egress     | Containers는 Workers Paid를 요구한다. 비용 승인 전 사용하지 않으며, 유료 플랜만으로 SSRF가 해결되지 않는다. [Containers 비용](https://developers.cloudflare.com/containers/platform/pricing/) |

통제된 staging 원격 실증 없이 수집 활성화를 허용할 수 없다. B/C 출시 승인을 차단한다.
