// R-01 프린터 버튼 + 개발/일반 모드 설정 공유 검증 (가짜 PT210A)
import puppeteer from 'puppeteer-core';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const SHOTS = 'd:/대학/4학년/졸전/byeolungwan-fortune-slip/tools/tests/output/';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const hex = (a) => a.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

const MOCK = () => {
  const cfg = window.__mock = { calls: [], requests: 0, cancel: false, blockConnect: false };
  const device = new EventTarget();
  Object.assign(device, { id: 'mock-pt210a-22cd', name: 'PT210A_22CD' });
  const w = async (buf, mode) => {
    if (!device.gatt.connected) throw new DOMException('GATT Server is disconnected.', 'NetworkError');
    cfg.calls.push({ t: performance.now(), bytes: [...new Uint8Array(buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf)], mode });
    await new Promise((r) => setTimeout(r, 1));
  };
  const ch = { properties: { write: true, writeWithoutResponse: true }, writeValueWithoutResponse: (b) => w(b, 'noresp'), writeValueWithResponse: (b) => w(b, 'resp') };
  const svc = { async getCharacteristic(u) { if (u.startsWith('49535343-8841')) return ch; return { async startNotifications() {}, addEventListener() {} }; } };
  device.gatt = {
    connected: false,
    async connect() { if (cfg.blockConnect) throw new DOMException('fail', 'NetworkError'); await new Promise((r) => setTimeout(r, 20)); this.connected = true; return this; },
    disconnect() { this.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); },
    async getPrimaryService() { return svc; },
  };
  cfg.device = device;
  cfg.drop = () => { device.gatt.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); };
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: {
    async requestDevice() { cfg.requests++; if (cfg.cancel) throw new DOMException('User cancelled', 'NotFoundError'); return device; },
    async getDevices() { return []; },
  } });
};

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, protocolTimeout: 60000, userDataDir: mkdtempSync(join(tmpdir(), 'share-')) });
const errors = [];
async function open(url) {
  const p = await browser.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.evaluateOnNewDocument(MOCK);
  await p.emulate({ viewport: { width: 1280, height: 800, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X210) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
  await p.goto(url, { waitUntil: 'networkidle0' });
  return p;
}
const tap = async (p, s) => { await p.tap(s); await wait(); };
const vis = (p) => p.$$eval('.page', (els) => els.filter((e) => !e.hidden).map((e) => e.dataset.page).join(','));
const startBtn = (p) => p.$eval('#start-printer', (e) => ({ hidden: e.hidden, text: e.textContent.trim(), status: e.dataset.status }));
async function toResult(p) {
  await tap(p, '.start__btn');
  await p.tap('#birth-year'); await p.keyboard.type('1995'); await p.keyboard.type('03'); await p.keyboard.type('07'); await wait();
  await tap(p, '.birth__submit');
}
const waitEnd = (p) => p.waitForFunction(() => [...document.querySelectorAll('.page')].find((e) => !e.hidden).dataset.page === 'end', { timeout: 90000, polling: 100 }).then(() => true, () => false);

// 태블릿에 이미 저장된 값(실물에서 정상 출력된 조합이라고 가정)
const TABLET = { id: 'mock-pt210a-22cd', name: 'PT210A_22CD', feedRev: 2, settings: { chunkSize: 64, chunkDelayMs: 20, writeMode: 'with-response', feedLines: 6, feedMode: 'init', feedDelayMs: 0 } };

// ── 1. 일반 모드 R-01 버튼 ──
console.log('— R-01 프린터 버튼(일반 모드)');
let normal = await open(BASE);
await normal.evaluate((s) => localStorage.setItem('byeolungwan.printer', JSON.stringify(s)), TABLET);
await normal.reload({ waitUntil: 'networkidle0' });
let b = await startBtn(normal);
ok(!b.hidden && b.text === '프린터 연결' && b.status === 'disconnected', `미연결: "${b.text}" 표시`);
const geo = await normal.evaluate(() => {
  const s = document.getElementById('stage').getBoundingClientRect(); const k = s.width / 1920;
  const r = (el) => { const b = el.getBoundingClientRect(); return { x0: (b.left - s.left) / k, x1: (b.right - s.left) / k, y0: (b.top - s.top) / k, y1: (b.bottom - s.top) / k }; };
  const range = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); const b = rg.getBoundingClientRect(); return { x0: (b.left - s.left) / k, x1: (b.right - s.left) / k, y0: (b.top - s.top) / k, y1: (b.bottom - s.top) / k }; };
  return { btn: r(document.getElementById('start-printer')), logo: r(document.querySelector('.brand-logo')), help: r(document.querySelector('.help-btn')), eyebrow: range(document.querySelector('[data-page="start"] .intro__eyebrow')), icon: !document.querySelector('#start-printer svg') && document.getElementById('start-printer').classList.contains('printer-chip') };
});
const cx = (geo.btn.x0 + geo.btn.x1) / 2, cy = (geo.btn.y0 + geo.btn.y1) / 2;
ok(Math.abs(cx - 960) < 2 && Math.abs(cy - 125.5) < 2, `상단 가운데 배치: 중심 (${cx.toFixed(0)}, ${cy.toFixed(0)}), 크기 ${Math.round(geo.btn.x1 - geo.btn.x0)}×${Math.round(geo.btn.y1 - geo.btn.y0)}`);
const overlap = (a, c) => Math.min(a.x1, c.x1) > Math.max(a.x0, c.x0) && Math.min(a.y1, c.y1) > Math.max(a.y0, c.y0);
ok(!overlap(geo.btn, geo.logo) && !overlap(geo.btn, geo.help) && geo.btn.y1 < geo.eyebrow.y0 - 100, '로고·도움말·안내 문구와 겹치지 않음');
ok(geo.icon, '이전 R-03 버튼과 같은 .printer-chip 외형(아이콘 없이 상태 점)');
ok(await normal.$('.dev-printer') === null && await normal.$('.dev-badge') === null, '일반 모드: DEV 패널·개발 표시 없음');
await normal.screenshot({ path: `${SHOTS}r01-disconnected.png` });

