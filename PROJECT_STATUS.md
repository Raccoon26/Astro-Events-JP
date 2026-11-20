# DEV-08 전국 공정 조사와 주말 행사 모음

공식 정보원 114개·공식성 95개·47/47 도도부현을 보존한다. DEV-08에서 일본어 시정촌 및 소규모 시설을 확장하고 공식 원문 기반 정보원 18개를 review로 추가했다. 단일 공식 정보원 지역 24곳→8곳, 실제 수집 승인·활성 0이다. [47현 비교와 근거](DEV08_FAIRNESS_REPORT.md)

지역 aging·유형/VTuber 분리·cursor, 현재 Verified와 canonical revision을 사용한 JST 주말 모음, 별도 합성 Outbox를 로컬/격리 0010에서 검증한다. 원격 두 D1은 0004, Collection/Notifications=false, production Cron 0, Workers 안전 전송기 fail-closed를 유지한다. DEV-08 실제 수집기 실행과 외부 발송은 0이다. [완료 범위](DEV08_COMPLETION.md) · [시험](DEV08_TEST_REPORT.md) · [요구 감사](dev08-coverage.json)

DEV-09 운영, 실제 사이트 승인, CPU·인증 장기 실증을 후속 게이트로 유지하며 자동 진입하지 않는다.

## 이전 단계 이력

# DEV-07 행사 중복 및 변경 추적

로컬/격리 기능은 [구현·한계](DEV07_COMPLETION.md), [시험](DEV07_TEST_REPORT.md), [요구사항 감사](dev07-coverage.json)에서 확인한다. PR #30 병합 main `632822aa898218d63255a3dc6b3a1edcb94df306`의 기존 708개 테스트와 0001~0008을 보존한다. DEV-07의 0009는 로컬/격리 전용이다. 실제 병합 및 main 동기화는 E 드라이브 complete:dev 보고서를 근거로 한다.

사용자가 DEV-06R의 합성 Telegram A/B 각 1건, Private Reports 시험 Issue 및 GitHub 이메일 수신을 직접 확인했다. 실제 버튼 클릭, 실네트워크 장애 복구 전수, 전체 Cloudflare CPU와 장기 운영 인증 갱신은 별도 미검증이다. [사용자 확인 범위](DEV06R_LIVE_VALIDATION.md)

Collection/Notifications=false, Source active 0, Workers 안전 전송기 fail-closed, 원격 D1 양쪽 0004, production Cron 0을 유지한다. DEV-07 외부 전송과 production 변경은 0이다. [GitHub App 전환 설계](AUTH_AUTOMATION_DESIGN.md)는 모의 인터페이스까지만 검증하며 DEV-08은 자동 시작하지 않는다.

## 이전 단계 이력

# DEV-06R: 제한 수신 시험 준비

고정 합성 행사에 한해 Telegram·Private Reports에 연결할 수 있는 Windows 로컬 실행기를 분리했다. 전용 Secret, 읽기 전용 점검, 대상·본문·시간에 묶인 승인 코드가 모두 필요하다. 실제 메시지·시험 Issue·이메일·버튼 수신은 승인 전이므로 미검증이다. 기존 Watch·이메일·봇 `/start` 설정을 재요구하지 않는다. [시험 절차와 결과 범위](DEV06R_LIVE_VALIDATION.md).

# DEV06: 로컬 알림 구현 및 회귀 검증

Telegram A/B, Private Issue 서식, callback 3종, 현재 검증과 게시글 재검사, 부분별 Outbox와 불확실한 전달 복구, 로컬 CLI와 이메일 준비 진단을 구현했다. 로컬·격리 환경의 696개 테스트가 48개 파일에서 통과했다. 기존 597개 테스트와 0001~0007 마이그레이션은 원본 해시로 보존했다. GitHub 완료 결과는 E 드라이브 보고서에 기록한다. [완료 근거](DEV06_COMPLETION.md) · [검사](DEV06_TEST_REPORT.md) · [요구 감사](dev06-coverage.json).

실제 Telegram/Reports Issues/이메일 발송0, 실제 Source 승인/수집/검증행사/게시0, Collection/Notifications=false, Workers SSRF fail-closed다. 원격 D1은 양쪽0004, production Cron0이며 원격 신규 migration·production 변경·추가 인증 요청은 없다. Reports Private/Issues 읽기 조회는 확인했지만 credential Issues 쓰기·실제 수신은 미검증이다. DEV05R 140/170 표본과 emoji 목표 미달·최종 코드 재실측 미완료를 보존하며 DEV06 CPU를 보장하지 않는다. DEV07은 시작하지 않는다.

