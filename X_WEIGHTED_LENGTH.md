# X 공식 가중 길이

[공식 twitter-text](https://github.com/twitter/twitter-text), [v3 설정](https://github.com/twitter/twitter-text/blob/master/config/v3.json), [conformance](https://github.com/twitter/twitter-text/tree/master/conformance)를 사용한다. runtime twitter-text3.1.0·twemoji-parser11.0.2를 exact 고정하고 v3 설정을 한 파일에서 사용한다. 최대280, URL 변환23, scale100/defaultWeight200 및 예외 ranges, NFC·emoji 규칙을 공식 parseTweet로 계산한다. JavaScript text.length나 단순 문자 slice로 게시 가능 여부를 결정하지 않는다.

공식 커밋30e2430d90cff3b46393ea54caf511441983c260의 validate.yml/config/LICENSE를 바이트 그대로 보관하고 SHA256을 검사한다. Biome는 이 vendor 디렉터리를 수정하지 않는다. v3 discounted emoji22사례·방향문자2사례의 공식 계산과 이전v2 weighted20사례를 각각 맞는 설정으로 대조한다. 프로젝트 publication 정책은 방향/제어 문자에 대해 공식 길이 규칙보다 엄격하다. 원본의 UTF16 표시 인덱스는 NFC/NFD에서 다를 수 있고 가중 길이는 동일하다.

추가 시험은 일본어/한자/가나·반각/전각·영문/숫자·기호·줄바꿈·URL/긴URL/복수URL/일본어 구두점·태그/멘션·emoji/VS/skin-tone/ZWJ/국기·보충평면·NFC/NFD·279/280/281·잘못된 Unicode를 포함한다. 공식 파서의 과거 emoji 인식 범위를 넘는 invisible-joiner 조합은 안전하게 거부한다. 현재 X 서버의 모든 비공개 규칙이나 미래 변경을 보증하지 않는다. 패키지/설정 변경에는 새 정책버전·원본 fixture 대조·전체 회귀가 필요하다. X Premium 긴 글을 사용하지 않는다.

본문은 공식 URL을 한 개 포함하고 일반 데이터 필드의 URL/멘션/태그 주입을 거부한다. URL이 공식 추출기에 정확히 한 개로 인식되지 않으면 보류한다. 전체 본문·태그·공백·줄바꿈을 함께 계산한다. 길이 초과 시 간결한 전체 문장 템플릿→개장/정원/요금 등 선택 블록 생략→두 번째 태그 생략을 적용한다. 제목·날짜 역할·상태·장소·핵심 예약/선택 조건·공식 URL·태그 한 개는 유지한다. 그래도 초과하면 essential-info-too-long이며 저장하지 않는다. 생략은 필드 단위로 이유를 기록한다.

공식 구현은 오래된 core-js2/punycode 의존성 경고가 있다. 검사 시 npm audit 결과를 별도 확인하며 경고를 취약점0과 혼동하지 않는다. browser bundle과 실제 격리 workerd에서 실행을 검증한다. 플랫폼 CPU는 로컬 elapsed와 구별한다.

## ES2022 Workers 번들

공식 twitter-text의 알고리즘은 그대로 사용한다. Workers 전용 bundle에서만 이미 ES2022에 포함된23개 core-js2 side-effect import를 native-compat의 기본기능 검사로 치환한다. NFC/가중/emoji/URL 계산을 대체하거나 생략하지 않는다. 공식44사례는 Miniflare workerd의 minified/native bundle에서도 모든기대필드가 일치하며 core-js global initializer가 없는지 검사한다. 로컬 일반 패키지 경로도 별도 conformance를 유지한다. 미지원 런타임은 fail-closed이며 유료서비스를 추가하지 않는다.

## Emoji 없는 문자 부분집합의 동등 경로

잠재emoji가없는제한된ASCII/일본어범위에서만공식parseTweet의emoji탐색을생략한다. 최대길이/URL변환/NFC/가중/range/유효성검사는동일한공식알고리즘이다. ©/®/〰/〽/㊗/㊙·keycap/VS/ZWJ/국기/보충평면등은full공식경로다. 허용범위전체를100자씩원본emoji-enabled구현과대조하고공식fixture/실제native workerd에서도대조한다. 과대8KiB초과fixture는공식원본검사와프로젝트입력거부를각각확인해입력제한을약화하지않는다.
