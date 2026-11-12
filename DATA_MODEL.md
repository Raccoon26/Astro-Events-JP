# 데이터 모델

> DEV-01R 현재 상태(2026-11-12 JST): 공식 OAuth/Free 화면 확인, 원격 D1 두 개·0001~0004 적용·staging CRUD/Time Travel 복구를 실제 검증했다. Worker 배포·Cron 실행·CPU·Actions 인증/production 승인은 이 스냅샷에서 아직 검증 중이다. 아래 과거 DEV01~03의 보류 기록은 당시 이력이며 현재 결과는 DEV-01R 절과 PROJECT_STATUS를 따른다.

DEV01은 기존0001을 수정하지 않고 `0002_deployment_identity.sql`을 추가했다. deployment_identity는 singleton=1 PK, staging/production 환경, 환경과일치하는database_name, schema_version=2, 초기화시각을 보관한다. 마이그레이션 자체는 marker를 추측해 넣지 않으며, 대상의 provider ID/이름과 빈 DB를 검증한 guarded initialize에서 단한번 설정한다. Worker는 marker를 수정하지 않는다. 이 테이블은 운영 상세/이벤트 테이블과 독립하며 보관정리 대상이 아니다.

기존 테이블/컬럼/관계/인덱스/보관기간은 그대로다. 0001의 정규화LF SHA256 회귀검사를 추가했다. 로컬 실제 Wrangler D1과 workerd에서 두 migration·테이블/인덱스·FK/quick_check·합성staging CRUD를 검증했다. 실제 원격D1 적용과 Time Travel은 인증보류로 미검증이다. 마이그레이션/복구는 DISASTER_RECOVERY를 따른다.

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

## DEV02 추가 마이그레이션

0001/0002는바이트기준보존하고SHA검사한다. 0003_registry.sql만추가했다. registry_metadata는source/facility/vtuber의검토근거/유형/운영주체/별칭을JSON으로확장하고registry_urls는엔티티종류별URL및과거alias를UNIQUE로관리한다. registry_history는Source수정전후와시각을FK로보존한다. facility_sources는기존facilities/sources의다대다FK이며vtuber_sources는기존것을재사용한다. polymorphic metadata/URL의참조는관리API가유지하며원시SQL삭제는제공하지않는다.

sources_due를유지하고category/state/prefecture/next시각, prefecture/source_id, facilities(prefecture,facility_id) 인덱스를필터/커서조회에추가했다. 인덱스추가로등록쓰기비용이증가하므로로컬meta로측정한다. 목록조회는1개JOIN이며N+1을사용하지않는다. 기존metadata없는Source도보이며미검증active는조회결과review로격리한다(DB원본보존). 운영예약/ETag등은sources컬럼이기준이다. deployment_identity.schema_version=2는DEV01런타임호환marker이며0003적용여부는migration ledger로별도관리한다. 원격DB/production에는적용하지않았다.

## DEV03 추가 스키마

0001~0003은 변경하지 않고 SHA를 검사한다. 0004_collection.sql에 source_approvals/source_policy_reviews, collection_jobs(단계/owner/lease/offset/문서지문), collection_documents(validator/시도/성공/변경/실패/완료), event_candidates/candidate_versions, candidate_images, collection_cursors/host_gates/run_metrics를 추가했다. Event 및 게시/전달 테이블에는 쓰지 않는다. 후보 지문 변경 시 Review Required로 되돌리고 이전 관측 버전을 보존한다. 이미지 권리는unknown이 기본이며 이미지 실패로 후보를 cascade 삭제하지 않는다.

전문 원문을 저장하지 않고 최대64KiB parsed 메타데이터만 임시 job payload로 둔다. 후보와 버전은 DEV04 처리·DEV09 보관 정책의 대상이며 임의 자동 삭제는 실행하지 않는다. 완료/실패 job·관측 메타·실행 기록 정리는 DEV09에서30일 bounded 정책에 편입한다. Source/시설 정보는 영구 보존하고 기존 이벤트90일/지문2년 정책을 변경하지 않는다.

## DEV-01R 원격 기반

DEV-01R 원격 staging/production에 기존0001~0004를 적용했다. 기존 SQL 파일은 수정하지 않았고0004도 LF SHA 검사를 추가했다. 실제 ID는 manifest/config에 분리 기록한다. deployment_identity.schema_version2는 런타임 marker이며 migration ledger에는4개 파일을 별도로 기록한다. production에는 marker와 스키마만 있으며 Seed/행사 테스트 데이터는 넣지 않는다.
