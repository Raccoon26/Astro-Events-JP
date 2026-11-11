# D1·Worker 복구

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
