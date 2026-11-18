// 운세지(영수증) 전용 렌더러 — 화면 DOM이 아니라 result 데이터만으로 384px 폭 캔버스에 그린다.
// 흰 바탕에 검정으로 그린 뒤 1비트 비트맵(1 = 검정)으로 바꿔 ESC/POS 래스터로 보낸다.
//
// 레이아웃: references/receipt/운세지 레이아웃.png(768px, 2배) 를 384px로 옮긴 값.
// 아래 숫자는 디자인의 '잉크 위쪽' 좌표(px)이며, 운세 본문·응원 문구 줄 수에 따라 그 아래 요소가 함께 내려간다.

import { PRINT_WIDTH_DOTS, BYTES_PER_ROW } from './escpos.js';
import { formatIssueDate } from '../domain/receipt-date.js';

const W = PRINT_WIDTH_DOTS;
const LEFT = 21.5;            // 왼쪽 정렬 텍스트의 잉크 시작
const RIGHT = 362;            // 오른쪽 정렬 값의 잉크 끝
const TEXT_WIDTH = RIGHT - LEFT;
const BODY_WIDTH = 300;       // 본문만 축소: 왼쪽 시작점 유지, 오른쪽 여백 62.5px
const NAME_BOTTOM_EXTRA = 12; // 별자리 이름 아래 점선까지 여백 추가
const LOGO_PATH = 'public/assets/logo.svg';
const LOGO_VIEWBOX = '99 176 145 403';   // logo.svg의 실제 그림 영역(원본 파일은 수정하지 않고 메모리에서만 자름)
const QR_PATHS = { app: 'public/assets/receipt/qr/app.svg', web: 'public/assets/receipt/qr/website.svg' };
const QR_CORE_VIEWBOX = '62 62 1023 1023'; // QR SVG(37모듈·모듈 31단위)에서 패턴 33모듈 — 모듈당 정확히 4px
const QR_SIZE = 66;                        // QR 크기 관리: 33모듈 × 2px ≈ 8.25mm
const QR_QUIET = 16;                       // 표준 여백 4모듈(16px) 이상을 흰 종이로 비워 둔다

const FONT_SANS = 'Pretendard';
const FONT_HANJA = 'ByeolungwanHanja';
const sans = (wt, px) => `${wt} ${px}px ${FONT_SANS}, ${FONT_HANJA}`;

const F = {
  title: sans(600, 15.5),
  issue: sans(400, 12.5),
  name: sans(500, 19),
  hanja: `400 14px ${FONT_HANJA}`,
  alias: sans(400, 14.5),
  heading: sans(600, 14.6),
  body: sans(400, 13.6),
  lucky: sans(600, 14.6),
  cheer: sans(500, 14.6),
  qrLabel: sans(500, 11.7),
};
const BODY_PITCH = 21;   // 본문 줄 간격(디자인 실측)
const CHEER_PITCH = 22;
const LUCKY_PITCH = 27;
const RECEIPT_THRESHOLD = 200;

async function ensureFonts() {
  await Promise.all([
    ...Object.values(F).map((f) => document.fonts.load(f, '가나다氐宿“”0123456789.')),
    document.fonts.load(`400 14px ${FONT_HANJA}`, '角亢氐房心尾箕斗牛女虛危室壁奎婁胃昴畢觜參井鬼柳星張翼軫宿'),
  ]);
}

const svgCache = new Map();

async function loadSvgImage(path, { viewBox, extraStyle = '', width, height }) {
  const text = await (await fetch(path)).text();
  let svg = text.replace(/<\?xml[^>]*>/, '');
  if (viewBox) svg = svg.replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`);
  svg = svg.replace(/<svg\b([^>]*?)\swidth="[^"]*"/, '<svg$1').replace(/<svg\b([^>]*?)\sheight="[^"]*"/, '<svg$1');
  svg = svg.replace(/<svg\b/, `<svg width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"`);
  if (extraStyle) svg = svg.replace(/<\/svg>\s*$/, `<style>${extraStyle}</style></svg>`);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** SVG 원본을 읽어(파일은 그대로) 보기 영역·선 굵기만 메모리에서 바꾼 뒤, 검정 실루엣 캔버스로 만든다.
 *  (별 점처럼 밝은 색으로 그려진 부분도 모두 검정이 되고, 투명한 바탕은 그대로 흰 종이로 남는다) */
async function svgSilhouette(path, { viewBox, extraStyle = '', width, height }) {
  const key = `sil|${path}|${viewBox}|${extraStyle}|${width}x${height}`;
  if (svgCache.has(key)) return svgCache.get(key);
  const img = await loadSvgImage(path, { viewBox, extraStyle, width, height });
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, width, height);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#000';
  g.fillRect(0, 0, width, height);
  svgCache.set(key, c);
  return c;
}

