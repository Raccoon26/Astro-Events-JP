# 전달 장애 복구

기본은 Dry Run이며 실제 적용은 로컬 모의 D1에만 허용한다. `node scripts/notifications.mjs <command>`를 사용한다. `--apply --simulation --local-budget` 세 옵션 없이는 변경하지 않는다. `--remote`, `--live`, production과 API Token 옵션은 거부한다. 로컬 예산 명시는 실제 Cloudflare 계정 예산 확인을 대신하지 않는다.

초기화는 registry/verifier/posts ledger 0007과 staging identity2를 확인하고 0008을 batch 적용한다. 이미 적용되면 반복하지 않는다. view와 ledger가 다르면 초기화하지 않고 중단한다. 기존 DB를 삭제하거나 migration을 수정하지 않는다. Wrangler local D1 ledger와 registry 관리 DB ledger는 별도 저장소다.

preview --post는 현재 게이트를 통과한 A/B/Issue를 보여준다. enqueue는 --post/--source/--fingerprint/--revision을 명시하고 반환 nextCursor로 페이지를 이어 간다. claim --delivery 후 반환 owner로 dispatch --delivery/--owner를 별도 실행한다. provider 상태는 E cache/notifications/staging/provider.json에 모의임을 표시해 저장한다. 정상 외부 provider나 Telegram 계정이 아니며 원격 요청은 없다.

list --state pending|sending|sent|uncertain|failed, history --delivery, updates로 상태를 조회한다. 목록은 최대 50행이며 마지막 delivery_id를 다음 --cursor로 전달한다. 본문과 관리 메시지는 별개다. 성공한 부분을 복제하지 말고 실패한 부분의 키만 처리한다.

recover --delivery는 lease 만료 시 시작 전이면 pending, 시작 뒤면 uncertain으로 만든다. uncertain Telegram은 검색 API가 있다고 가정하지 않는다. 모의 기록을 사람이 확인한 경우에만 confirm --delivery --external-id --reason으로 수신 사실을 인정한다. 동일 결정은 멱등이며 다른 ID/이유는 충돌이다. 내용이 이미 바뀌었어도 수신 사실 정리는 가능하지만 오래된 게시글의 재전송/현재 추천은 계속 금지한다.

reconcile --delivery는 GitHub private proof→bounded marker/정확한 본문 양의 일치를 확인한다. 발견하지 못해도 새 Issue를 만들지 않는다. 목록 불완전/충돌이면 uncertain을 유지한다. 같은 행사 Issue 수정도 cause 잠금으로 직렬화한다. 응답 손실 수정은 recover-update 또는 confirm-status --update --reason으로 명시적 모의 수신 사실을 기록할 때만 해결한다. callback ack는 ack/recover-ack으로 별도 처리하며 불확실한 ack를 무한 반복하지 않는다.

callback --token --action posted|held|recheck --chat --user --message --update는 서버 토큰과 현재 대상에 일치해야 한다. update-status --update는 관리 메시지/기존 Issue만 수정하고 복사용 본문은 수정하지 않는다. 재확인은 자동 수집하지 않는다.

모든 적용 명령에는 위 세 적용 옵션이 추가로 필요하다. 토큰/오류 원문은 공개 로그에 남기지 않는다. 실제 인증·전송 실패를 이 도구로 해결했다고 주장하지 않는다. 실전 복구 시험은 별도 승인·최소 권한·현재 Free 예산·비공개 대상 검증 후 진행할 후속 단계다.
