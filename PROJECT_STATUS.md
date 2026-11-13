# DEV04 프로젝트 상태 — 2026-11-14 JST

**DEV04 구현·검증 완료 / 제품 수집·알림 운영 OFF.** [25항목 완료보고](DEV04_COMPLETION.md)와 [시험/실패이력](DEV04_TEST_REPORT.md)을 현재 근거로 사용한다. 최종문서PR의 실제CI·병합/main SHA는 E reports/github-completion 및 최종대화보고에서 확인한다. 아래 이전상태는 이력이다.

- 기존206개 목적·20개파일·migration0001~0004 보존. 전체350개/25파일 check·types/Biome·두환경/collector/verifier build·D1/FK/무결성·secret/npm audit0·요구감사 통과.
- dev04-2: 후보→필드별근거·정밀도/조건·공식변경·시설/이미지→현재Verified 게이트. 원자적CAS/revision·경합/rollback/재개·로컬DryRun관리·0005를 구현했다.
- 실제staging 고정합성3회Verified·외부요청0·DB읽기1/쓰기0. 공식CPU 집계(Health포함4요청) P50 3.392/P99 8.608ms·오류0. 정확한이전Worker/Health200 복구. 전체/대형입력/원격0005저장의성능보장아님.
- 원격두환경Health200·별도D1·0001~0004·Source/Event/Candidate0. 0005는E로컬/격리에만적용. 수집/알림false·productionCron0·Workers안전전송fail-closed.
- Seed/로컬Source96·공식성77·47현/시설92/VTuber4·active0/review85/unsupported9/paused2 유지. 실제공식수집/검증행사0. 猫谷ここな의공식교차링크는미확인이다.
- 기존인증/Secrets/보호정책유지·Reports Private/Issues=true·실제E경로/전후DryRun·지정C/D후보없음/삭제0. 물리분리·C/D전체무잔여미검증.
- DEV05~10 범위와무료정책을유지한다. DEV05 로컬입력계약은준비됐으며자동시작하지않는다. 현재새인증/토큰요구없음. 원격0005/production변경·실수집승인은후속단계에서별도검토한다.

## 이전 진행 기록 (최종상태 아님)

# DEV04 프로젝트 상태

DEV04 검증 엔진 구현·로컬 검증 및 GitHub 완료 절차를 진행한다. 기준 main07abbf8268ec0b8514baf01cf3309ffb1f98da00(PR9)에서 기존206개 목적·마이그레이션0001~0004·원격 기반을 보존했다.

후보/필드별 공식 attestation·날짜/신청/요금/예약·공식취소/연기·시설영향·권리·현재Verified게이트·D1 CAS/rollback/경합·로컬CLI/0005를 구현했다. [설계](VERIFICATION_DESIGN.md), [검사/미검증](DEV04_TEST_REPORT.md), [요구감사](dev04-coverage.json)를 참조한다. 최신 check/PR/CI/병합/mainSHA는 E 완료보고서로 확인한다.

실제 Source96/공식성77/47현/시설92/VTuber4와 active0/review85/unsupported9/paused2, 실제수집0/실제검증행사0를 유지한다. 猫谷ここな 교차링크 검토는 미완료다. Collection/Notifications=false·productionCron0, Workers peer/TLS 미검증 fail-closed를 보존한다.

0005는 E 로컬 staging/격리 D1만 적용했다. 원격 staging/production은0001~0004이며 새 검증 기능OFF, 기존 Health/Cron 호환성 유지다. production 신규 migration/fixture import/수집 활성화는 하지 않았다. 기존 인증/Secrets/보호 규칙은 변경하지 않는다. DEV01R CPU는 과거 실측이며 DEV04 CPU와 구분한다. 새 staging합성 진단은 실제 실행·메트릭을 확인한 후만 성공으로 기록한다.

남은 제한: 실제 공식자료 검증0, 특수 일본어/복잡한 가격/권리는 명시적 검토, 원격0005/실제검증DB CPU 미검증, 실제사이트 수집과 Workers 안전전송 미지원. DEV05~10 요구사항은 그대로 보존하며 DEV05를 자동 시작하지 않는다. 현재 새 인증/토큰 요청은 불필요하다.

## 이전 단계 이력(현재 상태와 구분)