/** QR: 색을 바꾸지 않고(흰 바탕·검은 모듈 그대로) 패턴 영역만 정수 배율로 그린다 — 패턴 변형·재생성 없음 */
async function qrImage(path) {
  const key = `qr|${path}`;
  if (svgCache.has(key)) return svgCache.get(key);
  const img = await loadSvgImage(path, { viewBox: QR_CORE_VIEWBOX, width: QR_SIZE, height: QR_SIZE });
  const c = document.createElement('canvas');
  c.width = QR_SIZE;
  c.height = QR_SIZE;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, QR_SIZE, QR_SIZE);
  g.drawImage(img, 0, 0, QR_SIZE, QR_SIZE);
  svgCache.set(key, c);
  return c;
}

// 줄 첫머리에 오면 안 되는 문장부호(앞 줄에 붙인다)
const NO_LINE_START = new Set([...'.,!?;:)]}』」”’…·、。，']);

/** 한국어 줄바꿈: 띄어쓰기 단위로 나누고, 한 단어가 한 줄보다 길면 글자 단위로 나눈다. 글자를 줄이거나 자르지 않는다. */
export function wrapKorean(g, text, maxWidth) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let cur = '';
    const pushWord = (word) => {
      const next = cur ? `${cur} ${word}` : word;
      if (!cur || g.measureText(next).width <= maxWidth) { cur = next; return; }
      lines.push(cur);
      cur = word;
    };
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (g.measureText(word).width <= maxWidth) { pushWord(word); continue; }
      for (const ch of word) { // 아주 긴 단어: 글자 단위
        if (cur && g.measureText(cur + ch).width > maxWidth && !NO_LINE_START.has(ch)) { lines.push(cur); cur = ch; } else cur += ch;
      }
    }
    if (cur) lines.push(cur);
  }
  // 줄 첫 글자가 문장부호면 앞 줄 끝으로 옮긴다
  for (let i = 1; i < lines.length; i++) {
    while (lines[i] && NO_LINE_START.has(lines[i][0])) {
      lines[i - 1] += lines[i][0];
      lines[i] = lines[i].slice(1).trimStart();
    }
  }
  return lines.filter((l) => l.length);
}

const ascentOf = (g, s) => g.measureText(s).actualBoundingBoxAscent;
const inkLeftOf = (g, s) => g.measureText(s).actualBoundingBoxLeft;
const inkRightOf = (g, s) => g.measureText(s).actualBoundingBoxRight;

/** 글자의 잉크 위쪽이 inkTop에 오도록 그린다(기준선 = inkTop + '가'의 잉크 높이) */
function textAt(g, font, s, { inkTop, x, align = 'left' }) {
  g.font = font;
  const base = inkTop + ascentOf(g, '가');
  if (align === 'right') g.fillText(s, x - inkRightOf(g, s), base);
  else g.fillText(s, x + inkLeftOf(g, s), base);
  return base;
}

function centerText(g, font, s, inkTop, cx = W / 2) {
  g.font = font;
  const m = g.measureText(s);
  const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  g.fillText(s, cx - inkW / 2 + m.actualBoundingBoxLeft, inkTop + ascentOf(g, '가'));
}

/** 점선 구분선: 두께 2px, 4px 선 · 4px 빈칸 (디자인 실측) */
function dashed(g, y) {
  g.fillRect(21, y, 2, 2);                                  // 양 끝은 2px 짧은 점선(디자인 실측)
  for (let x = 27; x + 4 <= 359; x += 8) g.fillRect(x, y, 4, 2);
  g.fillRect(361, y, 2, 2);
}

