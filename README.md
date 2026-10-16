# 별운관 운세지

졸업전시 '별운관' 부스에서 쓰는 운세지 출력 체험 웹앱입니다. 갤럭시 탭 A9+ 가로 화면과 PWA 전체 화면 실행을 기준으로 만들었습니다.

관람객이 양력이나 음력으로 생년월일을 입력하면 한국 전통 별자리인 28수 중 자신의 별자리와 오늘의 운세를 보여 줍니다.

> 지금 결과 화면의 별자리(저수 氐宿 · 너구리자리)와 운세 문구는 **시연용 고정 데이터**입니다. 실제 28수 판정과 영수증 프린터 출력은 아직 연결되지 않았습니다.

## 실행

빌드 과정이 없는 정적 사이트입니다(HTML·CSS·JavaScript ES 모듈).

```bash
python -m http.server 8765
# http://localhost:8765/
```

- `?dev=1`: 개발 모드입니다. 출력하기 버튼으로 출력 완료 화면을 시연할 수 있고, "실제 인쇄되지 않았습니다" 표시가 함께 나옵니다.
- `?dev=1&screen=birth|result|end&help=1`: 특정 화면을 바로 엽니다(화면 확인용).

## 배포

`main` 브랜치에 push하면 GitHub Actions(`.github/workflows/pages.yml`)가 GitHub Pages에 배포합니다. 이때 서비스 워커 버전에 커밋 SHA가 자동으로 들어갑니다.

## 구조

| 경로 | 내용 |
|---|---|
| `index.html` | 4개 화면과 도움말 모달 |
| `src/css/` | 디자인 토큰, 화면 비율 맞춤, 컴포넌트, 화면별 배치 |
| `src/js/domain/` | 생년월일 검증과 음력 변환, 별자리 판정(시연용), 운세 조회(시연용) |
| `src/js/ui/` | 입력 폼, 달력 선택, 도움말 모달, 별자리 아이콘 |
| `src/js/pwa.js`, `sw.js` | 서비스 워커 등록, 오프라인 캐시, 안전한 시점에만 업데이트 |
| `vendor/korean-lunar-calendar/` | 한국 음력 변환 라이브러리 v0.4.0 (MIT) |
| `public/fonts/` | 마루부리, 프리텐다드 (SIL OFL 1.1, 각 폴더의 라이선스 파일 참고) |

## 라이선스 고지

- 마루 부리 © NAVER Corp. — SIL Open Font License 1.1
- Pretendard © Kil Hyung-jin — SIL Open Font License 1.1
- korean-lunar-calendar © Jinil Lee — MIT License
- 디자인, 이미지, 로고 © 별운관
