# GitHub 이메일 알림 연계

이메일 전송기는 구현하지 않는다. 별도 SMTP·유료 메일 API·서버를 도입하지 않고 비공개 Reports Issue의 GitHub 알림을 사용한다. 이번 DEV의 실제 Issue 생성·이메일 발송·메일함 수신 확인은 모두 0건/미검증이다. Issue 성공이 이메일 도착이나 전체 본문 포함을 보장하지 않는다.

향후 별도 발송 시험 승인 시 사용자 본인의 GitHub Settings → Emails에서 수신 주소 인증을 확인하고 Settings → Notifications에서 participating/watching의 Email 알림 및 전달 주소를 확인한다. 자신의 계정으로 Issue를 만드는 경우 own updates 수신 선택도 확인한다. Reports 저장소 Watch → All Activity 또는 Custom → Issues를 선택하거나 개별 Issue를 Subscribe하며 Ignore가 아닌지 확인한다. 비공개 저장소 접근권한도 유지되어야 한다. 이 단계는 지금 사용자에게 요구하거나 자동 변경하지 않는다.

`npm run notifications:email`은 기본 모두 unknown인 로컬 준비 상태를 출력한다. E reports 안의 boolean/null 전용 JSON을 `node scripts/notifications.mjs email --proof E:/Astro-Events-JP/reports/email-settings.json`으로 평가할 수 있다. 필드는 repositoryPrivate/repositoryAccess/issuesEnabled/watchSubscribed/issueSubscribed/ignored/verifiedEmail/emailNotificationsEnabled다. 이름·이메일 주소·비밀 토큰을 넣지 않는다. 성공은 별도 승인 시험을 계획할 준비라는 뜻이며 deliveryVerified와 inboxReceiptVerified는 항상 false다.

2026-11-18 repository subscription GET은 404였다. 미구독뿐 아니라 인증 방식의 API 미지원/가시성 문제일 수 있으므로 이메일 비활성화를 확정하지 않았다. GitHub watching subscription API는 fine-grained token과 App token을 지원하지 않는다는 공식 제한도 있다. 토큰을 광범위하게 재발급하기보다 사용자가 공식 화면에서 확인하는 방법을 우선한다.

수신 장애 시 저장소/Issue 구독·Ignore·선택 수신 주소/인증·own updates·GitHub 웹 알림·메일함 필터/스팸 순서로 확인한다. 실제 메일함을 확인하지 않으면 수신 완료로 기록하지 않는다. GitHub가 알림 본문을 축약할 수 있으므로 상세 보고서는 Private Issue 링크로 제공한다.

공식 참조(2026-11-18): [Configuring notifications](https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications), [Watching REST](https://docs.github.com/en/rest/activity/watching). 별도 승인된 테스트의 수신 증거는 이 문서의 준비 상태와 구분해 기록해야 한다.

## DEV-06R 제한 수신 결과

사용자가 합성 시험 Private Issue의 이메일 도착을 직접 확인했다. 향후 GitHub App 주체가 작성하는 Issue에 대한 별도 수신 시험은 아직 실행하지 않았다. 기존 Watch/이메일 설정과 시험 증거 범위는 [DEV-06R 기록](DEV06R_LIVE_VALIDATION.md)에 따른다.
