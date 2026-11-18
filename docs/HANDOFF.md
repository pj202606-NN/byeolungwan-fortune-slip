# 별운관 운세지 — 작업 인수인계 문서

## 최신 변경 (2026-11-19, 사용자 최종 수정 요청)

이 절이 아래 이전 인수인계 기록보다 우선합니다. 사용자는 이번 작업의 commit·push·GitHub Pages 배포를 허용했습니다. 이후 작업까지 포괄하는 허용은 아닙니다.

- 최종 운세 기간은 **2026-11-20~24**입니다. 한국 날짜가 기간 밖이면 20일/24일로 제한합니다. 개발 날짜 주입에도 같은 규칙을 적용합니다.
- `fortune-repo.js`는 20~24 전용 JSON의 `종합.short`만 읽습니다. v6 조회·사전 로딩·서비스 워커 캐시 의존성은 제거했습니다.
- 별자리 이름 아래 점선은 y=452 → **464px(+12px)**. 이후 제목·본문도 12px 내려 기존 내부 간격을 유지합니다.
- 본문은 **좌측 정렬**, x=21.5px 유지, 폭 340.5 → **300px**, 오른쪽 여백 22 → **62.5px**. 다른 블록 폭과 13.6px 글꼴 크기는 유지합니다.
- QR 패턴은 **66×66px(33모듈×2px)**. `receipt-render.js`의 `QR_SIZE` 한 곳에서 조정합니다. QR 사이 32px, 라벨 위 흰 여백 16px을 유지합니다. 비트맵 판독 성공이 실물 판독 성공을 보장하지 않습니다.
- 디자인 PNG·PDF와 오래된 JS·소개 JSON·v6 JSON은 `.gitignore`로 공개 저장소에서 제외하고 로컬 원본은 보존합니다. 이 파일들은 기존에 Git 추적되지 않았습니다.
- 응원 문구 MD 원문은 테스트용으로 저장소에 보존하며 Pages 아티팩트에서는 제외합니다. 런타임은 `cheers.js`를 사용합니다.
- 프린터 전송·급지 파일 3개와 `pwa.js`는 기존 배포 커밋과 동일합니다. 새 서비스 워커 버전은 기존 Actions의 커밋 SHA 치환 방식으로 적용합니다.
- 운세지 미리보기는 `tools/tests/output/receipt-0.png`~`receipt-4.png`, 디자인 예시 비교는 `calib-bitmap.png`입니다. 출력물은 Git에서 제외합니다.
- 자동화 검증: 기존 7개 테스트 외 `node tools/tests/finalcheck.mjs`로 25·26일 제한, 본문 오른쪽 비트맵 여백, QR Quiet Zone, 개발 패널 미리보기 및 필수 에셋을 확인합니다.
- 최종 로컬 결과: datatest 50/50, receipttest 28/28, printtest 38/38, feedtest3 36/36, sharetest 30/30, regress 17/17, cardfit-offline 7/7, finalcheck 7/7 — **총 213/213**. 140건 렌더링, 66px QR 판독 20건 성공, 길이 948~990 dots(약 119~124mm), 오프라인 캐시 72개 확인.
- 실기기 확인 필요: 66px QR 2개 판독, 본문·한자·별자리 선명도, 내용 누락, 자동 급지 및 절취 여유. 실제 태블릿·프린터 인쇄는 사용자가 수행합니다.

---

## 이전 인수인계 기록 (최신 규칙은 위 절 참고)

작성: 2026-11-19 (Claude Code → Codex 이전용)
기준 커밋: `0107173` (배포 중) + **아직 커밋하지 않은 작업: 새 운세지 레이아웃과 28수 데이터 연결**

규칙 요약은 저장소 루트의 [AGENTS.md](../AGENTS.md)에 있습니다. 이 문서는 지금까지의 작업 내용, 현재 상태, 남은 일, 검증 방법을 정리한 것입니다.

---

