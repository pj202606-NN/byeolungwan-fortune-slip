// ESC/POS 명령 생성 — 프린터 연결과 분리된 순수 함수들.
// PT210A(58mm, 인쇄 폭 384 dots)에서 nRF Connect로 "1B 40 ... 0A 0A"가 인쇄되는 것을 확인한 경로를 따른다.
// 한글은 프린터 내장 글꼴/코드페이지에 의존하지 않도록 텍스트가 아니라 래스터 이미지(GS v 0)로 보낸다.

export const PRINT_WIDTH_DOTS = 384;            // 58mm 용지 인쇄 폭
export const BYTES_PER_ROW = PRINT_WIDTH_DOTS / 8;

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export const cmd = {
  init: () => [ESC, 0x40],                                   // ESC @  프린터 초기화
  align: (n) => [ESC, 0x61, n],                              // ESC a n  0=왼쪽 1=가운데 2=오른쪽
  lineSpacingDefault: () => [ESC, 0x32],                     // ESC 2  기본 줄 간격
  feedLines: (n) => [ESC, 0x64, Math.max(0, Math.min(255, n))], // ESC d n  n줄 급지
  lf: () => [LF],
};

/** ASCII 텍스트 한 줄. (한글 불가 — 테스트 출력 전용) */
export function asciiLine(text) {
  const bytes = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    bytes.push(code >= 0x20 && code < 0x7f ? code : 0x3f); // ASCII 밖 문자는 '?'
  }
  bytes.push(LF);
  return bytes;
}

/**
 * 1비트 비트맵 → GS v 0 래스터 명령들.
 * 한 번에 너무 큰 이미지를 보내지 않도록 bandRows 줄씩 나눠 각각 독립된 GS v 0 명령으로 만든다.
 * @param {Uint8Array} bits  행 우선, 한 줄 widthBytes 바이트, MSB가 왼쪽 점, 1 = 검정
 */
export function rasterCommands(bits, widthBytes, height, bandRows = 96) {
  const out = [];
  for (let y0 = 0; y0 < height; y0 += bandRows) {
    const rows = Math.min(bandRows, height - y0);
    out.push(
      GS, 0x76, 0x30, 0x00,                 // GS v 0, m=0(일반 크기)
      widthBytes & 0xff, (widthBytes >> 8) & 0xff,
      rows & 0xff, (rows >> 8) & 0xff,
    );
    const start = y0 * widthBytes;
    for (let i = start; i < start + rows * widthBytes; i++) out.push(bits[i]);
  }
  return out;
}

/** 테스트 출력: nRF Connect에서 성공한 것과 같은 초기화 + 텍스트 + 줄바꿈 */
export function buildTestPrint(lines = ['BYEOLUNGWAN TEST']) {
  return Uint8Array.from([
    ...cmd.init(),
    ...cmd.align(1),
    ...lines.flatMap((l) => asciiLine(l)),
    ...cmd.align(0),
    ...cmd.feedLines(3),
  ]);
}

/** 인쇄 후 종이 배출 기본값(줄). ESC d n은 mm가 아니라 현재 줄 간격(ESC 2 기본값) × n 만큼 급지한다.
 *  PT210A 실측: 10줄 ≈ 35mm(줄당 약 3.5mm) → 6줄 ≈ 21mm. */
export const DEFAULT_FEED_LINES = 6;

/** 운세지·보정 출력의 이미지 부분: 초기화 → 가운데 정렬 → 래스터 이미지 → 정렬 복귀.
 *  급지는 인쇄가 끝난 뒤 buildPostPrintFeed로 따로 보낸다. */
export function buildRasterPrint(bitmap) {
  return Uint8Array.from([
    ...cmd.init(),
    ...cmd.lineSpacingDefault(),
    ...cmd.align(1),
    ...rasterCommands(bitmap.bits, bitmap.widthBytes, bitmap.height),
    ...cmd.align(0),
  ]);
}

/**
 * 인쇄 후 급지 명령 두 가지(PT210A 실물 결과 기준)
 *  - 'init'  (B, 7바이트) ESC @ · ESC 2 · ESC d n  — 운세지 출력 직후에도 종이가 배출되는 것이 실물로 확인됨
 *  - 'plain' (A, 5바이트) ESC 2 · ESC d n          — 운세지 이미지 직후에는 배출되지 않았음(f2ff972)
 * 가설: PT210A는 GS v 0 래스터 인쇄 뒤 ESC @로 초기화하기 전까지 ESC d를 실행하지 않는다.
 * ESC @는 아직 인쇄되지 않은 버퍼를 지우므로, 이미지 인쇄가 끝났을 시점(대기 후)에만 보낸다.
 */
export const FEED_MODES = Object.freeze({
  init: { label: 'B · ESC @ 포함 (7B)', build: (n) => [...cmd.init(), ...cmd.lineSpacingDefault(), ...cmd.feedLines(n)] },
  plain: { label: 'A · ESC @ 없음 (5B)', build: (n) => [...cmd.lineSpacingDefault(), ...cmd.feedLines(n)] },
});
export const DEFAULT_FEED_MODE = 'init';

export function buildPostPrintFeed(feed = DEFAULT_FEED_LINES, mode = DEFAULT_FEED_MODE) {
  return Uint8Array.from((FEED_MODES[mode] || FEED_MODES[DEFAULT_FEED_MODE]).build(feed));
}

/** 종이 배출 테스트: 아무것도 인쇄하지 않고 급지만 (B와 같은 7바이트). 실기기에서 동작 확인됨 */
export function buildFeedOnly(feed = DEFAULT_FEED_LINES) {
  return buildPostPrintFeed(feed, 'init');
}

/** 래스터 밴드 요약(로그용): 밴드 수, 마지막 밴드 줄 수, 래스터 데이터 바이트 */
export function rasterSummary(bitmap, bandRows = 96) {
  const bands = Math.ceil(bitmap.height / bandRows);
  return { bands, lastRows: bitmap.height - bandRows * (bands - 1), rasterBytes: bitmap.widthBytes * bitmap.height };
}

/** 디버깅용 16진수 표기 */
export function toHex(bytes, max = 64) {
  const arr = [...bytes.slice(0, max)].map((b) => b.toString(16).padStart(2, '0').toUpperCase());
  return arr.join(' ') + (bytes.length > max ? ` … (${bytes.length} bytes)` : '');
}
