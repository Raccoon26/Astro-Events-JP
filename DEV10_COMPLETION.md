# DEV-10 통합과 릴리스 판정

기준 main `18787b2c74aa4ede382b0d6c193cf5894c1b2a02` 및 PR #33을 확인했다. 로컬·격리에서 새 비공개 Worker와 DEV-09 작업 장부를 연결하고 Off/스키마/DB 격리/예산 게이트를 검증한다.

- 별도 환경의 `ReleaseOperations`는 Workers RPC로 예약과 한 단계 호출을 받는다. 배포 설정은 off, 공개 URL·미리보기·경로·Cron·DB binding이 비어 있다. 일반 HTTP 진입은 404다. 기존 Health 및 진단 Cron은 그대로 사용한다.
- 격리 D1의 실제 파서·사람 검토 계약·ID/revision·예약·일본어 게시글·주말 스냅샷·Outbox와 게시 확인을 연결한다. DEV-06R 한정 합성 수신의 사용자 확인을 별도로 보존한다.
- 알려진 외부 보안 게이트는 SSRF 피어, 개별 Source, 실제 App 최소권한 승인, CPU/비용, 수신·복구·원격 스키마·rollback이다. Windows의 Node 로컬 전송은 명시 TLS 확인을 강제하며 Workers 수집기는 fail-closed다.

A의 코드/CI/보호 병합 증거는 최종 E 드라이브 보고서를 참조한다. B 제한 staging 실증과 C production 승인 기준은 [릴리스 판정](DEV10_RELEASE_READINESS.md)과 [수동 실증 계획](DEV10_MANUAL_APPROVAL_PLAN.md)을 따른다. DEV-10R은 별도 요청과 승인으로 시작한다.
