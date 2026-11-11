# 테스트와 증거

DEV01 추가: 기존11시험의 검증목적/이름/부정테스트를 보존하고 Health 성공fixture만 실제D1 marker/표준Request 계약에 맞게 강화했다. 총48시험(7파일)에서 환경별설정·누락DB·collection/notification잠금·환경변조·Health200/503/404/405/HEAD·민감정보·timeout·Cron두종류·계정예산·원격명령guard·원격오류격리/재시도0·pagination거부·원본migration불변을 검증했다.

로컬 통합은 Miniflare가 실제workerd를 실행하고 별도D1 두개에 전체schema를 적용한다. localhost HTTP·bind쿼리·staging합성CRUD·production격리·테이블/인덱스·quick_check/FK·Cron·환경오류복구를 시험한다. sql.js snapshot복구는 로컬시뮬레이션이다. `npm run d1:local`은 실제Wrangler의 별도영속staging D1에 migration적용/identity/무결성을 다시 검사한다. 로컬측정은 E reports/dev01-local-d1-measurement.json에 저장한다.

Cloudflare원격 Free/계정여유/권한·DB생성/원격migrations·TimeTravel·Worker배포/실패rollback·원격HTTP/Cron·CPU기준선·GitHub실배포는 사용자 인증보류로 차단이다. 로컬시험이나 skipped deployment가 이 항목을 통과시킨 것으로 간주되지 않는다. 재개시 CLOUDFLARE_SETUP과 DISASTER_RECOVERY 순서로 실증하고 PROJECT_STATUS를 갱신한다.

npm run check는 preflight→Cloudflare정책/원본migration검사→소스/테스트타입→Biome lint/format→Vitest→양환경Wrangler dry-run→Secret/금지파일scan+npm audit high→요구/문서감사→실제local D1검사 순서이다. 실제 CI 검사명은 quality이다. 실패시 보호/검사를 제거하지 않고 수정한다.

| DEV00 검증       | 방식                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| 타입/빌드/스타일 | Workers와Node테스트 설정분리, tsc·Biome·Wrangler dry-run                                           |
| 스키마           | sql.js 실제SQLite마이그레이션·integrity/FK·권리/UNIQUE·독립지문·미래/unknown/진행중/최근 보존      |
| 실제로컬D1       | Wrangler local migrations apply; 원격은 미검증                                                     |
| 보안기초         | SSRF구문·host·HTMLescape·오류비노출·예산경계·환경검증                                              |
| 경로/정리        | 실제E preflight, 격리fixture의 missing-drive/wrong-cwd·DryRun보존·제한삭제·외부/변경/소유/링크거부 |
| 요구/문서        | R01~32·원요청0~24 매핑·담당DEV·증거·필수문서·11단계·15계약                                         |
| GitHub           | 인증/visibility/기존상태·Reports private 재조회·push/PR/CI·보호/병합 실증                          |

기계문서감사는 의미완전성을 증명하지 않는다. 원요청과 REQUIREMENTS를 다시 읽고 모든 범주·이미지권리·일본어/해시태그·Telegram/메일/privateIssues·중복·보관·무료·E/정리·Git자동완료를 로드맵과 대조한다.

DEV03은 DNS/redirect/body/timeout/429/robots fixture, DEV04는 날짜/공식취소/이미지권리, DEV05는 일본어/X공식가중길이, DEV06은 응답소실/멱등callback/실메일, DEV07은 연례/회차/경쟁, DEV08은47현/범주균형, DEV09는 한도/복구/보관경계, DEV10은 실운영통합을 추가한다.

물리드라이브를 뽑는 시험은 하지 않는다. missing-path는 하드웨어분리 시험과 다르다. Cloudflare계정/실CPU/원격D1, 실Telegram/메일은 DEV01/06에 검증하며 현재 성공으로 표시하지 않는다. 실제결과는 PROJECT_STATUS에 기록한다.

## DEV02 테스트

기존48개시험과검증목적을삭제/축소하지않았다. registry/seed-quality/registry-integration에현코드전체대조,중복/host/민감URL/SQL입력, CRUD/이력/alias/시설다중연결/후보승인/인물확장, 미검증활성차단, 지역회전/독립VTuber예산/범주최소량, 전체사전검증/환경차단/단위rollback/운영상태보존을추가했다. 실로컬D1에최종Seed와2000fixture를넣고FK/quick_check·DryRun/반복0쓰기·검색읽기량/경과시간/크기를검증한다. CI는네트워크사이트수집없이같은Seed를검증한다. npm run check에seed:validate를추가했으며기존CI/48회귀/양환경빌드·보안·요구감사·Wrangler local마이그레이션을보존한다. 실제인터넷근거검토는data의검토시각스냅샷이며CI테스트가현재출처공식성/정책을새로증명하지는않는다.
