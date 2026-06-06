# 작업: Secret 및 환경변수 점검

상태: Todo  
우선순위: High  
목표: 공개/공유하면 안 되는 인증 정보와 환경변수 구조를 정리

## 배경

프로젝트 루트와 `backend`에 실제 인증 파일 또는 실제 값처럼 보이는 설정이 있습니다. 외부 공유, GitHub 업로드, 배포 전 반드시 secret 관리 기준을 정리해야 합니다.

## 관련 파일

- `.env`
- `.env.example`
- `backend/.env`
- `backend/ .env.example`
- `backend/worldchallengebattle-firebase-adminsdk-fbsvc-1e9684a925.json`
- `signing-key-0xf76Bc0.json`
- `.gitignore`

## 확인할 항목

- [ ] Firebase Web config 공개 가능 범위 확인
- [ ] Firebase Admin SDK JSON 파일 제거/보관 정책 결정
- [ ] World Chain signing key 보관 방식 결정
- [ ] YouTube API/OAuth 관련 secret 위치 확인
- [ ] PostgreSQL 접속 정보 노출 여부 확인
- [ ] `.env.example`을 placeholder 값으로 교체
- [ ] `.gitignore`에 secret 파일 패턴 추가
- [ ] 로컬 개발용 `.env`와 배포 환경변수 분리

## 완료 기준

- [ ] 공개 가능한 예시 env 파일만 남음
- [ ] 실제 secret은 repo 밖 또는 배포 플랫폼 secret store로 이동
- [ ] README에 secret 설정 방법 문서화
- [ ] 기존 secret이 외부에 공유된 적 있다면 rotation 필요 여부 판단

