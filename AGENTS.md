# AGENTS.md — 별운관 운세지 (byeolungwan-fortune-slip)

> 코딩 에이전트(Codex 등)가 이 저장소에서 작업할 때 지켜야 할 규칙과 핵심 맥락입니다.
> 작업 이력, 현재 상태, 남은 일, 검증 방법은 **[docs/HANDOFF.md](docs/HANDOFF.md)** 에 자세히 있습니다. 작업을 시작하기 전에 꼭 읽어 주세요.

## 프로젝트 한 줄 요약

졸업전시 '별운관' 부스의 갤럭시 탭 A9+에서 관람객이 생년월일을 입력하면, 한국 전통 별자리 28수와 오늘의 운세를 보여 주고 GOOJPRT PT-210A 블루투스 감열 프린터로 운세지를 출력하는 정적 PWA입니다.

- 배포: https://pj202606-nn.github.io/byeolungwan-fortune-slip/ (개발 모드 `?dev=1`)
- 저장소: https://github.com/pj202606-NN/byeolungwan-fortune-slip (`main`에 push하면 GitHub Actions가 Pages로 자동 배포)
- 빌드 도구 없음: HTML · CSS · JavaScript ES 모듈. 모든 경로는 상대 경로입니다(GitHub Pages 하위 경로에서 동작).

## 사용자와 일하는 방식

- **설명과 보고는 한국어 존댓말로 합니다.** 코드·파일명은 원문 그대로 써도 됩니다.
- **commit과 push는 사용자가 그 작업에서 허용했을 때만 합니다.** 허용은 요청 한 건에만 적용됩니다. 허용이 없으면 수정과 로컬 검증까지만 하고, 배포할지 물어봅니다.
- 요청 범위 밖의 디자인 변경, 문구 추가, 장식 추가, 리팩터링을 하지 않습니다. 디자인을 바꿔야 할 이유가 생기면 먼저 보고합니다.
- 확인하지 않은 것을 확인한 것처럼 보고하지 않습니다. 자동화 검증과 실제 태블릿·프린터에서 확인할 일은 나눠서 적습니다.
- 데이터, 판정 규칙, 운세 문구를 임의로 만들지 않습니다. 없는 파일이나 값은 없다고 보고합니다.

## 절대 바꾸지 말 것 (실기기에서 검증 완료)

1. **PT-210A 전송·급지:** `src/js/print/pt210a-ble.js`, `src/js/print/escpos.js`, `src/js/print/print-service.js`의 전송 부분
   - Service `49535343-fe7d-4ae5-8fa9-9fafd205e455`, Write `49535343-8841-43f4-a8d4-ecbe34729bb3`, Notify `49535343-1e4d-4bd9-ba61-23c647249616`
   - 이미지 전송 후 대기(`400ms + 이미지 줄 수/400초`, 최대 5초. ESC @ 방식은 최소 1.5초) → 별도 쓰기로 급지 `1B 40 1B 32 1B 64 06` (B 방식, 6줄 ≈ 21mm). 전체 확대 요청에 따라 대기 상한만 3→5초로 조정했습니다.
   - 청크 크기·간격·쓰기 방식의 코드 기본값(128B / 10ms / auto)
2. **태블릿에 저장된 프린터 설정:** `localStorage['byeolungwan.printer']`의 저장 키와 병합 방식을 바꾸지 않습니다. 실기기에서 맞춘 값(청크 64B 등)이 여기에만 있습니다.
3. **원본 이미지:** `public/assets/*`, `public/assets/receipt/*`(별자리 SVG 28개, QR SVG 2개), `logo.svg`, `bg-01.png`를 수정하지 않습니다. 색 변환은 메모리에서만 합니다.
4. **화면 디자인:** R-01~R-04와 도움말 모달의 배치·글꼴·색. 피그마 레퍼런스 기준이며 텍스트 배율은 `src/css/tokens.css`의 `--ts: 1.1` 하나로 조절합니다.
5. **PWA 업데이트 정책:** 새 버전은 시작 화면에서만 적용합니다(체험 중 새로고침 금지).

## 데이터 규칙 (`src/data/receipt/`)

- 생년월일 판정은 `byeolungwan_28su_birthdate_reference.json`의 양력 월·일 구간을 씁니다(시작·끝 포함). 음력 입력은 양력으로 변환한 뒤 판정합니다.
- 오늘의 운세(종합·간략):
  - 11/20~24: `byeolungwan_fortunes_2026-11-20_24.json`의 `constellations[키].daily[날짜].종합.short`
  - 11/25 이후는 11/24로 제한하며 v6 데이터는 사용하지 않습니다.
- 발행일은 한국 시간 기준이고 11/20~11/24 범위로 맞춥니다(`src/js/domain/receipt-date.js`). 인쇄 버튼을 누를 때 다시 계산합니다.
- 행운 정보: 사신수 → 방위·오방색(동/청, 북/흑, 서/백, 남/적), 칠요 → 행성(목성·금성·토성·태양·달·화성·수성).
- 응원 문구: `src/js/data/cheers.js`(MD 원문과 글자 그대로 일치해야 함).
- 표기: 위수(危宿)·제비자리 / 위수(胃宿)·꿩자리를 구분하고, 노루자리는 류수(柳宿) → `s03_ryu.svg`.
- `28su_database_final*.js`는 오래된 파일이라 쓰지 않습니다.

## 실행과 검증

```bash
# 로컬 서버(서비스 워커는 localhost에서도 동작 — 수정 후 이전 화면이 보이면 DevTools에서 SW 해제)
python -m http.server 8765 --bind 127.0.0.1      # 저장소 루트에서

# 자동화 테스트(가짜 PT210A로 브라우저 검증, 설치된 Chrome 사용)
cd tools/tests && npm install
node datatest.mjs        # 데이터·규칙(Node만)
node receipttest.mjs     # 운세지 140건 렌더링·QR 판독·화면 연결·전송
node printtest.mjs && node feedtest3.mjs && node sharetest.mjs && node regress.mjs && node cardfit-offline.mjs
BASE=https://pj202606-nn.github.io/byeolungwan-fortune-slip/index.html node printtest.mjs   # 배포 주소 대상
```

테스트별 용도와 기대 결과, 배포 절차는 [docs/HANDOFF.md](docs/HANDOFF.md)에 있습니다.

## 배포할 때 (허용받은 경우에만)

1. `sw.js`의 `PRECACHE`에 새 파일을 넣었는지 확인합니다. 빠지면 오프라인에서 동작하지 않고, 목록에 없는 파일을 넣으면 Actions의 확인 단계가 실패합니다.
2. commit(메시지 끝에 공동 작성자 줄 유지) → `git push origin main`
3. Actions 성공 여부와 실제 주소의 `sw.js` `VERSION`(커밋 SHA 앞 12자리)을 확인합니다.
4. 실제 주소를 대상으로 테스트를 실행합니다.
