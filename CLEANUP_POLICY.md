# 안전 정리

기본 npm run cleanup은 Dry Run이다. 실제 E드라이브와 정확한repo·조상경로 링크를 검사하고 E:/Astro-Events-JP/reports/cleanup-<timestamp>.json에 기록한다. C/D 전체순회 없이 C:/Astro-Events-JP, D:/Astro-Events-JP의 존재만 보고한다. 다른경로 잔여물이 없다고 보장하지 않는다. npm/Wrangler 경로는 wrapper와 환경설정에서 E로 통제한다.

허용목록은 createOwnedTemp로 직접 생성한 E:/Astro-Events-JP/temp/astro-<UUID>.tmp 파일뿐이다. owner=astro-events-jp, regenerable=true, 생성시SHA256 등록 manifest는 reports/owned-files.json이다. 연결·소유·정확한부모경로·정규화/realpath·모든조상 symlink/junction·regularfile·hardlink개수1·내용해시를 검사한다. 변경/불명/외부/링크/디렉터리는 거부한다.

실삭제는 npm run cleanup -- --apply를 명시했을 때 위 파일에만 허용한다. C/D후보·공용캐시·개인파일·다른프로젝트·시스템/Windows설정은 report-only이며 별도소유확인과 사용자승인 없이는 삭제하지 않는다. 도구에는 C/D삭제 기능이 없다. 전체드라이브 재귀삭제/링크경유삭제는 금지한다.

시험은 E temp 아래 새 astro-test-* 격리디렉터리에서 한다. fixture teardown의 재귀삭제는 테스트가 직접 생성한 검증된 root에 한정한다. 실제 C/D/사용자파일로 실패시험하지 않는다. 개발전후 보고를 남기며 불명확한 파일은 후보로만 기록한다.
