// 운세지(영수증) 전용 렌더러 — 화면 DOM이 아니라 result 데이터만으로 384px 폭 캔버스에 그린다.
// 흰 바탕에 검정으로 그린 뒤 1비트 비트맵(1 = 검정)으로 바꿔 ESC/POS 래스터로 보낸다.

import { PRINT_WIDTH_DOTS, BYTES_PER_ROW } from './escpos.js';

const W = PRINT_WIDTH_DOTS;
const PAD_X = 28;
const LOGO_PATH = 'public/assets/logo.svg';
const LOGO_VIEWBOX = '99 176 145 403';   // logo.svg의 실제 그림 영역(원본 파일은 수정하지 않고 메모리에서만 자름)
const ICON_VIEWBOX = '56 48 154 150';    // icon-s.svg 별·선 영역

const FONT_SERIF = 'MaruBuri';
const FONT_SANS = 'Pretendard';

async function ensureFonts() {
  await Promise.all([
    document.fonts.load(`400 24px ${FONT_SERIF}`),
    document.fonts.load(`600 24px ${FONT_SANS}`),
    document.fonts.load(`400 20px ${FONT_SANS}`),
  ]);
}

const svgCache = new Map();

/** SVG 원본을 읽어(파일은 그대로) 보기 영역·선 굵기만 메모리에서 바꾼 뒤, 검정 실루엣 캔버스로 만든다. */
async function svgSilhouette(path, { viewBox, extraStyle = '', width, height }) {
  const key = `${path}|${viewBox}|${extraStyle}|${width}x${height}`;
  if (svgCache.has(key)) return svgCache.get(key);
  const text = await (await fetch(path)).text();
  let svg = text.replace(/<\?xml[^>]*>/, '');
  if (viewBox) svg = svg.replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`);
  svg = svg.replace(/<svg\b/, `<svg width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"`);
  if (extraStyle) svg = svg.replace(/<\/svg>\s*$/, `<style>${extraStyle}</style></svg>`);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, width, height);
    // 색과 관계없이 그려진 부분을 모두 검정으로(밝은 색 별 점도 인쇄되도록)
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#000';
    g.fillRect(0, 0, width, height);
    svgCache.set(key, c);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 최대 폭을 넘는 줄은 띄어쓰기 기준으로 나눈다(글자를 줄이거나 자르지 않음). */
function wrapLines(g, lines, maxWidth) {
  const out = [];
  for (const line of lines) {
    if (g.measureText(line).width <= maxWidth) { out.push(line); continue; }
    let cur = '';
    for (const word of line.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && g.measureText(next).width > maxWidth) { out.push(cur); cur = word; } else cur = next;
    }
    if (cur) out.push(cur);
  }
  return out;
}

function divider(g, y) {
  g.fillRect(PAD_X, y, W - PAD_X * 2, 2);
}

/**
 * @param {object} result  app.js의 state.result (화면과 같은 데이터)
 * @returns {{bits:Uint8Array, widthBytes:number, height:number, canvas:HTMLCanvasElement}}
 */
export async function renderReceipt(result) {
  await ensureFonts();
  const [logo, icon] = await Promise.all([
    svgSilhouette(LOGO_PATH, { viewBox: LOGO_VIEWBOX, width: 46, height: 128 }),
    svgSilhouette(result.star.iconPath, {
      viewBox: ICON_VIEWBOX,
      extraStyle: 'polyline,line,path{stroke-width:2.6}',
      width: 196, height: 190,
    }),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = 1600; // 넉넉히 그리고 마지막에 실제 높이로 자른다
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, canvas.height);
  g.fillStyle = '#000';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';

  let y = 20;
  g.drawImage(logo, (W - logo.width) / 2, y);
  y += logo.height + 30;

  g.font = `600 26px ${FONT_SANS}`;
  g.fillText('오늘의 운세', W / 2, y + 24);
  y += 36;
  g.font = `400 21px ${FONT_SANS}`;
  g.fillText(result.fortune.dateLabel, W / 2, y + 21);
  y += 42;

  divider(g, y);
  y += 22;

  g.drawImage(icon, (W - icon.width) / 2, y);
  y += icon.height + 12;

  // 별자리 이름 + 한자: 두 크기를 한 줄 가운데에 함께 놓는다
  const nameFont = `400 54px ${FONT_SERIF}`;
  const hanjaFont = `400 30px ${FONT_SERIF}`;
  g.font = nameFont;
  const nameW = g.measureText(result.star.name).width;
  g.font = hanjaFont;
  const gap = 14;
  const hanjaW = g.measureText(result.star.hanja).width;
  const startX = (W - (nameW + gap + hanjaW)) / 2;
  const baseline = y + 52;
  g.textAlign = 'left';
  g.font = nameFont;
  g.fillText(result.star.name, startX, baseline);
  g.font = hanjaFont;
  g.fillText(result.star.hanja, startX + nameW + gap, baseline);
  g.textAlign = 'center';
  y = baseline + 16;

  g.font = `400 30px ${FONT_SERIF}`;
  g.fillText(result.star.alias, W / 2, y + 30);
  y += 54;

  divider(g, y);
  y += 30;

  // 운세 문장은 원래 줄 나눔을 지킨다: 모든 줄이 폭에 들어갈 때까지 글자를 조금씩 줄이고(25→19px),
  // 그래도 넘치는 줄만 띄어쓰기에서 나눈다.
  const textWidth = W - 40;
  let size = 25;
  for (; size > 19; size--) {
    g.font = `400 ${size}px ${FONT_SERIF}`;
    if (result.fortune.lines.every((l) => g.measureText(l).width <= textWidth)) break;
  }
  g.font = `400 ${size}px ${FONT_SERIF}`;
  const lineHeight = Math.round(size * 1.68);
  for (const line of wrapLines(g, result.fortune.lines, textWidth)) {
    g.fillText(line, W / 2, y + size);
    y += lineHeight;
  }
  y += 14;
  divider(g, y);
  y += 2 + 24; // 하단 여백(용지 급지는 ESC/POS 명령으로 따로)

  const height = Math.ceil(y);
  return { ...toBitmap(g, height), canvas: cropCanvas(canvas, height) };
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
