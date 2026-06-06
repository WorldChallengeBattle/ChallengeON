# 작업: YouTube 업로드 E2E 테스트

상태: Todo  
우선순위: High  
목표: 브라우저 카메라 녹화부터 YouTube 업로드, DB 저장, 피드 재노출까지 검증

## 배경

`CameraCapture`에서 녹화한 영상을 백엔드 `/api/videos/upload`로 전송하고, 백엔드는 YouTube 업로드 후 `challenge_videos`에 저장합니다.

## 관련 파일

- `src/components/CameraCapture.tsx`
- `src/App.tsx`
- `backend/server.js`
- `backend/youtube-setup.js`
- `backend/schema.sql`

## 테스트 시나리오

- [ ] 챌린지 선택
- [ ] 카메라/마이크 권한 요청 확인
- [ ] 녹화 시작/정지 확인
- [ ] 업로드 요청 body 확인: `video`, `challengeId`, `author`
- [ ] 백엔드 multer 저장 확인
- [ ] YouTube API 업로드 성공 확인
- [ ] 반환된 YouTube URL 확인
- [ ] `challenge_videos` insert 확인
- [ ] 프론트엔드 피드에서 새 영상 노출 확인
- [ ] 업로드 실패 시 사용자 오류 메시지 확인

## 완료 기준

- [ ] 실제 YouTube 계정에 영상 업로드 성공
- [ ] DB에 영상 row 생성
- [ ] 앱 내 챌린지 상세 영상 목록에 반영
- [ ] 임시 업로드 파일 정리 정책 확인

## 리스크

- YouTube OAuth 권한/토큰 만료
- 업로드 quota 제한
- 모바일 브라우저 카메라 권한 차이
- World App WebView에서 MediaRecorder 지원 여부

