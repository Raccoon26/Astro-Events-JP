# DEV-00~10 로드맵

> DEV-01R 현재 결과(2026-11-13 JST): staging·production 원격 Worker/D1·마이그레이션·staging 복구/rollback·Health/Cron·실제 CPU·승인된 Actions 배포를 검증했다. [원격 검증 결과](DEV01R_REMOTE_REPORT.md)가 최신 근거이며 아래 DEV01~03 당시의 보류 기록은 이력이다. 수집·알림=false, active0, production Cron0. 최종 문서 PR/CI/병합/main SHA는 E 완료 보고서 기준이다.

DEV01의 원격 보류는 DEV01R에서 재개해 별도 Worker/D1·복구/배포/CPU 기반을 검증했다. DEV02/03 당시의 사용자 보류 기록은 이력으로 보존한다. 실운영 수집은 active0·Workers 전송기 fail-closed·DEV09 운영 승인 전까지 금지한다.

각 단계는 REQUIREMENTS 전체와 기존 구현·상태·회귀를 먼저 검토한다. 완료는 코드/테스트/문서와 GITHUB_WORKFLOW의 PR/CI/안전병합 확인을 포함한다. 차단은 PROJECT_STATUS에 별도 기록한다. 다음 단계로 자동진입하지 않는다.

| DEV | 목표                                        | 완료 조건                                                                                                                                                                                                                  |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00  | 기반·환경·DB·아키텍처·무료정책·GitHub자동화 | 15계약/마이그레이션·경로/정리안전·CI/문서/감사·권한/Reports 점검, 전체 검사·PR·병합또는차단증거                                                                                                                            |
| 01  | Workers·D1·CI배포                           | Free계정확인·실DB생성/ID·Secret·staging/production 분리·마이그레이션/복구·배포workflow 최소권한·health/Cron실증·CPU기준선; collection=false 유지                                                                           |
| 02  | 전국정보원·시설·VTuber등록                  | 47현별 registry와 시정촌확장, JAXA/연구기관/대학 및 소규모지역시설·클럽 포함, 공식성/robots/약관/host·계정 검증, 4인물 실제공식출처와 확장등록, category 최소할당                                                          |
| 03  | 수집·이미지·발견                            | RSS/Atom/HTML/사이트맵 파서·fixture·timeout/body/redirect/DNS SSRF·429/retry·ETag/digest·장애격리·공식이미지URL·discovery승인·미지원목록·로컬프로파일; 소형합성 원격CPU는DEV01R 검증, 실제사이트/크기별10ms 검증은계속필수 |
| 04  | 행사·시설·참가·이미지검증                   | 날짜/장소/요금/예약/신청·필드근거·Verified게이트·모호성보류·공식취소근거·휴관영향·정기휴관제외·이미지권리/크레딧·이미지소실허용                                                                                            |
| 05  | 일본어X완성글                               | 전13종 템플릿·일본어품질표본·반복완화·근거없는표현금지·해시태그1~2·X공식가중규칙/URL/emoji/일본어 경계fixture·길이초과 안전처리·Verified만생성                                                                             |
| 06  | Telegram·PrivateIssues·이메일               | private검증·Secrets·Report전체필드·복사용글분리·이미지/권리/원본링크·게시완료/보류/재확인·chat검증·callback멱등·outbox/uncertain복구·루프금지·실메일구독/전달검증·보고상세보관정책                                         |
| 07  | 중복·변경·취소·마감                         | stable ID/연도/회차·fuzzy검토·지문2년·중복등록/게시/전달경쟁시험·공식변경revision·휴관/재개관영향·예약시작/마감변경/임박·일정연기종료정보갱신                                                                              |
| 08  | 전국정밀조사·지방발견·주말모음              | 47현 aging fairness/완주지연지표·소규모/시정촌확장·도쿄편중방지·범주균형·VTuber비침식·주말집계와개별중복정책                                                                                                               |
| 09  | 3시간자동운영·정리·장애복구                 | Cron실행·lease/cursor복구·일예산예약/실측·한도초과유예/경고/불명failclosed·매일bounded정리(90일/2년/30일)·미래/미해결보호·Issues상세정리·DB/계정용량·Free중단보고                                                          |
| 10  | 통합·일본어·보안·실운영                     | 전국모든범주통합·일본어수동평가·실Telegram/메일/Images/권리확인·SSRF/secrets/SQL/HTML감사·복구/경쟁/보관회귀·무료운영실측·수집지연/미지원한계보고                                                                          |

DEV01 당시 로컬 구현에는 제품 수집·검증·X 생성·Telegram Bot·원격DB·자동정리 엔진이 없었다. 현재 수집 라이브러리는DEV03, 원격DB는DEV01R 결과를 따르며 나머지 제품 기능과 실제 운영은 후속DEV 범위다. 위 완료 조건을 삭제해 DEV00을 제품완성으로 표시하지 않는다.

## DEV-01R 원격 기반

DEV-01R은 기존01의 원격 보류 조건을 재개한 보완 단계이며 DEV04가 아니다. 현재 실제 OAuth/Free 대시보드/계정 조사·원격 D1 두개/마이그레이션/CRUD·staging Time Travel을 검증했고 staging/production 배포·실제CPU·Actions·사용자 production 승인을 검증했다. 전체 완료 조건을 삭제하지 않는다. DEV02~03의96정보원·92시설·47현·수집승인0, DEV04~10의 모든 제품 범위를 보존하며 다음DEV는 자동 시작하지 않는다.

## DEV04 검증 기반

후보의 근거/정밀도/조건·공식 상태/시설 영향·이미지 권리·CAS/revision과 현재 VerifiedEvent 게이트, 로컬 관리 명령을 추가한다. 실제 출처 승인0/수집0과 Workers fail-closed는 유지한다. 원격0005/production 변경 없이 로컬 및 격리 D1을 검증한다. DEV05는 이 게이트와 확인된 필드만 사용하도록 준비하되 자동 시작하지 않는다. [검사 결과](DEV04_TEST_REPORT.md).
