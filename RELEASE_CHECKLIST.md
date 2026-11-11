# DEV 완료 체크리스트

DEV01 추가 gate: Free플랜/계정전체여유, 두DB실ID·provider/내부marker, 원격migration·staging CRUD/TimeTravel·Worker rollback·Health/Cron·실CPU·조건부배포를 실제검증해야 **운영환경완료**다. 인증이 보류되면 local구현/테스트만 명시하여 merge할 수 있지만 DEV01 운영완료로 표시하지 않는다. 사용자 지시로 DEV02/03 로컬개발은 분리할 수 있지만 실운영 선행조건은 유지한다. production에는 테스트삭제/복구를 수행하지 않는다. 상세 현재상태는 PROJECT_STATUS 및 외부최종보고서가 기준이다.

- [ ] 원격/로컬·현재DEV·기존변경/보호 검토
- [ ] R01~R32·원요청0~24와 구현/후속조건 대조
- [ ] 변경파일·회귀·비밀/public-private 검토
- [ ] E preflight·cache/temp경로·전후DryRun보고
- [ ] test/type/lint/format/build/schema/security/requirements 통과
- [ ] 문서·PROJECT_STATUS 완료/미완료/버그/사용자조치 갱신
- [ ] DEV commit/push·main PR·최신head CI/승인/충돌/보호 확인
- [ ] 안전병합/AutoMerge 또는 차단PR유지·증거
- [ ] merge SHA·main최신·작업트리 확인·최종보고
- [ ] 다음DEV 자동진입 없음

매 DEV 실행 양식이다. 실제 DEV00 결과는 PROJECT_STATUS와 PR/CI를 기준으로 한다.

DEV02 gate: 원본0001/0002보존, Seed검증/현별커버리지/공식성-수집승인분리, 로컬D1 Import/DryRun/반복0쓰기/rollback/환경격리, 기존48회귀, 전체check 및 최신head CI/안전병합을확인한다. 47코드지원과47현공식출처확보 및active개수는별도보고한다. 未確認계정은Verified에포함하지않는다.