## 1. 바로 이어서 할 일 (우선순위)

1. **커밋하지 않은 새 운세지 작업을 사용자에게 확인받기** (7절의 "확인 대기" 항목)
   - commit·push·배포는 사용자가 허용했을 때만 합니다.
   - 허용받으면 8절의 배포 절차대로 진행하고, 실제 주소에서 테스트합니다.
2. **커밋 전에 정할 것**
   - `references/receipt/`(디자인 PNG·PDF), `src/data/receipt/28su_database_final_updated_20261119.js`, `byeolungwan_28su_descriptions_v3.json`, `tools/tests/`를 공개 저장소에 올릴지 사용자에게 묻습니다.
   - 올리지 않을 파일은 `.gitignore`에 추가합니다. (`00_DESIGN_REFERENCE/`, `tools/tests/node_modules/`, `tools/tests/output/`은 이미 제외되어 있습니다.)
3. **배포 뒤 사용자가 실기기로 확인할 것**
   - 새 운세지 실제 출력: 13.6px 본문, 한자, 별자리 선의 선명도, 약 13cm 길이
   - QR 2개 실물 판독
   - 자동 배출 약 2cm

## 2. 프로젝트 개요

- **용도:** 졸업전시 '별운관' 부스. 갤럭시 탭 A9+(가로, Android Chrome, 설치형 PWA)에서 관람객이 체험합니다.
- **흐름:** R-01 시작 → R-02 생년월일 입력(양력/음력·윤달) → R-03 별자리·오늘의 운세 → '운세지 출력하기' → PT-210A로 인쇄 → R-04 완료
- **디자인 기준:** `00_DESIGN_REFERENCE/`(화면 1920×1200 피그마 PNG 5장, Git에서 제외), `references/receipt/운세지 레이아웃.png·pdf`(운세지 768px = 2배 해상도)
- **주소:** 배포 https://pj202606-nn.github.io/byeolungwan-fortune-slip/ · 개발 모드 `?dev=1` · 저장소 https://github.com/pj202606-NN/byeolungwan-fortune-slip
- **QR 연결 주소(판독 결과):** 앱 `https://pj202606-NN.github.io/byeol-ungwan-app/`, 웹사이트 `https://pj202606-nn.github.io/byeolungwan-main-site/`

## 3. 파일 구조

