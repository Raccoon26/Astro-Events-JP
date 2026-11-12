# 정보원·이미지 정책

등록 후보는 공식기관/시설/주최/공식VTuber 사이트이다. JAXA, 国立天文台, 国立極地研究所, JAMSTEC 및 전국 대학은 초기 후보이며 수집범위를 제한하지 않는다. 47개 현별 정보원과 시정촌을 확장한다. 지역 천문대·과학관·플라네타륨·도서관·공민관·교육위원회·동호회·축제도 같은 등록·검증 절차를 사용한다. 비공식 검색결과는 discovery 후보로만 사용하고 최종 근거는 공식 출처로 검증한다.

등록 심사는 운영주체/공식성·공개대상 행사·robots.txt·이용조건·라이선스·허용host·현/시정촌·RSS유무·소스간격·본문크기·지원파서·DNS/리다이렉트 안전성을 확인한다. 승인 전 state=review, 자동 discovery는 승인 없이 active로 바뀌지 않는다. 소스별 최소 간격과 Retry-After를 준수하고 수집자 User-Agent/연락정책은 공개정보 범위에서 DEV03 확정한다. 접근차단/로그인/유료벽을 우회하지 않는다.

RSS/Atom→공식HTML→공식사이트맵 순이다. 링크추적 깊이/개수/host를 제한하고 robots와 재시도도 예산에 포함한다. 지정host의 하위도메인을 자동허용하지 않는다. 공식 호스트 변경은 재심사한다. JS 렌더링·대형PDF·OCR·캡차·로그인 필요 사이트는 discovery_candidates의 unsupported와 state_reason으로 관리하고 공식 대체 피드를 찾는다. robots가 허용되지 않거나 약관이 불명확하면 보류한다.

宇推くりあ·月女神イチ·猫谷ここな·星見まどか는 초기 인물 후보이다. DEV00에서는 공식계정을 추측해 seed하지 않는다. DEV02 결과는 VTUBER_VERIFICATION.md와 data/vtubers.json에 기록한다. 확인계정도 자동활성화하지않으며 猫谷ここな는 추가공식연결검토가필요하다. 새 인물도 같은 구조로 추가한다. 지정인물은 비천문 팬행사·굿즈·팝업 등도 포함하지만 일상방송/개인잡담은 제외한다. VTuber 예산이 천문학/우주/지방소스 최소할당을 소모하지 않게 한다.

이미지는 공식포스터, 키비주얼, 대표이미지, 허가된시설사진 순으로 찾는다. image_rights_status=permitted는 이용조건/허가근거URL과 필요한 attribution이 확인된 경우만 가능하다. unknown/prohibited는 재업로드용으로 추천하지 않으며 출처페이지 링크를 전달한다. URL 존재 확인과 권리 검증은 별개이다. 원본URL·출처·권리·크레딧은 Report에 포함하고 삭제/404는 available=false로 표시한다. 이미지 실패로 행사 자체를 삭제하지 않는다. 이미지 파일은 저장하지 않는다.

DEV02의공식성/robots/이용조건/파서승인을분리하고미확인정책은review로둔다. [등록가이드](SOURCE_REGISTRY.md), [전국검토보고](SOURCE_COVERAGE.md), [Seed관리](SEED_GUIDE.md)를따른다. Solar의이용규약은방문규칙, JAMSTEC/JAXA는링크와콘텐츠/이미지재이용조건이별개임을확인했으므로일반SNS재게시/자동수집허가로해석하지않았다.

## DEV03 수집 승인

실제 active는 계속0이다. CollectionStore.approve는 공식 주체·URL·robots/약관·scope/host·형식·간격·유효기간·성공한 시험 근거를 명시적으로 요구한다. approve/review CLI는 기본DryRun이며 실제 파일 근거 없이 결과를 만들지 않는다. approve는 inactive Source를 자동 시험하지 않는다. robots404는 개별 absence 승인 없이는 수집 허가가 아니다. robots 지문이 바뀌거나 심사가 만료되면 재검토한다. review/unsupported 재심사는 기존 active를 차단한다.

실제 NAOJ 정책 검토는 원문 이용규정 확인/robots 확인 불가로review다. 수집기 실전 시험은0이며 합성 fixture의 승인을 실제 사이트 승인에 포함하지 않는다. 파서와 접근의 기술적 제약은 [PARSER_SUPPORT](PARSER_SUPPORT.md)와 [SSRF_SECURITY_AUDIT](SSRF_SECURITY_AUDIT.md)를 따른다.
