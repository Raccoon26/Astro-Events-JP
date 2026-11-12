# 신규 공식 정보원 발견

기존 공식 페이지의 관련 링크·RSS/Atom alternate·sitemap·주최/협력/예약 링크에서 후보를 추출한다. 파서는 링크만 반환하며 재귀 네트워크 탐색을 하지 않는다. SourceDiscovery facade 또는 orchestrator 원자적 저장을 통해 discovery_candidates에 review로 기록한다. canonical URL UNIQUE와 기존 Source alias 검사를 사용한다. 기존 수동 심사 결과를 덮어쓰거나 자동 active로 전환하지 않는다.

기본 링크20개, sitemap depth1/자식3개이며 URL 구문·스킴·host/scope는 요청 직전 다시 확인한다. 새 외부 호스트 링크는 기존 공식 페이지에서 연결됐더라도 소유 관계가 미확인인 review다. 발견됐다는 이유로 DNS나 원문을 요청하지 않는다. 외부 URL의 텍스트/HTML 지시문은 데이터일 뿐이다.

DEV03 수동 정책/발견 검토에서 다음4개를 data/candidates.json에 추가했다. Source Seed96개/공식성77개와47현 최소 확보 수는 변경하지 않았다. 새 후보는 수집 승인/Verified 수에 포함하지 않는다.

| 현   | 발견 경로                                                                                                             | 상태                                                |
| ---- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 新潟 | [柏崎市立博物館 星空観察会](https://www.city.kashiwazaki.lg.jp/k_museum/planetarium/hoshizora_kansatsukai/index.html) | 연도별 관찰회 목록 확인, 접근 조건 review           |
| 滋賀 | [甲賀市 みなくち子どもの森 안내](https://www.city.koka.lg.jp/5999.htm)·공식 시보의夜空旅人                            | 계절별 목록 변동, review                            |
| 秋田 | [秋田県総合教育センター 천문시설 안내](https://www.pref.akita.lg.jp/pages/archive/80146)                              | 시설/교육 프로그램 안내, 현행 행사·접근 조건 review |
| 高知 | [芸西天文学習館 관측회 재개 안내](https://www.pref.kochi.lg.jp/doc/2026040700142/)                                    | 건물 공사와 관측회 운영을 구분할 근거, review       |

24개 단일 검증 출처 지역 중 新潟/滋賀/秋田의 추가 경로를 보강했지만 등록된 Source가 늘었다고 표시하지 않는다. 高知는 소규모 지역 천문시설 경로다. 기존 실패 후보 NAOJ404는 unsupported로 유지한다. 후보는 총5개(새 review4/기존 unsupported1)다.

실제 엔진 시험은 승인0개로0회다. 이 문서의 공식 원문 수동 검토/검색과 승인된 Collector 실행을 구분한다. 猫谷ここな의 공식 교차링크는 추가 확보하지 못했으며 기존 Review Required를 유지한다. VTuber 예산은 일반 천문·우주/지방 조사와 분리한다.
