# DEV06 알림 설계

현재 구현은 로컬 staging/격리 D1과 주입된 `isolated-fake` 전송기만 사용한다. 실제 Telegram·Reports Issues·이메일 발송은 0이며 운영 Worker에는 알림 경로를 설치하지 않는다. 실제 HTTP 전송 어댑터·Secrets 등록·수신 시험은 별도 승인 단계다. 이는 실패를 성공으로 대체하는 모드가 아니라 동일 API 계약의 명시적 모의 실행이다.

`NotificationService.deliver(report, delivery)`와 `callback(token, action)` 계약은 `OutboxNotificationService`가 구현한다. deliver는 현재 보고서와 전달 키를 대조해 Outbox에 접수한다는 뜻이며 외부 수신 성공이라는 뜻이 아니다. callback에는 허용 사용자·채팅·메시지 문맥을 주입해야 한다. 기존 15개 계약과 DEV03 후보→DEV04 검증→DEV05 게시글 연결을 보존한다.

PostStore.current → VerificationStore의 현재 근거 재검사 → 저장된 GeneratedPost 무결성/X 길이 검사 → Report/메시지 렌더 → 버전 CAS → Outbox 저장 순서다. PostStore.get의 반환 계약은 그대로 유지한다. 새 current의 단기 capsule은 후보·공식 승인·문서·시설·VTuber·검증 JSON/규칙·게시글 모든 관련 열을 SQL bind로 묶는다. 원래 입력 digest 규칙은 바꾸지 않는다. 이미지 생존 증거의 유효 기간도 상한에 반영한다. capsule은 invocation 사이에 캐시하지 않는다.

각 메시지 부분은 별도 전달이다. enqueue는 페이지당 최대 2개 부분, 조회는 최대 50행 커서다. claim, dispatch, callback, 상태 수정, callback 응답 처리는 별도 호출이다. 함수만 나눠 CPU 예산이 초기화된다고 주장하지 않는다. 실제 workerd 테스트가 각 단계를 독립 HTTP invocation으로 실행한다. 자동 실행 스케줄러는 DEV09 대상이다.

Telegram A는 copyText 그대로이며 B와 Issue는 관리용 표현이다. 현재 revision과 필드별 confirmed/unknown/ambiguous/conflicting을 유지하고 시설 휴관을 행사 취소로 바꾸지 않는다. 취소·연기는 DEV04 공식 판단만 사용한다. 우선순위는 취소·연기/운영 변경을 구분하지만 전국 공정성과 VTuber 비침식 정책은 기존 DEV08/09 범위를 보존한다.

자세한 상태·동시성은 [Outbox](DELIVERY_OUTBOX_DESIGN.md), [복구](DELIVERY_RECOVERY.md), [메시지](TELEGRAM_MESSAGE_POLICY.md), [보안](TELEGRAM_CALLBACK_SECURITY.md), [Reports](GITHUB_REPORTS_POLICY.md)를 따른다. 실제 자료 검증 건수와 모든 synthetic 검사는 별개다.
