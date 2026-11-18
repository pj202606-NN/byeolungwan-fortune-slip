// 가짜 PT210A(Web Bluetooth 모의 객체)로 연결·출력·실패 처리를 검증한다.
// 실제 BLE 통신·종이 인쇄는 검증하지 않는다(실기기 필요).
import puppeteer from 'puppeteer-core';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const SHOTS = 'd:/대학/4학년/졸전/byeolungwan-fortune-slip/tools/tests/output/';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));

// 페이지보다 먼저 실행되는 모의 navigator.bluetooth
const MOCK = () => {
  const cfg = window.__mock = { written: [], chunkLens: [], writes: 0, noRespFailOnce: false, failAt: -1, disconnectAt: -1, cancel: false, writeDelay: 2, connectCount: 0, permitted: (() => { try { return JSON.parse(sessionStorage.getItem('mockPermitted') || 'false'); } catch { return false; } })() };
  const listeners = {};
  const writeChar = {
    properties: { write: true, writeWithoutResponse: true },
    async writeValueWithoutResponse(buf) {
      if (cfg.noRespFailOnce) { cfg.noRespFailOnce = false; throw new DOMException('GATT operation failed', 'NetworkError'); }
      return this._w(buf, 'noresp');
    },
    async writeValueWithResponse(buf) { return this._w(buf, 'resp'); },
    async _w(buf, mode) {
      if (!device.gatt.connected) throw new DOMException('GATT Server is disconnected.', 'NetworkError');
      cfg.writes++;
      if (cfg.failAt > 0 && cfg.writes >= cfg.failAt) throw new DOMException('GATT operation failed for unknown reason.', 'NotSupportedError');
      if (cfg.writes === cfg.disconnectAt) { device.gatt.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); throw new DOMException('GATT Server is disconnected.', 'NetworkError'); }
      const u = new Uint8Array(buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf);
      cfg.chunkLens.push(u.length); cfg.modes = (cfg.modes || new Set()).add(mode);
      for (const b of u) cfg.written.push(b);
      await new Promise((r) => setTimeout(r, cfg.writeDelay));
    },
  };
  const notifyChar = { async startNotifications() {}, addEventListener() {} };
  const service = { async getCharacteristic(uuid) { if (uuid.startsWith('49535343-8841')) return writeChar; if (uuid.startsWith('49535343-1e4d')) return notifyChar; throw new DOMException('no', 'NotFoundError'); } };
  const device = new EventTarget();
  Object.assign(device, { id: 'mock-pt210a-22cd', name: 'PT210A_22CD' });
  device.gatt = {
    connected: false,
    async connect() { cfg.connectCount++; await new Promise((r) => setTimeout(r, 30)); this.connected = true; return this; },
    disconnect() { this.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); },
    async getPrimaryService(uuid) { if (uuid === '49535343-fe7d-4ae5-8fa9-9fafd205e455') return service; throw new DOMException('no service', 'NotFoundError'); },
  };
  cfg.device = device;
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: {
    async requestDevice(opts) {
      cfg.lastRequest = opts;
      if (cfg.cancel) throw new DOMException('User cancelled the requestDevice() chooser.', 'NotFoundError');
      cfg.permitted = true; try { sessionStorage.setItem('mockPermitted', 'true'); } catch {}
      return device;
    },
    async getDevices() { return cfg.permitted ? [device] : []; },
  } });
};

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: mkdtempSync(join(tmpdir(), 'prt-')) });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.evaluateOnNewDocument(MOCK);
await page.emulate({ viewport: { width: 1280, height: 800, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X210) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });

const tap = async (sel) => { await page.tap(sel); await wait(); };
const visiblePage = () => page.$$eval('.page', (els) => els.filter((e) => !e.hidden).map((e) => e.dataset.page).join(','));
const errText = () => page.$eval('#print-error', (e) => e.textContent);
const chip = () => page.$eval('#printer-chip', (e) => ({ hidden: e.hidden, text: e.textContent.trim(), status: e.dataset.status }));
const mock = (expr) => page.evaluate(expr);
async function toResult() {
  await tap('.start__btn');
  await page.tap('#birth-year'); await page.keyboard.type('1995'); await page.keyboard.type('03'); await page.keyboard.type('07'); await wait();
  await tap('.birth__submit');
}
const waitPage = (p, timeout = 15000) => page.waitForFunction((p) => [...document.querySelectorAll('.page')].find((e) => !e.hidden).dataset.page === p, { timeout, polling: 100 }, p).then(() => true, () => false);
const waitErr = (timeout = 15000) => page.waitForFunction(() => document.getElementById('print-error').textContent !== '', { timeout, polling: 100 }).then(() => true, () => false);