## 이전 단계 이력

# DEV05R: 최적화·대표 합성 실증 완료 / 유형별8ms 목표 일부 미달 / 실운영 OFF

전체597개/39파일·기존539개 목적/0001~0007 보존·보안/요구감사를 통과했다. 최종 staging170건은 모두 성공, 공식 CPU140관측/누락30에서 P50/P95/P99=2.407/4.689/6.364ms·최대8.770ms·10ms초과0/140, 첫 생성1관측5.224ms다. 통합 분포 목표는 충족했지만 이모지 유형 P99는8.770ms(9관측)로8ms를 초과했다. 모든 cold/원격 전체 gate·저장/3시간 Cron은 보장하지 않는다. [완료·전체파일](DEV05R_COMPLETION.md)과 [측정·실패·한계](DEV05R_CPU_REPORT.md)를 따른다.

정확한 원래 staging 복구/Health200, production 버전 불변·Cron0, 두 원격DB0004·Collection/Notifications=false를 재확인했다. active0·실제사이트/게시/알림0·Workers peer/TLS fail-closed를 유지한다. DEV06~10 범위를 보존하며 DEV06은 시작하지 않았다. 새 토큰/권한/유료 자원은 없다.

## 이전 조사 이력

# DEV05R 현재: 첫 실증 완료 / cold 비용 보완 검증 중

PR23/main17b5122·576검사/37파일과 고정340요청·정확한 staging 복구를 확인했다. 관측pool P99는 baseline5.182/optimized7.423ms지만 optimized 첫 생성12.805ms가 남아 운영 활성화는 차단한다. 순수 preparePost의 startup 준비와170회 optimized-only 후속 비교를 준비했다. [실제 결과·미검증](DEV05R_CPU_REPORT.md)을 따른다. production/원격0004·수집/알림OFF·active0·실제사이트0·SSRF fail-closed·DEV06미시작을 유지한다.

## 이전 진행 기록

# DEV05R CPU 조사 진행

최신 main157aaab6eb284f3e65df85d5207ee6efcf8a60b8에서 dev/dev-05r-cpu-optimization을 시작했다. 기존539목적/32파일·0001~0007을 보존한다. [조사 설계](CPU_PROFILE_DESIGN.md), [실제 측정과 미검증](DEV05R_CPU_REPORT.md), [독립 invocation 경계](FREE_EXECUTION_PIPELINE.md)를 따른다. 로컬 실제 workerd CDP 조사·scalar/startup/동일 proof 재사용·D1 marker 조회33→27문장을 보완했다. 원격340회 비교는 아직 실행하지 않았으며8ms 목표를 충족했다고 표시하지 않는다. production/원격0004·수집/알림OFF·active0·실제사이트0·SSRF fail-closed를 유지한다. DEV06은 시작하지 않는다.

## DEV05 완료 이력

# DEV05 프로젝트 상태 — 2026-11-16 JST

**DEV05 로컬 기능 구현·검사 완료 / 원격 CPU 10ms 충족은 미확인 / 제품 운영 OFF.** [25항목 완료보고·전체 변경 파일](DEV05_COMPLETION.md), [13종 합성 샘플](POST_SAMPLES.md), [검사·실패 이력](DEV05_TEST_REPORT.md)을 현재 근거로 사용한다. 구현 PR18~21은 필수 CI·보호 조건을 충족해 병합했고 최신 구현 main은 d56ebbb676bdbc16c8a069f847ae288e3a46ec56이다. 마지막 증거 문서 PR도 complete:dev로 전체 검사·CI·병합·main 동기화를 확인하며 실제 최종 SHA는 E reports/github-completion 및 최종 대화 보고에서 제공한다.

전체 539개/32파일·원래350개 목적·공식 X conformance·native workerd·D1·보안 검사를 통과했다. 최신 staging 고정 합성 진단43882405606은 3회 생성/정확한 복구에 성공했지만 공식 집계(Health 포함4요청)의 CPU P50 4.453ms/P99 16.958ms로 10ms 성능 보장이 아니다. 공식 startup 22ms는 별도 초기화 예산이다. 원격 전체 검증/저장·13종 전체의 CPU는 미측정이며 실운영 활성화 전에 추가 성능 검증이 필요하다. 이 제한을 숨겨 Production 준비 완료로 표시하지 않는다.

