# 프로젝트 상태

기준일 2026-11-11 JST. 현재 **DEV-02 로컬 구현·정보원 검토 완료, 최종 GitHub 완료 절차 대상**이다. 이 문서는 병합 전 검토 스냅샷이며 실제 PR/최신 CI/커밋·병합·main SHA는 E reports/github-completion 보고서와 최종 보고를 기준으로 확인한다. DEV-03은 시작하지 않는다.

## 선행 단계와 작업 범위

DEV-00 PR #1과 DEV-01 PR #2의 merged=true를 API로 확인했다. 기준 main은 165b12e0d55a866923301bb32c5278ef4f5240c2이며 최신 main에서 dev/dev-02-source-registry를 만들었다. 기존 48개 테스트 파일·검증 목적, 15모듈 계약, Workers Health/Cron, 수집·알림 false, staging/production 분리, 무료 예산 보호, 경로/정리 도구와 CI를 보존했다.

**DEV-01: 로컬 완료 / 원격 검증 보류. DEV-02: 원격 연결과 분리해 로컬 개발 가능. Cloudflare 실운영: DEV-01 원격 검증 전 활성화 금지.** 사용자의 이번 지시에 따라 인증을 다시 요청하거나 OAuth/배포를 시도하지 않았다.

## DEV-02 구현 완료

- 47현의 공식 코드·일본어명·보고용8지역, 시정촌 null 허용 및 확장 가능한 조회
- SourceRegistry D1 CRUD·필터·고정 ID·URL/과거 alias·중복변형 심사·상태·예약·갱신 이력
- 시설 등록·조회·공식 URL 변경·운영 상태 근거와 여러 Source 연결
- 인물별 공식계정 근거·별칭·중복 차단·새 인물 확장·미검증 활성 차단
- Discovery 후보 등록·승인/거절/미지원·검토 후 Source 전환
- 47현 커서 회전·오래된 조사/마감/우선도·지역 내 category 최소량·VTuber 별도 예산 기반
- 최종 Seed 사전 검증·Dry Run·변경 미리보기·로컬 staging 전용 Import·단위별 원자적 batch/실패 재개·운영 데이터 덮어쓰기 방지
- 0003_registry.sql 추가. 0001/0002 파일은 변경하지 않았고 SHA 검사를 유지·확장했다.

## 실제 정보원 확보 및 남은 검토

Source **96개**, 시설 **92곳**, VTuber **4명**, 별도 실패 후보1개다. 공식성 Verified **77개**, 공식성 추가확인 **19개**다. 47/47현에 최소1개 공식성 확인 Source를 확보했다. active **0**, review **85**, unsupported **9**, paused **2**다. 47현 코드 지원·실제 출처 확인·수집 승인 현황은 서로 다른 지표다.

시설 유형은 과학관/플라네타륨74, 천문대6, community6, 연구기관5, 대학1이다. category=local은8개이며 소규모 지자체 관측시설·공민관/시민센터·교육센터 등을 포함한다. 유명기관만 등록한 목록이 아니다. 연구기관은 JAXA筑波/相模原, NAOJ, NIPR, JAMSTEC, 대학은京都大学附属天文台다. 도서관은豊川市ジオスペース館의 중앙도서관 공식 페이지가 포함된다.

宇推くりあ는 홈페이지/권리자 프로필의 계정 링크, 月女神イチ는 운영자의 YouTube 링크, 星見まどか는 본인 프로필의 YouTube/X 링크를 확인했다. **猫谷ここな는 권위 있는 공식 교차링크를 확보하지 못해 Review Required**다. 확인하지 못한 X/판매 경로는 추측하지 않았다. SNS 전체 수집을 보장하지 않으며 모두 enabled=0이다.

공식성 확인만으로 크롤링/이미지 재게시를 허용하지 않는다. robots/이용 조건/파서 승인이 끝나지 않아 모든 수집 승인을 보류했다. 약관 링크를 찾은 결과와 실제 본문 검토를 구분했다. Solar의 방문 규칙, JAMSTEC/JAXA의 재이용 조건은 별도 검토 기록에 남겼다. 仙台의 웹사이트 정비·星のくに 옛 운영자의 휴지 공지는 paused로 기록하며 행사 취소/현재 재개관을 추측하지 않는다. NAOJ 잘못된 후보 경로404는 Source에서 제외했다.

