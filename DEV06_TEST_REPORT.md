# DEV06 검사 근거와 한계

기준은 main `2f2791000c464b3a8a760d61d3c8fe52f848c68a`, 기존 597개/39파일과 migrations 0001~0007이다. data/dev06-baseline.json과 audit-dev06은 원본 테스트/fixture/migration의 LF SHA-256을 검사한다. 기존 목적을 삭제하거나 skip하지 않았다. 최종 전체 check/CI 결과는 완료 보고와 E logs의 실제 결과를 기준으로 갱신한다.

Windows E 드라이브의 전체 테스트에서 696개가 48개 파일에서 통과했다. 테스트 실행기는 로컬 workerd 프로세스의 I/O 경합을 줄이기 위해 파일을 직렬 실행한다. 기존 5,000행 회귀 데이터와 해당 테스트의 제한 시간 및 검증 조건을 보존했다. 승인 fixture가 만료된 뒤에도 사용할 수 없는 수집 전송기를 요청 전에 차단하도록 했으며, 만료 검사는 사용 가능한 전송기에 계속 적용한다.

초기 npm audit에서 기존 잠금 파일의 picomatch 경고가 확인됐다. 해당 권고가 철회된 뒤 기존 설정과 잠금 파일로 다시 조회한 결과 0건이었다. [GitHub Advisory GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).

| 검사                   | 검출하는 오류                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| notification-messages  | 전13종 copy 바이트/문자열 불일치, 관리정보 분리/상한, URL/Markdown/멘션 주입, 이미지 권리 손실                            |
| notification-protocol  | chat/echo/private proof 오류, HTTP/Retry-After/timeout 분류, 응답 손실, fake 상태 JSON 위조                               |
| notification-outbox    | 부분 성공 재발송, 동시 claim, lease 만료, payload+hash 동시 위조, source/fingerprint/document/post 변경, 예산 불명/과다   |
| notification-callback  | 잘못된 actor/chat/message/action/만료/replay, posted/held CAS 경합, recheck/지문/게시기록, copy 수정 및 보고 루프         |
| notification-safety    | DB batch rollback, 검증 후 commit 전 변경, 과거 수신 재조정, 일예산, 가짜 Report/key, 2,000행 cursor/FK/quick_check       |
| notification-workerd   | 별도 실제 workerd invocation에서 현재 gate→enqueue→claim→모의dispatch→callback, invocation별 D1 비용, outbound fetch 차단 |
| notification-cli/email | production/live/잘못된 적용 옵션 차단, 읽기 전용 준비상태, 이메일 설정과 실제 수신 구별                                   |

정합성 검사는 실제 로컬 Miniflare D1/SQLite를 사용한다. D1에서 PRAGMA integrity_check는 SQLITE_AUTH로 거부되어 지원되는 quick_check와 foreign_key_check를 사용한다. 실패를 skip하지 않고 지원 API로 같은 정합성 목적을 확인한다. 기존 전체 스키마/마이그레이션 시험도 유지한다.

E reports/dev06-workerd-measurement.json은 단계별 calls/statements/rows read/write와 로컬 경과시간을 저장한다. dev06-cursor-measurement.json은 2,003행/41페이지 시험, dev06-d1-measurement.json은 중복 재실행·부분별 전달을 포함한 시나리오 전체 측정이다. 합계는 한 Worker invocation 비용이 아니다. Cloudflare CPU·메모리는 null이며 로컬 elapsed를 CPU로 표기하지 않는다.

실제 Telegram 수신·GitHub Issue 쓰기·이메일 수신·원격0008·전체 전달 CPU는 시험하지 않았다. 외부 알림 요청은 0이다. 읽기 전용 Reports metadata 확인과 GitHub 코드 PR/CI는 제품 알림과 별개다. 합성 fixture는 실제 행사/검증/알림 수에 포함하지 않는다. 실제 Workers Free에서 알림+gate+DB 파이프라인의 10ms 충족은 아직 보장하지 않는다.
