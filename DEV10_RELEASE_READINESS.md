# DEV-10 릴리스 판정 기준

## A 코드와 검증

작업 범위는 비공개 Worker 진입 경계, 합성 end-to-end, 보안과 비용 판단, 기존 제품 보존 및 성능 측정 준비다. 최종 PR HEAD의 quality, 보호 병합, 원격과 로컬 main 일치 증거로 A 완료 여부를 판단한다. A가 모두 충족되면 **CODE_READY / OPERATIONS_PENDING**이다.

## B 제한 staging 실증

필요한 별도 승인과 현재 원격 미충족 항목은 staging 스키마, 피어 입증, 소수 Source 승인, 경로별 공식 CPU, Observability 계정 사용량, 실제 App 최소권한, 제한 수신, 장애 재개, 원격 rollback이다. 기존 진단 staging 배포와 Health는 이 실증에 대한 증거와 구분한다. B 실증과 A 완료 뒤 **STAGING_VALIDATED / PRODUCTION_PENDING**을 검토한다.

## C Production 승인

사용자가 위험·비용·배포·활성화·복구 절차를 승인한 뒤 실제 배포 승인 조건, 단계별 Source/Cron/알림 및 중지 수단을 검증한다. A/B/C 증거를 모두 확보하면 **PRODUCTION_READY**를 검토한다. A의 필수 증거가 실패했거나 확인되지 않으면 **BLOCKED**다. 판정은 운영 플래그나 배포 권한을 변경하는 기능과 독립적이다.