# DEV-01R 프로젝트 상태

2026-11-13 JST. **Cloudflare 원격 기반 검증 완료 / 실제 수집·알림 운영은 비활성화.** [실제 증거·수치·제약](DEV01R_REMOTE_REPORT.md)을 기준으로 한다. 최종문서PR의 필수CI/병합/main SHA는 E reports/github-completion 및 최종 완료 보고서에서 확인한다.

## 구현·로컬·원격 검증 완료

- 공식OAuth·Workers Free 직접확인과Actions subscription/계정전체예산 검사. 환경별Secret 실제검증.
- staging/production별도D1(실ID manifest)·0001~0004·schema2·테이블/인덱스/FK/무결성. 기존migration수정0.
- staging합성CRUD·Bookmark/TimeTravel·실패DDL/ledger보존·복구. production에는시험/삭제/Seed없음.
- 두Worker 실제배포/Health200·정확한D1 binding/disabled flags. staging실제오류503→200/Worker rollback 성공.
- 실제Cron5회성공·UTC/JST검증, staging1slot/production0slot. 실제CloudflareCPU/메모리·D1meta측정.
- staging자동배포·최신mainCI·production사용자명시승인과GitHub Environment직접승인 후run43432927707성공.
- 기존178목적보존·총206테스트/18파일,types/Biome/build/SQL/Seed/요구사항/secret/npm audit0.
- 실제E preflight·cache/temp/auth/log/report 경로검증·정리DryRun. 다른Worker변경시각/지문보존. Reports Private/Issues확인.

## 미구현·미검증·남은 제약

DEV01의계정인증/원격D1/Worker배포/복구/CPU기반 보류항목은 이번실증으로해소했다. 제품실운영이 시작된것은아니다. Source96/공식성77/47현47/시설92/VTuber4/active0을유지한다. 실제공식사이트수집0이며 Workers fetch peer/TLS pinning은미검증이라fail-closed를유지한다. 실제RSS/HTML본문 크기별CPU·전국처리량/장기운영은후속실측이필요하다.

날짜/요금/예약·시설영향/공식취소·이미지권리·일본어X글/해시태그·Telegram/PrivateIssues/메일·중복/변경·전국공정성·보관/정리/장애운영·통합은DEV04~10범위로보존한다. COLLECTION_ENABLED/NOTIFICATIONS_ENABLED=false. ProductionCron0·Seed/이벤트/후보0. 월추가비용0엔목표와유료자동전환금지유지.

외장하드물리분리시험은하지않았다. missing-path회귀로분리시안전중단을검증했다. C/D전체잔여물없음을주장하지않고지정프로젝트후보만DryRun했다. 알려진진단버그3건은수정후원격최종성공으로검증했으며실패이력은삭제하지않았다.

## GitHub·다음 단계

배포코드main8cfa441163c307b7efdf97e88e289dbb8528bb32. PR5~8필수CI/보호준수병합, 최종문서PR도complete:dev로검증한다. main직접개발Push/force/보호우회/브랜치삭제없음. 사용자의추가인증/토큰설정은현재불필요하다. DEV04의로컬개발기반은준비됐지만자동진입하지않는다.

## DEV03 종료 스냅샷(이력)

기준일 **2026-11-12 JST**. 현재 **DEV-03 로컬 수집 엔진 구현·검증**, GitHub 최종 완료 절차 대상이다. 실제 최신 PR HEAD/CI/병합/main SHA는 E reports/github-completion 및 DEV03_COMPLETION 보고서에서 확인한다. DEV-04는 시작하지 않는다.

## 선행 단계와 경계

DEV00 PR1·DEV01 PR2·DEV02 PR3의 병합 결과를 기반으로 한다. DEV02 main `c19eae8df99638940b37d43cde37cc0a5d82fc0b`를 확인하고 최신 main에서 dev/dev-03-collector를 만들었다. 기존79개 테스트/10파일·Registry/시설/VTuber/47현/Seed·공개 Health/안전 Cron·경로/정리/CI/자동 완료를 보존했다. 0001~0003은 변경하지 않고 SHA 검사를 유지한다.

