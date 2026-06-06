# 작업: 번들 크기 최적화

상태: Todo  
우선순위: Medium  
목표: Vite 빌드의 대형 chunk 경고를 줄이고 초기 로딩 성능 개선

## 배경

`npm run build`는 성공하지만 Vite가 500 kB를 넘는 chunk 경고를 출력합니다.

## 빌드 결과 메모

```text
dist/assets/index-BNTTXo8x.js   1,076.22 kB | gzip: 326.90 kB
Some chunks are larger than 500 kB after minification.
```

## 관련 파일

- `src/App.tsx`
- `src/main.tsx`
- `vite.config.ts`
- `package.json`

## 개선 후보

- [ ] 탭 단위 lazy loading 적용
- [ ] 카메라/영상 업로드 컴포넌트 lazy loading
- [ ] Web3/MiniKit 관련 무거운 로직 분리
- [ ] framer-motion 사용 범위 점검
- [ ] Vite/Rolldown output chunk 설정 검토
- [ ] bundle analyzer 도입 여부 검토

## 완료 기준

- [ ] 주요 initial chunk 크기 감소
- [ ] 빌드 경고 해소 또는 허용 기준 문서화
- [ ] 앱 초기 화면 로딩에 필요한 코드만 우선 로드
- [ ] `npm run build` 성공

