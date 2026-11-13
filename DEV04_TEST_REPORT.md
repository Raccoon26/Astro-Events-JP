# DEV04 검증·감사 보고

기준 main07abbf8268ec0b8514baf01cf3309ffb1f98da00 / PR9 병합을 확인하고 dev/dev-04-verifier에서 작업했다. 기존206개 목적과 migration0001~0004를 보존한다. 최신 전체 check/CI/병합 결과·SHA는 최종 E reports/github-completion 및 완료 보고서가 기준이다.

## 로컬 증거

날짜/시간·개장/시작·신청역할·요일·연도·기간·자정, 요금범위/복수요금·예약/선착/추첨/접수, 공식 관계·근거 충돌/위조·현재 문서/후보 버전·seal·VTuber·권리 판단을 검사한다. JAXA/NAOJ/NIPR/JAMSTEC·대학·지방시설·과학관·도서관/공민관·동호회·VTuber 사례는 모두 합성이며 실제 공식 검증 건수가 아니다.

Native local D1는0001~0005·FK·CAS·경쟁/중복·부분 쓰기 실패 rollback/재개·환경 변경·소스/원문 변경·이미지·시설 공지 이력/미래 상태/휴관 영향·커서를 검사한다. 실제 workerd에 고정 합성 검증을 실행하며 외부 fetch는 차단한다. 원격 Cloudflare 시험과 구분한다. CLI 거부 시험은 --remote/production/불명 옵션/적용 요건 부족을 차단한다. 부분 실행용 -t 시험의 skipped는 최종 전체 성공 수에 포함하지 않는다.

2,001개 합성 후보를 최대50행/41페이지로 순차 처리했다. 로컬 D1의 마지막 빈 조회 포함42 statements/2,002읽기/0쓰기, DB크기425,984→3,391,488바이트를 관측했다. 이 읽기 값은 후보 커서 조회의 비용이며 전체 검증/commit 비용은 별도다. insert/index 쓰기 및 최신 elapsed는 E reports/dev04-local-benchmark.json에 기록한다. elapsed는 Cloudflare CPU가 아니다. 단일 commit의 메타 계측도 별도 기록한다.

## 실제 자료·원격 경계

기존 Seed96/공식성77/시설92/47현/VTuber4, active0/review85/unsupported9/paused2를 유지한다. 실제 후보/검증 행사0, 공식 웹사이트 검증/재요청0. 猫谷ここな는 기존 Review Required다. Workers peer/TLS IP 검증 미완료로 fail-closed, 수집/알림false, productionCron0이다.

0005는 격리 및 E 로컬 staging에만 적용한다. 원격 두DB는0001~0004로 유지하며 production migration/fixture import/자동 검증은 하지 않는다. 기존 OAuth/환경별 Secret과 배포 보호는 유지한다. main index는 verifier를 import하지 않고 새 스키마가 없어도 Health/Cron은 동작한다. VerificationStore는 구스키마/OFF에서 출력 차단한다.

DEV01R 실측 CronCPU P992.815ms·소형 파서6.000ms·productionHealth2.444ms는 과거 소표본이다. DEV04 실제 CPU와 동일하지 않다. staging 고정 합성 verifier 진단은 안전한 별도 benchmark 버전/복구 절차로만 측정하며 실제 결과가 없으면 미측정으로 남긴다. 무료 한도/계정 예산을 검사하지 않은 원격 시험은 실행하지 않는다.

## 요구사항·안전

R01~R32 및 DEV04 요청0~20은 dev04-coverage.json으로 연결한다. DEV05 전13종 일본어 글/길이·DEV06 Telegram/PrivateIssues/이메일·DEV07 변경/중복·DEV08 전국균형/주말·DEV09 Cron/보관/복구·DEV10 통합은 그대로 남는다. 검증 기능 구현과 제품 운영 완료를 구분한다.

실제 E preflight/캐시/임시/빌드/로컬DB/보고서 경로와 전후 정리 Dry Run을 사용한다. C/D는 알려진 전용 후보만 검사하며 삭제0건, 전체 디스크 무잔여를 주장하지 않는다. 물리적 외장하드 분리는 미시험이며 기존 missing-path 안전중단 시험을 보존한다.

## 2026-11-14 JST 사전 완료 검사

기존206개 포함314개/23파일 전체 검사, typecheck/Biome/두환경+collector+verifier build, secret scan, npm audit 취약점0, 요구사항 감사, Wrangler local D1/FK/quick_check를 통과했다. npm 보안 서버 접속은 샌드박스 밖의 허용된 네트워크 실행에서 재검증했으며 검사 실패를 생략하지 않았다. 후속 profile-verifier의 production 거부 시험도 최신 complete:dev/CI에서 추가 검증한다.

