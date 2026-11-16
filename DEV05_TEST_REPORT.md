# DEV05 검사와 구현 범위 — 2026-11-16 JST

기준 main24b8880936a76167ad286f592620c51cdbd5e0ef / PR17 merged를 확인하고 dev/dev-05-japanese-posts에서 작업했다. 기존350개/25파일의 목적과0001~0005를 보존한다. 최초 전체기준 시험은349통과/CLI cold-start5초초과1실패였고 해당 파일 단독8개는 통과했다. CLI는 위험 옵션을 무거운 esbuild/Miniflare import 전에 거부하도록 수정했으며 실패를 삭제/skip하지 않았다.

13종 일본어·정밀도/신청역할/조건·위조/만료·공식가중conformance·Unicode/emoji·안전 단축·멱등/버전·현재Verified게이트·쓰기CAS/동시실행·DB실패rollback/재개·현재출력 차단·schema4/5/OFF·로컬CLI/production거부를 추가한다. 원어민 실사용자 검수는 미실시이며 개발자 자기 검토와 자동 검사는 구별한다. [전13종샘플](POST_SAMPLES.md), [길이검사](X_WEIGHTED_LENGTH.md), [설계](POST_GENERATOR_DESIGN.md)를 참조한다.

로컬 nativeD1에서 preview0쓰기·저장·현재get·재실행0쓰기·단일경쟁행·원자적rollback/재시작을 검사한다. 생성한 오래된 행이 남더라도 Source/승인/후보/문서/규칙/만료/시설/VTuber/실제Event가 달라지면 게이트가 거부한다. 감사 이력에는 복사 본문을 제공하지 않는다. 실제 workerd에서 전13종/공식길이 파서를 외부fetch 차단 상태로 시험한다.

로컬 소표본 저장은33 API calls/statements·95행읽기·3행쓰기였다. 반복저장은0쓰기다. 고정 합성2,000건은25건 단위의 **순수 생성만** 측정했으며 초기 elapsed 약0.88초/heap변화 약6.9MB였다. 최신 재실행 값은 E reports/dev05-d1-measurement.json, dev05-local-render-benchmark.json이 기준이다. 이 수치는 Cloudflare CPU·원격DB·전국 처리량이 아니다. 전체 검증/저장은 여러 실행 단위로 분리해야 하며 실제 계정 사용량 불명은 쓰기를 차단한다.

0006은 로컬/격리만 적용한다. 원격 staging/production은0004 유지, 수집/알림OFF·active0·실제사이트/공식검증행사0·productionCron0·Workers peer/TLS fail-closed를 유지한다. Source96/공식성77/47현/시설92/VTuber4와 猫谷ここな Review Required는 변경하지 않는다. Telegram/X/Reports 발행·이미지 파일 요청은0이다.

원격 순수 생성 프로파일은 기존 main+quality·Free/계정예산·staging-only 진단/정확한 rollback 정책 아래 고정 fixture3회만 허용한다. 0004/Health SELECT만 사용하고0005/0006 원격DDL/검증데이터 쓰기·production변경은 없다. 아직 실행하지 않은 CPU/배포는 성공으로 기록하지 않으며 실제 실행 후 별도 증거를 보완한다. DEV04의 P998.608ms는 DEV05 또는 전체파이프라인 성능 보장이 아니다.

최종 전체 check/시험총수·CI/PR/commit/main·E전후정리는 완료 기록에 추가한다. R01~32/DEV05요청0~21은 dev05-coverage.json으로 연결하고 DEV06~10을 완료로 표시하지 않는다. 실제수집승인/Workers안전전송/원격새스키마/실Telegram·메일/실사용언어평가는 후속 단계의 남은 조건이다.

## 자기 검토에서 발견한 기존 오류와 회귀 보강

DEV04 요금 파서의 유료+0엔 등급 순서에 따른 전체무료 오분류를 수정했다. 명시적인 전체무료 주장과 등급별0엔을 분리하고, 상품가격/분류불명 금액은 참가비로 추정하지 않는다. 콜론으로 구분된 명시적 요금범위도 보존한다. 새 검증규칙은 dev04-3이며 이전 dev04-2 결정은 재검증 전 현재출력에서 제외한다. 기존350개 목적은 유지하고24시험파일/모든fixture는 원본그대로다. 나머지1파일은 근거의 규칙버전 기대 문자열 한 곳만2→3으로 바꿨으며 audit-dev05가 이 정확한 치환을 되돌린 원본 SHA를 대조한다. 단언/시험 삭제나 skip은 없다.

추가된2,001개 Event ID 힌트 커서는41페이지/최대50행이며 enum-only 힌트의 실제출력을 별도로 거부한다. 이는2,001개 실제Verified행사 저장시험이 아니다. 원격전체저장 CPU/DB 대규모검증은 미시험이다. 초기 PR 전 전체check는505개/30파일·빌드·보안취약점0·요구감사·로컬D1에 통과했으며 이후 추가된 안전/요금 회귀를 최종 complete:dev에서 다시 검사한다. 샌드박스의 최초 npm audit 네트워크 오류는 실패로 남기고 허용된 네트워크 실행으로 전체검사를 재실행해 성공했다. 최초 커서 크기시험의 미지원 PRAGMA도 실제 D1 meta.size_after로 수정/재시험했다.