// 선택 취소
await normal.evaluate(() => { window.__mock.cancel = true; });
await tap(normal, '#start-printer');
ok((await normal.$eval('#start-printer-msg', (e) => e.textContent)).includes('취소'), `선택 취소 안내: "${await normal.$eval('#start-printer-msg', (e) => e.textContent)}"`);
await normal.evaluate(() => { window.__mock.cancel = false; });

// 연결
await tap(normal, '#start-printer'); await wait(300);
b = await startBtn(normal);
ok(b.text === '프린터 연결됨' && b.status === 'connected', `연결 성공 → "${b.text}"`);
ok((await normal.$eval('#start-printer-msg', (e) => e.textContent)) === '', '연결 후 안내 문구 사라짐');
const req1 = await normal.evaluate(() => window.__mock.requests);
await tap(normal, '#start-printer');
ok(await normal.evaluate(() => window.__mock.requests) === req1, '연결된 상태에서 다시 눌러도 기기 선택 창 안 열림');
await normal.screenshot({ path: `${SHOTS}r01-connected.png` });
ok(await normal.evaluate((s) => JSON.stringify(JSON.parse(localStorage.getItem('byeolungwan.printer')).settings) === JSON.stringify(s.settings), TABLET), '연결해도 저장된 설정을 덮어쓰지 않음');