```
index.html                 4개 화면(section.page) + 도움말 모달. 1920×1200 무대를 transform으로 축소·확대
manifest.webmanifest       PWA(fullscreen, landscape, #0E2D40)
sw.js                      서비스 워커: PRECACHE 73개, 시작 화면에서만 업데이트(VERSION은 배포 때 커밋 SHA로 바뀜)
src/css/tokens.css         글꼴(@font-face: MaruBuri, Pretendard, ByeolungwanHanja), 색, --ts(텍스트 배율 1.1)
src/css/base.css           무대·배경·상하단 띠
src/css/components.css     헤더·버튼·입력칸·카드·모달·개발 패널
src/css/pages.css          화면별 배치, 프린터 연결 버튼(.printer-chip, R-01은 .printer-chip--start)
src/js/app.js              화면 전환, 결과 생성(resultFor/buildResult), 출력 흐름, 카드 글자 크기 맞춤, 개발 모드
src/js/stage.js            화면 배율, 안드로이드 키보드 대응
src/js/pwa.js              서비스 워커 등록, 안전한 시점(시작 화면·8초 무조작)에만 새 버전 적용
src/js/domain/birthdate.js       생년월일 검증, 음력→양력 변환(vendor/korean-lunar-calendar)
src/js/domain/date-utils.js      한국 시간 오늘 날짜, 양력 일수
src/js/domain/receipt-date.js    ★ 발행일 규칙(11/20~11/25로 맞춤, 개발 모드 날짜 주입)
src/js/domain/mansions.js        ★ 28수 판정, 표기, 그래픽 경로, 행운 정보
src/js/domain/star-resolver.js   생년월일 → 별자리(mansions.js 사용)
src/js/domain/fortune-repo.js    ★ 날짜별 운세 조회(출처 규칙)
src/js/data/cheers.js            ★ 응원 문구 28개(MD에서 자동 추출)
src/js/ui/*.js                   입력 폼, 달력 선택, 도움말, 별자리 아이콘(인라인 SVG), 프린터 UI·개발 패널
src/js/print/pt210a-ble.js       PT-210A Web Bluetooth 연결·청크 전송·재연결·설정 저장 (수정 금지)
src/js/print/escpos.js           ESC/POS 명령(래스터 GS v 0, 96줄 밴드, 급지 패킷) (수정 금지)
src/js/print/print-service.js    출력 작업(중복 방지, 이미지 → 대기 → 별도 급지, 로그) (전송 부분 수정 금지)
src/js/print/receipt-render.js   ★ 운세지 384px 렌더러(새 레이아웃), 1비트 변환, 미리보기, 보정 이미지
src/data/receipt/                ★ 원본 데이터(아래 6절)
public/assets/                   bg-01.png, logo.svg, icon-s.svg, receipt/constellations/*.svg(28), receipt/qr/{app,website}.svg
public/fonts/                    maru-buri, pretendard, hanja(★ ByeolungwanHanja)
public/icons/                    PWA 아이콘
vendor/korean-lunar-calendar/    음력 변환 라이브러리 v0.4.0(MIT, 원본 그대로·확장자만 .js)
.github/workflows/pages.yml      main push → 서비스 워커 VERSION 치환 → precache 파일 확인 → Pages 배포
tools/tests/                     ★ 자동화 테스트(puppeteer-core + jsQR, 가짜 PT210A)
```

★ 표시는 아직 커밋하지 않은 작업에서 추가하거나 바꾼 파일입니다.

## 4. 커밋 이력

| 커밋 | 내용 |
|---|---|
| `5149a4a` | 초기 버전: 4개 화면·도움말, 양력/음력·윤달, PWA, GitHub Pages |
| `23c65f1` | `.gitattributes`(LF 고정) |
| `df74ed2` | R-01 텍스트 가운데 정렬, 전체 글자·버튼 10% 확대(`--ts`) |
| `eb1062b` | PT-210A 실제 출력(Web Bluetooth, 래스터), 배경 이미지 교체 |
| `3a30b98` | 인쇄 후 급지 설정(feedLines) |
| `f2ff972` | 급지를 별도 BLE 쓰기로 분리, 기본 6줄 → 실물에서 배출 안 됨 |
| `3fbfe01` | 급지 패킷을 `ESC @` 포함 7바이트로 변경 → **실물 성공**, 급지 진단 기능 |
| `483ec1a` | R-01 상단 가운데 프린터 연결 버튼, 개발·일반 모드 설정 공유(쓸 때마다 저장소에서 다시 읽음) |
| `0107173` | R-01 버튼을 R-03의 `.printer-chip` 디자인으로 복원 (**현재 배포본**) |

## 5. 핵심 결정과 이유

**프린터 (PT-210A, 실기기 검증)**
- 128B 청크에서는 이미지가 깨졌습니다. 사용자가 개발 패널에서 64B 등으로 바꾼 값은 **태블릿 localStorage에만** 있습니다. 코드 기본값은 128B 그대로입니다. 사용자가 최종 값을 알려 주면 그때 코드 기본값으로 반영합니다.
- 급지는 이미지 데이터에 붙이면 무시됐습니다. ESC @ 없이 따로 보낸 5바이트도 이미지 직후에는 무시됐습니다. 그래서 이미지 전송 → 대기 → `1B 40 1B 32 1B 64 n`(7B)을 별도로 보냅니다.
  - 가설: PT-210A는 래스터 인쇄 뒤 `ESC @` 전까지 `ESC d`를 실행하지 않습니다.
  - `ESC @`는 아직 인쇄되지 않은 버퍼를 지우므로, 반드시 대기 시간 뒤에 보냅니다.
