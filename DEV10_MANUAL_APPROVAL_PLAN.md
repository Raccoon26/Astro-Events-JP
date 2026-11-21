# DEV-10R 승인 및 실증 계획

1. **별도 승인과 환경 고정.** staging 전용 DB/Worker ID, 소수 Source와 요청 한도, 기간, Free 비용, App 설치 및 Telegram/Reports 수신 대상을 먼저 승인한다. 기존 production Worker, Cron, Secret, Issue 변경은 범위 밖이다. 한정 수신은 DEV-06R 승인코드를 정규 운영 credential로 재사용하지 않는다.
2. **사전 스냅샷.** 대상 DB ID/ledger/D1 storage 및 row 사용량, Time Travel UTC bookmark, Worker 배포 버전과 config를 읽어 staging 이름을 대조한다. 민감한 백업은 E의 승인된 비공개 위치에 둔다. Time Travel Free 범위 7일, 같은 DB를 덮어쓰는 restore의 영향과 작업 중지를 승인받는다. [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
3. **순서대로 DDL 적용 및 확인.** 기존 0001~0004 ledger를 보존한다. 각 단계에서 아래 읽기 쿼리로 schema를 확인하고 이전 phase를 통과한 경우에만 다음 파일을 적용한다. 작업 전후 대상 ID·ledger·`PRAGMA foreign_key_check`와 `PRAGMA quick_check`의 해당 환경 지원과 결과를 확인한다.
4. **네트워크와 기능.** 통제한 공개 엔드포인트에서 DNS 혼합/변경, v4/v6, 잘못된 SNI/인증서, 실제 endpoint, timeout/redirect 조건을 실증하고 실패마다 송신 0을 확인한다. Source별 robots/약관·정확한 경로·파서·응답 크기·최소 간격을 입증한다. App 인증과 제한 수신은 사용자 허용 범위에서 시험하고 오래된 버튼/중복/응답 소실 복구를 확인한다.
5. **비용과 종료.** Free 예산의 지표/시간/누락 CPU를 기록한다. 1회 1단계 및 제한된 시도를 사용한다. 로컬 rehearsal 미터의 읽기/쓰기는 D1 작업의 크기를 추정하는 증거다. DDL 인덱스 작업 비용은 원격 기존 행/인덱스에 따라 달라지므로 실행 전 크기를 재확인하고 각 승인 단계의 실제 D1 메타데이터를 남긴다. 정지, 태스크 비활성화, Worker 버전 되돌림, 필요 시 승인된 staging Time Travel, 불확실한 발송의 수동 확인 순으로 복구한다.

| migration | 적용 후 읽기 확인                                                                           |
| --------- | ------------------------------------------------------------------------------------------- |
| 0005      | `SELECT version FROM verification_schema`                                                   |
| 0006      | `SELECT version FROM post_generation_schema`, `PRAGMA table_info(generated_posts)`          |
| 0007      | `PRAGMA index_list(generated_posts)`, `PRAGMA index_list(verification_decisions)`           |
| 0008      | `SELECT version FROM notification_schema`, `PRAGMA foreign_key_list(notification_context)`  |
| 0009      | `SELECT version FROM event_tracking_schema`                                                 |
| 0010      | `SELECT version FROM nationwide_schema`, `SELECT count(*) FROM survey_checkpoint`           |
| 0011      | `SELECT version FROM automation_schema`, `SELECT count(*) FROM ops_lease WHERE singleton=1` |
| 0012      | `PRAGMA table_info(release_isolation)`, `SELECT count(*) FROM release_isolation`는 기본 0   |

0012에 포함된 격리 표식은 승인된 전용 DB에만 명시적으로 기록한다. 기본 구성에는 이 DB binding·공개 route·preview URL·Cron이 없다. 기존 staging/production DB에는 혼합 적용하거나 표식을 생성하지 않는다.

## DEV-10R-A 로컬 수집 전송

승인형 Windows 대안에서 Source와 최대 요청을 따로 승인한다. 관리형 egress 검증은 사용자 관리 대상·예산·DNS/peer/SNI 증거가 있는 staging 시험 제안이 필요하다. [승인 목록](DEV10R_A_RELEASE_GATE.md)
