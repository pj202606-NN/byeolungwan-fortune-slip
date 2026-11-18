// 최종 기간 제한·본문 여백·QR 여백·개발 미리보기·공개 에셋 검사
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const base = new URL('./', BASE).href;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: mkdtempSync(join(tmpdir(), 'final-')) });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('requestfailed', r => errors.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${base}index.html?dev=1&screen=result&date=2026-11-26`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__fortuneSlip?.state.result);
  const result = await page.evaluate(async () => {
    const S = window.__fortuneSlip;
    const { renderReceipt } = await import('./src/js/print/receipt-render.js');
    const { getTodayFortune } = await import('./src/js/domain/fortune-repo.js');
    const sel = document.querySelector('[data-preview="date"]');
    let datesMatch = true;
    for (const date of ['2026-11-25', '2026-11-26']) {
      sel.value = date; sel.dispatchEvent(new Event('change'));
      for (let id = 1; id <= 28; id++) {
        const m = await S.mansionById(id);
        const r = await S.resultFor(m, null);
        const f = await getTodayFortune({ mansion: m, dateIso: '2026-11-24' });
        datesMatch &&= r.receipt.issueIso === '2026-11-24' && r.fortune.date === '2026-11-24' && r.receipt.fortuneText === f.text && r.fortune.text === f.text;
      }
    }
    const bm = await renderReceipt(S.state.result);
    const l = bm.layout;
    const bit = (x, y) => (bm.bits[y * bm.widthBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
    let rightWhite = true, quietWhite = true;
    for (let y = l.bodyTop; y < l.bodyBottom + 1; y++) for (let x = 323; x < 384; x++) if (bit(x, y)) rightWhite = false;
    for (const qx of l.qrXs) for (let y = l.qrTop - l.qrQuiet; y < l.qrTop + l.qrSize + l.qrQuiet; y++) for (let x = qx - l.qrQuiet; x < qx + l.qrSize + l.qrQuiet; x++) {
      if ((x < qx || x >= qx + l.qrSize || y < l.qrTop || y >= l.qrTop + l.qrSize) && bit(x, y)) quietWhite = false;
    }
    return { datesMatch, rightWhite, quietWhite, screen: document.querySelector('[data-page="result"] .fortune-card__date').textContent };
  });
  ok(result.datesMatch && result.screen === '2026년 11월 24일', '개발 모드 25·26일: 28개 모두 화면·발행일·운세가 24일과 일치');
  ok(result.rightWhite, '최종 비트맵 본문 오른쪽 61px에 잉크 없음');
  ok(result.quietWhite, '110px QR 둘레 최소 16px(4모듈 이상) 흰 여백 보존');
  await page.click('.dev-printer__toggle');
  await page.click('[data-dev="preview"]');
  await page.waitForSelector('.dev-printer__receipt');
  ok(await page.$eval('.dev-printer__receipt', e => e.width === 384 && e.height > 800), '개발 패널 운세지 미리보기 생성');
  const paths = [...readFileSync(new URL('../../sw.js', import.meta.url), 'utf8').matchAll(/^ {2}'(\.\/[^']*)',/gm)].map(m => m[1]);
  const resources = await page.evaluate(async paths => Promise.all(paths.map(async p => {
    const r = await fetch(p, { cache: 'reload' });
    return { p, status: r.status, type: r.headers.get('content-type') };
  })), paths);
  ok(resources.every(r => r.status === 200), `하위 경로 포함 필수 정적 파일 ${resources.length}개 HTTP 200`);
  ok(resources.filter(r => r.p.endsWith('.json')).every(r => /json/.test(r.type)), '필수 JSON 응답 형식 정상');
  ok(errors.length === 0, `브라우저·에셋 오류 없음 ${JSON.stringify(errors)}`);
} finally { await browser.close(); }
console.log(`합계 PASS ${pass} / FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
