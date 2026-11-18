// (1) R-03 카드: 140개 운세가 카드 안에 들어가는지  (2) 서비스 워커 캐시로 오프라인 운세지 생성
import puppeteer from 'puppeteer-core';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, protocolTimeout: 180000, userDataDir: mkdtempSync(join(tmpdir(), 'fit-')) });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.emulate({ viewport: { width: 1280, height: 800, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X210) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
await page.goto(`${BASE}index.html?dev=1&screen=result`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__fortuneSlip && window.__fortuneSlip.state.result, { timeout: 30000 });

const fit = await page.evaluate(async () => {
  const S = window.__fortuneSlip;
  const body = document.querySelector('[data-page="result"] .fortune-card__body');
  const foot = document.querySelector('[data-page="result"] .fortune-card__foot');
  const sel = document.querySelector('[data-preview="date"]');
  const out = [];
  for (const d of ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24']) {
    sel.value = d; sel.dispatchEvent(new Event('change'));
    for (let id = 1; id <= 28; id++) {
      const r = await S.resultFor(await S.mansionById(id), null);
      body.textContent = r.fortune.text;
      // app.js의 fitFortuneCards와 같은 규칙
      body.style.fontSize = ''; body.style.lineHeight = '';
      const maxH = foot.offsetTop - body.offsetTop - 12;
      let size = parseFloat(getComputedStyle(body).fontSize);
      const ratio = parseFloat(getComputedStyle(body).lineHeight) / size;
      while (body.scrollHeight > maxH && size > 18) { size -= 1; body.style.fontSize = `${size}px`; body.style.lineHeight = `${Math.round(size * Math.min(ratio, 1.55))}px`; }
      out.push({ d, id, size, fits: body.getBoundingClientRect().bottom <= foot.getBoundingClientRect().top, len: r.fortune.text.length });
    }
  }
  return out;
});
const sizes = fit.map((f) => f.size);
ok(fit.length === 140 && fit.every((f) => f.fits), `R-03 카드: 140개 운세 모두 카드 안에 들어감 (글자 ${Math.min(...sizes)}~${Math.max(...sizes)}px, 기본 35.2px)`);
const worst = fit.reduce((a, b) => (b.size < a.size ? b : a));
console.log(`     가장 많이 줄어든 경우: ID ${worst.id} ${worst.d} ${worst.len}자 → ${worst.size}px`);

console.log('— 오프라인');
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 60000 }).catch(() => {});
const cacheInfo = await page.evaluate(async () => {
  const keys = await caches.keys(); const c = await caches.open(keys[0]);
  return { keys, urls: (await c.keys()).map((r) => new URL(r.url).pathname) };
});
const sw = readFileSync('d:/대학/4학년/졸전/byeolungwan-fortune-slip/sw.js', 'utf8');
const listed = [...new Set([...sw.matchAll(/^ {2}'(\.\/[^']*)',/gm)].map((m) => m[1]))];
ok(cacheInfo.urls.length === listed.length, `서비스 워커 캐시 ${cacheInfo.urls.length}/${listed.length}개`);
ok(['byeolungwan_fortunes_2026-11-20_24.json', 'byeolungwan_28su_birthdate_reference.json', 'ByeolungwanHanja-Regular.woff2', 's03_ryu.svg', 'cheers.js', 'mansions.js', 'receipt-date.js'].every((n) => cacheInfo.urls.some((u) => u.endsWith(n))), '새 데이터·한자 글꼴·그래픽·모듈 캐시됨');
ok(cacheInfo.urls.filter((u) => u.includes('/constellations/')).length === 28, '별자리 그래픽 28개 캐시');
ok(!cacheInfo.urls.some((u) => u.includes('28su_database_final') || u.includes('descriptions') || u.includes('_v6') || u.endsWith('.md') || u.includes('/qr/')), '쓰지 않는 오래된 JS·소개 JSON·MD는 캐시하지 않음');
await page.setOfflineMode(true);
await page.reload({ waitUntil: 'networkidle0' });
const off = await page.evaluate(async () => {
  const S = window.__fortuneSlip;
  const { renderReceipt } = await import('./src/js/print/receipt-render.js');
  const r = await S.resultFor(await S.mansionById(19), null);
  const bm = await renderReceipt(r);
  return { h: bm.height, w: bm.widthBytes * 8, name: `${r.receipt.suName} ${r.receipt.hanja}`, text: r.receipt.fortuneText.slice(0, 20) };
});
ok(off.w === 384 && off.h > 800, `오프라인에서 운세지 생성: ${off.name} ${off.w}×${off.h} "${off.text}…"`);
ok(errors.length === 0, `오류 없음 ${JSON.stringify(errors.slice(0, 2))}`);
console.log(`\n합계 PASS ${pass} / FAIL ${fail}`);
await browser.close();

process.exitCode = fail ? 1 : 0;
