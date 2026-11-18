// 설치된 이전 버전(PWA) → 새 배포 감지 → 체험 중에는 유지 → 시작 화면에서만 적용 → 새 파일 캐시 확인
import puppeteer from 'puppeteer-core';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = 'https://pj202606-nn.github.io/byeolungwan-fortune-slip/';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${new Date().toLocaleTimeString('ko-KR')} ${c ? 'PASS' : 'FAIL'} ${m}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const remoteVersion = async () => (await (await fetch(`${BASE}sw.js?t=${Date.now()}`, { cache: 'no-store' })).text()).match(/const VERSION = '([^']+)'/)[1];

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: mkdtempSync(join(tmpdir(), 'lu-')) });
const page = await browser.newPage();
await page.emulate({ viewport: { width: 1280, height: 800, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X210) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
const swVersion = () => page.evaluate(() => new Promise((res) => {
  const c = navigator.serviceWorker.controller; if (!c) return res(null);
  const ch = new MessageChannel(); ch.port1.onmessage = (e) => res(e.data.version);
  c.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
}));
const visiblePage = () => page.$$eval('.page', (els) => els.filter((e) => !e.hidden).map((e) => e.dataset.page).join(','));

await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 60000 });
const v1 = await swVersion();
console.log('설치된 이전 버전:', v1);
await page.tap('.start__btn'); await wait(200);
await page.tap('#birth-year'); await page.keyboard.type('1995'); await page.keyboard.type('03'); await page.keyboard.type('07'); await wait(200);
await page.tap('.birth__submit'); await wait(300);
await page.evaluate(() => { window.__marker = 'same-document'; });
console.log('결과 화면(체험 중)에서 새 배포를 기다립니다…');

const deadline = Date.now() + 15 * 60e3;
let v2 = v1;
while (Date.now() < deadline && v2 === v1) { await wait(10000); v2 = await remoteVersion().catch(() => v1); }
ok(v2 !== v1, `새 버전 배포 확인: ${v1} → ${v2}`);
await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting, { timeout: 120000, polling: 500 });
ok(true, '새 버전 다운로드 완료 → 대기');
await wait(20000);
ok(await page.evaluate(() => window.__marker) === 'same-document' && await visiblePage() === 'result', '결과 화면(체험 중) 20초 동안 새로고침 없음');
ok(await swVersion() === v1, '체험 중에는 이전 버전 유지');
await page.tap('[data-page="result"] .page__btn-left'); await wait(200);
await page.tap('[data-page="birth"] .page__btn-left');
const t0 = Date.now();
await page.waitForFunction(() => window.__marker === undefined, { timeout: 60000, polling: 500 }).catch(() => {});
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 20000 }).catch(() => {});
ok(await page.evaluate(() => window.__marker) === undefined, `시작 화면에서 ${((Date.now() - t0) / 1000).toFixed(1)}초 후 새 버전 적용`);
ok(await swVersion() === v2, `새 버전 동작: ${await swVersion()}`);
const cache = await page.evaluate(async () => {
  const keys = await caches.keys();
  const c = await caches.open(keys[0]);
  return { keys, urls: (await c.keys()).map((r) => new URL(r.url).pathname) };
});
ok(cache.keys.length === 1 && cache.keys[0] === `fortune-slip-${v2}`, `이전 캐시 정리: ${cache.keys}`);
const need = ['print/escpos.js', 'print/pt210a-ble.js', 'print/print-service.js', 'print/receipt-render.js', 'ui/printer-ui.js'];
ok(need.every((n) => cache.urls.some((u) => u.endsWith(n))), `새 출력 모듈 5개 캐시됨 (전체 ${cache.urls.length}개)`);
ok(await page.$('#printer-chip') !== null, '업데이트 후 프린터 UI 로딩');
console.log(`\n합계 PASS ${pass} / FAIL ${fail}`);
await browser.close();
