# Telegram 메시지 정책

메시지 A는 저장된 일본어 X 본문과 문자열 및 UTF-8 바이트가 일치해야 한다. 앞뒤 설명·내부 ID·Markdown·HTML·parse_mode·entities를 추가하지 않는다. URL·태그·emoji·개행을 바꾸지 않고 DEV05 공식 X 가중 길이 검사를 다시 통과한다. 웹페이지 preview는 끈다. API 응답의 chat/message ID와 text echo가 정확히 일치해야 성공으로 기록한다. echo가 다르면 uncertain이며 원문을 수정하거나 무조건 재전송하지 않는다.

메시지 B는 기존 관리 CLI에 맞춘 한국어 항목명과 공식 일본어 명칭을 사용한다. 날짜 정밀도와 종류, 장소/지역, 주최자, 신청/예약/요금의 판단 상태, 검증/만료 시각, revision, 가중 길이, 공식 링크, 최초 발견, 현재 변경 revision, 게시 상태, 이미지 URL/출처/권리/크레딧/생존 여부를 제공한다. 선택 필드가 unknown이면 무료·예약 불필요 등으로 보충하지 않는다. 작성 시점의 전달 상태는 snapshot이며 현재 채널별 상태는 Outbox 조회로 확인한다.

관리 메시지는 행 경계를 유지해 3,800 UTF-16 단위 이하로 분리한다. 이는 Bot API의 4,096자 상한에 대해 보수적이며 surrogate/emoji/URL을 잘라내지 않는다. 단일 과대 필드는 전송을 보류한다. 최대 8개 부분이다. 복사용 본문은 분할하지 않는다. 관리 메시지 수정에는 4,096 상한을 다시 적용하고 복사용 메시지는 수정하지 않는다.

이미지는 permitted/unknown/prohibited와 구체적인 근거·attribution을 보존한다. permitted에도 권리 근거 URL이 필요하다. 모든 상태에서 이번 구현은 링크만 제공하고 sendPhoto/바이너리 다운로드·복제·DB 저장을 지원하지 않는다. 사진이 없거나 소실되어도 행사와 알림 본문은 보존한다. unknown은 재업로드 허가가 아니다.

35바이트 불투명 callback_data가 있는 관리 버튼 세 개를 사용한다. 보안 규칙은 [callback 정책](TELEGRAM_CALLBACK_SECURITY.md)을 따른다. [전13종 합성 예시](NOTIFICATION_SAMPLES.md)는 실제 행사 보고가 아니다.

공식 근거: [Telegram Bot API](https://core.telegram.org/bots/api)의 sendMessage, InlineKeyboardButton, setWebhook(2026-11-18 확인). paid broadcast 옵션을 전달하지 않는다.

## DEV-07 관리 메시지 B

새 그룹의 B는 한국어 항목에 공식 일본어 이름을 표시한다. 예시 합성 데이터 표시

```text
도도부현: 北海道
시정촌: 미확인
예약: 사전 신청 필수
참가비: 무료
입장료: 미확인
신청 마감: 미확인
공식 변경 이력: 개최 일정 2026年11月23日 13:30〜15:00 → 2026年11月24日 14:30〜16:00
```

검증값이 있는 경우에만 날짜·시간·예약·요금을 표시하며 값이 다른 공식 근거와 충돌하거나 불명확한 경우에는 각각 구분한다. 이미지·출처·권리·크레딧 링크와 분리 전송 한도를 유지한다. A 일본어 copyText와 DEV-06R 고정 시험 payload는 그대로 유지한다. 관리 데이터는 일반 텍스트로 처리하고 format mode를 설정하지 않는다.