// 바이트 해석: ESC/POS 래스터 밴드를 다시 이미지로
function parseJob(bytes) {
  const info = { init: bytes[0] === 0x1b && bytes[1] === 0x40, bands: [], rows: 0, widthBytes: null, tail: null, text: '' };
  let i = 0; const rowsData = [];
  while (i < bytes.length) {
    if (bytes[i] === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30) {
      const w = bytes[i + 4] | (bytes[i + 5] << 8); const h = bytes[i + 6] | (bytes[i + 7] << 8);
      info.bands.push(h); info.widthBytes = w; info.rows += h;
      rowsData.push(bytes.slice(i + 8, i + 8 + w * h)); i += 8 + w * h;
    } else i++;
  }
  info.tail = bytes.slice(-3);
  info.raster = rowsData.flat();
  return info;
}
function writePbm(path, raster, widthBytes, rows) {
  const header = Buffer.from(`P4\n${widthBytes * 8} ${rows}\n`);
  writeFileSync(path, Buffer.concat([header, Buffer.from(raster)]));
}

// ── 1. 운영 모드: 미연결 출력 → 오류, 완료 화면 이동 없음 ──
console.log('— 운영 모드');
await page.goto(BASE, { waitUntil: 'networkidle0' });
await toResult();
let c = await chip();
ok(!c.hidden && c.text === '프린터 연결', `미연결: 작은 연결 버튼 표시 "${c.text}"`);
await tap('.result__print');
ok(await visiblePage() === 'result' && (await errText()).includes('프린터가 연결되어 있지 않습니다'), `미연결 출력 → 결과 화면 유지 + 안내 "${await errText()}"`);
await page.screenshot({ path: `${SHOTS}result-not-connected.png` });

// ── 2. 선택 취소 ──
await mock(() => { window.__mock.cancel = true; });
await tap('#printer-chip');
await wait(200);
ok((await errText()).includes('취소'), `프린터 선택 취소 안내 "${await errText()}"`);
await mock(() => { window.__mock.cancel = false; });

// ── 3. 연결 ──
await tap('#printer-chip');
await page.waitForFunction(() => document.getElementById('printer-chip').hidden, { timeout: 5000 }).catch(() => {});
const req = await mock(() => window.__mock.lastRequest);
ok(JSON.stringify(req.optionalServices) === '["49535343-fe7d-4ae5-8fa9-9fafd205e455"]' && req.filters.some((f) => f.namePrefix === 'PT210'), `requestDevice 필터: ${JSON.stringify(req)}`);
c = await chip();
ok(c.hidden, '연결됨: 운영 모드에서는 연결 버튼 숨김(화면 단정)');
ok(await errText() === '', '연결 후 오류 문구 사라짐');

