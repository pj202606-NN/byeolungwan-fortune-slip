// 새 운세지 렌더러 ↔ 디자인 비교: 디자인 예시 문구로 그려 PNG 저장
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const SHOTS = 'd:/대학/4학년/졸전/byeolungwan-fortune-slip/tools/tests/output/';
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${BASE}index.html?dev=1`, { waitUntil: 'networkidle0' });
const out = await page.evaluate(async () => {
  const { renderReceipt, bitmapPreview } = await import('./src/js/print/receipt-render.js');
  const { mansionById } = await import('./src/js/domain/mansions.js');
  const m = await mansionById(3);
  const mk = (fortuneText, cheer) => ({ receipt: { issueDate: { y: 2026, m: 11, d: 20 }, suName: m.suName, hanja: m.hanja, alias: m.alias, graphicPath: m.graphicPath, fortuneText, luck: m.luck, cheer } });
  const design = await renderReceipt(mk('서두르지 않아도 괜찮습니다.\n차분히 이어 온 일에서\n작은 성과를 만날 수 있습니다.\n오늘은 나의 속도를 믿어 보세요.', '흔들림 없이 지켜 온 마음이 빛나기를.'));
  const toUrl = (bm) => bitmapPreview(bm).toDataURL('image/png');
  return { url: toUrl(design), canvasUrl: design.canvas.toDataURL('image/png'), h: design.height, layout: design.layout };
});
writeFileSync(`${SHOTS}calib-bitmap.png`, Buffer.from(out.url.split(',')[1], 'base64'));
writeFileSync(`${SHOTS}calib-canvas.png`, Buffer.from(out.canvasUrl.split(',')[1], 'base64'));
console.log('height', out.h, JSON.stringify(out.layout));
console.log('errors', JSON.stringify(errors));
await browser.close();
