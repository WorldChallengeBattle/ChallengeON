# 작업: API Base URL 환경변수화

상태: Todo  
우선순위: Medium  
목표: 프로덕션 API URL 하드코딩 제거

## 배경

현재 `src/config/api.ts`에서 production API base URL이 직접 하드코딩되어 있습니다. 배포 환경별로 API 서버가 달라질 수 있으므로 환경변수 기반으로 전환해야 합니다.

## 관련 파일

- `src/config/api.ts`
- `.env.example`
- `vite.config.ts`
- `README.md`

## 현재 구조

```ts
const isDev = import.meta.env.DEV;

export const API_BASE = isDev
  ? ''
  : 'http://211.205.183.23:8080';
```

## 변경 방향

- [ ] `VITE_API_URL` 우선 사용
- [ ] 개발 환경에서는 proxy 사용 가능
- [ ] 값이 없을 때 명확한 fallback 또는 오류 메시지 제공
- [ ] `.env.example`에 `VITE_API_URL` 추가
- [ ] README에 로컬/배포별 설정법 작성

## 완료 기준

- [ ] 코드에 운영 IP 하드코딩 없음
- [ ] 로컬 개발에서 `/api` proxy 정상 동작
- [ ] 배포 빌드에서 환경변수 기반 API 호출 정상 동작