// ── 4. 실제 출력 + 중복 클릭 방지 ──
await mock(() => { window.__mock.written = []; window.__mock.chunkLens = []; window.__mock.writes = 0; window.__mock.writeDelay = 3; });
await page.tap('.result__print');
await wait(60);
const busyState = await page.$eval('.result__print', (b) => ({ disabled: b.disabled, text: b.textContent }));
ok(busyState.disabled && busyState.text === '출력 중…', `출력 중 버튼 잠금 "${busyState.text}"`);
// 출력 중 연타
await page.evaluate(() => { for (let i = 0; i < 5; i++) document.querySelector('.result__print').click(); });
ok(await waitPage('end', 30000), '전송 완료 후 완료 화면 이동');
const job = await mock(() => window.__mock.written);
const parsed = parseJob(job);
// 이미지 작업 시작(ESC @ · ESC 2 · ESC a 1) 횟수 = 출력 작업 수 (급지 명령의 ESC @는 제외)
const initCount = job.reduce((n, b, i) => n + (b === 0x1b && job[i + 1] === 0x40 && job[i + 2] === 0x1b && job[i + 3] === 0x32 && job[i + 4] === 0x1b && job[i + 5] === 0x61 ? 1 : 0), 0);
ok(initCount === 1, `연타해도 출력 작업 1건 (ESC @ ${initCount}회)`);
ok(parsed.init, 'ESC/POS: ESC @ 초기화로 시작');
ok(parsed.widthBytes === 48 && parsed.rows > 600 && parsed.bands.every((h) => h <= 96), `래스터: 폭 ${parsed.widthBytes * 8} dots, ${parsed.rows}줄, 밴드 ${parsed.bands.length}개(최대 ${Math.max(...parsed.bands)}줄)`);
ok(parsed.tail[0] === 0x1b && parsed.tail[1] === 0x64, `끝: ESC d ${parsed.tail[2]} 급지`);
const lens = await mock(() => window.__mock.chunkLens);
ok(Math.max(...lens) <= 128, `청크 크기 최대 ${Math.max(...lens)}B (설정 128B), 총 ${lens.length}회, ${job.length} bytes`);
ok((await mock(() => [...window.__mock.modes])).join() === 'noresp', 'writeValueWithoutResponse 사용');
writePbm(`${SHOTS}printed-receipt.pbm`, parsed.raster, parsed.widthBytes, parsed.rows);
ok(await page.$eval('.dev-badge', () => true).catch(() => false) === false, '운영 모드: 개발 표시 없음');
const endCard = await page.$eval('[data-page="end"] .fortune-card__foot', (e) => e.textContent);
ok(endCard === '장수 · 張宿 · 사슴자리', `완료 화면 카드 = 출력한 결과(실제 판정: ${endCard})`);

// ── 5. 처음으로 → 연결 유지 → 두 번째 관람객도 출력 ──
await tap('.end__home');
const snap1 = await mock(() => document.getElementById('printer-chip').hidden);
ok(snap1, '처음 화면으로 돌아가도 프린터 연결 유지');
await toResult();
await mock(() => { window.__mock.written = []; window.__mock.writes = 0; });
await tap('.result__print');
ok(await waitPage('end', 30000), '두 번째 출력도 성공 → 완료 화면');
await tap('.end__home');

// ── 6. 전송 실패 ──
await toResult();
await mock(() => { window.__mock.writes = 0; window.__mock.failAt = 20; });
await tap('.result__print');
ok(await waitErr() && await visiblePage() === 'result', `전송 실패 → 결과 화면 유지 "${await errText()}"`);
ok(await page.$eval('.result__print', (b) => !b.disabled && b.textContent === '운세지 출력하기'), '실패 후 출력 버튼 다시 사용 가능');
await mock(() => { window.__mock.failAt = -1; });

// ── 7. 출력 중 연결 끊김 → 실패 처리 → 자동 재연결 ──
await mock(() => { window.__mock.writes = 0; window.__mock.disconnectAt = 30; window.__mock.connectCount = 0; });
await tap('.result__print');
await page.waitForFunction(() => document.getElementById('print-error').textContent.includes('끊겼'), { timeout: 15000 }).catch(() => {});
ok((await errText()).includes('끊겼') && await visiblePage() === 'result', `출력 중 끊김 → "${await errText()}"`);
await mock(() => { window.__mock.disconnectAt = -1; });
const reconnected = await page.waitForFunction(() => document.getElementById('printer-chip').hidden, { timeout: 12000, polling: 200 }).then(() => true, () => false);
ok(reconnected && await mock(() => window.__mock.connectCount) >= 1, `끊긴 뒤 자동 재연결 (재연결 시도 ${await mock(() => window.__mock.connectCount)}회)`);
await tap('.result__print');
ok(await waitPage('end', 30000), '재연결 후 출력 성공');

// ── 8. writeValueWithoutResponse 실패 시 writeValue 폴백 ──
await tap('.end__home'); await toResult();
await mock(() => { window.__mock.noRespFailOnce = true; window.__mock.modes = new Set(); });
await tap('.result__print');
ok(await waitPage('end', 30000) && (await mock(() => [...window.__mock.modes])).includes('resp'), `without-response 실패 → writeValue 폴백 후 성공 (${await mock(() => [...window.__mock.modes])})`);

// ── 9. 새로고침 후 재연결 ──
await page.reload({ waitUntil: 'networkidle0' });
const autoRe = await page.waitForFunction(() => window.__mock.connectCount > 0, { timeout: 8000 }).then(() => true, () => false);
await toResult();
ok(autoRe && await mock(() => document.getElementById('printer-chip').hidden), '새로고침 후 이전 프린터 자동 재연결(getDevices 지원 시)');
await tap('.result__print');
ok(await waitPage('end', 30000), '재실행 후 바로 출력 성공');