로컬 합성 commit 표본은4 API calls/8 SQL statements/46행읽기/13행쓰기였다. 2,001후보 시험의 초기2,000행 insert/index 쓰기는8,000행, 커서 읽기는2,002행/쓰기0이었다. CPU가 아닌 로컬 elapsed 약13.75초이며 fixture 생성·삽입·검증을 포함한다. 최신값은 E 보고서 기준이다.

원격 CPU 진단은 mode=profile-verifier로 staging에만 허용한다. 기존 diagnose는4파서/SSRF 목적을 보존한다. verifier-only는 고정 합성3회와 Health SELECT만 수행하며 DB marker 오류 주입/DDL/Seed/실제Source 변경 없이 임시 benchmark를 finally rollback한다. main+필수CI+Free계정 예산을 먼저 검사한다. 실제 실행 결과는 확인 후 별도 기록한다.

## 최초 원격 실행과 배포 이력 회귀 수정

PR10(head20e392028a6afe761e1c55c5dd280964d5f255d6)이 필수CI 후 squash병합되어 main067e315bbc79eac2a77f407f4d05460d57821b4a와 로컬을 동기화했다. 최신315개/23파일 전체 check와 main CI run43450684341은 통과했다.

자동staging run43450938834는 업로드 후 Health200에 성공했으나 현재 배포 이력 조회에서 실패했다. 배포11개로 API의 total_pages=2가 되면서 전체 자원 목록용 pagination 검사가 이력에도 적용됐다. 따라서 workflow 전체는 실패로 보존하며 배포 성공으로 계산하지 않는다. version e5cf25a3-61d2-4b60-b09d-d13af18741bd/100%와 Health는 유지됐다. profile-verifier run43451095505도 같은 첫 조회에서 중단되어 합성 검증은 아직0회다. 원격DB/production은 변경하지 않았다.

수정은 현재 배포만 필요한 경로를 프로젝트 두Worker의 GET /deployments?page=1&per_page=1로 제한한다. 응답 page=1/per_page=1/배포1개를 확인하며 /workers/scripts·D1 등 전체 자원 인벤토리의 불완전 페이지 거부는 유지한다. 공식API는 첫 배포가 현재 traffic을 처리한다고 명시한다. [공식 목록 API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/). 원격 읽기1회에서 최신배포1개 반환을 확인했고6개 독립 회귀시험을 추가했다. 수정 후 전체검사/CI/자동배포/고정진단을 다시 실행한다.

2026-11-13 15:15UTC 원격 읽기 검증에서 staging/production 두DB0001~0004·source/event/candidate0·verification_schema없음, 별도DB binding, 수집/알림false·stagingCron1/production0을 확인했다. 기존OAuth는 공식Wrangler whoami로 자동갱신됐고 추가권한/로그인 요구가 없었다. Reports Private/Issues=true를 기존 GitHub 인증으로 확인했다(연결도구의 Private 조회404는 성공으로 간주하지 않음). 첫 배포 계정snapshot은 Free, 당일요청50/D1읽기564·쓰기9/저장778240B/Cron1이었다. provider 지연이 있는 계정전체 집계이며 DEV04 단독비용이 아니다.

## 최종 입력 감사 보강

PR11(head3715c2c350fb251e212f88256e1c2cdccc058c42)은321개/24파일 전체검사·필수CI 후 main144ca468522077b8d7bbfa3e2ae383e4aa8be869에 병합됐다. 후속 감사에서 입관료 문맥의 성인/어린이 요금이 참가비로 분류되는 경우와 지역명만 있고 장소는 미정인 경우를 확인해 보강했다. 소수/잘못된 쉼표/음수/근사·최소금액, 동일요금등급 충돌, 비정상/충돌 정원, 추첨 부정형도 보류한다. 별도8개 회귀를 추가했으며 임의로 지원 범위를 확대해 추정하지 않는다. 최종전체check/CI는 이 변경까지 포함한다.

## DEV03 체크포인트와 신선도 통합 회귀

최신main dcffdea74b2983ffd804a79e7831eb779277d6ab의 CI43453137984와 실제staging배포43453394876은 성공했다. 직전업로드단계실패43452628109는 실패이력으로 남기며 생략하지 않는다. 새권한/설정변경 없이 다음최신main실행에서 정상화됐다.

최종 통합감사에서 DEV03의 같은본문 pagination 체크포인트가 collection_documents.changed_at을 후속페이지시각으로 갱신하는 문제를 확인했다. 이 경우 첫페이지의 정상후보가 오래된문서로 잘못 보류될 수 있었다. 원본migration은 변경하지 않고 digest가 실제로 바뀔 때만 changed_at을 갱신하도록 SQL을 수정했다. 격리native D1에서 동일지문후속페이지는 기존Verified를 유지하고 실제본문변경후 미관측후보는 차단함을 검증했다. 기존206개 및 모든신규시험과 함께 전체check/CI를 재실행한다.
