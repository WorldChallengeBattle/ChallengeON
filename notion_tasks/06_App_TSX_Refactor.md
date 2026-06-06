# 작업: `App.tsx` 컴포넌트/훅 분리

상태: Todo  
우선순위: Medium  
목표: 거대한 `App.tsx`를 기능별 컴포넌트와 hook으로 분리하여 유지보수성 개선

## 배경

`src/App.tsx`에 인증 후 처리, claim, 챌린지 목록, 영상 목록, 투표, 프로필, 모달, 스크롤, UI 렌더링이 집중되어 있습니다. 기능 추가와 디버깅 비용이 빠르게 증가할 수 있습니다.

## 관련 파일

- `src/App.tsx`
- `src/services/challengeService.ts`
- `src/contexts/AuthContext.tsx`
- `src/components/CameraCapture.tsx`
- `src/components/VideoPlayer.tsx`

## 분리 후보

- [ ] `components/layout/AppHeader.tsx`
- [ ] `components/layout/BottomNav.tsx`
- [ ] `components/challenges/ChallengeCard.tsx`
- [ ] `components/challenges/ChallengeSections.tsx`
- [ ] `components/modals/JoinChallengeModal.tsx`
- [ ] `components/modals/SubmitLinkModal.tsx`
- [ ] `components/profile/ProfileView.tsx`
- [ ] `components/rankings/RankingsView.tsx`
- [ ] `hooks/useChallenges.ts`
- [ ] `hooks/useChallengeVideos.ts`
- [ ] `hooks/useOnboardingClaim.ts`
- [ ] `hooks/useUserVotes.ts`

## 완료 기준

- [ ] `App.tsx`는 routing/state composition 중심으로 축소
- [ ] 각 탭 UI가 별도 컴포넌트로 이동
- [ ] claim 로직이 hook으로 분리
- [ ] 기존 빌드 성공 유지
- [ ] 기존 기능 동작 변화 없음

## 주의사항

- 한 번에 전체를 바꾸기보다 탭 단위로 나누는 것이 안전합니다.
- 리팩터링 중 UI 스타일 변경은 최소화합니다.