- "출력 성공"은 BLE 전송 완료라는 뜻일 뿐입니다. 용지 없음이나 걸림은 알 수 없습니다. 이미지가 성공하고 급지만 실패하면 완료 화면으로 갑니다(재출력 방지).
- 일반 모드에서는 실제 전송이 성공했을 때만 완료 화면으로 갑니다. 개발 모드에서 프린터가 없으면 시연 흐름으로 가고 "실제 인쇄 아님"을 표시합니다.

**설정 공유:** 개발 모드(Chrome 탭)와 일반 모드(설치형 앱)는 같은 `localStorage['byeolungwan.printer']`를 씁니다.
- 출력할 때마다 저장소에서 다시 읽습니다.
- 연결할 때는 기기 정보만 저장하고, 설정을 바꿀 때는 바뀐 항목만 저장합니다.
- `feedRev: 2` 표시가 있으면 급지 기본값 이전(migration)을 다시 하지 않습니다.

**새 운세지(미커밋)**
- 렌더러는 디자인의 '잉크 위쪽' 좌표를 384px로 옮겼습니다. 디자인 예시 문구로 비교했을 때 0~1px 차이입니다.
- 글자는 프리텐다드입니다.

| 요소 | 글자 크기 · 굵기 |
|---|---|
| 제목 | 15.5px · 600 |
| 발행일 | 12.5px |
| 수 이름 | 19px · 500 |
| 한자 | 14px |
| 별칭 | 14.5px |
| 소제목·행운 정보 | 14.6px · 600 |
| 본문 | 13.6px, 줄 간격 21 |
| 응원 문구 | 14.6px · 500 |
| QR 라벨 | 11.7px |

- **한자 글꼴:** 마루부리와 프리텐다드에 28수 한자가 없습니다. 그래서 Noto Sans KR(OFL)에서 29자를 추출해 이름을 바꾼 `ByeolungwanHanja`를 넣었습니다(`public/fonts/hanja/LICENSE.txt`).
- **흑백 기준값:** 운세지는 200입니다. 170이면 본문 획이 빠지고, 220 이상이면 글자가 뭉칩니다.
- **QR:** 패턴 33모듈만 132px(모듈 4px)로 그립니다. 사이와 둘레에 16px 이상 여백을 둡니다. 디자인(58px)보다 크고 간격이 넓은 것은 판독을 위해서입니다.
- **별자리 SVG:** 그린 뒤 모든 점과 선을 검정으로 칠합니다. 선 굵기만 3.2단위(약 1.7px)로 키웠습니다. 원본 파일은 바꾸지 않습니다.
- **화면 카드(R-03·R-04):** 실제 운세 문장을 넣고 자동 줄바꿈합니다. 넘칠 때만 글자를 줄입니다(35.2px → 최소 26.2px, `fitFortuneCards`). 화면과 종이 내용을 같게 하기 위한 결정이며, 사용자 확인을 기다리는 중입니다.
- **인쇄 시점 재계산:** 인쇄 버튼을 누르면 `buildResult`를 다시 실행합니다. 날짜가 바뀌었으면 화면도 갱신합니다.

## 6. 데이터 파일 (`src/data/receipt/`)

