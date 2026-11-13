# DEV04 검증 아키텍처

DEV03 EventCandidate → CandidateEventValidator.validate(Event) → Validation → verify(Validation) / VerificationStore.verified(eventId) → DetailedVerifiedEvent 순서다. 기존 15개 계약과 EventValidator/FacilityMonitor 메서드는 보존한다. 새 타입은 하위 호환 선택 필드와 검증 메타데이터로 확장한다. 배포 Worker 진입점은 검증기를 호출하지 않는다.

## 근거와 신뢰 경계

단순 URL/문자열/Verified enum은 증명이 아니다. DEV03의 후보·원문 URL·fingerprint·문서 digest/changed_at, 현재 Source Registry 승인, 명시적인 공식 근거 검토 패킷을 함께 요구한다. 패킷은 공식 발췌를 직접 확인한 관리자의 수동 attestation이며 다운로드한 전체 문서나 자동 사실 증명이 아니다. document.digest는 제한된 발췌의 SHA256, version은 검토 문서 버전, 별도 collection_documents digest는 수집 본문의 지문이다. 이 차이를 감사에서 보존한다. 외부 재요청은 하지 않는다.

패킷에는 후보/source/fingerprint, 이유, 확인 시각, 행사와 공지 주체의 관계 및 그 근거, 최대4문서/24필드주장/8이미지/8VTuber가 필요하다. 24KiB 패킷·문서4096자·인용1024자·후보64KiB·JSON 깊이14/노드1500/배열100 한도를 둔다. 원문이 변경된 후 다시 관측되지 않은 과거 후보는 재승인할 수 없다. 게시일은 개최일의 대체 값이 아니다. 상충하는 공식 필드는 Review Required다.

## 영속화와 출력

0005는 verification_decisions의 불변 결정·원문 버전·필드 근거·규칙·만료·snapshot과 events의 candidate/decision 연결·날짜 정밀도, 시설 공지 revision/history를 더한다. 결정당 하나의 D1.batch가 decision → Event → revision/images → candidate generation 순으로 실행된다. 마지막 generation 갱신과 모든 문장의 CAS 조건이 원본/fingerprint·Source/approval·원문·시설/공지/연결·VTuber·환경 identity를 검사한다. 임의 nonce로 경쟁 실행의 패배자가 승자의 자식 행을 쓰지 못하게 한다. SQL 실패는 전체 rollback, CAS 실패는 쓰기0으로 종료한다. 재실행은 같은 패킷이면 멱등적이다.

출력은 현재 후보/문서/승인/시설을 재로드하고 저장 패킷을 다시 평가하며 Event 실제 열과 결정 projection을 대조하고 최종 CAS read를 한다. 메모리 validate 결과도 WeakMap seal로 위조/수정/문맥 변경을 거부한다. OFF/구버전 스키마/만료/승인 철회/오래된 fingerprint는 null이다. 후속 DEV05~07은 enum-only SELECT 대신 이 게이트를 사용해야 한다. 읽기 직후 외부 변경과 후속 전송 사이의 경쟁은 DEV06/07의 outbox/전송 직전 재검증으로 다룬다.

## 배치와 분리

CollectionStore.listForVerification은 기존 최대50행 커서를 유지한다. VerificationStore.pending도 최대50행이며 general/VTuber를 분리하고 문서/정책 snapshot 변경·만료·review를 재검증 대상으로 반환한다. 단일 후보 검증/commit은 작은 작업 단위다. 전국 데이터를 Worker1회에서 처리하지 않는다. 실제 계정 예산 미확인은 commit을 차단하며 CLI의 --local-budget은 로컬 전용 attestation이다. 원격 예산으로 간주하지 않는다.

[판정 정책](VERIFICATION_POLICY.md), [시설](FACILITY_VERIFICATION.md), [이미지](IMAGE_RIGHTS_POLICY.md), [검사 보고](DEV04_TEST_REPORT.md)를 참조한다.
