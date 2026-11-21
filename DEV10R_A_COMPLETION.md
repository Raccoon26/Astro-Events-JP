# DEV-10R-A 수집 전송 판정

**ALTERNATIVE_READY**는 기존 Windows PC의 승인형 로컬 수집 전송을 구현·격리 검증했다는 의미다. Cloudflare Workers 외부 전송은 별도 게이트가 열릴 때까지 차단된다. 출시 전체 판정은 **CODE_READY / OPERATIONS_PENDING**이다.

- 기준 main e3378e64cd7b18e2007315517371bccf60ed6f0d 및 PR #34를 확인했다.
- Node HTTPS는 전체 DNS 결과를 검사하고 하나의 공인 IPv4 소켓을 고정한다. 원래 SNI와 인증서를 검증하고 커널이 보고한 피어를 확인한 후에만 HTTP 에이전트에 소켓을 넘긴다.
- Collector가 각 요청의 승인·lease를 확인한다. Node는 DNS 이후 접속 전에 다시 확인하고 종료·재개 시에는 승인 지문과 D1 저장 경계를 점검한다.
- 기존 Worker 전송기, 진단 설정, 배포 워크플로, 0001–0012를 보존한다. 새 마이그레이션·유료 자원·외부 수집·알림·정리 실행은 이번 범위 밖이다.
- 정밀 요건은 [보안 점검](DEV10R_A_SECURITY_REPORT.md), [대안 비교](DEV10R_A_TRANSPORT_COMPARISON.md), [격리 시험](DEV10R_A_TEST_REPORT.md), [후속 승인](DEV10R_A_RELEASE_GATE.md)에 있다. 실제 CI, 병합, E 경로 및 원격 안전 상태는 E 드라이브 최종 보고서에서 확인한다.
