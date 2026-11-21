# DEV-10R-A 이후 승인 경계

개발 코드의 판정은 **ALTERNATIVE_READY**이고 서비스 전체 판정은 **CODE_READY / OPERATIONS_PENDING**이다. 무료 Windows 대안의 운용 경계는 승인형 E 로컬 수집이다. 기존 staging 진단과 production의 쓰기·Cron·발송 정책을 그대로 사용한다.

DEV-10R-B의 **준비·설계**는 명시적 요청을 받은 뒤 시작할 수 있다. 실제 시험 전 아래를 개별 승인받는다.

1. 기존 로컬 Windows Node로 시험할 공식 Source, hostname·경로·robots·약관, 최대 요청 수와 담당자를 확정한다. 휴면/철회된 Source를 자동으로 활성화하지 않는다.
2. 관리형 Workers 경로를 원하는 경우에는 자체 통제 endpoint와 사용량 상한이 있는 staging 시험을 별도 승인한다. 사전 DNS IP, 실제 원격 peer, SNI·인증서, redirect, IP 대역, 오류를 판정할 수 있어야 하며 일반 fetch fallback은 금지한다.
3. Cloudflare D1과 데이터 연계가 필요한 경우 좁은 인수 인증, 비공개 staging 목적지, 승인된 스키마, 예산, provenance, rollback을 실증한다. 현재 원격 D1은 두 환경 모두 0004다.
4. 공식 단계별 CPU/계정 사용량, Observability, 실제 App·제한 수신·복구는 DEV-10 실운영 게이트에 남는다. Production 활성화에는 추가 명시적 승인이 필요하다.