// 연결 끊김 → 버튼 복귀 → 재연결
await normal.evaluate(() => { window.__mock.blockConnect = true; window.__mock.drop(); });
await wait(300);
b = await startBtn(normal);
ok(b.text === '프린터 연결' && b.status === 'disconnected', `연결 끊김 → "${b.text}"로 복귀`);
await normal.evaluate(() => { window.__mock.blockConnect = false; });
await normal.waitForFunction(() => document.getElementById('start-printer').dataset.status === 'connected', { timeout: 15000 }).catch(() => {});
ok((await startBtn(normal)).status === 'connected', '같은 기기는 터치 없이 자동 재연결(실패 시 버튼으로 수동 연결 가능)');

// ── 2. R-03 복구 경로 ──
console.log('— R-03');
await toResult(normal);
ok(await normal.$eval('#printer-chip', (e) => e.hidden), '연결 정상: R-03 연결 버튼 숨김');
await normal.evaluate(() => { window.__mock.blockConnect = true; window.__mock.drop(); });
await wait(300);
ok(!(await normal.$eval('#printer-chip', (e) => e.hidden)), '체험 중 연결 끊김: R-03에 복구용 연결 버튼 표시');
await tap(normal, '.result__print');
ok(await vis(normal) === 'result' && (await normal.$eval('#print-error', (e) => e.textContent)).includes('연결되어 있지 않습니다'), 'R-03: 미연결 출력은 안내 후 결과 화면 유지');
await normal.evaluate(() => { window.__mock.blockConnect = false; });
await normal.evaluate(() => { const d = window.__mock.device; d.gatt.connected = false; });
await tap(normal, '#printer-chip'); await wait(400);
await normal.waitForFunction(() => document.getElementById('printer-chip').hidden, { timeout: 15000 }).catch(() => {});
ok(await normal.$eval('#printer-chip', (e) => e.hidden), 'R-03에서 다시 연결 → 버튼 숨김');
await normal.evaluate(() => { window.__mock.calls = []; });
await tap(normal, '.result__print');
ok(await waitEnd(normal), '재연결 후 운세지 출력 → 완료 화면');
let c = await normal.evaluate(() => window.__mock.calls);
ok(hex(c[c.length - 1].bytes) === '1B 40 1B 32 1B 64 06' && Math.max(...c.slice(0, -1).map((x) => x.bytes.length)) <= 64 && c.every((x) => x.mode === 'resp'), '저장된 설정(64B·with response·B 6줄)으로 출력');
await tap(normal, '.end__home');
ok((await startBtn(normal)).status === 'connected', '처음 화면으로 돌아와도 "프린터 연결됨" 유지');

