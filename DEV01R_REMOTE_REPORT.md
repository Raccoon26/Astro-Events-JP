# DEV-01R 원격 검증 결과

검증일 2026-11-13 JST. **staging·production 원격 기반 검증 완료**. 최종 문서 PR도 필수 CI·보호·안전 병합 게이트를 적용한다. DEV04는 시작하지 않는다.

## 실제 자원과 데이터

| 환경       | Worker                     | D1 ID                                | 데이터 상태                                    |
| ---------- | -------------------------- | ------------------------------------ | ---------------------------------------------- |
| staging    | astro-events-jp-staging    | 14a756a0-4721-482a-9021-47d237be6f02 | 스키마·환경 표식만 유지, 시험 변경 원복        |
| production | astro-events-jp-production | 497d64ba-c18f-404b-b1b5-1dd13676ed39 | 스키마·환경 표식만, Seed/행사/시험 데이터 없음 |

두 D1에 원본 0001~0004를 적용했다. 기존 마이그레이션은 수정하지 않았다. provider ID/이름·deployment_identity schema2·테이블/인덱스·quick_check·foreign_key_check를 검증했다. 두 DB 저장량은 각각389,120바이트, 합계778,240바이트였다. 기존 다른 Worker1개의 수정 시각·코드 지문과 기존 도메인/라우팅을 보존했다.

Wrangler 공식 OAuth를 사용했고 로그인된 Workers plans에서 Free/Current plan/$0를 직접 확인했다. 이후 GitHub 환경별 토큰으로 subscription/계정전체 사용량/실제 DB 표식을 재검증했다. OAuth와 Actions 토큰을 구분하며 값은 저장소·보고서·콘솔에 출력하지 않았다. OAuth 파일·개발 도구 상태는 E 전용 경로다. 새 연결 도구의 API 인증 재시도 안내는 성공으로 계산하지 않고 기존 검증된 인증을 유지했다.

## 원격 시험 증거

