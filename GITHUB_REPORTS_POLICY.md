# 비공개 GitHub Reports 정책

대상은 정확히 `Raccoon26/Astro-Events-JP-Reports`다. 공개 코드 저장소를 보고서 대상으로 대체하지 않는다. 2026-11-18 읽기 전용 API 조회는 200/private=true/has_issues=true와 사용자 repository push/admin 접근을 확인했다. 이는 현재 credential의 Issues 쓰기 범위까지 입증하지 않는다. 실제 쓰기 시험·Issue 생성은 수행하지 않았고 0건이다. Private 저장소가 보이지 않으면 미존재로 단정하지 않는다.

프로토콜은 정확한 full_name/private/has_issues와 명시적 Issues 쓰기 capability를 모두 요구한다. 현재 fake의 issues_write는 모의 capability attestation이다. 실제 GitHub REST의 permissions.admin/push를 Issues 쓰기 토큰 범위로 오인하지 않는다. 후속 live adapter는 fine-grained token 또는 GitHub App의 대상 Reports 저장소 Issues:write와 Metadata:read를 별도로 검증해야 한다. 지금 새 토큰·권한은 요구하지 않는다.

Issue는 현재 행사 제목/분류/지역/장소/주최자, 일정과 정밀도, 신청/예약/요금 판단 상태, 행사 상태, 검증 근거/시각/만료, X 본문/가중 길이/태그, 이미지/권리/크레딧, 최초 발견/current revision/게시 상태/전달 snapshot을 포함한다. unknown은 그대로 표시한다. 본문은 50,000 UTF-16 단위 상한이며 과대 입력은 보류한다. 제목은 grapheme 경계로 최대 200 단위다. 멘션은 전각화하고 Markdown을 escape하며 안전 URL은 명시적 링크로, 복사용 X 본문은 충돌하지 않는 fence 안에 원문 그대로 둔다. 외부 입력은 코드나 명령으로 실행하지 않는다.

행사 ID의 SHA-256 marker를 사용하고 같은 행사 revision들은 기존 Issue 번호와 연결한다. 각 revision의 전달 키는 별도이며 per-event Issue 잠금은 신규 보고와 게시 상태 수정을 직렬화한다. 번호/marker/대상 URL/본문 echo를 검증한다. 응답 손실 후 정확한 marker와 본문을 가진 양의 수신 증거만 sent로 재조정한다. 50개 목록이 불완전하거나 중복 marker·불일치·검색 부재면 uncertain을 유지하며 두 번째 create를 하지 않는다. 향후 대규모 검색/관리 검토는 bounded cursor로 추가해야 하며 현재는 안전하게 중단한다.

GitHub Issue webhook/상태 수정/callback이 신규 행사 발견으로 역류하는 경로는 없다. origin은 verified-post만 허용한다. 실질적인 행사 의미 중복 병합과 긴급 변경 정책 확대는 DEV07이다. 실제 Issue의 오래된 상세 축약/삭제는 DEV09 보관 엔진과 별도 승인 범위이며 이번에 원격 데이터를 변경하지 않는다.

공식 참조: [Issues REST](https://docs.github.com/en/rest/issues/issues), [repository metadata](https://docs.github.com/en/rest/repos/repos#get-a-repository). 이메일 조건은 [이메일 안내](GITHUB_EMAIL_NOTIFICATION.md)와 분리한다.
