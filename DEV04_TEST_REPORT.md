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