**DEV01: 로컬 완료 / 원격 검증 보류. DEV02: 로컬 구현·검증·PR3 병합 완료. DEV03: 로컬 엔진 구현. Cloudflare 실운영: DEV01 원격 검증 전 활성화 금지.** 인증을 다시 요구하거나 원격 자원·배포를 시도하지 않았다. Worker 진입점은 수집기를 호출하지 않는다. Collection/Notifications와 GitHub 배포 활성화는 false이며 병합으로 실운영이 시작되지 않는다.

## DEV03 구현

- HTTPS 정확한 호스트/경로 승인·매 redirect 검증·요청/본문/스트림/timeout/abort 제한·한정 재시도·429/Retry-After 이월
- RSS2·Atom·bounded HTML/CSS rules·sitemap/index 파서·UTF8/Shift_JIS 등 엄격한 일본어 디코딩·DTD/외부 entity 차단
- 원문/비교 제목·게시일/개최일 후보 분리·모든 날짜 원문/필드 근거/규칙 버전/지문·Review Required 후보
- 공식 이미지 URL/출처·rights=unknown/available=null·파일 저장/허가 추정 없음
- robots/약관/공식성/시험 근거를 요구하는 승인·재검토·승인 철회 시 저장된 checkpoint 처리도 차단
- ETag/Last-Modified/304/본문 지문·Source 시도/성공/실제 변경/실패/재조사 시각
- 신규0004: 승인/검토·호스트 간격·작업/checkpoint·문서 상태·후보/버전/이미지·공정 커서·실행 계측
- fetch/parse와 원자적 DB commit 분리·owner/lease CAS·실패 후 parsed 재개·최대3 fetch claim/명시적 검토 재시도
- 페이지당10개/nextOffset·변경 시 재시작/중복 PK·sitemap depth1/자식3개·47현 커서/VTuber 별도 배정
- DEV04용 listForVerification 최대50행 커서 조회. Event/게시글/알림 생성 없음

[설계](COLLECTOR_DESIGN.md)·[지원 형식](PARSER_SUPPORT.md)·[SSRF 감사](SSRF_SECURITY_AUDIT.md)에 상세 동작과 한도를 기록했다.

## 실제 정보원과 승인 결과

Source96개, 공식성 Verified77개/추가확인19개, 시설92곳, VTuber4명, 실제 공식성 출처47현47/47를 보존한다. **active0 / review85 / unsupported9 / paused2**다. 시설은 과학관·플라네타륨74/천문대6/community6/연구기관5/대학1이며 category=local8개다. 공식성 확인 출처1개뿐인24현은 [커버리지](SOURCE_COVERAGE.md)에 유지한다.

新潟·滋賀·秋田·高知의 실제 공식 페이지에서 지방 정보원4개를 추가 발견해 review Discovery 후보로 저장했다. 기존 실패 후보와 합해 Seed 후보5개다. Source Verified/시설 수에 포함하지 않았다. [발견 근거](SOURCE_DISCOVERY.md)를 참조한다.

NAOJ 이용 조건은 열람했으나 자동 수집 범위가 명확하지 않고 robots 원문 확인도 완료하지 못해 review를 기록했다. 검토 도구 접근 실패를 HTTP404로 해석하지 않았다. **실제 수집 승인0 / 승인 사이트 엔진 시험0 / live gate 네트워크 요청0**이다. 임의 승인이나 미승인 사이트 시험은 하지 않았다. 정책이 명확한 승인 Source 확보 후 실전 검증이 필요하다.

宇推くりあ·月女神イチ·星見まどか의 기존 공식 연결 근거를 유지한다. 猫谷ここな는 공식 교차링크 부족으로 Review Required다. 전원 enabled=0이며 X 전체/일반 방송 감시를 보장하지 않는다.

## 검증 상태

RSS/Atom/HTML/sitemap4형식을 실제 로컬 workerd에서 실행하고 격리 D1의 마이그레이션·저장·304/지문·rollback/재개·페이지 완주·후보 버전·승인 철회·경합·무료 예산/production 차단을 검사한다. 기존79개는 삭제·목적 축소 없이 유지한다. 최종 테스트 수·전체 check/최신 HEAD CI 결과는 E 완료 보고서에 남긴다. 실패 상태는 병합하지 않는다.