// ── 10. 개발 모드 ──
console.log('— 개발 모드');
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await page.goto(`${BASE}?dev=1`, { waitUntil: 'networkidle0' });
await toResult();
c = await chip();
ok(!c.hidden && c.text === '프린터 연결', '개발 모드: 미연결 상태 표시');
await tap('.result__print');
ok(await visiblePage() === 'end' && await page.$eval('.dev-badge', (b) => !b.hidden), '개발 모드 + 프린터 없음 → 시연 완료 화면 + "실제 인쇄 아님" 표시');
await tap('.end__home'); await toResult();
await tap('.dev-printer__toggle');
await tap('[data-dev="connect"]');
await wait(300);
const info = await page.$eval('.dev-printer__info', (e) => e.textContent);
ok(info.includes('연결됨') && info.includes('PT210A_22CD'), `개발 패널 상태: ${info.split('\n').slice(0, 2).join(' / ')}`);
await mock(() => { window.__mock.written = []; });
await tap('[data-dev="test"]');
await page.waitForFunction(() => document.querySelector('.dev-printer__info').textContent.includes('출력 성공'), { timeout: 10000 }).catch(() => {});
const testBytes = await mock(() => window.__mock.written);
const hex = testBytes.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
ok(hex === '1B401B6101' + Buffer.from('BYEOLUNGWAN TEST').toString('hex').toUpperCase() + '0A1B61001B6403', `TEST 출력 바이트 ${hex}`);
await mock(() => { window.__mock.written = []; });
await tap('[data-dev="calib"]');
await page.waitForFunction(() => document.querySelector('.dev-printer__log').textContent.includes('보정 출력: 데이터 전송 완료'), { timeout: 10000 }).catch(() => {});
const cal = parseJob(await mock(() => window.__mock.written));
ok(cal.rows === 96 && cal.widthBytes === 48, `보정 출력: ${cal.widthBytes * 8}×${cal.rows}`);
await page.select('[data-setting="chunkSize"]', '20');
await tap('[data-dev="preview"]');
await wait(500);
const prev = await page.$eval('.dev-printer__preview', (e) => ({ hidden: e.hidden, text: e.textContent }));
ok(!prev.hidden && prev.text.includes('384×'), `미리보기: ${prev.text}`);
await page.screenshot({ path: `${SHOTS}dev-panel.png` });
await mock(() => { window.__mock.written = []; window.__mock.chunkLens = []; });
await tap('.result__print');
// 확대된 약69KB 이미지를 20B 청크로 보내면 모의 BLE·청크 타이머를 포함해 60초를 넘길 수 있다.
ok(await waitPage('end', 120000), '개발 모드 + 연결됨 → 실제 출력 후 완료 화면');
ok(Math.max(...await mock(() => window.__mock.chunkLens)) === 20, '청크 20B 설정 적용');
ok(await page.$eval('.dev-badge', (b) => b.hidden), '실제 출력 후에는 "실제 인쇄 아님" 표시 숨김');
ok(await page.evaluate(() => JSON.parse(localStorage.getItem('byeolungwan.printer')).settings.chunkSize) === 20, '전송 설정이 기기에 저장됨');

// ── 11. Web Bluetooth 미지원 ──
console.log('— 미지원 브라우저');
const p2 = await browser.newPage();
await p2.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: undefined }); });
await p2.goto(BASE, { waitUntil: 'networkidle0' });
await p2.click('.start__btn'); await wait();
await p2.type('#birth-year', '1995'); await p2.type('#birth-month', '3'); await p2.type('#birth-day', '7');
await p2.click('.birth__submit'); await wait();
await p2.click('.result__print'); await wait(300);
const u = await p2.evaluate(() => ({ err: document.getElementById('print-error').textContent, chip: document.getElementById('printer-chip').hidden, page: [...document.querySelectorAll('.page')].find((e) => !e.hidden).dataset.page }));
ok(u.page === 'result' && u.err.includes('쓸 수 없습니다') && u.chip, `미지원: 연결 버튼 숨김, 안내 "${u.err}"`);

ok(errors.length === 0, `콘솔 오류 없음 ${JSON.stringify(errors)}`);
console.log(`\n합계 PASS ${pass} / FAIL ${fail}`);
await browser.close();
process.exitCode = fail ? 1 : 0;