| 파일 | 쓰임 |
|---|---|
| `byeolungwan_28su_birthdate_reference.json` | 28수 id·이름·mansion `저(氐)`·사신수·칠요·양력 구간 → 판정·표기·행운 |
| `byeolungwan_fortunes_2026-11-20_24.json` | 11/20~24 운세. 키는 `저수`, `위수(危)`, `위수(胃)`, `류수` 형식 |
| `byeolungwan_28su_fortunes_20261119_25_v6.json` | 11/25 운세(`today[]`). **이 프로젝트에 없어서** `/졸전/db` 등 5곳에 있는 같은 사본(sha1 `02d4f90b83ce`)을 복사함. 요청서의 `v6(3)`과 같은 버전인지는 확인하지 못함 |
| `별운관_28수_운세지_응원문구_최종안.md` | 응원 문구 원본(원래 파일 이름이 URL 인코딩되어 있어 바꿈). 런타임에는 `cheers.js`를 씀 |
| `28su_database_final_updated_20261119.js` | 오래된 데이터 — **사용 금지**(보존만) |
| `byeolungwan_28su_descriptions_v3.json` | 지금은 쓰지 않음 |

11/20~24는 전용 JSON과 v6의 문장이 140개 중 119개 다릅니다. 날짜별 출처를 섞지 마세요.

## 7. 사용자 확인 대기 (미커밋 작업 관련)

1. v6 파일 버전이 맞는지
2. 한자 전용 글꼴을 추가해도 되는지(OFL 부분 추출본)
3. 결과 화면 카드에 실제 운세를 넣고, 넘칠 때만 글자를 줄이는 방식이 괜찮은지
4. QR을 132px로 키우고 간격을 넓힌 배치가 괜찮은지
5. 급지 전 대기 시간이 길어진 점: 운세지가 길어져 같은 계산식으로 2.37초 → 약 2.99초
6. 공개 저장소에 포함할 파일(1절 2번)

## 8. 배포 절차 (허용받은 경우에만)

- **GitHub 인증:** `gh` CLI가 없습니다. Git 자격 증명 관리자에 저장된 GitHub 계정(`pj202606-NN`, 권한 repo·workflow)으로 push합니다.
  - Actions 상태를 조회하려면 `printf "protocol=https\nhost=github.com\n\n" | git credential fill`로 받은 토큰을 `GH_TOKEN` 환경변수로만 쓰고, 출력하지 않습니다.
- **절차**
  1. `sw.js` PRECACHE를 점검합니다. 목록의 모든 파일이 실제로 있어야 Actions가 통과합니다.
  2. commit → `git push origin main`
  3. `GH_TOKEN=... node tools/tests/watch-run.mjs $(git rev-parse HEAD)`로 Actions 결과를 확인합니다.
     - `deploy-pages` 단계가 "artifact metadata" 같은 일시 오류로 실패하면, API로 재실행합니다(`POST /repos/pj202606-NN/byeolungwan-fortune-slip/actions/runs/{id}/rerun`). 예전에 한 번 있었습니다.
  4. 실제 주소 `sw.js`의 `VERSION`이 커밋 SHA 앞 12자리인지 확인합니다.
  5. 실제 주소 대상으로 테스트합니다: `BASE=https://pj202606-nn.github.io/byeolungwan-fortune-slip/index.html node <테스트>.mjs`
  6. PWA 업데이트를 검증하려면, **push 전에** `node tools/tests/live-update.mjs`를 백그라운드로 실행합니다. 현재 배포본을 설치하고 결과 화면에서 기다리다가, 새 버전을 감지하면 시작 화면에서만 적용되는지 확인합니다.
- **커밋 메시지:** 한국어 요약과 변경 목록을 쓰고, 마지막 줄에 `Co-Authored-By:` 공동 작성자 줄을 붙여 왔습니다. 같은 형식을 유지합니다.

## 9. 자동화 테스트 (`tools/tests/`)

준비: `cd tools/tests && npm install`. Windows에 설치된 Chrome(`C:/Program Files/Google/Chrome/Application/chrome.exe`)을 씁니다. 로컬 대상은 `python -m http.server 8765 --bind 127.0.0.1`(저장소 루트)이 켜져 있어야 합니다. 스크린샷과 이미지는 `tools/tests/output/`에 저장됩니다.

