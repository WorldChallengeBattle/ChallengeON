# 작업: DB 마이그레이션/운영 문서

상태: Todo  
우선순위: Medium  
목표: PostgreSQL 운영 DB 초기화, 마이그레이션, 점검 절차 문서화

## 배경

현재 `backend/schema.sql`과 여러 migration script가 존재합니다. 운영 환경에서 어떤 순서로 적용해야 하는지 문서화가 필요합니다.

## 관련 파일

- `backend/schema.sql`
- `backend/migrate-donations.js`
- `backend/migrate-hashtags.js`
- `backend/migrate-is-active.js`
- `backend/migrate-official-status.js`
- `backend/migrate-sea-region.js`
- `backend/migrate-video-titles.js`
- `backend/check-db.js`
- `backend/check-counts.js`
- `backend/seed-top-challenges.js`
- `backend/seed-shorts.js`

## 문서화할 항목

- [ ] 신규 DB 생성 방법
- [ ] `schema.sql` 적용 방법
- [ ] migration script 실행 순서
- [ ] seed script 실행 기준
- [ ] 데이터 백업 방법
- [ ] 운영 배포 전 DB health check
- [ ] rollback 또는 수동 복구 기준

## 완료 기준

- [ ] 새 환경에서 DB를 재현할 수 있음
- [ ] migration 순서가 명확함
- [ ] seed와 sync 작업의 차이가 문서화됨
- [ ] 운영 점검 명령어가 정리됨

