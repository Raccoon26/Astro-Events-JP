# DEV-06R 제한 실수신 시험

이 단계는 본인 계정에 합성 행사를 전달하는 로컬 시험을 준비한다. 운영 Worker와 DEV-06의 `isolated-fake` 경로는 기존 계약을 사용한다. 원격 D1은 0004, 수집·알림 플래그는 `false`, production Cron은 0이다. 신규 마이그레이션은 없다. 전용 로컬 D1에 0001~0008과 시험 장부를 설치하며 실제 행사·게시 상태와 분리한다.

## Secret과 사전 점검

1. Windows의 `E:\Astro-Events-JP\repo`에서 `pwsh -NoProfile -File scripts/dev06r-secret.ps1 -Mode install`을 실행한다. 봇 토큰과 본인의 개인 채팅·사용자 ID는 숨김 입력으로 받는다. 토큰·전체 Chat ID는 채팅, 커밋, 리포트, CLI 인자에 넣지 않는다. GitHub는 `Raccoon26/Astro-Events-JP-Reports` 한 곳만 선택한 만료 기한 있는 fine-grained 토큰의 Issues **Read and write**와 Metadata **Read**를 사용한다. 새 토큰은 사용자가 직접 발급하거나 이미 이 범위로 발급된 토큰을 사용한다. 일반 Git 자격 증명은 이 연결의 쓰기에 쓰지 않는다. [GitHub Issues 권한](https://docs.github.com/en/rest/issues/issues#create-an-issue).
2. Windows DPAPI가 현재 Windows 사용자용으로 암호화한 `E:\Astro-Events-JP\tools\config\dev06r-secret.dpapi`만 저장한다. 같은 사용자로 실행하고 디버그 네트워크 추적, 셸 transcript, secret 파일 복사·공유를 피한다. 원본 토큰을 로컬 평문 파일로 내보내지 않는다. 기존 파일 덮어쓰기와 링크 경유를 거부한다.
3. `node scripts/dev06r.mjs preview`는 Secret 없이 합성 본문과 Issue를 미리 보여준다. `pwsh -NoProfile -File scripts/dev06r-secret.ps1 -Mode preflight`는 `getMe`, `getChat`, `getWebhookInfo`와 GitHub `/user`, Reports metadata·Issue 목록을 **읽기 전용**으로 조회한다. 개인 채팅 ID와 허용 사용자 ID가 같아야 한다. `/start` 이후 해당 봇이 채팅을 볼 수 있는지 확인하며 실제 전송 성공은 별개다. GitHub 계정·저장소 소유·비공개·Issues 활성·archived 및 접근 권한을 검사한다. 토큰 자체의 실제 쓰기는 무해한 조회로 입증할 수 없으므로 저장소 한정 쓰기 설정을 사용자 확인으로 남기고 실제 응답 전에는 성공 처리하지 않는다. [Telegram Bot API](https://core.telegram.org/bots/api).

## 명시 승인과 실행

`preflight`가 발송 가능하다고 보고하면 검증된 봇 이름, 끝 2자리만 표시한 Chat ID, 승인 코드·만료, 복사용 A 1건과 관리 B 1건, 비공개 저장소의 `[TEST] Astro-Events-JP DEV-06R 제한 수신 시험` Issue 1건, 무료 한도, 보존 방침을 검토한다. 본 단계의 개발 명령이나 Secret 설치는 승인으로 취급하지 않는다. 코드와 정확한 시험 계획에 별도로 명시 승인한 후에만 보호된 실행기의 `-Mode send -Approval <코드>`를 사용한다. 계획은 대상·봇·GitHub 계정/저장소·본문·callback 범위·최대 30분 시간 창에 묶인다. GitHub가 이메일 알림을 발송하며 실제 수신은 보장되지 않는다.

미리보기는 외부 호출 0회, 사전 점검은 송신 없이 최대 9회 조회, 승인된 송신은 중복 검사와 쓰기 직전 비공개 재확인을 포함해 최대 13회 호출과 최대 3번의 쓰기다. 관리 메시지는 고정 시험에서 1건만 허용한다. 복사용 A는 DEV-05의 일본어 출력과 동일하며, TEST는 합성 행사 제목 단계에서 넣는다. B에만 관리 정보가 들어간다. 링크 미리보기는 비활성화하며 이미지나 X 게시 전송 경로는 없다. 새 서비스, 유료 기능, Cloudflare Worker 호출과 원격 D1 쓰기 예산은 모두 0이다.

## 버튼과 장애 복구

독점 사용을 확인한 시험 봇이고 webhook이 비어 있을 때만 버튼 3개와 `-Mode poll -Approval <같은 코드>`를 허용한다. 승인 시간이 끝나기 전에 버튼을 눌러 확인한다. 세션당 최대 3회 짧은 poll, 총 최대 15회 조회와 최대 3회 ACK를 허용한다. webhook을 건드리지 않으며 update offset을 앞으로 이동하거나 큐를 비우지 않는다. 이전 업데이트로 큐의 처음 30건이 가득 차거나 기존 webhook/consumer가 있으면 버튼 실증은 보류한다. 사용자·개인 채팅·봇·관리 메시지 ID와 D1의 토큰 해시·revision·만료를 비교해 각 버튼을 한 번만 consume한다. 게시완료는 시험 기록에만 남는다. [Telegram 업데이트 방식](https://core.telegram.org/bots/api#getting-updates).

`status`는 부분별 Outbox와 provider ID·시각·버튼 ACK를 보여준다. `reconcile`은 최대 6번의 GitHub 조회로 동일 계정, 저장소, 제목, 본문, marker, 링크가 일치하는 Issue만 복구한다. 50건씩 최대 4페이지 조회에서 목록 완결성을 확인할 수 없으면 중단한다. Telegram timeout·5xx·echo 불일치는 `uncertain`이다. 같은 부분을 다시 보내거나 `uncertain`을 성공으로 바꾸지 않는다. 관리 메시지가 실패해도 A가 재발송되지 않는다. 아직 claim하지 않은 부분만 새 승인 범위 안에서 재개할 수 있다. 기존 Issue가 있는 새 장부에서 신규 시험을 거부한다. 장부나 잠금이 손실되면 새로 만들어 재발송하지 말고 먼저 기존 기록을 대조한다. 시험 Issue·메시지·장부는 보존하고 자동 삭제·수정·공개 전환하지 않는다.

## 수신 증거와 CPU

사용자가 설정한 Watching·Participating·My own updates와 Reports Issues 구독은 그대로 쓴다. 시험 Issue가 확인되면 GitHub 알림함과 이메일에서 해당 Private 링크를 대조한다. `-Mode observe -Channel github-web` 또는 `-Channel email`에 `-Outcome received|not-received -IssueUrl <확인된 링크> -ObservedAt <시간대 포함 ISO 시각>`을 추가해 직접 관찰한 결과나 미도착 확인을 따로 기록할 수 있다. 메일함에 접근할 수 없으면 사용자 확인 전에는 미검증이다. 미도착은 기존 구독의 대상 저장소, GitHub 알림함, 전달 주소와 스팸함을 진단한다. SMTP나 외부 메일 서비스는 사용하지 않는다. [GitHub 알림 설정](https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications).

이 시험의 Node·로컬 D1 기록으로 Cloudflare CPU를 판단하지 않는다. 원격 현재 Verified 게이트·본문 생성/조회·Outbox·실전 전송·callback은 따로 실측해야 하며 0004 환경에서 실행 불가한 경로는 미검증이다. DEV-05R의 emoji P99 8.770ms, cold 표본과 전체 파이프라인의 미해결 상태를 보존한다. P99 8ms 목표와 Workers Free CPU 10ms 한도를 별도로 판단하고 자동 운영은 차단한다. [Cloudflare Worker 한도](https://developers.cloudflare.com/workers/platform/limits/).

## 감사와 현재 증거

R01~R32 및 DEV00~06 이전 감사는 `npm run check`에서 계속 실행한다. `audit-dev06r.mjs`가 기존 696개/48파일의 테스트·fixture와 migrations 0001~0008 해시를 검증한다. R11/R15~R19는 합성 fixture와 exact copy·Outbox·수신 분리, R22~R28/R31은 무료 예산·Secret·E 보관·Private 대상·보호 병합과 연결한다. DEV07~10 구현 범위는 로드맵에 남긴다.

기존 sparse Verified D1 회귀의 5,000행 준비가 30초 제한을 넘겨 다음 검사의 준비에도 영향을 주었다. 동일한 5,000행을 SQL 한 번으로 넣도록 준비 절차만 바꿨다. 실제 조회 결과, 읽기 상한, 30초 제한은 그대로이며 기록한 정확한 파일 해시 쌍만 감사에서 인정한다.

현재 실제 발송 승인은 없고 지정 Secret도 미설치다. 승인 대상 봇·채팅은 미확인 상태다. 실제 Telegram·Issue 쓰기·웹/이메일 알림·버튼은 모두 미검증이며 발생한 시험 발송 비용은 0이다. 코드는 격리 대역과 로컬 D1에서 검증한다.
