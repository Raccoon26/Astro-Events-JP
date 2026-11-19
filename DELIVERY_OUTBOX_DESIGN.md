# 전달 Outbox와 원자성

0008은 기존 notification_deliveries/publication_records/generated_posts/event_images를 보존하며 로컬에서만 확장한다. 기존 0001~0007 checksum과 597개/39파일 테스트 원본은 audit-dev06이 검사한다. 원격 두 DB는 0004 상태를 유지하고 신기능은 schema gate로 차단한다. 운영 Worker에는 알림 모듈 import/route가 없다.

notification_groups는 현재 event/revision/post/decision/fingerprint/report version과 snapshot digest, 유효기간, origin/mode, 버튼 설정을 묶는다. notification_context는 각 부분의 payload/digest/target/index를 보관한다. `UNIQUE(post,report_version,mode)` 및 부분별 키가 같은 데이터 재실행을 멱등 처리한다. 원문 HTML/이미지 바이너리는 저장하지 않는다.

부분은 Telegram copy, 각각의 management, GitHub issue다. pending→sending→sent 또는 uncertain/failed로 전이한다. claim은 owner/30초 lease/시도 횟수 CAS다. 최대 3회이며 known rejection과 Retry-After가 있는 실패만 예정 시각 이후 재시도한다. 요청 결과를 모르는 timeout/5xx/disconnect는 uncertain이다. 전송 시작 전 durable checkpoint와 attempt를 기록한다. 외부 성공 후 D1 commit 실패는 성공으로 표시하지 않는다.

result_owner는 완료 CAS의 소유자를 증명해 잃어버린 lease의 부수 기록을 차단한다. Issue 연결과 잠금 해제도 해당 결과/owner에 종속된다. event 단위 Issue 잠금은 수정과 신규 revision 생성의 경합을 막으며 uncertain 원인 ID를 보존한다. Telegram 본문이 성공하면 관리 실패로 본문을 다시 보내지 않는다. GitHub 실패가 Telegram 성공 상태를 되돌리지 않는다.

전송 직전에 PostStore.current 및 바인딩된 SQL guard를 다시 확인하고 payload도 현재 렌더링과 대조한다. payload hash만 변경해 위조해도 통과하지 않는다. 성공 응답 이후 입력이 바뀌면 uncertain으로 기록해 남은 부분을 차단한다. 반대로 과거 외부 수신 사실의 재조정은 현재 Verified 승인을 뜻하지 않으며 재전송 없이 별도 기록만 정리할 수 있다.

simulation publication은 별도 mode/action provenance와 simulation 지문으로 표시한다. live mode를 실행하는 구현은 없다. 외부 provider를 흉내 내는 FakeNotificationWire는 주입된 신뢰 모듈이며 사용자 문자열 mode를 보안 sandbox로 간주하지 않는다. 로컬 CLI에는 고정 모의 대상과 provider만 존재하고 Secret/URL override/실제 발송 플래그를 지원하지 않는다.

프로젝트 일일 모의 요청 상한 512, 채널별 최소 1초 간격을 D1 reservation으로 원자적으로 예약한다. 이 숫자는 제공자 한도가 아닌 보수적 내부 정책이다. account usage가 없거나 기존 Free guard를 초과하면 중단한다. 글로벌 요청량·rows read/write·DB 공간은 별도 예산이다. 실제 계정 측정을 로컬 usage fixture로 대체하지 않는다.

상세 보관은 행사 종료 이후 최소 90일, 최소 게시지문 2년, 실행 로그 30일 정책을 보존한다. 미래 일정과 미해결 uncertain/recheck/시설 공지는 보호한다. RESTRICT FK가 부모만 삭제하는 실수를 막는다. DEV09는 해결 여부 확인 후 자식→부모 bounded purge를 구현해야 하며 이번 DEV에 자동 삭제 엔진은 없다.