## PR 전 검증 상태

최종 사전 전체check는511개/30파일·타입/Biome·두Worker/collector/verifier/posts build·공식fixture·Secret/의존성취약점0·요구감사·로컬D1에 통과했다. 이후 설정불변/입관·입장범위/제목주장 게이트 시험을 추가했고 최신관련122개가 통과했다. complete:dev는 최신전체를 다시 검사한 후에만 commit/PR을 만든다. E로컬registry의0006적용·재실행변경0·쓰기0·ID목록0을 실제명령으로 확인했고 원격DB변경은없다. 전후DryRun의지정C/D후보는없음/삭제0이며물리분리·C/D전체무잔여는미검증이다.

## DEV05 실제 첫 CPU 표본과 보완

main ff79092d6620adb5a630921b556fe60842b5fdcc / Actions43872693538에서 고정합성212가중자 생성3회·외부요청0·D1각읽기1/쓰기0·정확한원본버전복구가 성공했다. 임시버전1f04e554-ea31-4f67-8336-f7864150300f의 공식GraphQL은 Health등을포함한5요청, errors/subrequests0, CPU P50=3.041ms/P99=19.583ms, memoryP99=5462999B였다. 이는 10ms 기준 충족으로 계산하지 않는다. 보고된 계정사용량은 요청6/D1읽기5·쓰기0/저장778240B/Cron1이며 지연집계다.

종료일미정 장기휴관의 잘못된 만료차단을 보완하고 단일휴관일 만료와 구별했다. 이어서 동일본문의 가중길이 재계산을 없애고, 생성 전용 임시 Worker를 수집/검증 진단과 분리했다. Workers ES2022의 native built-in이 대신하는 twitter-text3.1.0의 정확한23개 ES5 polyfill import만 alias하며 알고리즘/규칙/검증을 생략하지 않는다. 기본기능이 없으면 안전하게 실패한다. 공식원본44가중/방향사례를 최적화된 실제workerd에서 그대로 대조한다. [공식alias설명](https://developers.cloudflare.com/workers/wrangler/configuration/#module-aliasing). 번들축소나 로컬elapsed를 원격CPU성공으로 바꾸지 않고 새main/필수CI/Free예산/원본버전복구로 재측정한다.

## 추가 CPU 관측과 읽기 비용 보강

main53dcd7a12bd8e54e60e5f271039614db13f713ce의 전용/minified/native 진단43875528015는 고정합성210가중자3회와 정확한rollback에 성공했다. 임시버전f11f9bd7-336e-4c5b-8b8a-99cc92c4453b의 공식집계4요청은 P50=2.614ms/P99=20.720ms, memoryP99=3236140B·오류/subrequests0이었다. 첫 표본과 입력변형/포함Health수가 달라 엄밀한 동일조건 성능비교가 아니며10ms충족으로 표시하지 않는다.

이에 emoji가 존재할 수 없는 ASCII/일본어의 제한된 범위만 공식 parseTweet의 동일가중·URL 경로에서 emoji탐색을 생략한다. emoji 가능문자/결합문자/VS/보충평면은 그대로 full공식경로다. 전체허용범위와 원본emoji-enabled 결과를 대조하고 공식v3 fixture/실제workerd에서도 동등성을 확인한다. 8KiB를 넘는 공식과대fixture는 원본알고리즘의 기대값을 계속 검사하면서 프로젝트wrapper의 안전한 거부도 별도로 검사한다. 입력상한이나길이규칙을낮추지않는다. 새main/CI후실제CPU를재측정한다.

검토대기행이 많아도 제한된목록조회가 전체테이블을읽지 않도록0007_post_read_indexes.sql에 Verified부분covering index와(event_id,post_id)이력인덱스를추가했다.0001~0006은변경하지않는다. INDEXED BY로필수인덱스가없으면전체스캔대신fail-closed다. 격리D1의5,000 Review행+1Verified힌트에서2행읽기/0쓰기, 저장33문장/95읽기/4쓰기·반복0쓰기를관측했다. 인덱스추가의쓰기비용도포함한다.0007은E로컬/격리에만적용하며원격은계속0004다.

## 세 번째 실제 표본과 초기화 예산 분리

main714d01bafca05166b67a65fad2268fe410a402ed / 진단43879903909에서 고정210가중자3회/외부요청0/각D1읽기1·쓰기0 및 정확한이전버전복구에성공했다. 임시버전a9cb8d74-17c8-4393-8a2b-bf7a204ee1ab의공식집계는Health등포함5요청/P50=5.293ms/P99=23.064ms·오류/subrequests0이다. 이역시10ms충족으로계산하지않는다. Cloudflare는드문초과에buffer를두지만반복초과는1102로중단할수있으므로성공응답만으로CPU보장을하지않는다.

공식Workers한도는전역초기화1초와요청CPU10ms를구분한다. 이를명시적으로활용해고정31가중자의합성문자열로순수공식파서를전역초기화한다. 네트워크/DB/행사근거/실제검증을초기화로옮기지않으며요청마다모든실제본문을별도검사한다. Wrangler의공식startup시간을안전하게숫자로추출해요청CPU와함께기록하고새main/CI/staging/rollback에서확인한다. 초기화/요청수치가실제로없으면성공으로표시하지않는다. [공식startup한도](https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time).