// ── 3. 개발 모드에서 바꾼 설정 → 열려 있는 일반 모드에 즉시 적용 ──
console.log('— 설정 공유');
const devPage = await open(`${BASE}?dev=1`);
await devPage.bringToFront();
ok(await devPage.$('.dev-printer') !== null && (await devPage.$eval('#start-printer', (e) => e.hidden)), '개발 모드: DEV 패널 유지, R-01 상단 버튼 대신 패널 사용');
const devButtons = await devPage.$$eval('[data-dev]', (els) => els.map((e) => e.dataset.dev).join(','));
ok(devButtons === 'connect,disconnect,test,calib,preview,feed,feedA,feedB,calibA,calibB', `개발 패널 기능 유지: ${devButtons}`);
await devPage.tap('.dev-printer__toggle'); await wait();
const devSel = await devPage.$$eval('[data-setting]', (els) => Object.fromEntries(els.map((e) => [e.dataset.setting, e.value])));
ok(devSel.chunkSize === '64' && devSel.chunkDelayMs === '20' && devSel.writeMode === 'with-response' && devSel.feedMode === 'init' && devSel.feedLines === '6', `개발 모드가 같은 저장값을 읽음: ${JSON.stringify(devSel)}`);
// 개발 모드에서 새 조합 저장
await devPage.select('[data-setting="chunkSize"]', '128');
await devPage.select('[data-setting="chunkDelayMs"]', '5');
await devPage.select('[data-setting="writeMode"]', 'without-response');
await devPage.select('[data-setting="feedLines"]', '7');
await devPage.select('[data-setting="feedMode"]', 'plain');
await devPage.select('[data-setting="feedDelayMs"]', '2000');
await wait(300);
// 일반 모드(새로고침 없이) 출력
await normal.bringToFront();
await toResult(normal);
await normal.evaluate(() => { window.__mock.calls = []; });
await tap(normal, '.result__print');
await waitEnd(normal);
c = await normal.evaluate(() => window.__mock.calls);
const gap = c[c.length - 1].t - c[c.length - 2].t;
ok(Math.max(...c.slice(0, -1).map((x) => x.bytes.length)) === 128, `일반 모드가 새 청크 128B로 전송 (새로고침 없이)`);
ok(c.slice(0, -1).every((x) => x.mode === 'noresp'), '일반 모드가 새 쓰기 방식 without response 사용');
ok(hex(c[c.length - 1].bytes) === '1B 32 1B 64 07' && gap >= 1950 && gap < 2600, `일반 모드가 새 급지(A·7줄)·대기 ${Math.round(gap)}ms 적용`);
await tap(normal, '.end__home');
// 일반 모드가 다시 연결해도 개발 모드 설정을 덮어쓰지 않음
await normal.evaluate(() => { window.__mock.drop(); });
await wait(200);
await normal.evaluate(() => { const d = window.__mock.device; d.gatt.connected = false; });
await tap(normal, '#start-printer'); await wait(400);
const after = await normal.evaluate(() => JSON.parse(localStorage.getItem('byeolungwan.printer')).settings);
ok(after.chunkSize === 128 && after.chunkDelayMs === 5 && after.writeMode === 'without-response' && after.feedLines === 7 && after.feedMode === 'plain' && after.feedDelayMs === 2000, `일반 모드 재연결 후에도 개발 모드 설정 유지: ${JSON.stringify(after)}`);

// ── 4. 새로고침·재실행 후 유지 ──
await normal.close();
normal = await open(BASE);
await normal.bringToFront();
const kept = await normal.evaluate(() => JSON.parse(localStorage.getItem('byeolungwan.printer')).settings);
ok(kept.chunkSize === 128 && kept.feedLines === 7 && kept.feedMode === 'plain', '일반 모드 재실행 후에도 개발 모드에서 저장한 설정 유지(덮어쓰기 없음)');
b = await startBtn(normal);
ok(b.status === 'disconnected' && b.text === '프린터 연결', '재실행 후 BLE 연결은 새로(설정과 연결은 별개) — 연결 버튼 표시');
// 정상 조합으로 되돌리기(개발 모드에서) → 일반 모드 반영
await devPage.bringToFront();
await devPage.select('[data-setting="chunkSize"]', '64');
await devPage.select('[data-setting="chunkDelayMs"]', '20');
await devPage.select('[data-setting="writeMode"]', 'with-response');
await devPage.select('[data-setting="feedLines"]', '6');
await devPage.select('[data-setting="feedMode"]', 'init');
await devPage.select('[data-setting="feedDelayMs"]', '0');
await wait(300);
await normal.bringToFront();
await tap(normal, '#start-printer'); await wait(300);
await toResult(normal);
await normal.evaluate(() => { window.__mock.calls = []; });
await tap(normal, '.result__print'); await waitEnd(normal);
c = await normal.evaluate(() => window.__mock.calls);
ok(hex(c[c.length - 1].bytes) === '1B 40 1B 32 1B 64 06' && Math.max(...c.slice(0, -1).map((x) => x.bytes.length)) === 64 && c.every((x) => x.mode === 'resp'), '개발 모드의 정상 출력 조합(64B·with response·B 6줄)이 일반 모드에 그대로 적용');

ok(errors.length === 0, `콘솔 오류 없음 ${JSON.stringify(errors)}`);
console.log(`\n합계 PASS ${pass} / FAIL ${fail}`);
await browser.close();
