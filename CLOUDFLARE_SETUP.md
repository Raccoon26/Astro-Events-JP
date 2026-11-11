# Cloudflare 연결·환경 구축

DEV-01 원격 인증은 사용자 요청으로 보류되었다. 현재 Workers Free 플랜, 계정 전체 사용량, 실제 DB ID, 권한, 원격 자원 충돌 여부는 **미확인**이다. 로컬 D1/workerd 결과는 원격 성공의 증거가 아니다. `cloudflare-resources.json`의 null 및 Wrangler의 0000… ID는 로컬 식별자이며 실제 Cloudflare ID가 아니다. 원격 guard가 이를 거부한다.

## 인증을 재개할 때

사용자가 재개를 요청하면 E repo에서 environment.ps1을 적용한 후 공식 Wrangler OAuth를 사용한다. `node scripts/wrangler.mjs login --browser=false --scopes account:read user:read workers:write d1:write`는 계정조회/Worker/D1 설정용이다. OAuth는 세밀한 개별자원 제한이 제한적이므로 승인 화면을 확인한다. 지속갱신 offline_access를 자동 추가하지 않는다. 현재는 새 동의를 요청하거나 로그인을 재시도하지 않는다. 비밀번호/토큰을 채팅에 넣지 않는다. 자격증명은 E tools/config 아래, API 호출은 메모리에서만 읽고 auth token CLI 출력을 로그로 남기지 않는다.

CI에는 별도의 **환경별** API 토큰을 사용한다. Cloudflare Dashboard → My Profile → API Tokens → Create Custom Token에서 대상 계정의 Workers Scripts Edit·D1 Edit를 필요한 자원에 한정한다. 조회/metrics에는 Account Analytics Read 등 해당 조회 권한만 추가한다. DNS·Routes·KV·유료제품·Billing Write는 필요없다. 초기 D1 생성은 해당 계정 D1 생성권한, 생성 후에는 가능한 범위에서 각 DB/Worker로 축소한다. 토큰을 GitHub Settings → Environments → staging 또는 production → Environment secrets의 CLOUDFLARE_API_TOKEN에 저장한다. 두 환경에 같은 토큰을 복사하지 않는다. 현재 Secrets는 등록하지 않았다.

## 실제 Free 계정과 사용량 확인

Cloudflare Dashboard의 Workers & Pages 플랜과 Billing → Subscriptions에서 Workers Free를 확인한다. 계정 전체 Workers 요청, 모든 D1 읽기/쓰기·저장량, 현재 Cron 수, 기존 Worker/DB 목록을 확인한다. 계정조회 권한이 없거나 일부 지표가 모호하면 배포하지 않는다. 단순히 유료 구독이 보이지 않거나 프로젝트 자체 트래픽이 적다는 이유로 여유를 추정하지 않는다.

guard는 `CF_ACCOUNT_EVIDENCE` 환경 Secret에 아래 **실측값**을 요구한다. 예시 숫자를 그대로 승인근거로 사용하지 않는다. source는 실제 인증된 Dashboard 확인을 뜻한다. checkedAt은 UTC 확인시각, utcDay는 해당 UTC일이다. 15분이 지나거나 날짜가 바뀌면 새 근거가 필요하다. 프로젝트별 Cron 수를 모르면 0으로 보수 계산해 추가 슬롯을 확보한다. 이 근거는 운영자 확인이며 자동 플랜 인증 시스템을 완성했다고 주장하지 않는다.

```json
{
  "accountId": "실제 계정 ID",
  "source": "cloudflare-dashboard",
  "plan": "free",
  "checkedAt": "실제 UTC 확인시각",
  "utcDay": "실제 UTC 날짜",
  "requests": null,
  "reads": null,
  "writes": null,
  "databaseBytes": null,
  "cronTriggers": null,
  "projectCronTriggers": { "staging": 0, "production": 0 }
}
```

null은 차단을 의미한다. Secret을 Git에 저장하지 않는다. 현재 구조는 사용량 근거 갱신이 필요하므로 **조건부 자동 배포**이다. 계정 지표의 실시간 자동 수집·플랜 검증 및 API 권한/스키마의 원격 검증은 인증 재개 후 남은 DEV01 완료 조건이다. 지표 지연/샘플링과 다른 프로젝트의 동시사용을 감안해 headroom을 남긴다.

## 자원 생성과 재개 순서

1. E 환경·인증·Free·계정사용량을 확인하고 CLOUDFLARE_ACCOUNT_ID와 위 근거를 안전한 프로세스 환경에 설정한다.
2. `node scripts/cloudflare-provision.mjs`: 기존 목록을 먼저 읽어 이름충돌/DB10개/Cron5개 한도를 검사하고 프로젝트 D1 두 개만 생성한다. 충돌한 기존 자원을 자동 인수하지 않는다. 부분 성공은 manifest에 즉시 기록하며 성공한 DB를 자동 삭제하지 않는다.
3. 실제 ID를 manifest와 wrangler.jsonc에 반영한 diff를 검토하고 모든 검사를 통과시킨다. staging/production ID는 달라야 한다.
4. `node scripts/cloudflare.mjs migrate staging --approve-staging-migrations`, `initialize staging`, `inspect staging`, `staging-probe staging`을 순서대로 실행한다. 운영은 별도 `migrate production --approve-production-migrations`, `initialize production`, `inspect production`만 수행한다. production에 테스트 데이터 삭제/복구를 하지 않는다.
5. staging bookmark/Time Travel·Worker rollback·실제 HTTP/Cron·CPU/계정사용량을 검증한다. [복구 절차](DISASTER_RECOVERY.md)를 따른다.
6. [배포 절차](DEPLOYMENT.md)에 따라 main의 검증된 코드만 배포한다. 아직 등록되지 않은 토큰·지표를 준비하기 전에 활성화 변수를 true로 바꾸지 않는다.

Workers는 astro-events-jp-staging / astro-events-jp-production, D1도 동명으로 분리한다. 도메인·기존 다른 Worker·D1·구독 설정은 수정하지 않는다. 실제 workers.dev subdomain 설정이 없다면 계정 소유자가 공식 화면에서 선택해야 한다. 유료 플랜/임시 preview 계정으로 대체하지 않는다.
