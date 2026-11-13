# 테스트와 증거

> DEV-01R 현재 결과(2026-11-13 JST): staging·production 원격 Worker/D1·마이그레이션·staging 복구/rollback·Health/Cron·실제 CPU·승인된 Actions 배포를 검증했다. [원격 검증 결과](DEV01R_REMOTE_REPORT.md)가 최신 근거이며 아래 DEV01~03 당시의 보류 기록은 이력이다. 수집·알림=false, active0, production Cron0. 최종 문서 PR/CI/병합/main SHA는 E 완료 보고서 기준이다.

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

## DEV03 추가 검사

기존79개시험의 목적을보존했다. RSS/Atom의정상·누락·중복·깨진XML/DTD·namespace, HTML카드/표/상세/selector/인코딩/일본어·이미지/JS거부, sitemap중복/깊이/순환/offset을추가했다. HTTP200/304/redirect/403/404/429/5xx/timeout/abort/단절/크기·압축·MIME, host/IP/IDN/DNSpeer/정책변경/승인·예산거부를검사한다.

실제workerd에서4형식파싱을실행하고로컬D1에서원자적rollback/중단복구/경합·validator/변경없음/25항목완주/변경후26항목재개·후보버전/3회재시도한도를검증했다. 소형/중형/복잡HTML의경과시간과D1meta를E reports에기록한다. 실제공식Collector시험은승인0으로0회,원격Cloudflare CPU도미검증이다. npm run check는새collector browser bundle까지검사하며CI권한/기존quality gate는유지한다.

## DEV-01R 원격 기반

기존178개 시험을 보존한다. 47현 D1등록 시험은 기본5초를 초과해 검증 내용 그대로 명시적30초를 지정했고, placeholder 부정 시험은 실제 config가 provision된 뒤에도 명시적 null fixture로 계속 검사한다. 새 account-snapshot/recovery/Cron 정책·고정 benchmark/production 거부·D1 identity·Worker fail-closed 시험을 추가한다. 실제 원격 D1/Time Travel 결과와 mock/로컬 결과를 구분한다. 최신 check/CI의 실제 통과 수를 최종 보고에 기록한다.

## DEV-01R 진단 수정 (2026-11-13)

실제 staging 자동배포 run43429571095는 성공했다. 후속 diagnose run43429666817은 기존 schema_version=2 CHECK 제약 때문에 실패했고 성공으로 계산하지 않는다. 원본0002를 수정하지 않고 staging DB의 environment/database_name을 함께 임시 불일치로 바꿔 Health503을 확인한다. initialized_at의 고유 owner와 compare-and-set 조건으로 이 시험의 변경만 finally에서 원복하며 전체 원래 marker를 대조한다. production DB에는 접근하지 않는다. 실제 원본0002를 로드한 SQLite 회귀3개가 CHECK 유지·HTTP 실패 후 복구·production 거부·동시 관리자 변경 보존을 검증한다. 전체203개 check/최신 PR CI 후 diagnose를 재실행한다. production 활성화/배포는 자동 승인 검토가 staging 진단 진행 및 구체적인 배포 승인 미확인으로 거절했으므로 보류 상태다.

## DEV-01R 원격 진단 관측 및 확인 보강

2026-11-13 run43431019676에서 실제 Health503→200·RSS/Atom/HTML/Sitemap 각3회와 SSRF fail-closed1회에 성공했다. benchmark version910454e2-5d11-4c1c-aa88-950653850789의 Cloudflare 실제 CPU P50=2.331ms/P99=8.490ms, 13 reported fetch/errors0/subrequests0(Health 포함, 수집기 전체 성능 보장 아님). CLI rollback은 성공했지만 직후 GET이 이전 deployment를 반환해 전체 workflow는 실패했다. 나중에 정확한 이전 version13ed466d-81fb-4d16-8c65-7c4d4a0f65c1·Health200·benchmark404를 직접 확인했다. mutation을 반복하지 않고 GET만 최대8회/1초 간격 재조회해 exact version/100% traffic을 검증하도록 보강한다. 새3개 시험과 전체206개 check/CI 후 동일 staging 진단을 재검증한다. Production은 여전히 배포되지 않았고 승인 대기다.

## DEV01R 최종 검사 기준

기존178개 목적을 유지한206개/18파일 전체 check와 최신HEAD필수CI, 실제staging deploy/Health503→200·고정4파서·fail-closed·정확한version rollback·production사용자승인배포를 검증했다. 실패한 초기3workflow는실패 이력으로 보존한다. 최종문서PR도같은quality/보호/안전병합을 거친다. 실제사이트수집·대형본문CPU·물리드라이브분리·제품알림/메일은시험하지 않았으며 성공으로 계산하지 않는다.

## DEV04 구현 경계

DEV04의 정책·합성 기관/지역·이미지·CLI·native D1/workerd 통합 및2,001건 커서 시험을 추가한다. 기존206개를 삭제하지 않는다. [시험 범위와 로컬/원격 구분](DEV04_TEST_REPORT.md), [감사](dev04-coverage.json). 최종 npm run check는 verifier build/신규 migration/기존 회귀까지 검사한다.
