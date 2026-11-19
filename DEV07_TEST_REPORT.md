# DEV-07 검증 보고서

기준은 708개 테스트와 기존 migration 0001~0008이다. SHA-256 감사로 기존 테스트·합성 fixture·migration 파일을 검증한다. 기존 CI 설치 검증, X 공식 가중 길이 fixture, 비밀 검사와 npm audit, staged/production Worker build, protected complete:dev를 유지한다.

## 합성 및 격리 시나리오

- 동일 URL·추적 파라미터·공식 cross-link, 일본어 전각/반각 및 punctuation, 다른 연도·회차·시간과 온라인/현장, 부대행사, 장소·주최 불일치, 개최일 미상.
- 호스트·문서·현재 revision 근거, 유사 후보 보류/거부/승인·멱등성, 이전 행사 일시의 공식 변경과 안정 ID, 구 revision의 게시글 및 callback 차단.
- JST 정확한 접수 시작과 24시간 임박·마감, 날짜-only 경계, 조기 종료·연장·재개·추가 모집 및 취소/연기 분리.
- 한 canonical 행사의 일반 공지, 실제 접수 시작, 마감 임박을 각각 저장·전달한다. 이미 일반 공지를 게시했다고 표시한 뒤 접수 시작 공지만 보류해도 확인된 마감 목적의 상태는 독립적이고 Private Issue는 하나다.
- native D1 rollback 및 재개, 공식 시설 공지 철회, 알림 부분별/uncertain 회귀, 동일 Private Issue 재사용, 두 채널의 복사용 본문 불변 및 보존.
- Telegram B의 공식 지명·요금 구분·확인되지 않은 항목과 변경 전후, GitHub App 교환 캐시·권한·만료·경합·폐기·rate limit 모의 테스트.

합성 사례에 대한 검증이며 운영 정보원의 실제 오탐률·누락률을 산정할 근거는 없다. 서로 다른 페이지라도 권위 있는 공식 관계를 입증하지 못하면 유사 후보는 검토 대기로 남는다. 데이터가 비교 범위를 넘으면 자동 병합·발행을 보류한다. [관측 및 안전 모델](DEV07_COMPLETION.md)

## 시간·비용·한도

Windows E 드라이브 격리 workerd 테스트는 `reports/dev07-d1-measurement.json`에 elapsed와 D1 rows read/written을 저장한다. 이 지표는 로컬 프로세스 시간과 D1 결과 metadata다. Cloudflare CPU 및 운영 처리량은 미측정이다. Cloudflare Free의 Workers 100,000 requests/day, 10ms CPU, 50 외부 subrequest와 D1 50 queries/invocation을 기준으로 작은 실행 단위와 CAS 예산을 계획한다. D1 Free는 계정 기준 일일 5백만 읽기 행·10만 쓰기 행·5GB 저장이고, DB당 최대 500MB다. 인덱스 변경도 쓰기에 포함된다. [Workers 한도](https://developers.cloudflare.com/workers/platform/limits/) · [D1 한도](https://developers.cloudflare.com/d1/platform/limits/) · [D1 Free 가격](https://developers.cloudflare.com/d1/platform/pricing/)

DEV-05R은 순수 게시글 생성 경로의 제한된 표본이다. 최신 전체 경로·이모지·cold 실행의 보류 사항을 유지한다. 외부 시험 전송 및 production DB 변경은 DEV-07에서 0이다. 안전 정리 전후 Dry Run과 최신 CI 및 main 동기화는 E 드라이브 보고서에 남긴다.
