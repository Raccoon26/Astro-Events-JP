# DEV05 게시글 생성 설계

DEV04의 현재 `VerificationStore.capture(eventId)` → 순수 `renderPost` → 현재 게이트 재확인 → `PostDelivery` 순서다. capture는 기존 verified와 동일한 검증을 사용하며 결정 ID·Event revision·SQL CAS snapshot을 함께 반환한다. 재조회로 확인 시각/만료를 연장하지 않는다. `JapanesePostGenerator`는 기존 generate(event,kind)/validateLength(text) 계약을 보존하지만 전달된 객체를 신뢰하지 않고 DB의 현재 객체와 사실 projection을 비교한다.

순수 커널은 합성 단위시험/고정 프로파일 전용이다. `Verified` 문자열이나 사용자가 만든 객체만으로 실제 출력/저장을 승인하지 않는다. 후보/fingerprint·현재 문서·공식 Source 승인·규칙·만료·시설/공지·VTuber 관계·Event 실제 열을 DEV04에서 재검사한다. preview/get은 출력 직전 이를 다시 확인한다. 저장도 직전 재검사와 DB CAS, 저장 후 재검사를 거친다. 이 경로는 현재 **로컬 staging 관리 도구에만** 제공하며 배포 Health/Cron 진입점은 import하지 않는다.

## 데이터와 원자성

기존 generated_posts와 `(event_id,revision,kind,template_version)` UNIQUE를 재사용한다. 신규0006은 결정 FK·input/content SHA256·길이정책 버전·valid_until·생략 사유 JSON을 추가한다. 기존 행은 NULL 메타데이터로 남지만 현행 출력 게이트를 통과하지 못한다. ID와 변형은 event/revision/kind/templateVersion으로 결정한다. templateVersion 두 등록값 ja-v1/ja-v1.1은 같은 검증 정책 아래 별도 재생성 네임스페이스이며 임의 버전 문자열은 거부한다.

한 개 조건부 INSERT를 D1.batch로 원자적으로 수행한다. 현재 후보/출처/근거/시설/VTuber/환경 snapshot과 결정 만료를 WHERE에서 비교한다. SQL bind만 사용한다. 경쟁 실행은 UNIQUE/ON CONFLICT로 한 행만 남고 승자의 전체 내용과 digest를 다시 검증한다. 같은 입력의 재실행은 읽기만 하며 기존 글을 덮어쓰지 않는다. 변조된 행·CAS 충돌·DB 오류는 성공으로 처리하지 않는다. 쓰기 후 새로운 변경이 있으면 행이 남아도 출력 게이트가 이를 차단한다.

## 출력 계약

`PostDelivery.copyText`에는 일본어 완성 글만 있다. metadata는 source/event ID·revision·결정/fingerprint·확인/만료·공식 URL·각 필드 판정·weightedLength/remaining·templateVersion·생략 이유·이미지 URL/권리/출처/크레딧·시설 영향을 별도로 제공한다. 이미지 권리는 DEV04 값을 그대로 전달하며 본문에서 재업로드를 권장하지 않는다. DEV06은 전송 직전에도 get/preview 게이트를 사용해야 한다. 현재 추천은 해당 조회 시점의 유효성이고 미래 전송 보증이 아니다.

목록은 최대50행의 ID/revision **힌트**이며 현재 Verified 보증이 아니다. 실제 한 행을 preview해 확인한다. 이력도 최대50행/커서의 감사 메타데이터만 반환하고 낡은 본문은 반환하지 않는다. 목록 전체를 N+1 검증하거나 전국 데이터를 Worker 한 실행에서 생성하지 않는다. 검증·생성·저장은 독립 실행 단위로 운영해야 하며 로컬 관리 명령의 쿼리 비용을 Worker10ms 보장으로 간주하지 않는다.

## 로컬 관리

E 환경 적용 후 `npm run posts:init`는0006 Dry Run이다. 명시적으로 `-- --apply --enable-posts --local-budget`을 주면 기존0005 registry ledger·staging identity 확인 뒤 단일 batch로 적용/ledger 기록한다. 재실행은 변경0이다. `posts:list -- --cursor ID --limit 25`, `posts:preview -- --event ID --kind observation`, `posts:get -- --post ID`, `posts:history -- --event ID`를 제공한다.

preview 저장은 `--apply --enable-posts --local-budget --source SOURCE --fingerprint SHA --revision N`이 모두 필요하다. 현재 source/fingerprint/revision과 맞지 않으면 거부한다. 원격/production 옵션은 지원하지 않는다. 오류는 안전한 코드만 출력한다. 공식 사이트 요청, X 게시, Telegram/Issues/메일 발행은0이다. E reports/dev05-posts-*.json에 미리보기와 D1 메타를 기록한다.

0001~0005를 수정하지 않고 LF SHA를 검사한다.0006은 로컬/격리에만 적용한다. 원격 두DB는0004이며 schema view가 없어 fail-closed다. 기존 Health/Cron은 영향을 받지 않는다. down migration으로 데이터를 지우지 않고 기능OFF·코드 rollback을 기본으로 한다. 원격 적용은 후속 별도 승인·Bookmark·호환성 검토 대상이다.

DEV05 자기검토에서 발견한 요금 범위 버그 수정으로 현행 VerificationStore 규칙은 dev04-3이다. 기존 dev04-2 판정은 게이트에서 재검증을 요구하며 새 Source 승인이나 원격데이터 변경을 만들지 않는다. 실제Source/행사0 상태를 유지한다.

추가회귀: 공식 근거가 종료일미정/계속휴관임을 명시하면 시작일이 지났어도 검증만료까지 공지를 생성할 수 있다. 날짜 하나만 있는 종료된 단일휴관을 무기한 연장하지 않는다. CPU 진단은 src/posts/remote-benchmark.ts의 별도 고정 생성 진입점을 써 Collector/Validator 초기화를 분리하며 기존4파서/검증 진단은 본래 진입점을 보존한다.

posts:init는최종적으로0006/0007의미적용파일만미리보고명시적apply에서단일batch로적용한다. Verified목록은0007부분인덱스, 이력은0007 event/post인덱스를명시하므로다수Review행/다른Event이력전체를스캔하지않는다. 인덱스없는구환경의해당목록은fail-closed다.

## DEV05R 최적화의 계약

preparePost는 모든 실제 입력의 사실/길이를 재검사하고, renderPost의 요청별 SHA ID와 기존 JSON property 순서를 보존한다. startup은 고정 합성1건의 순수 준비만 수행하며 WebCrypto/DB/외부 I/O·실제 사실 캐시를 만들지 않는다. 저장은 fresh snapshot proof를 매번 만들되 한 작업 내 동일 proof/body digest만 재사용한다. 현재 gate/만료/문서/시설/VTuber/revision/CAS는 생략하지 않는다. 원격 성능의 범위는 DEV05R_COMPLETION.md와 DEV05R_CPU_REPORT.md를 따른다.
