# 데이터 모델

실행 가능한 기준은 `migrations/0001_foundation.sql`; D1 호환 SQLite, UUID 계열 TEXT PK, UTC ISO-8601 정규화 시각과 `Asia/Tokyo` 표시 시간대를 사용한다. 날짜만 확인되면 date_precision=date, 미확정 값은 NULL이다. SQL 값은 반드시 bind한다. 마이그레이션은 새 번호 파일로 추가하며 기존 적용 파일을 수정하지 않는다. DEV01에서 원격 DB ID를 구성하고 staging 적용·백업/복구를 검증한다.

| 테이블                   | 역할 / 수명                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| sources                  | 공식URL·허용host·범주·현/시정촌·형식·우선도·cursor용 due시각·etag/digest·robots/약관·실패/backoff; 영구                                          |
| facilities               | 명칭·현·URL·운영상태·휴관시작/종료·재개관·근거·최종검증; 영구                                                                                    |
| vtubers / vtuber_sources | 이름·공식계정·확인상태·확인시각·활성여부 / 정보원 다대다; 실제공식URL 확인 전 disabled                                                           |
| events                   | stable_event_id·출처/시설·제목·분류·주최·현/시정촌/회장·일시·JST·신청기간·예약·요금·URL·상태·검증·근거·최초/최종확인·연도/회차·revision·종료확인 |
| event_vtubers            | 행사와 인물 다대다                                                                                                                               |
| event_changes            | revision별 전/후 JSON·변경유형·공식확인·근거·시각; event와 함께 정리                                                                             |
| facility_notices         | 여러 휴관/점검/재개관·행사영향·정기여부·해결시각; 미해결 보존                                                                                    |
| event_images             | URL·출처URL·유형·권리상태·표기·허가근거·확인시각·생존여부; 이미지 파일 없음                                                                      |
| generated_posts          | 행사revision/type/template별 일본어 텍스트·해시태그·가중길이·시각; 종료후90일                                                                    |
| publication_records      | posted/held/recheck/pending·유일action ID·게시링크·만료; 상세 종료후90일                                                                         |
| posted_fingerprints      | 행사와 FK를 두지 않는 최소 지문·연도/회차·revision·종류·게시일·만료; 2년                                                                         |
| crawl_runs               | 실행·종료·상태·cursor·처리/이월/실패·요청/읽기/쓰기·안전오류코드; 30일                                                                           |
| notification_deliveries  | 유일전달키·channel/part/revision·outbox 상태·lease·외부ID·재시도·만료; 상세90일 후 최소 전달 tombstone 정리                                      |
| discovery_candidates     | 정규URL 유일·발견근거·현/시정촌/범주·승인/거절/미지원; 소스 자동활성화 금지                                                                      |
| scheduler_state          | 현/범주 cursor·lease/owner·갱신시각                                                                                                              |
| daily_usage              | UTC일·실측읽기/쓰기/요청/DB크기·경고시각; DEV09에서30일집계 정리                                                                                 |

## 제약·인덱스

현코드1~47, 예약boolean/unknown, status/verification enum, 기간역전 금지, 이미지 permitted에는 근거URL 필수. 동일행사 이미지·생성글revision/template·change revision·전달키·callback action·지문은 UNIQUE로 경쟁조건에서도 중복을 차단한다. 검증 기준 충족은 enum만으로 보장하지 않으므로 DEV04가 필드별 근거를 검증한다.

행사삭제는 이미지/변경/생성글/인물관계를 cascade한다. 시설은 지우지 않으며 notice/발신/게시 참조는 SET NULL로 보존한 뒤 정책에 따라 정리한다. event ID 지문은 독립 보존한다. 소스due·행사현/일시·정리시각·발신due 인덱스로 전체스캔을 피한다. 인덱스 갱신도 D1 쓰기량이다.

## 정리 알고리즘 (DEV09 구현)

매일 UTC 정리, 100행 이하씩 budget 확인 후 반복·checkpoint. 종료 확인과 실제 종료일이 모두 90일 이전이며 미래 시작이 없고 미해결 facility notice가 없는 행사만 `src/retention.ts`의 선택 쿼리로 계획한다. 날짜 미확정/끝 미확정/미래/진행중 휴관은 보존한다. 새 revision으로 연기되면 종료확인을 재검증한다. posts/images/changes/근거와 연결 상세도 함께 제거한다.

게시지문은 게시시각부터 달력상2년 후 expires_at으로 설정하고 독립 삭제한다(윤일 정책: 해당월 마지막날). crawl_runs는 시작후30일, orphan publication/delivery 상세는 명시적 expires_at으로90일 정리한다. 미해결 전달은 재조정 후 최소 tombstone만 유지한다. 실제 행사 보고를 GitHub에 영구 복제해 두지 않으며 DEV06/09에서 Issues 본문/댓글의 오래된 상세도 축약·정리한다. Git 이력에 실보고를 쌓지 않는다.

D1 meta.size_after/rows_read/rows_written과 대시보드 지표를 수집한다. 단일 DB500MB에 대해 350MB 경고·400MB 수집축소·450MB 비필수쓰기중단, 5GB 계정사용량도 확인한다. 경고/정리에 예산을 남긴다. DEV00은 선택쿼리/제약 시험만 수행했으며 자동 삭제 스케줄은 아직 실행하지 않는다.