/**
 * @param {object} result  app.js의 state.result — 화면(R-03·R-04)과 같은 데이터
 *   result.receipt = { issueDate:{y,m,d}, suName, hanja, alias, graphicPath, fortuneText, luck:{direction,color,planet}, cheer }
 * @returns {{bits:Uint8Array, widthBytes:number, height:number, canvas:HTMLCanvasElement}}
 */
export async function renderReceipt(result) {
  const r = result.receipt;
  await ensureFonts();
  const [logo, graphic, qrApp, qrWeb] = await Promise.all([
    svgSilhouette(LOGO_PATH, { viewBox: LOGO_VIEWBOX, width: 22, height: 59 }),
    // 원본 선 굵기(1단위)는 133px에서 약 0.5px이라 감열지에서 사라지므로 선만 굵게(점 크기는 그대로)
    svgSilhouette(r.graphicPath, { viewBox: '0 0 250 250', extraStyle: 'polyline,line,path{stroke-width:3.2}', width: 133, height: 133 }),
    qrImage(QR_PATHS.app),
    qrImage(QR_PATHS.web),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = 2000; // 넉넉히 그리고 마지막에 실제 높이로 자른다
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, canvas.height);
  g.fillStyle = '#000';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';

  // A. 로고 (잉크 21×59, 가운데)
  g.drawImage(logo, Math.round((W - logo.width) / 2), 49);

  // B. 제목 · 발행일 · 점선
  centerText(g, F.title, '오늘의 운세', 135);
  textAt(g, F.issue, '발행일', { inkTop: 173.5, x: 22 });
  textAt(g, F.issue, formatIssueDate(r.issueDate), { inkTop: 173.5, x: 66 });
  dashed(g, 203);

  // C. 별자리 그래픽 (회색 네모 자리 133×133, 가운데) — 회색 네모 자체는 그리지 않는다
  g.drawImage(graphic, Math.round((W - 133) / 2), 237);

  // D. 수 이름 + 한자(같은 기준선), 동물 별자리명, 점선
  g.font = F.name;
  const nameM = g.measureText(r.suName);
  g.font = F.hanja;
  const hanjaM = g.measureText(r.hanja);
  const gap = 6;
  const rowW = nameM.actualBoundingBoxLeft + nameM.width + gap + hanjaM.actualBoundingBoxRight;
  const x0 = (W - rowW) / 2 + nameM.actualBoundingBoxLeft;
  g.font = F.name;
  const nameBase = 385 + ascentOf(g, '가');
  g.fillText(r.suName, x0, nameBase);
  g.font = F.hanja;
  g.fillText(r.hanja, x0 + nameM.width + gap, nameBase);
  centerText(g, F.alias, r.alias, 413);
  dashed(g, 452 + NAME_BOTTOM_EXTRA);

  // E. 오늘의 운세(왼쪽 정렬) + 본문(자동 줄바꿈, 줄 수만큼 아래로 늘어남), 점선
  textAt(g, F.heading, '오늘의 운세', { inkTop: 479 + NAME_BOTTOM_EXTRA, x: LEFT });
  g.font = F.body;
  const bodyLines = wrapKorean(g, r.fortuneText, BODY_WIDTH);
  g.textAlign = 'left';
  let y = 513 + NAME_BOTTOM_EXTRA;
  for (const line of bodyLines) {
    textAt(g, F.body, line, { inkTop: y, x: LEFT });
    y += BODY_PITCH;
  }
  const dash3 = y - BODY_PITCH + 40;
  dashed(g, dash3);

  // F. 행운의 방위 · 오방색 · 행성 (항목명 왼쪽, 값 오른쪽), 점선
  const luckyRows = [['행운의 방위', r.luck.direction], ['행운의 오방색', r.luck.color], ['행운의 행성', r.luck.planet]];
  let ly = dash3 + 27;
  for (const [label, value] of luckyRows) {
    textAt(g, F.lucky, label, { inkTop: ly, x: LEFT });
    textAt(g, F.lucky, value, { inkTop: ly, x: RIGHT, align: 'right' });
    ly += LUCKY_PITCH;
  }
  const dash4 = ly - LUCKY_PITCH + 39;
  dashed(g, dash4);

  // G. 응원 문구(가운데, 길면 줄바꿈) — 원문 앞뒤에 “ ”만 붙인다
  g.font = F.cheer;
  const cheerLines = wrapKorean(g, `“${r.cheer}”`, TEXT_WIDTH);
  let cy = dash4 + 29;
  for (const line of cheerLines) {
    centerText(g, F.cheer, line, cy);
    cy += CHEER_PITCH;
  }
  const cheerBottom = cy - CHEER_PITCH + 13;

  // H. QR 2개(앱 · 웹사이트) — 정수 위치, 사이·둘레 여백 확보
  const qrTop = Math.round(cheerBottom + 46);
  const qrGap = 2 * QR_QUIET;                       // 32px
  const qrLeft = Math.round((W - (QR_SIZE * 2 + qrGap)) / 2);
  const qrXs = [qrLeft, qrLeft + QR_SIZE + qrGap];
  g.drawImage(qrApp, qrXs[0], qrTop);
  g.drawImage(qrWeb, qrXs[1], qrTop);
  const labelTop = qrTop + QR_SIZE + QR_QUIET + 2;
  centerText(g, F.qrLabel, '앱', labelTop, qrXs[0] + QR_SIZE / 2);
  centerText(g, F.qrLabel, '웹사이트', labelTop, qrXs[1] + QR_SIZE / 2);

  const height = Math.ceil(labelTop + 10 + 60); // 라벨 아래 여백(디자인 60px). 종이 배출은 기존 급지 명령으로 따로
  const layout = { bodyLines, bodyLeft: LEFT, bodyWidth: BODY_WIDTH, bodyAlign: g.textAlign, nameDividerY: 452 + NAME_BOTTOM_EXTRA, cheerLines, qrTop, qrXs, qrSize: QR_SIZE, graphicTop: 237, height };
  // 흑백 기준값 200: 13.6px 본문의 얇은 가로획이 끊기지 않는 값(170은 획 누락, 220 이상은 글자가 뭉침 — 비교 확인)
  return { ...toBitmap(g, height, RECEIPT_THRESHOLD), canvas: cropCanvas(canvas, height), layout };
}

/** 회색조 → 1비트(밝기 임계값). 글자와 선 위주라 디더링 없이 임계값이 더 선명하다. */
export function toBitmap(g, height, threshold = 160) {
  const { data } = g.getImageData(0, 0, W, height);
  const bits = new Uint8Array(BYTES_PER_ROW * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < threshold) bits[y * BYTES_PER_ROW + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { bits, widthBytes: BYTES_PER_ROW, height };
}

function cropCanvas(src, height) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

/** 1비트 비트맵을 실제 인쇄 모양(흑백)으로 다시 그린 미리보기 캔버스 */
export function bitmapPreview({ bits, widthBytes, height }) {
  const c = document.createElement('canvas');
  c.width = widthBytes * 8;
  c.height = height;
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < c.width; x++) {
      const on = bits[y * widthBytes + (x >> 3)] & (0x80 >> (x & 7));
      const i = (y * c.width + x) * 4;
      const v = on ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** 청크 크기 점검용 테스트 이미지: 테두리 + 체크무늬 띠(잘리거나 어긋나면 바로 보인다) */
export function renderCalibrationBitmap(label = '') {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, 96);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, 3); g.fillRect(0, 93, W, 3); g.fillRect(0, 0, 3, 96); g.fillRect(W - 3, 0, 3, 96);
  for (let x = 8; x < W - 8; x += 16) g.fillRect(x, 10, 8, 8);
  g.font = `600 30px ${FONT_SANS}`;
  g.textAlign = 'center';
  g.fillText(`별운관 ${label}`.trim(), W / 2, 64);
  for (let x = 16; x < W - 8; x += 16) g.fillRect(x, 76, 8, 8);
  return toBitmap(g, 96);
}
