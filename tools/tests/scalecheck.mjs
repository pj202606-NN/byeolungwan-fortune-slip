// 확대된 실제 텍스트 렌더링·장문 하단 보존·28개 그래픽 외곽 및 비교 이미지
import puppeteer from 'puppeteer-core';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const BASE = new URL('./', process.env.BASE || 'http://127.0.0.1:8765/').href;
const output = new URL('./output/', import.meta.url);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: mkdtempSync(join(tmpdir(), 'scale-')) });
try {
  const page = await browser.newPage();
  await page.goto(`${BASE}index.html?dev=1&screen=result&date=2026-11-20`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__fortuneSlip?.state.result);
  const before = 'data:image/png;base64,' + readFileSync(new URL('receipt-before-enlargement.png', output)).toString('base64');
  const data = await page.evaluate(async before => {
    const { renderReceipt, bitmapPreview } = await import('./src/js/print/receipt-render.js');
    const { buildRasterPrint, rasterSummary } = await import('./src/js/print/escpos.js');
    const { createPrintService } = await import('./src/js/print/print-service.js');
    const S = window.__fortuneSlip;
    const r = await S.resultFor(await S.mansionById(3), null);
    const drawn = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(value, ...args) {
      drawn.push({ value, font: this.font }); return original.call(this, value, ...args);
    };
    let normal;
    try { normal = await renderReceipt(r); } finally { CanvasRenderingContext2D.prototype.fillText = original; }
    const longResult = { ...r, receipt: { ...r.receipt, fortuneText: Array(12).fill(r.receipt.fortuneText).join(' ') } };
    const long = await renderReceipt(longResult);
    const transmissions = [];
    const fakePrinter = {
      snapshot: () => ({ supported: true, settings: { feedLines: 6, feedMode: 'init', feedDelayMs: 0 } }),
      isConnected: () => true, setJobPhase() {},
      async write(bytes) { transmissions.push({ t: performance.now(), length: bytes.length, feed: bytes.length === 7 ? [...bytes] : null }); },
    };
    const print = await createPrintService(fakePrinter).printReceipt(longResult);
    const lp = bitmapPreview(long);
    const footer = lp.getContext('2d').getImageData(0, Math.ceil(long.layout.cheerBottom), 384, long.height - Math.ceil(long.layout.cheerBottom)).data;
    const footerWhite = footer.every((v, i) => i % 4 === 3 || v === 255);
    const contact = document.createElement('canvas'); contact.width = 7 * 200; contact.height = 4 * 230;
    const cg = contact.getContext('2d'); cg.fillStyle = '#fff'; cg.fillRect(0, 0, contact.width, contact.height);
    const bounds = [];
    for (let id = 1; id <= 28; id++) {
      const result = await S.resultFor(await S.mansionById(id), null);
      const bm = await renderReceipt(result), l = bm.layout, left = (384 - l.graphicSize) / 2;
      const crop = bm.canvas.getContext('2d').getImageData(left, l.graphicTop, l.graphicSize, l.graphicSize);
      let minX = 180, minY = 180, maxX = -1, maxY = -1;
      for (let y = 0; y < 180; y++) for (let x = 0; x < 180; x++) if (crop.data[(y * 180 + x) * 4] < 200) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      bounds.push({ id, minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 });
      const x = ((id - 1) % 7) * 200, y = Math.floor((id - 1) / 7) * 230;
      cg.drawImage(bitmapPreview(bm), left, l.graphicTop, 180, 180, x + 10, y + 10, 180, 180);
      cg.fillStyle = '#000'; cg.font = '18px Pretendard'; cg.textAlign = 'center'; cg.fillText(`${id} ${result.receipt.suName}`, x + 100, y + 216);
    }
    const old = new Image(); old.src = before; await old.decode();
    const comparison = document.createElement('canvas'); comparison.width = 800; comparison.height = Math.max(old.height, normal.height) + 40;
    const c = comparison.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, comparison.width, comparison.height);
    c.fillStyle = '#000'; c.font = '18px Pretendard'; c.fillText('이전 (384px)', 20, 24); c.fillText('확대 후 (384px)', 420, 24);
    c.drawImage(old, 0, 40); c.drawImage(bitmapPreview(normal), 416, 40);
    return { drawn, bodyLines: normal.layout.bodyLines, layout: normal.layout, bounds, transmissions, printStatus: print.status,
      longHeight: long.height, longCanvasHeight: long.canvas.height, longLines: long.layout.bodyLines,
      longText: longResult.receipt.fortuneText, raster: rasterSummary(long), bytes: buildRasterPrint(long).length,
      footerWhite, comparison: comparison.toDataURL(), contact: contact.toDataURL(), longPreview: lp.toDataURL() };
  }, before);
  ok(data.bodyLines.every(line => data.drawn.some(d => d.value === line && /24px/.test(d.font))), '실제 fillText 본문 글꼴 24px 적용');
  ok(data.layout.logoHeight === 80 && data.layout.graphicSize === 180, '로고 80px 높이·그래픽 180px 개별 렌더링');
  ok(data.bounds.every(b => b.minX > 0 && b.minY > 0 && b.maxX < 179 && b.maxY < 179), '28개 그래픽 모두 프레임 가장자리에 닿지 않아 잘림 없음');
  console.log('그래픽 잉크 크기 범위:', Math.min(...data.bounds.map(b => b.width)), '~', Math.max(...data.bounds.map(b => b.width)), '×', Math.min(...data.bounds.map(b => b.height)), '~', Math.max(...data.bounds.map(b => b.height)));
  ok(data.longHeight > 2000 && data.longCanvasHeight === data.longHeight && data.longLines.join('').replace(/\s/g, '') === data.longText.replace(/\s/g, ''), `2000px 초과 장문도 전체 생성·누락 없음(${data.longHeight}px)`);
  ok(data.raster.rasterBytes === 48 * data.longHeight && data.raster.lastRows > 0, '장문 전체 높이가 ESC/POS 래스터에 포함됨');
  ok(data.printStatus === 'printed' && data.transmissions.length === 2 && data.transmissions[1].feed.join(',') === '27,64,27,50,27,100,6', '장문도 이미지 전체와 기존 급지 7바이트를 별도 쓰기로 전송');
  const wait = data.transmissions[1].t - data.transmissions[0].t;
  ok(wait >= 4980 && wait < 5700, `장문 자동 대기 상한 5초 확인(${Math.round(wait)}ms)`);
  ok(data.footerWhite, '장문도 응원 문구 뒤 흰 여백으로 끝남');
  for (const [name, url] of [['receipt-comparison.png', data.comparison], ['constellations-enlarged.png', data.contact], ['receipt-long.png', data.longPreview]]) writeFileSync(new URL(name, output), Buffer.from(url.split(',')[1], 'base64'));
} finally { await browser.close(); }
console.log(`합계 PASS ${pass} / FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
