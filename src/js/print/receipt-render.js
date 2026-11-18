// 운세지(영수증) 전용 렌더러 — 화면 DOM이 아니라 result 데이터만으로 384px 폭 캔버스에 그린다.
// 흰 바탕에 검정으로 그린 뒤 1비트 비트맵(1 = 검정)으로 바꿔 ESC/POS 래스터로 보낸다.
//
// 구성 순서·정렬은 원래 디자인을 유지하고, 확대된 실제 잉크 높이와 섹션 간격으로 세로 배치를 계산한다.

import { PRINT_WIDTH_DOTS, BYTES_PER_ROW } from './escpos.js';
import { formatIssueDate } from '../domain/receipt-date.js';

const W = PRINT_WIDTH_DOTS;
const LEFT = 21.5;            // 왼쪽 정렬 텍스트의 잉크 시작
const RIGHT = 362;            // 오른쪽 정렬 값의 잉크 끝
const TEXT_WIDTH = RIGHT - LEFT;
const BODY_WIDTH = 300;       // 본문만 축소: 왼쪽 시작점 유지, 오른쪽 여백 62.5px
const LOGO_PATH = 'public/assets/logo.svg';
const LOGO_VIEWBOX = '99 176 145 403';   // logo.svg의 실제 그림 영역(원본 파일은 수정하지 않고 메모리에서만 자름)
const GRAPHIC_SIZE = 180;
const LOGO_HEIGHT = 80;
const LOGO_WIDTH = Math.ceil(LOGO_HEIGHT * 145 / 403); // 원본 viewBox 비율

const FONT_SANS = 'Pretendard';
const FONT_HANJA = 'ByeolungwanHanja';
const sans = (wt, px) => `${wt} ${px}px ${FONT_SANS}, ${FONT_HANJA}`;

const F = {
  title: sans(600, 20.5),
  issue: sans(400, 16.5),
  name: sans(500, 26),
  hanja: `400 19px ${FONT_HANJA}`,
  alias: sans(400, 20),
  heading: sans(600, 21.5),
  body: sans(400, 24),
  lucky: sans(600, 21),
  cheer: sans(500, 22),
};
const BODY_PITCH = 35;   // 24px × 1.458
const CHEER_PITCH = 33;
const LUCKY_PITCH = 39;
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

/** 실제 문자열의 잉크 위쪽이 inkTop에 오도록 그린다. */
function textAt(g, font, s, { inkTop, x, align = 'left' }) {
  g.font = font;
  const base = inkTop + ascentOf(g, s);
  if (align === 'right') g.fillText(s, x - inkRightOf(g, s), base);
  else g.fillText(s, x + inkLeftOf(g, s), base);
  return base;
}