47현 최소 확보는 모든 시정촌·현행 행사 전수 확보가 아니다. 검증 출처가1개인24현과 각 접근 오류/추가 확인 목록은 [SOURCE_COVERAGE](SOURCE_COVERAGE.md)에 명시했다. 민간 동호회/축제/대학 연구실·동아리 확대는 DEV03/08에서 계속하며 요구사항을 삭제하지 않는다.

## 로컬 검증 결과

총 **79개 테스트 / 10개 파일**에 기존48개를 포함한다. 코드·Seed 검증·타입·Biome·양환경 Workers dry-run 빌드·Secret 검사/npm audit·R01~R32 및 DEV01/02 요구 매핑·실제 Wrangler 로컬 마이그레이션은 최종 npm run check/CI에서 모두 확인한다. 실패 시 병합하지 않고 수정한다.

별도 격리 workerd/D1에서 최종 96 Source·92시설·4인물·후보를 Import하고 반복/Dry Run 0쓰기, 기존 수동 pause·예약·ETag·실패횟수 보존, FK/quick_check, 원자적 실패 롤백을 검증한다. 2,000개 가상 확장 데이터는 테스트 fixture에만 존재한다. 목록은 1쿼리·25행 반환/25행 읽기이며 실제 측정 JSON은 E reports/dev02-benchmark.json이다. rows_read/rows_written/size_after는 **로컬 D1 meta**다. elapsedMs는 경과시간이고 cpuTimeMs=null이다. 원격 Cloudflare CPU/계정 비용 실측이 아니다.

전용 영속 로컬 저장소는 E cache/registry/staging이며 기존 Wrangler DB와 격리했다. 개발 중 초기 실험 저장소는 E cache/registry/dev02-prototype-preserved에 보존하고 최종 Seed로 새 전용 저장소의 init/Import/반복 실행을 검증했다. Production DB에는 접근하지 않았다.

## GitHub 및 E 드라이브

기존 GitHub 인증으로 main 저장소 admin/push/pull·Auto Merge 지원을 확인했다. Reports는 연결 앱에서404였으나 기존 로컬 Git 인증 API로 **200/private=true/Issues=true**를 재확인했다. 다른 저장소나 계정 권한은 변경하지 않았다. main 필수 quality/strict/PR·관리자 포함·강제 push/삭제 금지·production 승인 요구와 배포 비활성 변수를 보존한다.

기존 complete:dev -- --reviewed로 전체 검사 후 자동 commit/push/PR/최신 head CI/보호 조건 검사/expected-head 안전 병합/main fast-forward를 수행한다. 실배포는0이며 GitHub 코드 병합이 DEV01 운영 완료를 뜻하지 않는다.

실제 E:/Astro-Events-JP/repo에서 사전 경로 검사와 환경 설정·정리 Dry Run을 수행했다. npm/cache/temp/config/log/build/DB/report는 E에 두었다. C:/Astro-Events-JP·D:/Astro-Events-JP의 알려진 전용 경로만 검사했고 삭제하지 않았다. 개발 후에도 Dry Run/경로 보고를 E reports에 남긴다. 시스템/공용 캐시 전체가 비어 있다고 주장하지 않으며 물리적 드라이브 분리 시험은 미수행이다. 기존 missing-path/링크/외부 경로/소유·변경 파일 차단 시험을 보존했다.

## 미구현·미검증 및 다음 단계

DEV01 보류: 실제 계정 Free/전체 사용량/권한·자원 충돌 확인, 두 원격 D1/ID/마이그레이션·staging CRUD/Time Travel·Worker 배포/rollback·원격 Health/Cron/CPU·실 Actions 배포. 기존 실제 ID 미등록과 원격 guard를 유지하며 사용자 인증을 다시 요구하지 않는다.

DEV03~10의 RSS/HTML 수집·자동발견·검증·취소/시설 영향·공식 이미지/권리·일본어/해시태그·Telegram/이메일/Private Issues·게시지문·3시간 실운영·자동 삭제·통합 검증은 로드맵에 남는다. 완전 스케줄러의 lease/전국 지연/계정 예산 집행은 DEV08/09다. 알려진 로컬 테스트 실패는 수정 없이 남겨두지 않는다. 공식성 미확인19개와 미승인 수집정책, 猫谷ここな의 공식 연결은 명시적 검토 항목이다.

현재 사용자 추가 인증·토큰·사전 설정은 필요 없다. **DEV03 로컬 개발 기반은 준비되지만 사용자의 별도 지시 전 시작하지 않는다.** 실제 Cloudflare 실운영 준비는 DEV01 원격 검증 완료 후 판단한다.