| 파일 | 확인 내용 | 미커밋 작업 기준 결과 |
|---|---|---|
| `datatest.mjs` | 28개 매핑, 위수 구분, 류수, 날짜별 출처, 응원 문구 원문 일치, 행운 규칙, 생일 경계(366일·두루미·2/29), 발행일(자정·UTC) | 50/50 |
| `receipttest.mjs` | 28개 × 6일 운세지 렌더링, 본문 글자 누락 없음, 회색 네모 없음, QR 판독(jsQR), 화면 연결, 인쇄 시점 날짜 재계산, 급지 패킷·청크 | 25/25 |
| `cardfit-offline.mjs` | 168개 운세가 화면 카드에 들어가는지, 서비스 워커 캐시 73개, 오프라인 운세지 생성 | 7/7 |
| `printtest.mjs` | 연결·취소·미연결·전송 실패·끊김·재연결·폴백·개발 모드·미지원 브라우저 | 38/38 |
| `feedtest3.mjs` | 급지 A/B·진단 버튼·대기 시간·설정 보존 | 36/36 |
| `sharetest.mjs` | R-01 연결 버튼, R-03 복구, 개발↔일반 모드 설정 공유 | 30/30 |
| `regress.mjs` | 화면 이동·도움말·양력/음력/윤달·키보드 대응 | 17/17 |
| `receipt-calib.mjs` | 디자인 예시 문구로 운세지를 그려 `output/calib-*.png` 저장(디자인과 눈으로 비교) | — |
| `live-update.mjs` / `live-shots.mjs` / `watch-run.mjs` | 배포 후 PWA 업데이트, 화면 캡처, Actions 확인 | — |

**테스트를 다룰 때 주의할 점**
- 헤드리스 Chrome은 뒤로 밀린 탭을 멈춥니다. 페이지를 오갈 때 `page.bringToFront()`가 필요합니다.
- 개발 패널을 펼치면 화면 일부를 가립니다. 로그 영역을 `max-height: 96px`로 줄여 입력칸(y≈570)을 피하게 했습니다.
- 가짜 프린터(`MOCK`)는 실제 BLE·종이를 검증하지 않습니다. 실기기 항목은 사용자에게 따로 확인을 요청합니다.

## 10. 개발 환경 메모

- **OS·셸:** Windows 11, Git Bash와 PowerShell. 경로에 한글이 있습니다(`d:/대학/4학년/졸전/byeolungwan-fortune-slip`).
- **heredoc 주의:** Bash heredoc에서 긴 Python이나 백슬래시가 깨진 적이 있습니다. 긴 패치는 파일로 저장해서 실행하는 편이 안전합니다.
- **`.mjs` 파일:** Windows Python 서버는 `.mjs`를 JavaScript로 제공하지 않습니다. 그래서 음력 라이브러리를 `.js`로 바꿔 두었습니다. 새 모듈도 `.js`로 만드세요.
- **로컬 서비스 워커:** localhost에서도 동작합니다. 수정한 뒤 화면이 그대로면 테스트는 새 프로필로 실행하고(테스트 스크립트는 매번 임시 프로필 사용), 브라우저에서는 SW를 해제하세요.
- **다른 별운관 프로젝트:** `../28su-web`, `../28su-app` 등은 이 저장소와 무관합니다. 읽기만 하고 수정·커밋하지 않습니다.

## 11. 사용자 협업 스타일

- 단계별로 진행하고, 큰 변경 전에는 계획을 먼저 확인받는 것을 선호합니다.
- 전통 소재(28수 등)는 "그럴듯함"이 아니라 "실제로 맞는가"로 판단합니다. 임의 규칙이나 문구를 만들지 않습니다.
- 디자인을 재해석하지 않고 피그마 레퍼런스를 우선합니다. 붉은색 계열 경고 표시는 쓰지 않습니다(오류 문구는 크림색 `#FEEFCF`).
- 보고 형식: 바뀐 파일 / 구현 내용 / 자동화 테스트 결과 / 실기기에서 확인할 것 / 남은 문제를 한국어로 정리합니다.