- 13종 결정적 일본어·현재Verified 재검사·공식가중길이/안전축약·URL/태그·버전/원자저장/로컬관리 구현.
- 기존350목적·0001~0005를 보존. 24시험파일은 불변이고 1파일의 규칙버전 기대값만2→3으로 갱신했으며 원본목적/SHA감사를 유지한다.0006/0007은로컬/격리만, 원격두DB는0004유지.
- 실제Source96/공식성77/47현/시설92/VTuber4·active0·실제수집/검증행사0·Collection/Notifications=false·productionCron0·Workers전송fail-closed 유지.
- DEV06 발행/보고·DEV07중복변경·DEV08균형·DEV09운영정리·DEV10통합/실사용일본어검수는후속범위다. DEV06자동진입없음. 추가사용자토큰/권한요구없음.

## 이전 DEV04 기록

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

DEV05R 후속 진단43900596338은 3건404로 중단/정확한 원래 staging 복구·Health200을 확인했다. CPU 성공 표본으로 집계하지 않는다. 별도 빌드 marker 준비 검사와 보안 회귀를 추가했으며 최종 실측 전까지 cold 안정성 목표는 미달/미확인이다.

## 최종 NFC 확장 상한 회귀 수정

후속 코드 감사에서 NFC가 scalar 유효성은 보존하지만 UTF-16 길이를 늘릴 수 있음을 확인했다. U+0344 반복4097자는 원본4097자이지만 NFC8194자여서 기존 두 번째 scalarText의8192 상한이 필요했다. 중복 surrogate 순회를 다시 넣지 않고 measureScalar에 O(1) 길이 검사를 복구했다. 원래 정책과 같은 weightedLength=-1/valid=false/remaining=null 거부를 독립 회귀로 확인했다. 17고정결과/공식 X fixture/native runtime은 그대로다. 최종 전체590개/38파일이며 기존539개 목적/0001~0007 보존을 다시 검사한다.

원격 CPU 결과는 main041a662의 실측으로 고정한다. 이 보안 경계 수정 이후의 실제 원격 CPU를 재측정한 것으로 표시하지 않으며, 추가 성능 재배포 없이 최신 코드의 운영 활성화는 계속 차단한다. 유형별8ms·cold/전체 경로의 미해결과 독립 invocation 대안은 그대로 유지한다.

## main CI44098229138의 Biome 설치 누락과 예방

main193da0e의 설치 이후 lint에서 Cannot find module @biomejs/cli-linux-x64/biome가 발생했다. npm ci는 성공했지만 필수 플랫폼 실행 파일이 없었다. 다운로드 누락의 근본 네트워크 원인은 기존 로그만으로 확정하지 않는다. 이 실패 뒤 배포44099561158은 skipped이며 배포 성공으로 계산하지 않는다. 실패한 커밋을 재실행하거나 lint를 제거하지 않았다.

CI/배포의 설치 한 단계만 scripts/install-ci.mjs로 확장했다. Linux x64 격리 runner 전용·npm ci --include=optional·고정 manifest SHA 불변·각 설치4분/네트워크30초 timeout을 적용한다. 정확히 이 Biome optional binary 누락만 확인된 경우 한번 재설치하고 실제 CLI 버전을 고정 버전과 비교한다. 일반 npm 실패/timeout·다른 native 오류/버전 불일치·manifest 변경에는 재시도하지 않으며 실패를 숨기지 않는다. 기존 read-only GITHUB_TOKEN·필수 전체 check·production 승인·배포 조건은 유지한다. 제어·성공/복구/재실패/격리 거부 회귀7개를 추가해 최신597개/39파일이다.

공식 근거: [npm ci의 고정 lock/optional include](https://docs.npmjs.com/cli/v10/commands/npm-ci/), [Biome 설치·버전 고정](https://biomejs.dev/installation/install-biome/). 이 사전 검사는 설치 누락을 더 일찍 식별하고 확인된 누락에만 bounded 복구를 시도하는 것이며 외부 npm 장애 자체를 방지한다고 주장하지 않는다. 새 패키지/버전·유료 제품·원격 migration·production 변경은 없다.