| 시험                            | 실제 결과 / 증거                                                                                                                                                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| staging/production Actions 인증 | [staging](https://github.com/Raccoon26/Astro-Events-JP/actions/runs/43427676041), [production 읽기 전용 승인·검증](https://github.com/Raccoon26/Astro-Events-JP/actions/runs/43234263283) 성공                                                                                                |
| staging CI 자동 배포            | [최신 검증 코드 배포](https://github.com/Raccoon26/Astro-Events-JP/actions/runs/43432272640) 성공                                                                                                                                                                                             |
| staging 통합 진단               | [최종 diagnose](https://github.com/Raccoon26/Astro-Events-JP/actions/runs/43432477953) 성공                                                                                                                                                                                                   |
| HTTP/DB 오류와 복구             | 실제 staging 표식 불일치로503/DB_IDENTITY, owner/CAS finally 원복 후200/OK. DB 제약·schema2 유지                                                                                                                                                                                              |
| D1 CRUD/복구                    | staging 합성 insert/update/select/cleanup, 실제 Bookmark/Time Travel restore·실패DDL 감지·migration ledger 보존·합성행 부재·FK/무결성 확인. 상세 E reports/dev01r-staging-recovery-*.json                                                                                                     |
| Cron 실제 실행                  | Cloudflare eventType=cron의 UTC00/03/06/09/12시 버킷5회 success/errors0. JST09/12/15/18/21시. 설정만 또는 로컬 모의 실행이 아님                                                                                                                                                               |
| Worker 롤백                     | benchmark581398b2-ac0d-4c25-b0b7-1f886ba504a8 → 정상d6e46522-d6d1-4033-b4cf-c8d1ffba1d07, 정확한version/100% traffic·Health200·benchmark 경로404 확인                                                                                                                                         |
| production 실제 배포            | [승인된 배포 실행](https://github.com/Raccoon26/Astro-Events-JP/actions/runs/43432927707), 사용자 GitHub 직접 승인 후 성공, Health200·DB연결·disabled flags·Cron0·시험데이터0 확인. 실제 version e524cb3c-8714-4a6c-a529-1819b3c7f4e4. 배포 대상 main8cfa441163c307b7efdf97e88e289dbb8528bb32 |

production에는 테스트행·삭제·DROP·Time Travel 복구 시험을 실행하지 않았다. production D1을 자동 초기화/Seed Import하는 배포 단계가 없다. D1 복구와 Worker 코드 롤백은 서로 독립이다. Free Time Travel은7일이며 무제한 백업이 아니다. [D1 공식 복구 문서](https://developers.cloudflare.com/d1/reference/time-travel/)

## 실제 CPU·메모리·D1 비용

공식 Cloudflare GraphQL workersInvocationsAdaptive의 실제 CPU quantile이다. live schema의 microseconds 단위를 확인하고1000으로 나눴다. 로컬 경과시간을 CPU로 바꾸지 않았다. staging은2026-11-13 13:20:51 UTC, production은13:28:06 UTC 조회의 작은 표본이며 per-format 또는 최대 CPU 보장이 아니다.

| 범위 / Worker version          | reported 호출 | CPU P50/P99(ms) | 메모리 P99(bytes) |
| ------------------------------ | ------------- | --------------- | ----------------- |
| 일반 Health/오류·복구 d6e46522 | 3             | 1.736 / 2.576   | 1,572,876         |
| 실제 Cron c774bf87             | 5             | 1.799 / 2.815   | 1,572,876         |
| 최초 합성 benchmark910454e2    | 14            | 2.256 / 8.490   | 3,002,626         |
| 최종 합성 benchmark581398b2    | 15            | 1.623 / 6.000   | 3,003,093         |
| production Health e524cb3c     | 1             | 2.444 / 2.444   | 1,572,876         |

위 그룹의 runtime errors/subrequests는0이었다. benchmark는 고정된 작은 합성 RSS/Atom/HTML/sitemap 각각3회와 fail-closed SSRF1회만 시험했다. 그룹 집계에는 Health 등이 포함되므로 표본 수와13개 지정 요청을 혼동하지 않는다. 파서 응답의 실제 D1 meta는 각 rows_read=1/rows_written=0이었다. 파서 시험에서 후보를 DB에 저장하거나 외부 웹사이트를 요청하지 않았다. HTML 이미지 권리는unknown이었다.

계정전체의 provider-reported 일일 집계는13:20:54 UTC에 Workers44요청, D1 reads15/writes1로 조회됐다. 분석 지연 때문에 이 값은 모든 직후 SQL 검증의 최종 합계가 아니다. 예를 들어 원격 quick_check/FK 검사 자체의 meta도 별도 E 증거에 기록한다. DEV01R 전날 집계 reads937/writes278은0001~0004 적용·인덱스·복구 시험을 포함한 당시 관측값이다. 프로젝트 CPU 집계와 계정전체 예산을 분리하고 새 배포/진단 전마다 현재 구독·모든 자원·당일 사용량을 재조회한다.

Workers Free의100,000요청/일·CPU10ms/HTTP 및Cron·128MB·subrequest50·Cron5개, D1 Free의계정10DB/단일500MB/계정5GB·500만읽기/10만쓰기 기준을 재확인했다. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

실제 수집은 비활성화되어 있으며 이 소형 표본으로256KiB HTML·전국 수집·대규모 운영의10ms 준수를 확정하지 않는다. 지표 불명/Free 여유 부족은 차단하고 유료 플랜으로 자동 전환하지 않는다. staging Cron1개, production0개만 사용하며 일일 정리는 DEV09에서 별도 검토한다.

## 보안과 제품 경계

모든 Worker에서 COLLECTION_ENABLED=false·NOTIFICATIONS_ENABLED=false를 강제한다. 실제 행사 수집·Telegram·Reports 발행·자동 삭제를 시작하지 않는다. Source96/공식성77/47현47/시설92/VTuber4/active0을 보존했다. 네 VTuber 중 猫谷ここな의 공식 교차링크 미확인도 유지한다. DEV04~10의 날짜/요금/예약·권리·일본어 글/해시태그·Telegram/Private Issues/이메일·변경/중복·전국 공정성·정리·운영 검증 요구사항을 삭제하지 않았다.

Workers fetch의 실제 peer/TLS IP 고정 보장은 여전히 미검증이다. TCP Socket.opened.remoteAddress는 nullable이고 fetch peer 증명이 아니다. resolveOverride도 임의 일본 공식 호스트의 일반 해법으로 취급하지 않는다. [TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/), [Request/resolveOverride](https://developers.cloudflare.com/workers/runtime-apis/request/). 이번 실제 런타임에서 unavailableTransport의dns-protection-unavailable·외부요청0을 확인했으며 이 결과를 네트워크 pinning 성공으로 부르지 않는다. 유료 프록시·API·서버를 추가하지 않았다.

API 토큰의 provider 자원 범위는 계정 단위여서 도구의 고정 프로젝트명/D1 ID·환경 표식·clean main/CI 검사도 유지한다. 공개 Health는 허용한 최소 필드만 반환하며 상세 SQL/ID/인증값은 내보내지 않는다. GitHub production 필수 리뷰와 main 보호를 유지했고 승인 API를 대신 호출하지 않았다. 노출된 이전 토큰의 폐기·교체는 사용자 확인 사항이며 폐기 자체를 독립 API 검증했다고 주장하지 않는다. Reports 저장소 Private/Issues 활성 상태도 재확인했다.

## 회귀·경로·GitHub 완료

기존178개 검증 목적과0001~0004를 보존하고 총206개/18파일을 통과시켰다. generated types·TypeScript·Biome·두 환경 bundle/collector build·D1 로컬 통합/마이그레이션·Seed96/77/47·요구사항 감사·secret scan·npm audit0도 통과했다. 변경은 [PR5](https://github.com/Raccoon26/Astro-Events-JP/pull/5)·[PR6](https://github.com/Raccoon26/Astro-Events-JP/pull/6)·[PR7](https://github.com/Raccoon26/Astro-Events-JP/pull/7)·[PR8](https://github.com/Raccoon26/Astro-Events-JP/pull/8)의 최신 HEAD 필수 CI 후 안전 병합했다. 최종 문서 PR의 CI/병합/main SHA는 E reports/github-completion-*.json 및 최종 보고서에서 확인한다.

실제 Windows E드라이브·정확한repo·cache/temp/log/auth 경로와 전후 cleanup DryRun을 검증한다. 지정 C:/Astro-Events-JP 및 D:/Astro-Events-JP 후보는 존재하지 않았고 삭제0건이다. C/D 전체 탐색이나 시스템/다른 프로젝트 삭제는 하지 않았다. 물리적 외장하드 분리 시험은 수행하지 않았으며 missing-path 회귀로 안전 중단을 검사했다. 플랫폼/OS 자체 관리 파일까지 E 전용이라고 보장하지 않는다.

초기 run43234942275(즉시 Health 확인), run43429666817(잘못된 fault injection), run43431019676(즉시 rollback GET)은 실패 이력으로 보존한다. 각각 bounded Health 확인, 원본 schema 제약을 지킨 CAS 표식 시험, mutation을 반복하지 않는 bounded GET으로 수정하고 실제 최종 diagnose 성공을 확인했다. 실패를 skipped/성공으로 바꾸거나 테스트·보호를 제거하지 않았다.
