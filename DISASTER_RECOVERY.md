> DEV-01R 2026-11-13 진행: PR5/main c92995d 이후 staging Worker·별도 D1·3시간 진단 Cron과 실제 Health HTTP200을 확인했다. API 기반 Actions 인증은 staging/production 모두 성공했다. 초기 staging 배포 run43234942275는 Health 확인 실패로 종료되어 배포 성공으로 계산하지 않는다. 전파 지연만 bounded 재확인하며 DB/환경 오류는 즉시 실패한다. Cloudflare GraphQL 실제 CPU: fetch 4.004ms, cron P50 1.799ms/P99 2.815ms(6 reported invocations, errors0). 파서 원격 측정·staging rollback·production 배포는 아직 진행 중이다. 모든 Collection/Notifications=false, active0/96정보원/92시설/47현을 유지한다.

# D1·Worker 복구

> DEV-01R 현재 상태(2026-11-12 JST): 공식 OAuth/Free 화면 확인, 원격 D1 두 개·0001~0004 적용·staging CRUD/Time Travel 복구를 실제 검증했다. Worker 배포·Cron 실행·CPU·Actions 인증/production 승인은 이 스냅샷에서 아직 검증 중이다. 아래 과거 DEV01~03의 보류 기록은 당시 이력이며 현재 결과는 DEV-01R 절과 PROJECT_STATUS를 따른다.

DEV00의 0001_foundation.sql은 수정하지 않았다. 정규화된 LF 내용의 SHA256을 검사하며 CRLF checkout 차이는 허용한다. DEV01은 0002_deployment_identity.sql만 추가했다. 적용 전 migrations list와 schema/index inventory·quick_check·foreign_key_check를 확인하고, 원격은 현재 Time Travel bookmark를 E reports에 저장한다. additive DDL만 guard에서 허용하며 향후 ALTER/DROP/데이터수정 마이그레이션은 별도 검토·명시적 승인·호환성 계획이 필요하다.

[D1 공식 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)은 Workers Free에서 과거7일까지 복구하며 무제한이 아니다. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)는 DB당10분내10회 복구 한도를 명시한다. Time Travel은 SQL down migration이나 다른 DB로의 자동복제와 다르다. Worker rollback도 DB schema를 되돌리지 않는다. R2·Workflows·유료보관 서비스를 추가하지 않는다.

## staging 전용 원격 검증 (현재 차단)

1. 계정 Free/사용량·대상명/ID·내부 marker가 staging인지 검증한다. 테스트용 staging에 동시 변경을 중지한다.
2. migrate/initialize/inspect 후 `node scripts/cloudflare.mjs bookmark staging`으로 **schema2와 marker가 있는 시점**을 기록한다. 확인된 bookmark를 복구 대상과 함께 보존한다.
3. `staging-probe staging`은 매번 UUID를 사용해 합성후보 하나만 삽입·조회·finally에서 같은키만 삭제한다. production은 해당 명령을 거부한다.
4. 별도로 승인된 staging 복구시험에서 marker를 포함한 bookmark 이후 합성변경을 만든 뒤 `node scripts/cloudflare.mjs restore staging <정확한-bookmark>`로 되돌린다. guard가 production을 차단한다. 복구 전/후 bookmark·schema·합성변경 부재·quick_check/FK·Health를 대조한다. 실제 원격시험 결과를 남기기 전 완료로 표시하지 않는다.
5. 실패한 migration의 적용목록을 다시 읽는다. 0002 이전으로 돌아간 경우 schema2 Worker가 503을 반환하는 것은 정상적인 fail closed다. 원인을 확인하고 승인된 additive migration/marker 초기화로 복구한다. 실패 원인을 무시하고 migration 파일을 편집하거나 이미 적용됐다고 표시하지 않는다.

## Worker 복구

배포 전 환경별 알려진 정상 version ID와 설정/binding 호환성을 기록한다. staging에서 `node scripts/cloudflare.mjs rollback staging <version-id>`로 정확한 이전 버전만 지정한다. Health·Cron·DB marker/무결성을 재검증한다. production 자동 rollback은 제공하지 않는다. production 장애는 사용자 승인 아래 공식 Wrangler rollback과 호환성 검토를 별도 수행하며 DB 복구를 동반한다고 가정하지 않는다.

현재 로컬 시험은 sql.js 전체 schema snapshot→잘못된 DDL 실패 감지→합성변경→snapshot 복구→무결성·FK 확인, 실제 workerd/D1 환경혼동→503→설정복구→200을 검증했다. 이 결과는 **원격 Time Travel 또는 이전 Cloudflare 배포 rollback 시험을 대신하지 않는다**. 운영 데이터 backup을 Public Git/Actions artifact에 올리지 않는다.

## DEV-01R 원격 기반

2026-11-12 실제 staging DB에서 Bookmark를 취득하고 합성 Discovery 행 insert/update/read, 의도한 실패 DDL 감지, migration ledger 불변, Time Travel restore 후 합성행 부재·marker·quick_check/FK를 검증했다. 결과는 E reports/dev01r-staging-recovery-*.json이다. production은 구조/무결성만 검사하며 테스트행·restore·삭제를 실행하지 않았다. 원격 Worker rollback은 staging 배포 후 별도 검증 대상이다.

새 staging-recovery.mjs --apply는 production 인자를 거부하며 provider ID/이름/내부 marker·Free 근거를 먼저 검사한다. 부분 실패 시 Bookmark와 phase를 먼저 저장하고 DB를 자동 삭제하거나 무제한 재시도하지 않는다. failed DDL은 별도의 고정 구문오류 시험이며 기존 migration 파일을 변조하지 않는다.

## DEV-01R 진단 수정 (2026-11-13)

실제 staging 자동배포 run43429571095는 성공했다. 후속 diagnose run43429666817은 기존 schema_version=2 CHECK 제약 때문에 실패했고 성공으로 계산하지 않는다. 원본0002를 수정하지 않고 staging DB의 environment/database_name을 함께 임시 불일치로 바꿔 Health503을 확인한다. initialized_at의 고유 owner와 compare-and-set 조건으로 이 시험의 변경만 finally에서 원복하며 전체 원래 marker를 대조한다. production DB에는 접근하지 않는다. 실제 원본0002를 로드한 SQLite 회귀3개가 CHECK 유지·HTTP 실패 후 복구·production 거부·동시 관리자 변경 보존을 검증한다. 전체203개 check/최신 PR CI 후 diagnose를 재실행한다. production 활성화/배포는 자동 승인 검토가 staging 진단 진행 및 구체적인 배포 승인 미확인으로 거절했으므로 보류 상태다.
