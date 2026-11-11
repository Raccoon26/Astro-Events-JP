# Seed 관리 및 Import

data/prefectures.json / sources.json / facilities.json / vtubers.json / candidates.json은실제공개정보의검토스냅샷이다. 테스트용example주소는tests에만있다. 각Source는고정ID·원본URL·근거URL·검토시각·확인방법·robots/약관상태·접근실패사유를가진다. JPA공식디렉터리발견만으로Verified처리하지않고원본기관의이름/내용또는주체간공식연결을대조했다. directHTTP와검색서비스의공식원문확인은verificationMethod로구분한다. 원문접근실패를성공으로기록하지않는다.

Windows에서 E:/Astro-Events-JP/repo로이동하고 scripts/environment.ps1을먼저불러온다.

```powershell
npm run seed:validate
npm run seed:init
npm run seed:import
npm run seed:import -- --apply
npm run registry:list -- --prefecture 29
npm run registry:list -- --category vtuber --state unsupported
npm run registry:stats
npm run registry:coverage
```

init만별도의명시적스키마생성이다. Import기본DryRun은데이터/marker/스키마를쓰지않으며미초기화DB에서는실패한다. apply는로컬staging만허용하고production/--remote를거부한다. 별도Miniflare 저장소 E:/Astro-Events-JP/cache/registry/staging를사용하며기존Wrangler staging/production과공유하지않는다. Miniflare5의resourcePersistencePath를명시해프로세스간영속성을확인했다. local이름/내부marker를검사하고전체Seed의중복·구문·참조를쓰기전에검증한다. 기존DB를수동으로다른환경으로바꿨다면사용을중단한다.

각새Source와연결시설/metadata/URL/history는D1 batch의원자적단위다. 인물및검토후보는독립단위로먼저등록한다. 뒤단위가실패하면완료단위는남고실패단위는rollback한다. 전체Seed를한Worker호출/거대트랜잭션에넣지않으며같은명령을재실행해미완료단위만추가한다. DB오류를무시하지않는다. 기존Source/시설/인물/수동심사는insert-only로덮어쓰지않는다. ETag/Last-Modified/실패횟수/비활성상태/조사예약이보존된다. Seed수정은기존운영행을업데이트하지않으므로의도한정정은관리API를통해명시적으로적용한다.

list는최대100행, --cursor 마지막ID로이월한다. stats는로컬DB의실제집계이고registry:coverage는저장소Seed의검토현황이다. 서로다른스냅샷이므로구분한다. report는E reports에기록한다. data/coverage.json은registry:coverage로재생성하고전국보고서를동시에갱신한다. URL변경에도ID/참조는유지한다. 원문전체/이미지파일/인증정보/개인연락처는Seed에저장하지않는다.

scripts/research-sources.mjs는검토한Seed목록만대상으로명시적flag를요구하는1회조사도구다. robots를먼저확인하고불명/금지시본문요청을중단한다. 5초/256KiB상한·수동redirect·공개IPv4검사를사용하며재귀탐색/로그인우회는없다. 수집파서나완성된DNS rebinding방어가아니며Worker/CI에연결하지않는다. 재조사는수동근거와상태변경을검토하고coverage를재생성해야한다. 정기수집은DEV03이별도검증한다.
