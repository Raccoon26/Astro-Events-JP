# Telegram callback 인증과 상태 변경

버튼은 게시완료(posted)·보류(held)·재확인(recheck)다. posted는 사용자가 게시했다고 확인한 기록이며 X API 확인이 아니다. held는 동일 revision의 반복 전달을 멈춘다. recheck는 로컬 검토 대기 행을 만들며 외부 사이트를 요청하지 않는다. simulation 상태는 별도 mode와 action_provenance로 표시하고 게시지문은 simulation 접두어를 사용한다. 모의 게시를 실제 게시 수로 집계하지 않는다.

각 토큰은 WebCrypto randomUUID의 128비트 난수에서 만들며 `n6:`와 32 hex 문자로 총 35 ASCII 바이트다. 원시 토큰은 필요한 로컬 버튼 payload 안에만 보관하고 조회 키는 SHA-256이다. 서버 측 action·group·revision·expected generation·만료·소비 시각·전송된 관리 message ID에 바인딩한다. URL/Secrets/JSON을 callback_data에 넣지 않는다.

허용된 chat ID와 user ID, 실제 해당 관리 message ID가 모두 일치해야 한다. webhook은 POST/JSON/32KiB 상한과 Telegram 비밀 헤더를 검증한다. 최소 32자 Secret을 사용하고 WebCrypto HMAC verify로 비교한다. 공개 운영 endpoint는 설치하지 않았으며 이 handler는 격리 테스트에서만 사용한다. 새로운 Bot Token이나 Secret을 사용자에게 요구하지 않는다.

현재 Verified/Post 게이트를 통과한 뒤 publication generation CAS, 토큰 소비, publication_records, 출처 provenance, simulation 게시지문, 검토 작업, 관리 업데이트를 하나의 D1 batch로 기록한다. 게시완료/보류 경합은 하나만 성공한다. 같은 action의 재전송은 멱등 결과를 반환하고 다른 actor·메시지·action·과거 revision은 거부한다. 만료 토큰은 과거 성공 여부와 무관하게 거부한다.

callback HTTP 응답과 느린 외부 작업을 분리한다. answerCallbackQuery와 관리 메시지/Issue 수정은 별도 Outbox 작업·lease·최대 3회 정책을 사용한다. callback 자체가 신규 행사 보고를 만들지 않는다. 관리 수정은 copy 메시지를 절대로 수정하지 않으며 불확실한 수정도 자동 반복하지 않는다. 관리 상태가 변경되어도 기존 복사 본문은 불변이다.

위협/회귀 근거는 notification-callback, notification-safety, notification-workerd 테스트다. 토큰·Secret·원격 응답 원문은 로그에 출력하지 않는다. 실제 webhook 등록·Telegram 수신은 미검증이며 별도 사용자 승인 대상이다.
