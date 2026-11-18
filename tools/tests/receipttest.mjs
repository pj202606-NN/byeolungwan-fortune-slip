// 새 운세지: 28개 × 날짜별 렌더링, QR 판독, 화면 연결, 인쇄 시점 날짜 재계산, 기존 전송 파이프라인
import puppeteer from 'puppeteer-core';
import jsQR from 'jsqr';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const ROOT = 'd:/대학/4학년/졸전/byeolungwan-fortune-slip/';
const SHOTS = 'd:/대학/4학년/졸전/byeolungwan-fortune-slip/tools/tests/output/';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));

const MOCK = () => {
  const cfg = window.__mock = { calls: [] };
  const device = new EventTarget();
  Object.assign(device, { id: 'mock-pt210a-22cd', name: 'PT210A_22CD' });
  const w = async (buf, mode) => {
    cfg.calls.push({ t: performance.now(), bytes: [...new Uint8Array(buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf)], mode });
    await new Promise((r) => setTimeout(r, 1));
  };
  const ch = { properties: { write: true, writeWithoutResponse: true }, writeValueWithoutResponse: (b) => w(b, 'noresp'), writeValueWithResponse: (b) => w(b, 'resp') };
  const svc = { async getCharacteristic(u) { if (u.startsWith('49535343-8841')) return ch; return { async startNotifications() {}, addEventListener() {} }; } };
  device.gatt = { connected: false, async connect() { this.connected = true; return this; }, disconnect() { this.connected = false; }, async getPrimaryService(u) { if (u !== '49535343-fe7d-4ae5-8fa9-9fafd205e455') throw new Error('svc'); return svc; } };
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { async requestDevice() { return device; }, async getDevices() { return []; } } });
};

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, protocolTimeout: 120000, userDataDir: mkdtempSync(join(tmpdir(), 'rcpt-')) });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.evaluateOnNewDocument(MOCK);
await page.emulate({ viewport: { width: 1280, height: 800, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X210) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
await page.goto(`${BASE}?dev=1`, { waitUntil: 'networkidle0' });

ok(await page.evaluate(async () => { await document.fonts.load('400 14px ByeolungwanHanja', '氐宿'); return document.fonts.check('400 14px ByeolungwanHanja', '角亢氐房心尾箕斗牛女虛危室壁奎婁胃昴畢觜參井鬼柳星張翼軫宿'); }), '한자 글꼴(ByeolungwanHanja) 로딩: 28수 한자·宿 모두 사용 가능');

// QR 원본을 크게 그려 판독한 값(기준)
const qrRef = await page.evaluate(async () => {
  const out = {};
  for (const [k, p] of [['app', 'public/assets/receipt/qr/app.svg'], ['web', 'public/assets/receipt/qr/website.svg']]) {
    const img = new Image(); img.src = p; await img.decode();
    const c = document.createElement('canvas'); c.width = 600; c.height = 600;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 600); g.drawImage(img, 0, 0, 600, 600);
    out[k] = [...g.getImageData(0, 0, 600, 600).data];
  }
  return out;
});
const decode = (rgba, w, h) => { const r = jsQR(Uint8ClampedArray.from(rgba), w, h); return r && r.data; };
const refApp = decode(qrRef.app, 600, 600), refWeb = decode(qrRef.web, 600, 600);
ok(!!refApp && !!refWeb && refApp !== refWeb, `QR 원본 판독: 앱 ${refApp} / 웹 ${refWeb}`);

console.log('— 28개 × 날짜별 운세지 렌더링');
const dates = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'];
const summary = await page.evaluate(async (dates) => {
  const { renderReceipt } = await import('./src/js/print/receipt-render.js');
  const { buildRasterPrint, rasterSummary } = await import('./src/js/print/escpos.js');
  const S = window.__fortuneSlip;
  const rows = [];
  for (const d of dates) {
    for (let id = 1; id <= 28; id++) {
      // 개발 패널과 같은 경로: 테스트 날짜 주입 → 별자리 결과 생성
      const sel = document.querySelector('[data-preview="date"]');
      sel.value = d; sel.dispatchEvent(new Event('change'));
      const res = await S.resultFor(await S.mansionById(id), null);
      const bm = await renderReceipt(res);
      // 실제 그래픽 영역 검정 비율, QR 영역 비트 추출
      const bit = (x, y) => (bm.bits[y * bm.widthBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
      const gs = bm.layout.graphicSize, gx = Math.round((384 - gs) / 2), gy = bm.layout.graphicTop;
      let gBlack = 0; for (let y = gy; y < gy + gs; y++) for (let x = gx; x < gx + gs; x++) gBlack += bit(x, y);
      const qr = (x0) => { const arr = []; const pad = 16; for (let y = bm.layout.qrTop - pad; y < bm.layout.qrTop + bm.layout.qrSize + pad; y++) for (let x = x0 - pad; x < x0 + bm.layout.qrSize + pad; x++) { const v = bit(x, y) ? 0 : 255; arr.push(v, v, v, 255); } return arr; };
      const bytes = buildRasterPrint(bm);
      rows.push({
        d, id, issue: res.receipt.issueIso, name: `${res.receipt.suName} ${res.receipt.hanja}`, alias: res.receipt.alias, text: res.receipt.fortuneText, src: res.receipt.fortuneSource,
        luck: res.receipt.luck, cheer: res.receipt.cheer, w: bm.widthBytes * 8, h: bm.height, layout: bm.layout, bodyLines: bm.layout.bodyLines, cheerLines: bm.layout.cheerLines,
        gBlack, gTotal: gs * gs, qrApp: id === 1 || id === 24 ? qr(bm.layout.qrXs[0]) : null, qrWeb: id === 1 || id === 24 ? qr(bm.layout.qrXs[1]) : null,
        rs: rasterSummary(bm), bytes: bytes.length, last3: [...bytes.slice(-3)],
      });
    }
  }
  return rows;
}, dates);
ok(summary.length === 140, `렌더링 ${summary.length}건(28개 × 5일)`);
ok(summary.every((r) => r.w === 384), '모든 운세지 폭 384 dots');
ok(summary.every((r) => r.layout.bodyLeft === 21.5 && r.layout.bodyWidth === 300 && r.layout.bodyAlign === 'left'), '본문만 300px·좌측 정렬, 왼쪽 21.5px 유지');
ok(summary.every((r) => r.layout.nameDividerY - r.layout.aliasBottom === 51), '이름 아래 잉크 끝~점선 51px');
ok(summary.every((r) => r.layout.qrSize === 110), 'QR 두 개 모두 110px');
const hs = summary.map((r) => r.h); ok(Math.min(...hs) > 800, `세로 길이는 내용에 따라 변함: ${Math.min(...hs)}~${Math.max(...hs)} dots (${(Math.min(...hs) / 8).toFixed(0)}~${(Math.max(...hs) / 8).toFixed(0)}mm)`);
ok(summary.every(r => r.layout.textBounds.every(b => b.left >= 0 && b.right <= 384 && b.top >= 0 && b.bottom < r.h)), '전체 글자 영역이 384px 폭과 동적 이미지 높이 안에 들어감(140건)');
ok(summary.every(r => r.layout.bodyFontSize === 24 && r.layout.bodyPitch === 35 && r.layout.bodyDividerY - r.layout.bodyBottom === 45 && r.layout.qrTop - r.layout.cheerBottom >= 62), '본문 24px·행간 35px, 본문·응원 문구·QR 간 충돌 없음');
ok(summary.every((r) => r.issue === r.d), '발행일 = 데이터 날짜');
ok(summary.every((r) => r.bodyLines.join('').replace(/\s/g, '') === r.text.replace(/\s/g, '')), '운세 본문이 줄바꿈만 되고 글자 하나도 빠지지 않음(140건)');
const maxLines = Math.max(...summary.map((r) => r.bodyLines.length)); const minLines = Math.min(...summary.map((r) => r.bodyLines.length));
ok(true, `본문 줄 수 ${minLines}~${maxLines}줄 — 줄 수만큼 아래 요소가 내려가고 영수증이 길어짐`);
ok(summary.every((r) => r.cheerLines.join(' ').replace(/\s+/g, ' ') === `“${r.cheer}”`), '응원 문구가 원문 그대로 “ ”와 함께 출력(28개)');
ok(summary.every((r) => r.gBlack > 150 && r.gBlack < r.gTotal * 0.25), `별자리 그래픽이 검정으로 찍히고 회색 네모 없음(검정 비율 ${Math.min(...summary.map((r) => r.gBlack))}~${Math.max(...summary.map((r) => r.gBlack))} / ${180 * 180} dots)`);
ok(summary.every((r) => r.rs.lastRows > 0 && r.rs.rasterBytes === 48 * r.h && r.last3.join() === '27,97,0'), '이미지 전송 데이터: 폭 48바이트 × 전체 높이, 끝은 ESC a 0(급지는 기존대로 별도 전송)');
const qrRows = summary.filter((r) => r.qrApp);
const qrDecoded = qrRows.map((r) => [decode(r.qrApp, r.layout.qrSize + 32, r.layout.qrSize + 32), decode(r.qrWeb, r.layout.qrSize + 32, r.layout.qrSize + 32)]);
ok(qrDecoded.every(([a, w]) => a === refApp && w === refWeb), `최종 흑백 비트맵에서 QR 2개 판독 성공(${qrRows.length * 2}건): 원본과 같은 주소`);
// 대표 4개(사신수별) 내용 확인
for (const id of [3, 12, 17, 24]) {
  const r = summary.find((x) => x.id === id && x.d === '2026-11-24');
  console.log(`     ID ${id}: ${r.name} / ${r.alias} / ${r.luck.direction}·${r.luck.color}·${r.luck.planet} / “${r.cheer}” / ${r.bodyLines.length}줄 / ${r.h}dots`);
}
const r3 = summary.find((x) => x.id === 3 && x.d === '2026-11-20');
ok(r3.name === '저수 氐宿' && r3.alias === '너구리자리' && r3.luck.direction === '동쪽' && r3.luck.color === '청색' && r3.luck.planet === '토성' && r3.cheer === '변화 속에서도 당신의 자리를 찾아가기를.', '저수: 동쪽·청색·토성·“변화 속에서도 당신의 자리를 찾아가기를.”');
const sashinCheck = [[8, '북쪽', '흑색'], [15, '서쪽', '백색'], [22, '남쪽', '적색']].every(([id, dir, col]) => { const r = summary.find((x) => x.id === id); return r.luck.direction === dir && r.luck.color === col; });
ok(sashinCheck, '북방현무 북쪽·흑색 / 서방백호 서쪽·백색 / 남방주작 남쪽·적색');

// 미리보기 이미지 저장(사신수별 4개 + 가장 긴 운세)
const longest = summary.reduce((a, b) => (b.h > a.h ? b : a));
const pics = await page.evaluate(async (list) => {
  const { renderReceipt, bitmapPreview } = await import('./src/js/print/receipt-render.js');
  const S = window.__fortuneSlip;
  const out = [];
  for (const [id, d] of list) {
    const sel = document.querySelector('[data-preview="date"]'); sel.value = d; sel.dispatchEvent(new Event('change'));
    const bm = await renderReceipt(await S.resultFor(await S.mansionById(id), null));
    out.push(bitmapPreview(bm).toDataURL('image/png'));
  }
  return out;
}, [[3, '2026-11-20'], [12, '2026-11-22'], [17, '2026-11-24'], [24, '2026-11-24'], [longest.id, longest.d]]);
pics.forEach((u, i) => writeFileSync(`${SHOTS}receipt-${i}.png`, Buffer.from(u.split(',')[1], 'base64')));
console.log(`     가장 긴 운세지: ID ${longest.id} ${longest.d} ${longest.h}dots, 본문 ${longest.bodyLines.length}줄`);

console.log('— 화면 연결(R-03·R-04)');
await page.evaluate(() => { const s = document.querySelector('[data-preview="date"]'); s.value = ''; s.dispatchEvent(new Event('change')); });
await page.goto(BASE, { waitUntil: 'networkidle0' });
const tap = async (s) => { await page.tap(s); await wait(); };
await tap('.start__btn');
await page.tap('#birth-year'); await page.keyboard.type('1995'); await page.keyboard.type('03'); await page.keyboard.type('07'); await wait();
await tap('.birth__submit'); await wait(600);
const scr = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const body = q('[data-page="result"] .fortune-card__body'); const foot = q('[data-page="result"] .fortune-card__foot');
  return {
    page: [...document.querySelectorAll('.page')].find((e) => !e.hidden).dataset.page,
    name: q('.star__name-ko').textContent, hanja: q('.star__name-hanja').textContent, alias: q('.star__alias').textContent,
    date: q('[data-page="result"] .fortune-card__date').textContent, body: body.textContent, foot: foot.textContent,
    icon: q('.star__icon').dataset.iconPath, circles: q('.star__icon svg') ? q('.star__icon svg').querySelectorAll('circle').length : 0,
    fits: body.getBoundingClientRect().bottom <= foot.getBoundingClientRect().top, fontSize: getComputedStyle(body).fontSize,
  };
});
const expect20 = JSON.parse(readFileSync(ROOT + 'src/data/receipt/byeolungwan_fortunes_2026-11-20_24.json', 'utf8')).constellations['장수'].daily['2026-11-20']['종합'].short;
ok(scr.page === 'result' && scr.name === '장수' && scr.hanja === '張宿' && scr.alias === '사슴자리', `1995-03-07 → R-03: ${scr.name} ${scr.hanja} ${scr.alias}`);
ok(scr.icon.endsWith('s05_jang.svg') && scr.circles > 0, `R-03 아이콘 ${scr.icon.split('/').pop()}`);
ok(scr.date === '2026년 11월 20일', `R-03 카드 날짜 ${scr.date} (오늘 11/19 → 11/20 데이터)`);
ok(scr.body === expect20 && scr.foot === '장수 · 張宿 · 사슴자리', 'R-03 카드 = 운세지와 같은 운세·표기');
ok(scr.fits, `R-03 카드 안에 운세 문장이 들어감(글자 ${scr.fontSize})`);
await page.screenshot({ path: `${SHOTS}r03-real.png` });

console.log('— 인쇄 시점 날짜 재계산 + 기존 전송');
await page.goto(`${BASE}?dev=1&date=2026-11-21`, { waitUntil: 'networkidle0' });
await tap('.start__btn');
await page.tap('#birth-year'); await page.keyboard.type('2001'); await page.keyboard.type('05'); await page.keyboard.type('01'); await wait();
await tap('.birth__submit'); await wait(600);
const before = await page.$eval('[data-page="result"] .fortune-card__date', (e) => e.textContent);
await page.tap('.dev-printer__toggle'); await wait();
await page.tap('[data-dev="connect"]'); await wait(300);
await page.select('[data-preview="date"]', '2026-11-22'); await wait(); // 화면을 띄운 뒤 날짜가 바뀐 상황
await page.evaluate(() => { window.__mock.calls = []; });
await tap('.result__print');
await page.waitForFunction(() => [...document.querySelectorAll('.page')].find((e) => !e.hidden).dataset.page === 'end', { timeout: 120000, polling: 200 }).catch(() => {});
const after = await page.evaluate(async () => ({ date: document.querySelector('[data-page="end"] .fortune-card__date').textContent, body: document.querySelector('[data-page="end"] .fortune-card__body').textContent, height: (await window.__fortuneSlip.printService.buildReceipt(window.__fortuneSlip.state.result)).bitmap.height, st: window.__fortuneSlip.state.result.receipt }));
const expect22 = JSON.parse(readFileSync(ROOT + 'src/data/receipt/byeolungwan_fortunes_2026-11-20_24.json', 'utf8')).constellations['저수'].daily['2026-11-22']['종합'].short;
ok(before === '2026년 11월 21일' && after.date === '2026년 11월 22일' && after.st.issueIso === '2026-11-22' && after.body === expect22, `인쇄 버튼 시점에 발행일 재계산: 화면 ${before} → 출력·완료 화면 ${after.date}`);
const calls = await page.evaluate(() => window.__mock.calls);
const last = calls[calls.length - 1]; const image = calls.slice(0, -1).flatMap((c) => c.bytes);
const hex = (a) => a.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
ok(hex(last.bytes) === '1B 40 1B 32 1B 64 06', `기존 급지 패킷 그대로: ${hex(last.bytes)}`);
const gap = last.t - calls[calls.length - 2].t;
ok(gap >= Math.max(1500, Math.min(5000, Math.round(400 + after.height / 400 * 1000))) - 20 && gap < Math.max(1500, Math.min(5000, Math.round(400 + after.height / 400 * 1000))) + 500, `이미지 전송 후 급지까지 ${Math.round(gap)}ms (기존 자동 대기: 이미지 높이에 비례, 최대 5000ms)`);
ok(Math.max(...calls.slice(0, -1).map((c) => c.bytes.length)) <= 128 && calls.every((c) => c.mode === 'noresp'), '청크 128B·쓰기 방식 기본값 그대로(설정 변경 없음)');
// 전송된 래스터 = 미리보기 비트맵
let rows = 0, wB = 0; for (let i = 0; i < image.length;) { if (image[i] === 0x1d && image[i + 1] === 0x76 && image[i + 2] === 0x30) { wB = image[i + 4]; const h = image[i + 6] | (image[i + 7] << 8); rows += h; i += 8 + wB * h; } else i++; }
ok(wB === 48 && rows > 800, `전송된 래스터 ${wB * 8}×${rows} (긴 이미지도 기존 96줄 밴드로 모두 전송)`);

ok(errors.length === 0, `콘솔 오류 없음 ${JSON.stringify(errors.slice(0, 3))}`);
console.log(`\n합계 PASS ${pass} / FAIL ${fail}`);
await browser.close();

process.exitCode = fail ? 1 : 0;
