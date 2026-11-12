# 파서 지원 범위

| 형식    | 구현·검증                                                                                               | 제한                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| RSS2    | channel/item, title/link/description/pubDate/guid, enclosure·media thumbnail/content, 일반 namespace    | RSS1/RDF·JSON Feed 미지원. 링크 없는 항목은 보류/제외                                                                 |
| Atom    | feed/entry, id/title/alternate link, summary/content, published/updated, entry author 이름·prefix/XHTML | 공식 호스트·승인 범위 밖 링크는 행사 후보로 사용하지 않음                                                             |
| HTML    | 일반 li/article/card/table, 제목·상세 URL·날짜/장소 원문·time·이미지, detail-page 및 selector 설정      | 모든 사이트 공통 selector를 보장하지 않음. 신뢰된 adapter 설정의 단순 tag/class/id/속성/descendant/child/group만 허용 |
| Sitemap | urlset/index, loc/lastmod, 관련 URL 후보·중복/순환·깊이 제한, 내부 커서                                 | 모든 URL을 방문하지 않음. lastmod는 참고 근거이며 실제 변경/행사 일시가 아님                                          |

htmlparser2/css-select/domutils/domhandler와 saxes를 정확한 버전으로 잠갔다. saxes6의 오래된 .d.ts는 앱의 exactOptionalPropertyTypes와 호환되지 않아 좁은 sax-runtime JS/.d.ts 경계로 격리했다. 앱 타입 검사를 완화하지 않았으며 XML 공격 fixture 및 실제 workerd 실행으로 런타임 계약을 검증한다.

XML DTD/ENTITY 선언을 전부 거부하고 외부 엔터티·네트워크 해석을 하지 않는다. UTF-8을 기본으로 HTTP charset/HTML meta/XML declaration을 확인한다. Shift_JIS/windows-31j 별칭, EUC-JP/ISO-2022-JP는 TextDecoder가 제공하는 범위에서만 지원하며 불명 인코딩·손상 바이트는 invalid-encoding이다. UTF16/BOM·특수 피드 변형은 현재 미지원이다. HTML entity는 파서에서 처리하며 script/style을 실행하지 않는다.

표시용 일본어와 NFKC 비교용 제목을 분리한다. 공백을 정돈하되 원문 숫자/회차·문자 표현을 표시 데이터에 보존한다. 제목512/설명600 문자 등 짧은 후보만 저장한다. 날짜로 보이는 여러 표현을 raw 배열로 남기고 pubDate/published를 행사 시작 시각으로 바꾸지 않는다. 후보는 항상 Review Required이고 추출 신뢰도는 최종 검증 상태가 아니다.

og:image/twitter:image/img/공식 포스터 링크를 추출한다. poster→key-visual→representative 순이며 Source/승인된 이미지 호스트만 허용한다. 이미지 파일을 요청하거나 D1에 저장하지 않는다. rightsStatus=unknown, rightsEvidenceUrl/attribution=null, available=null은 아직 생존/권리를 확인하지 않았다는 뜻이다. 사라진 이미지가 후보 삭제로 이어지지 않는다. 시설 홍보 사진 재사용은 별도의 권리 근거가 없으면 추천하지 않는다.

headless browser/JavaScript 실행/로그인/CAPTCHA/유료벽 우회·PDF/OCR 본문 파싱은 없다. JS-only 페이지는 unsupported-format이다. 공식 RSS/HTML/sitemap/주최자 대체 경로를 review로 발견할 수 있다. VTuber의 일상 방송/잡담은 제외하고 특별·기념·협업·오프라인·굿즈/예약 공지를 우선한다. X 전체 타임라인·유료 X API는 사용하지 않는다.
