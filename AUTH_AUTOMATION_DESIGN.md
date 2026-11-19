# DEV-07 운영 인증 설계

| 경로              | 수명과 적용 범위                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| DEV-06R 승인 코드 | 특정 합성 시험의 대상·본문·범위와 최대 30분 시간 창에 바인딩한다. 일반 Outbox로 넣을 수 없다.                                                |
| Telegram          | 유효한 Bot Token을 Secret으로 재사용한다. 승인된 개인 chat/user allowlist를 매 송신·callback 시점에 확인한다.                                |
| GitHub Reports    | 현재 30일 fine-grained PAT에는 자동 갱신이 없다. 운영 전용 GitHub App의 installation access token 갱신은 DEV-09/10 승인 게이트에서 실증한다. |

## 향후 설치 및 최소 권한

1. 사용자 승인 후 Reports 전용 비공개 App을 등록한다. **Issues Read and write**, 기본 **Metadata Read**만 부여한다. Reports 저장소 한 곳에만 설치한다. 코드 저장소·다른 저장소 설치, Contents·Administration 권한, GitHub webhook이 없어도 Issue API를 사용할 수 있다.
2. App client ID, installation ID와 Reports 숫자 repository ID를 운영 정책과 묶는다. 개인키는 승인된 Secret에만 두고 계정·테스트·운영 범위를 분리한다. 임의 API 대상 구성은 허용하지 않는다.
3. App 개인키로 RS256 JWT를 만든다. GitHub 권고에 따라 `iat`는 현재보다 약 60초 앞선 과거, `exp`는 발급 후 10분 이내, `iss`는 App client ID를 사용한다. 인증 헤더는 Bearer를 사용한다.
4. `POST /app/installations/{installation_id}/access_tokens`의 `repository_ids`에 승인된 ID 하나, `permissions`에 Issues write를 지정한다. 발급 응답과 조회 가능한 범위를 대조한다. Metadata read와 정확한 repo/owner ID·Private·Issues enabled·archived 여부 확인은 필수다. 응답의 실제 `expires_at`을 사용하며 보통 한 시간이다. 토큰 형식은 GitHub가 변경할 수 있으므로 특정 prefix나 고정 길이로 검증하지 않는다.
5. 운영 경로로 연결할 때도 기존 Private 대상 검증, deterministic marker, existing Issue 번호, uncertain 중복 방지 정책을 그대로 사용한다.

[JWT 생성](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app) · [Installation 토큰 발급](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app) · [Installation API](https://docs.github.com/en/rest/apps/installations)

## 인증 상태와 복구

`InstallationCredential`은 주입된 교환 인터페이스에서 정확히 한 저장소와 최소 권한을 검증한다. 만료 2분 전 갱신과 프로세스 내 동시 호출 합치기, 토큰 메모리 캐시, 실패 후 호출 지연, 폐기 중 진행된 갱신 무효화를 모의 검증한다. 실제 개인키 읽기·서명과 HTTP 호출은 구현 범위에서 제외했다.

- **401** 기존 토큰을 버리고 다음 독립 실행에서 제한된 갱신을 허용한다. 교환 API의 401은 개인키·시간·설치 문제 진단까지 보류한다.
- **403/404** 권한 범위와 설치·비공개 대상을 확인하기 전에는 보류한다. 403이 명확한 rate limit을 나타낼 때는 서버의 재시도 시각을 따른다.
- **429 및 제한 응답** `Retry-After`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`을 근거로 대기한다. 헤더가 없으면 최소 1분 기다린 뒤 재확인한다. 인증 교환의 5xx/timeout은 backoff로 돌아간다. 쓰기 요청의 성공 여부가 불명확하면 기존 Outbox를 uncertain으로 유지한다.
- **폐기와 rotation** 사고 시 메모리 grant를 폐기하고 설치를 제한한다. 권한이 있으면 `DELETE /installation/token`으로 토큰을 무효화한다. 승인된 새 키로 전환하고 이전 키를 폐기하며 토큰과 키를 로그·D1·체크포인트에 기록하지 않는다. Telegram도 유출·취소 시 발급 및 Secret 갱신을 별도로 승인한다.

[GitHub REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) · [Installation 토큰 폐기](https://docs.github.com/en/rest/apps/installations#revoke-an-installation-access-token)

## Free 실행 경계와 수신

갱신에는 서명과 토큰 교환 1회가 필요하다. 사전 검사와 Issues 요청은 별도 예산에 포함한다. 단순 함수 분리에는 별도 CPU 예산이 없다. DEV-09/10에서 고립된 CPU 경계와 메모리 재사용을 실제로 측정한다. 실행 간 체크포인트에는 토큰 만료·재시도 시각·승인된 설치 식별만 남길 수 있다. 토큰 자체는 요청과 같은 신뢰 실행 안에서만 쓴다. Workerd 격리마다 반복 발급되는 비용, 중단·폐기·갱신과 403/429 회복, 전체 송신의 CPU 및 D1 비용을 검증한 후 운영을 승인한다. 기존 플랜과 새 자원 없는 구성을 우선한다. [Workers 한도](https://developers.cloudflare.com/workers/platform/limits/) · [D1 한도](https://developers.cloudflare.com/d1/platform/limits/)

App은 Issue 작성 주체를 바꾼다. Reports 접근권한을 가진 사람의 Issues Watch·이메일 설정으로 도착 여부를 독립 확인해야 한다. App 생성, 개인키 발급, Secret 변경, PAT 교체와 합성 수신 재시험에는 각각 해당 단계의 사용자 승인과 검증 기록이 필요하다. 기존 수신자가 완료한 설정을 재요구하지 않는다. [GitHub 알림 설정](https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications)
