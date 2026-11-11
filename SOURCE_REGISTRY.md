# 전국 정보원 등록 가이드

DEV02는 로컬 D1 등록·검토·통계 기반이다. Worker의 수집/알림은 false이며 Cron에는 연결하지 않는다. SourceRegistry 계약을 구현한 src/registry.ts, 시설/후보/인물 관리 src/registry-management.ts, 안전 Import src/seed-import.ts를 사용한다. 공개 HTTP 관리 API는 제공하지 않는다. 관리 코드는 신뢰된 운영자 도구에서만 호출한다.

도도부현 코드는 [국토교통성 공개 코드표](https://nlftp.mlit.go.jp/ksj/gmlold/codelist/PrefCode.html)의 01~47을 숫자와 두자리 문자열로 함께 저장한다. src/prefectures.ts는 코드 조회·지역별 목록을 제공한다. 보고용8지역은 北海道/東北/関東/中部/近畿/中国/四国/九州・沖縄이며 三重県은近畿로 정했다. 지역 구분은 유일한 법정 분류가 아니며 실제 키는현코드다. 시정촌/운영주체는 불명일때null로 보존한다.

등록은 register, 조회 get/list/listPrefecture, 수정 save, 비활성화 pause, 다음시각 schedule, 유사URL검토 duplicateCandidates를 쓴다. 기본register는 insert-only이며 같은ID는 어떤 필드도 덮어쓰지 않는다. 명시적save만 정적 정보/심사결과를 수정하고 이력을 남긴다. 수집시각·ETag·Last-Modified·실패횟수·예약은 보존한다. 예약은별도schedule이다. 최소간격은 기본86400초/최저3600초이고 후속 Collector가 이를집행한다.

상태 active/review/unsupported/paused를 보존한다. active는 공식성Verified, robots allowed, terms allowed, 두확인시각, HTTPS exacthost 및 지원파서의 명시적 parserApproved=true가 모두 필요하다. 공식성Verified는 수집승인과 다르다. 현재 모든Seed는 review/unsupported/paused이며 active는0이다. robots404는 허가확인을 의미하지 않는다. 이용약관 링크가 개인정보/방문규칙일 수도 있으므로 수집허가로 간주하지 않는다.

ID는 최초 URL 해시에서 생성한 후 데이터에 고정한다. URL변경시 같은ID로save하고 과거URL alias를보존한다. 기본port/host/추적파라미터/fragment만안전정규화한다. http/https·끝slash는자동병합하지않고 후보로찾아 명시적 distinctVariantEvidenceUrl 없이 중복변형등록을거부한다. 서로다른campus/행사페이지는별도Source다. 확인된동일피드의두번째주소는 새Source를만들지않고 기존ID의URL변경/alias로관리한다. 내용이다른경우만근거를남겨별도등록한다.

시설 facility/getFacility/listFacilities/setOperatingStatus, linkFacility로 하나의시설에여러Source를연결한다. 시설URL변경은같은ID를사용하며과거URL재사용을차단한다. 운영상태는unknown이기본이며공식근거URL과확인시각없이open으로추정하지않는다. 폐관감지·행사영향은DEV04/07이다.

후보 candidate/decide는발견경로·현·분류를저장하고 승인/거절/미지원처리를한다. approved는완전심사된active등록을요구하며 실패하면후보를승인표시하지않는다. 단위별실패후재시도가능하다. 재귀URL추적이나원격명령실행은없다.

selectFair는47현커서를돌며 현당최대1개·오래된조사/임박deadline/priority 순으로선택한다. categoryMinimums는선택된현내에서local등최소량을우선하며 가용소스가없는할당은강제로채우지않는다. VTuber는독립budget으로선택한다. 미도래예약·비활성소스는제외한다. 호출자는커서를저장하고선택된소스의예약을갱신해야한다. 예산합계검사·lease·전국완주지연·national/null지역할당을포함한완전스케줄러는DEV08/09이며 전국완주속도를보장하지않는다.
