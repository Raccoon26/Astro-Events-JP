# DEV06 로컬 알림 시스템 완료 근거

구현 범위는 현재 Verified/Post 게이트, 전13종 Telegram 복사/관리 메시지와 Private Issue 렌더링, 게시완료/보류/재확인 인증·멱등 처리, 채널/부분별 Outbox·lease·uncertain 복구·callback ack·상태 수정·로컬 CLI·이메일 준비 진단이다. 실제 전송 어댑터/Secret 등록/원격 migration/실제 발송·운영 활성화는 이번 범위에서 제외한다. [설계](NOTIFICATION_DESIGN.md), [검사](DEV06_TEST_REPORT.md), [전13종 합성 샘플](NOTIFICATION_SAMPLES.md), [요구감사](dev06-coverage.json)를 참조한다.

기존 0001~0007과 597개 목적을 보존하고 0008을 추가한다. schema/identity gate로 원격0004에서는 신기능을 실행하지 않는다. PostStore.get/NotificationService 등 기존 필수 계약을 유지하며 전달 직전 현재 근거/승인/버전/만료/이미지 생존 증거를 다시 확인한다. 모의 posted는 simulation provenance로 구분하고 실제 게시 확인으로 집계하지 않는다.

현재 실제 Source 승인0, 실제 사이트 수집/검증행사/게시/제품알림0, Collection/Notifications=false, Workers peer/TLS fail-closed와 production Cron0을 유지한다. Source96/공식77/47현/시설92/VTuber4 및 猫谷ここな 관계 미확인도 그대로다. 이 단계에서 production 또는 Cloudflare 인증/Secrets를 변경하지 않는다.

Reports 읽기 권한과 Private/Issues 활성화는 확인했지만 credential의 실제 Issues 쓰기와 이메일 전달은 미검증이다. subscription 404는 미구독 또는 인증 API 제약으로 해석을 보류한다. 사용자에게 지금 Bot Token/권한을 추가 요청하지 않는다. 향후 별도 승인된 수신 시험 때만 최소 설정을 안내한다.

기존 DEV05R CPU P99 6.364ms/최대8.770ms/관측140·누락30/emoji P99 8.770ms/최종 코드 재실측 미완료를 보존한다. 이는 DEV06 전체 파이프라인 CPU 보증이 아니다. 이번 원격 진단·신규 migration은 수행하지 않는다. DEV07~10의 의미적 중복/변경·전국균형·3시간운영·보관정리·실운영 검증은 후속 범위이며 자동 시작하지 않는다.

최종 테스트 수·PR/CI/개발 SHA·병합 main SHA·전체 변경 파일은 GitHub 완료 절차 후 E reports/DEV06_FINAL.json과 최종 보고에 기록한다. 병합/원격 기능에 관한 완료 주장은 실제 조회 결과와 구분한다.
