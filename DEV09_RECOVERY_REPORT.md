# DEV-09 장애 복구

`ops_jobs`는 UTC 슬롯과 단계마다 한 행만 만든다. CAS가 소유자·lease·generation과 예산 epoch를 한 배치로 기록한다. 각 호출은 예약, 만료 lease 한 건 복구, 또는 단계 한 건을 처리한다. 30초 lease를 넘은 완료 응답은 cursor를 전진시키지 않는다. 일시 오류는 1분 이후 최대 세 번 시도하며 공급자의 더 긴 Retry-After를 존중한다. 커서 형식을 잃으면 텅 빈 커서에서 재시작하고 기존 모듈의 unique/CAS로 중복 결과를 차단한다.

- 수집기 승인·robots·도메인·429 규칙은 기존 수집 ledger를 사용한다. workerd 기본 전송은 fail-closed이고 DEV-09 실행기는 합성 전송기만 주입할 수 있다.
- 현재 검증 결정·후보 지문·source 승인·행사 revision으로 새 게시 의도와 기존 생성 글을 연결한다. 오래된 의도는 보류하고 층별 멱등 메커니즘으로 중복 저장을 차단한다.
- 중단된 Telegram/Reports/주말 전송 및 callback/update는 기존 확인 장부를 재사용한다. 공급자 호출 이후 응답이 없으면 uncertain으로 남긴다. 자동 발송 기능은 설치하지 않는다.
- 지역·종류·VTuber cursor는 독립적이다. 결과 원장은 지역별 조사 시도와 실패·완료를 측정한다. 일일 보고는 47현 중 조사 근거가 없는 곳을 unknown으로 남긴다. 156시간은 DEV-08의 410회 합성 시뮬레이션 최장 선택 간격이다.
- API 오류 본문·토큰·원시 이벤트를 운영 보고에 넣지 않는다. 중요 장애와 미확정 전달을 두 전달 형태의 동일 보고 키로 미리 본다. Observability 수집이 끊겨도 D1 장부로 복구한다.

로컬 도구는 `node scripts/build-operations.mjs` 후 `node scripts/operations.mjs tick --apply-fixture` 및 독립 `step --apply-fixture`를 지원한다. `report`는 초기화된 격리 D1에서 전일 자료를 읽는다. 프로젝트 원격 Worker의 진입점은 기존 Health 및 Cron 진단을 실행한다.
