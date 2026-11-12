# DEV03 HTTP/SSRF 보안 감사

2026-11-12 JST. 완료한 것은 아래 로컬 보호 구현·fixture 검사다. 실제 Cloudflare 연결 IP 보장 또는 원격 보안 검증 완료를 뜻하지 않는다.

## URL과 리다이렉트

HTTPS·정확한 승인 hostname·기본443만 허용한다. IP literal/userinfo/local/private 이름·위험 스킴/포트·백슬래시/제어문자·불명 percent encoding·encoded slash/double encoding·민감 query를 거부한다. Unicode authority는 거부하고 검토된 IDN punycode만 허용한다. 하위 도메인과 유사 호스트를 자동 허용하지 않는다. HTML base도 승인된 공식 범위만 반영한다.

자동 redirect를 사용하지 않는다. 각 hop의 URL/경로/robots/요청 예산을 다시 확인한다. cross-origin redirect는 승인 hostname 목록에 있어도 별도 robots/소유 심사 없이는 차단한다. 다른 URL로 이동할 때 조건부 요청 헤더를 전달하지 않으며 최종 표현의 ETag를 원래 URL의 validator로 재사용하지 않는다.

## DNS와 실제 연결의 경계

[Workers DNS 문서](https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/)는 DoH 기반 조회와 일부 미구현 API를 설명한다. DNS 조회만으로 fetch가 사용하는 peer를 고정했다는 증거가 되지 않는다. 현재 [Workers fetch](https://developers.cloudflare.com/workers/runtime-apis/fetch/)에서 검증된 DNS 결과와 TLS peer를 묶는 방법을 원격 실증하지 못했다. 따라서 기본 Worker 전송기는 dns-protection-unavailable로 fail closed하며 평범한 fetch로 자동 대체하지 않는다. 이는 의도된 미지원 경계다.

로컬 Node 도구의 pinned-transport는 시스템 lookup 결과 전체가 공개 IPv4인 경우만 선택하고, lookup callback을 해당IP로 고정한다. IPv6/사설/loopback/link-local/metadata/문서용/멀티캐스트/혼합 답변은 거부한다. native HTTPS 인증서 검증과 원래 hostname SNI를 유지하고 agent:false/family4로 연결 풀 재사용을 막으며 response.socket.remoteAddress도 비교한다. DNS 변경 후 사설 peer에 접속하거나 일반 fetch로 fallback하지 않는다. 보수적으로 일부 합법 주소/IPv6-only 사이트도 미지원일 수 있다.

로컬 fake resolver/connect 테스트로 DNS 혼합 답변·peer 변경·SNI/핀ning을 검증했다. 실제 공식 사이트의 TLS 연결 성공 시험은0회이며 실제 Worker SSRF 완전 방어라고 주장하지 않는다. 향후 원격 연결을 재개할 때 강한 전송 보장과 무료 이용 가능성을 검증해야 하며 유료 프록시/VPS로 대체하지 않는다.

## 요청·입력·저장

robots의 User-Agent/Allow/Disallow/경로 우선/동률Allow/일반 wildcard·Crawl-delay를 처리한다. 본문64KiB의 보수적 부분집합이며 완전한 모든 robots 변형 지원은 아니다. robots 변경 지문·검색 실패·모호한 약관/유효기간은 차단한다. User-Agent는 AstroEventsJP와 프로젝트 GitHub URL로 식별한다.

스트림을 읽으며256KiB를 검사하고 5초 timeout/30초 HTTP 단계 deadline/외부 abort를 적용한다. 로컬 transport는 gzip/deflate/br 해제와 wire 상한을 적용하며 해제된 스트림도 별도로 검사한다. 요청 gap·호스트 gate·3회 job claim 한도·429/503 Retry-After 이월로 반복 부하를 줄인다. 입력 페이지/selector/XML을 코드로 실행하지 않고 SQL은 bind한다. DTD/ENTITY를 모두 거부한다.

후보/이미지/이력/진행 상태는 owner 조건이 있는 원자적 batch로 보존한다. 승인 취소/재심사는 Source를 review/unsupported로 바꾼다. 공개 HTTP 관리 경로·인증 헤더 전달·원문/비밀 로그가 없다. 실제 수집기/분산 일예산·장기 lease·정리 운영은 DEV09 원격 검증 전 활성화하지 않는다.
