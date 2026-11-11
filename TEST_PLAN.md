# 테스트와 증거

npm run check는 preflight→소스/테스트타입→Biome lint/format→Vitest→Wrangler bundle dry-run→Secret/금지파일scan+npm audit high→요구/문서감사 순서이다. 실제 CI 검사명은 quality이다. 실패시 보호/검사를 제거하지 않고 수정한다.

| DEV00 검증       | 방식                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| 타입/빌드/스타일 | Workers와Node테스트 설정분리, tsc·Biome·Wrangler dry-run                                           |
| 스키마           | sql.js 실제SQLite마이그레이션·integrity/FK·권리/UNIQUE·독립지문·미래/unknown/진행중/최근 보존      |
| 실제로컬D1       | Wrangler local migrations apply; 원격은 미검증                                                     |
| 보안기초         | SSRF구문·host·HTMLescape·오류비노출·예산경계·환경검증                                              |
| 경로/정리        | 실제E preflight, 격리fixture의 missing-drive/wrong-cwd·DryRun보존·제한삭제·외부/변경/소유/링크거부 |
| 요구/문서        | R01~32·원요청0~24 매핑·담당DEV·증거·필수문서·11단계·15계약                                         |
| GitHub           | 인증/visibility/기존상태·Reports private 재조회·push/PR/CI·보호/병합 실증                          |

기계문서감사는 의미완전성을 증명하지 않는다. 원요청과 REQUIREMENTS를 다시 읽고 모든 범주·이미지권리·일본어/해시태그·Telegram/메일/privateIssues·중복·보관·무료·E/정리·Git자동완료를 로드맵과 대조한다.

DEV03은 DNS/redirect/body/timeout/429/robots fixture, DEV04는 날짜/공식취소/이미지권리, DEV05는 일본어/X공식가중길이, DEV06은 응답소실/멱등callback/실메일, DEV07은 연례/회차/경쟁, DEV08은47현/범주균형, DEV09는 한도/복구/보관경계, DEV10은 실운영통합을 추가한다.

물리드라이브를 뽑는 시험은 하지 않는다. missing-path는 하드웨어분리 시험과 다르다. Cloudflare계정/실CPU/원격D1, 실Telegram/메일은 DEV01/06에 검증하며 현재 성공으로 표시하지 않는다. 실제결과는 PROJECT_STATUS에 기록한다.