function centerText(g, font, s, inkTop, cx = W / 2) {
  g.font = font;
  const m = g.measureText(s);
  const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  g.fillText(s, cx - inkW / 2 + m.actualBoundingBoxLeft, inkTop + m.actualBoundingBoxAscent);
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
  const [logo, graphic] = await Promise.all([
    svgSilhouette(LOGO_PATH, { viewBox: LOGO_VIEWBOX, width: LOGO_WIDTH, height: LOGO_HEIGHT }),
    svgSilhouette(r.graphicPath, { viewBox: '0 0 250 250', extraStyle: 'polyline,line,path{stroke-width:3.2}', width: GRAPHIC_SIZE, height: GRAPHIC_SIZE }),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  const g = canvas.getContext('2d');
  // 실제 글자를 먼저 측정해 필요한 높이만 확보한다. 고정 높이에 따른 잘림을 방지한다.
  const draws = [];
  const textBounds = [];
  const metrics = (font, text) => {
    g.font = font;
    const m = g.measureText(text);
    return { ascent: m.actualBoundingBoxAscent, height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
      width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight };
  };
  const text = (font, value, top, x = LEFT, align = 'left') => {
    const m = metrics(font, value);
    const left = align === 'center' ? x - m.width / 2 : align === 'right' ? x - m.width : x;
    textBounds.push({ text: value, left, right: left + m.width, top, bottom: top + m.height });
    draws.push(() => align === 'center' ? centerText(g, font, value, top, x) : textAt(g, font, value, { inkTop: top, x, align }));
    return top + m.height;
  };
  const divider = y => { const top = Math.ceil(y); draws.push(() => dashed(g, top)); return top; };
  const image = (img, top) => draws.push(() => g.drawImage(img, Math.round((W - img.width) / 2), top));

  const logoTop = 66;
  image(logo, logoTop);
  const titleTop = logoTop + LOGO_HEIGHT + 36;
  const titleBottom = text(F.title, '오늘의 운세', titleTop, W / 2, 'center');
  const issueTop = titleBottom + 33;
  const issueLabel = metrics(F.issue, '발행일');
  const issueBottom = Math.max(text(F.issue, '발행일', issueTop),
    text(F.issue, formatIssueDate(r.issueDate), issueTop, LEFT + issueLabel.width + 16));
  const firstDividerY = divider(issueBottom + 23);
  const graphicTop = firstDividerY + 46;
  image(graphic, graphicTop);

  const nameTop = graphicTop + GRAPHIC_SIZE + 24;
  g.font = F.name;
  const nameM = g.measureText(r.suName);
  g.font = F.hanja;
  const hanjaM = g.measureText(r.hanja);
  const nameGap = 8;
  const rowW = nameM.actualBoundingBoxLeft + nameM.width + nameGap + hanjaM.actualBoundingBoxRight;
  const x0 = (W - rowW) / 2 + nameM.actualBoundingBoxLeft;
  const nameBase = nameTop + Math.max(nameM.actualBoundingBoxAscent, hanjaM.actualBoundingBoxAscent);
  const nameBottom = nameBase + Math.max(nameM.actualBoundingBoxDescent, hanjaM.actualBoundingBoxDescent);
  textBounds.push({ text: r.suName + r.hanja, left: (W - rowW) / 2, right: (W + rowW) / 2, top: nameTop, bottom: nameBottom });
  draws.push(() => {
    g.font = F.name; g.fillText(r.suName, x0, nameBase);
    g.font = F.hanja; g.fillText(r.hanja, x0 + nameM.width + nameGap, nameBase);
  });
  const aliasTop = nameBottom + 13;
  const aliasBottom = text(F.alias, r.alias, aliasTop, W / 2, 'center');
  const nameDividerY = divider(aliasBottom + 51);

  const headingTop = nameDividerY + 37;
  const headingBottom = text(F.heading, '오늘의 운세', headingTop);
  const bodyTop = headingBottom + 30;
  g.font = F.body;
  const bodyLines = wrapKorean(g, r.fortuneText, BODY_WIDTH);
  let bodyBottom = bodyTop;
  bodyLines.forEach((line, i) => { bodyBottom = text(F.body, line, bodyTop + i * BODY_PITCH); });
  const bodyDividerY = divider(bodyBottom + 45);

  const luckyTop = bodyDividerY + 37;
  const luckyRows = [['행운의 방위', r.luck.direction], ['행운의 오방색', r.luck.color], ['행운의 행성', r.luck.planet]];
  let luckyBottom = luckyTop;
  luckyRows.forEach(([label, value], i) => {
    const top = luckyTop + i * LUCKY_PITCH;
    luckyBottom = Math.max(text(F.lucky, label, top), text(F.lucky, value, top, RIGHT, 'right'));
  });
  const luckyDividerY = divider(luckyBottom + 32);

  g.font = F.cheer;
  const cheerLines = wrapKorean(g, `“${r.cheer}”`, TEXT_WIDTH);
  const cheerTop = luckyDividerY + 39;
  let cheerBottom = cheerTop;
  cheerLines.forEach((line, i) => { cheerBottom = text(F.cheer, line, cheerTop + i * CHEER_PITCH, W / 2, 'center'); });
  const height = Math.ceil(cheerBottom + 80); // 응원 문구 뒤 마무리 여백만 남긴다.

  // 측정이 끝난 뒤 실제 높이로 캔버스를 생성하므로 긴 본문도 하단까지 보존한다.
  canvas.height = height;
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, height);
  g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  draws.forEach(draw => draw());
  const layout = { bodyLines, bodyLeft: LEFT, bodyWidth: BODY_WIDTH, bodyAlign: 'left', bodyTop, bodyBottom,
    bodyFontSize: 24, bodyPitch: BODY_PITCH, bodyDividerY, nameDividerY, cheerLines, cheerTop, cheerBottom,
    logoTop, logoWidth: LOGO_WIDTH, logoHeight: LOGO_HEIGHT, titleTop, issueTop, firstDividerY,
    graphicTop, graphicSize: GRAPHIC_SIZE, nameTop, aliasTop, aliasBottom, headingTop,
    luckyTop, luckyBottom, luckyPitch: LUCKY_PITCH, luckyDividerY, textBounds, height };
  return { ...toBitmap(g, height, RECEIPT_THRESHOLD), canvas, layout };
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