현재 테스트 인벤토리는 **178개/15파일(기존79 + 신규99)**이다. 전국 공통/VTuber 후보를 함께 넣어도47현의 조사 기회가 조회 상한 때문에 누락되지 않는 실제 D1 회귀 시험도 포함한다. 최종 최신 HEAD의 전체 check/CI를 병합 게이트로 사용한다.

E 영속 로컬 staging에0004를 적용하고 Seed 반복 Import/4후보 추가/NAOJ 검토 기록/collector 상태/active0 gate를 실행했다. 원격·production DB에 접근하지 않았다. 합성 저장 시험과 실제 행사 수집을 구분한다.

[벤치마크](COLLECTION_BENCHMARK.md)는 로컬 경과시간·D1 meta rows_read/rows_written/size_after를 기록한다. API 호출과 SQL statement 수를 분리하며 계측 저장 batch 자체의 제외를 명시한다. **실제 Cloudflare CPU=null**이며 로컬 시간으로10ms 준수를 확정하지 않는다. 최신 결과는 E reports/dev03-parser-benchmark.json 및 dev03-d1-measurement.json이다.

## E 드라이브·GitHub

실제 E:/Astro-Events-JP/repo와 환경·경로 검사를 수행했다. 코드/cache/temp/config/build/log/DB/report는 E 정책을 사용한다. 전후 정리 Dry Run을 E reports에 남긴다. C/D는 알려진 프로젝트 전용 경로만 점검하며 개인·시스템·공용 캐시를 삭제하지 않는다. 물리적 외장하드 분리 시험은 미수행이고 missing-path/link/외부 경로/소유·변경 파일 차단 논리 테스트를 유지한다.

기존 GitHub 인증과 complete:dev -- --reviewed로 전체 검사→개발 브랜치 commit/push→PR→최신 HEAD CI→보호 조건/expected-head 병합→main fast-forward를 수행한다. main 필수 quality/strict·PR·관리자 포함·강제 push/삭제 금지를 완화하지 않는다. 실제 결과/SHA는 E 완료 보고서에 기록한다. 다른 프로젝트·기존 브랜치를 변경/삭제하지 않는다.

## 미검증·제약·다음 단계

DEV01 보류: 계정 Free/권한/전체 사용량·자원 충돌, 두 원격 D1/ID/마이그레이션·staging CRUD/Time Travel, Workers 배포/rollback·원격 Health/Cron/CPU·실제 Actions 배포. 사용자 선택에 따라 인증을 다시 요구하지 않는다.

Workers DNS 조회만으로 실제 peer를 보장할 수 없어 기본 전송기는 **fail-closed**다. 로컬 Node는 DNS 전체 공인 IPv4·IP pin·원래 SNI/TLS·실제 peer 검증을 구현했고 주입 fixture로 시험했다. 실제 공식 사이트 TLS/수집·Workers SSRF 완전 방어를 검증했다고 주장하지 않는다. IPv6/HTTP-only/JS-render/PDF/RSS1은 현재 미지원이다.

계속 변경되는 큰 목록의 과거 항목 지연, national/null 지역 자동 배정, 장기 lease/완전 Cron 복구·전국 최적화는 DEV08/09다. 무제한 탐색/재시도를 허용하지 않는다. 정책 불명확/형식 한도 초과는 검토·미지원으로 유지한다.

DEV04 사실/요금/예약/취소·시설 영향·이미지 권리, DEV05 일본어 X/해시태그/길이, DEV06 Telegram/Private Issues/이메일·게시 완료, DEV07 변경·중복, DEV08/09 전국 실운영·계정 예산·자동 정리, DEV10 통합/실운영 검증 요구는 모두 유지한다. **DEV04 로컬 후보 검증 기반은 준비되지만 자동 시작하지 않는다. 현재 추가 인증·토큰·설정은 요구하지 않는다.**

## DEV04 PR10 및 원격 진단 이력

PR10 필수CI/보호준수병합·main067e315/로컬clean 동기화, 전체315개 통과. 자동staging 및 profile-verifier의 현재배포 이력 조회가 페이지2 발생으로 실패해 완료로 계산하지 않는다. Health200·기존schema/flags는 보존됐다. 명시적 최신배포1개 조회와6회귀를 추가하고 별도DEV04 증거브랜치에서 전체검사·CI·배포를 재검증한다. production변경/0005원격적용은 하지 않는다.
