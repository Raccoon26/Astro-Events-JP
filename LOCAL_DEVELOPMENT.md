# Windows E드라이브 개발

실제 작업공간은 `E:\Astro-Events-JP\repo`이다. root 기존 초기 checkout은 보존했다. 앞으로 repo checkout만 개발하며 root checkout에서 commit/push하지 않는다. Get-Volume는 권한거부로 디스크health/물리외장 여부는 미검증이다. 파일시스템 E경로 접근·쓰기는 검증한다.

```text
E:\Astro-Events-JP\
  repo\       Git checkout, node_modules, dist
  tools\      프로젝트 도구 설정
  cache\      npm, Wrangler local D1 state
  temp\       임시파일, 격리시험
  logs\       Wrangler 로그
  reports\    경로/정리/검증 보고 (Git 밖)
```

Node22.15 이상(22 LTS 권장), npm, Git, PowerShell7 사용. 프로그램 설치 자체는 시스템 경로에 존재할 수 있다. 공용설정/캐시를 삭제하거나 전역도구를 설치하지 않는다.

```powershell
Set-Location E:\Astro-Events-JP\repo
. .\scripts\environment.ps1
npm ci
npm run check
npm run d1:local
npm run cleanup
```

environment.ps1은 현재 shell의 TEMP/TMP/npm cache/XDG cache/config/WRANGLER_LOG_PATH를 E로 지정한다. .npmrc도 E npm cache를 고정한다. 설정은 drive·현재경로·ancestor symlink/junction 검사 후 적용한다. 연결해제/없는repo/잘못된경로는 예외로 종료하며 자동clone/fallback을 하지 않는다. 명령시작마다 preflight, 파일작업 실패시 중단한다. 진행중 물리분리는 예방할 수 없으므로 재연결후 Git상태/DB integrity를 검사한다.

Wrangler는 wrapper로 실행한다. local D1은 ../cache/wrangler-state, 빌드는 repo/dist, .wrangler(ignored)·temp도 E이다. build는 deploy --dry-run이며 배포하지 않는다. Wrangler auth/원격DB는 DEV01에서 구성한다. OS로그/도구의 OS관리파일까지 완전차단은 보장하지 않는다.

Linux GitHub hosted runner는 GITHUB_ACTIONS=true, 기타 Linux cloud는 ASTRO_CLOUD_WORKSPACE=1로 임시 checkout을 허용한다. E검증=false를 출력한다. CI npm cache는 runner.temp로 .npmrc보다 우선한다. Windows 로컬에는 cloud예외를 적용하지 않는다. cloud cleanup은 금지한다.

개발전후 npm run paths와 cleanup을 실행해 E reports에 보고한다. C/D는 알려진 프로젝트 경로만 확인하며 공용 npm캐시를 순회/삭제하지 않는다. 민감 env값을 출력하지 않는다.
