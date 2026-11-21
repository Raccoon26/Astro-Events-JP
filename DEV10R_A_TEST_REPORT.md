# DEV-10R-A 격리 시험

- 기존 810개/60파일과 migrations 0001–0012·Workers 배포 설정/진입점 해시를 보존한다. 기존 collector와 검증·행사 식별·변경·예약·전국·VTuber·일본어·주말·Outbox·알림·스케줄·복구·보관·App 감사는 check에서 재실행한다.
- DNS fixture는 공인·사설 혼합, loopback, 메타데이터, 복수 DNS, IPv6-only, IPv4-mapped, 답변 수, 타임아웃 뒤 연결 차단을 검사한다. 실제 DNS 조회는 없다.
- Ephemeral loopback TLS 서버에서 신뢰·hostname·SNI·만료·불신·피어 불일치를 확인한다. 테스트의 연결 함수만 로컬 임시 포트와 임시 신뢰 인증서를 사용한다. 피어 불일치/인증서 문제 시 HTTP 수신은 0이다. 운영 코드에는 로컬 목적지·사용자 CA·포트 우회 설정이 없다.
- 기존과 추가 HTTP 시험에서 원본 URL과 redirect 어휘·origin·path·홉, 429/503·Retry-After, robots, ETag, 압축 전후 제한, 헤더 허용목록, Worker fallback 차단을 검사한다.
- Native workerd 격리 D1으로 robots 응답 중 승인 철회, 변경된 승인 아래 파싱 체크포인트 재개, 동시 owner 경합, 기존 Worker 종단 간 회귀를 검증한다. 원격 사이트·신규 원격 전송·정리 실행은 0이다.
- 로컬 경과시간과 테스트 수는 E 보고서에 기록한다. 공식 Cloudflare egress CPU와 관리형 피어·SNI가 입증됐다고 표시하지 않는다.
