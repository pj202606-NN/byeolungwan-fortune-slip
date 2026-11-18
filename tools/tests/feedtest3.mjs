// 인쇄 후 급지(7B 기본) + 급지 진단 기능 검증 — 가짜 PT210A가 쓰기 단위(바이트·시각)를 기록
import puppeteer from 'puppeteer-core';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OLD = process.env.OLD; // 이전 배포본 주소(이미지 바이트 비교용, 선택)
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));

const MOCK = () => {
  const cfg = window.__mock = { calls: [], failFeed: false, failImageAt: -1, dropOnFeedWait: false, n: 0 };
  const device = new EventTarget();
  Object.assign(device, { id: 'mock-pt210a-22cd', name: 'PT210A_22CD' });
  const w = async (buf, mode) => {
    if (!device.gatt.connected) throw new DOMException('GATT Server is disconnected.', 'NetworkError');
    const u = [...new Uint8Array(buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf)];
    cfg.n++;
    const isFeed = (u.length === 5 && u[0] === 0x1b && u[1] === 0x32) || (u.length === 7 && u[0] === 0x1b && u[1] === 0x40 && u[2] === 0x1b && u[3] === 0x32);
    if (cfg.failFeed && isFeed) throw new DOMException('GATT operation failed', 'NotSupportedError');
    if (cfg.failImageAt > 0 && cfg.n >= cfg.failImageAt) throw new DOMException('GATT operation failed', 'NotSupportedError');
    cfg.calls.push({ t: performance.now(), bytes: u, mode });
    // 이미지 마지막 쓰기 직후 연결 끊김 재현
    cfg.total = (cfg.total || 0) + u.length;
    if (cfg.dropOnFeedWait && cfg.total === cfg.dropAfterBytes) {
      setTimeout(() => { device.gatt.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); }, 50);
    }
    await new Promise((r) => setTimeout(r, 2));
  };
  const ch = { properties: { write: true, writeWithoutResponse: true }, writeValueWithoutResponse: (b) => w(b, 'noresp'), writeValueWithResponse: (b) => w(b, 'resp') };
  const svc = { async getCharacteristic(u) { if (u.startsWith('49535343-8841')) return ch; return { async startNotifications() {}, addEventListener() {} }; } };
  device.gatt = { connected: false, async connect() { if (window.__mock.blockReconnect) throw new DOMException('fail', 'NetworkError'); this.connected = true; return this; }, disconnect() { this.connected = false; }, async getPrimaryService() { return svc; } };
  window.__mock.device = device;
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { async requestDevice() { return device; }, async getDevices() { return []; } } });
};

const hex = (a) => a.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
const sha = (a) => createHash('sha256').update(Buffer.from(a)).digest('hex').slice(0, 16);

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: mkdtempSync(join(tmpdir(), 'feed3-')) });
async function newPage() {
  const page = await browser.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.__errors.push(m.text()); });
  await page.evaluateOnNewDocument(MOCK);
  await page.emulate({ viewport: { width: 1280, height: 800, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X210) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
  return page;
}
let page = await newPage();
const tap = async (s) => { await page.tap(s); await wait(); };
const vis = () => page.$$eval('.page', (els) => els.filter((e) => !e.hidden).map((e) => e.dataset.page).join(','));
const resetCalls = () => page.evaluate(() => { window.__mock.calls = []; window.__mock.n = 0; window.__mock.total = 0; });
const calls = () => page.evaluate(() => window.__mock.calls);
const logText = () => page.$eval('.dev-printer__log', (e) => e.textContent);
const waitEnd = () => page.waitForFunction(() => [...document.querySelectorAll('.page')].find((e) => !e.hidden).dataset.page === 'end', { timeout: 90000, polling: 100 }).then(() => true, () => false);
const waitIdle = () => page.waitForFunction(() => !document.querySelector('.dev-printer__info').textContent.includes('출력 중'), { timeout: 60000, polling: 100 }).then(() => true, () => false);
async function toResult() {
  await tap('.start__btn');
  await page.tap('#birth-year'); await page.keyboard.type('1995'); await page.keyboard.type('03'); await page.keyboard.type('07'); await wait();
  await tap('.birth__submit');
}
const sel = () => page.$$eval('[data-setting]', (els) => Object.fromEntries(els.map((e) => [e.dataset.setting, e.value])));
async function receiptCalls(base, stored) {
  await page.goto(base, { waitUntil: 'networkidle0' });
  if (stored) await page.evaluate((s) => localStorage.setItem('byeolungwan.printer', JSON.stringify(s)), stored);
  await page.goto(`${base}?dev=1`, { waitUntil: 'networkidle0' });
  await toResult();
  await tap('.dev-printer__toggle');
  if (!(await page.$eval('.dev-printer__info', (e) => e.textContent)).includes('연결됨')) { await tap('[data-dev="connect"]'); await wait(300); }
  await resetCalls();
  await tap('.result__print');
  await waitEnd();
  return calls();
}

// 태블릿 상태 재현: f2ff972에서 저장된 값(정상 출력 BLE 설정 + 급지 7줄 + feedRev 2)
const TABLET = { id: 'mock-pt210a-22cd', name: 'PT210A_22CD', feedRev: 2, settings: { chunkSize: 64, chunkDelayMs: 20, writeMode: 'with-response', feedLines: 6 } };

// ── 0. 이전 배포본과 이미지 바이트 비교 ──
let oldImageHash = null;
if (OLD) {
  const c = await receiptCalls(OLD, TABLET);
  oldImageHash = sha(c.slice(0, -1).flatMap((x) => x.bytes));
  console.log(`     이전 배포본 이미지 전송 바이트 ${c.slice(0, -1).flatMap((x) => x.bytes).length} bytes, sha ${oldImageHash}, 마지막 쓰기 ${hex(c[c.length - 1].bytes)}`);
  await page.close(); page = await newPage();
}

// ── 1. 설정 보존 + 새 기본값 ──
let c = await receiptCalls(BASE, TABLET);
let s = await sel();
ok(s.chunkSize === '64' && s.chunkDelayMs === '20' && s.writeMode === 'with-response', `저장된 BLE 설정 유지: ${s.chunkSize}B / ${s.chunkDelayMs}ms / ${s.writeMode}`);
ok(s.feedLines === '6' && s.feedMode === 'init' && s.feedDelayMs === '0', `급지 6줄 유지, 급지 명령 기본 B(7B), 대기 자동 (${s.feedLines}/${s.feedMode}/${s.feedDelayMs})`);
const stored1 = await page.evaluate(() => JSON.parse(localStorage.getItem('byeolungwan.printer')));
ok(stored1.settings.chunkSize === 64 && stored1.feedRev === 2, '저장값을 덮어쓰지 않음(청크 64B, feedRev 2 그대로)');

// ── 2. 운세지: 이미지 → 자동 대기 → 7B 급지(별도 쓰기 1회) ──
const last = c[c.length - 1];
const image = c.slice(0, -1).flatMap((x) => x.bytes);
ok(hex(last.bytes) === '1B 40 1B 32 1B 64 06', `운세지 후 급지 = ${hex(last.bytes)} (7바이트, 별도 쓰기)`);
ok(c.filter((x) => x.bytes.length === 7 && x.bytes[0] === 0x1b && x.bytes[1] === 0x40).length === 1, '급지 명령 정확히 1회');
const gap = last.t - c[c.length - 2].t;
const rowsSent = image.length > 0 ? (() => { let r = 0; for (let i = 0; i < image.length;) { if (image[i] === 0x1d && image[i + 1] === 0x76 && image[i + 2] === 0x30) { const h = image[i + 6] | (image[i + 7] << 8); r += h; i += 8 + 48 * h; } else i++; } return r; })() : 0;
const expectWait = Math.min(3000, Math.round(400 + (rowsSent / 400) * 1000));
ok(gap >= expectWait - 50 && gap < expectWait + 700, `이미지 마지막 청크 → 급지까지 ${Math.round(gap)}ms (자동 대기 식 400+줄수/400초 → ${expectWait}ms)`);
ok(hex(image.slice(-3)) === '1B 61 00' && image[0] === 0x1b && image[1] === 0x40, '이미지 전송 = ESC @ … 래스터 … ESC a 0 (급지 없음)');
ok(Math.max(...c.slice(0, -1).map((x) => x.bytes.length)) <= 64 && c.every((x) => x.mode === 'resp'), '이미지·급지 모두 저장된 64B·with response로 전송');
if (oldImageHash) ok(sha(image) === oldImageHash, `이미지 전송 바이트가 이전 배포본(f2ff972)과 동일 (sha ${sha(image)})`);
let lg = await logText();
for (const t of ['운세지 출력 이미지: 전송 시작 — 전체', `래스터 ${Math.ceil(rowsSent / 96)}개 밴드, 마지막 밴드 ${rowsSent - 96 * (Math.ceil(rowsSent / 96) - 1)}줄`, '마지막 밴드 포함 전체', `운세지 출력 급지: 이미지 전송 후 ${expectWait}ms 대기(자동)`, '[1B 40 1B 32 1B 64 06] 전송 시작', '급지 명령 전송 완료 (실제 종이 배출 여부는 종이로 확인)']) {
  ok(lg.includes(t), `로그: "${t}"`);
}
ok(!/배출 성공|인쇄 성공/.test(lg), '로그에 "배출 성공/인쇄 성공" 같은 물리적 성공 단정 없음');

// ── 3. 진단 버튼 ──
await tap('.end__home'); await toResult();
const diag = async (btn) => { await resetCalls(); await tap(`[data-dev="${btn}"]`); await waitIdle(); await wait(300); return calls(); };
c = await diag('feedA');
ok(hex(c.flatMap((x) => x.bytes)) === '1B 32 1B 64 06', `급지 A 단독: ${hex(c.flatMap((x) => x.bytes))}`);
c = await diag('feedB');
ok(hex(c.flatMap((x) => x.bytes)) === '1B 40 1B 32 1B 64 06', `급지 B 단독: ${hex(c.flatMap((x) => x.bytes))}`);
c = await diag('feed');
ok(hex(c.flatMap((x) => x.bytes)) === '1B 40 1B 32 1B 64 06', '기존 종이 배출 테스트 = B와 동일 바이트');
c = await diag('calibA');
ok(hex(c[c.length - 1].bytes) === '1B 32 1B 64 06' && c.length > 2, `보정+급지 A: 이미지 후 ${hex(c[c.length - 1].bytes)}`);
const gA = c[c.length - 1].t - c[c.length - 2].t;
c = await diag('calibB');
const gB = c[c.length - 1].t - c[c.length - 2].t;
ok(hex(c[c.length - 1].bytes) === '1B 40 1B 32 1B 64 06', `보정+급지 B: 이미지 후 ${hex(c[c.length - 1].bytes)}`);
ok(gA >= 600 && gA < 1100 && gB >= 1500 && gB < 2000, `짧은 이미지 대기: A ${Math.round(gA)}ms(자동), B ${Math.round(gB)}ms(ESC @ 최소 1500ms)`);
ok((await sel()).feedMode === 'init', '진단 버튼은 저장된 급지 방식을 바꾸지 않음');
lg = await logText();
ok(lg.includes('급지 A 단독: 전송 시작 — 5 bytes [1B 32 1B 64 06]') || lg.includes('보정+급지 B'), '진단 로그에 실제 바이트 기록');

// ── 4. 급지 줄 수·방식·대기 설정 반영 ──
await page.select('[data-setting="feedLines"]', '5');
await page.select('[data-setting="feedMode"]', 'plain');
await page.select('[data-setting="feedDelayMs"]', '1000'); await wait();
await resetCalls();
await tap('.result__print'); await waitEnd();
c = await calls();
const g = c[c.length - 1].t - c[c.length - 2].t;
ok(hex(c[c.length - 1].bytes) === '1B 32 1B 64 05' && g >= 950 && g < 1400, `설정 5줄·A·1000ms → ${hex(c[c.length - 1].bytes)}, ${Math.round(g)}ms 뒤`);
const stored2 = await page.evaluate(() => JSON.parse(localStorage.getItem('byeolungwan.printer')).settings);
ok(stored2.feedMode === 'plain' && stored2.feedDelayMs === 1000 && stored2.chunkSize === 64, `설정 저장: ${JSON.stringify(stored2)}`);
await page.select('[data-setting="feedLines"]', '6');
await page.select('[data-setting="feedMode"]', 'init');
await page.select('[data-setting="feedDelayMs"]', '0'); await wait();
await tap('.end__home'); await toResult();

// ── 5. 출력 중 진단 금지(중복 방지) ──
await resetCalls();
await page.tap('.result__print'); await wait(200);
await page.evaluate(() => { document.querySelector('[data-dev="feedB"]').click(); document.querySelector('[data-dev="feedA"]').click(); });
await waitEnd();
c = await calls();
ok(c.filter((x) => x.bytes.length <= 7 && x.bytes[0] === 0x1b && (x.bytes[1] === 0x40 || x.bytes[1] === 0x32) && x.bytes.length !== 64).length === 1, '운세지 출력 중 진단 버튼 실행 안 됨(급지 1회만)');
ok((await logText()).includes('다른 출력이 진행 중이라 실행하지 않음'), '거부 사실 로그 기록');

// ── 6. 급지만 실패 → 완료 화면 + 경고 ──
await tap('.end__home'); await toResult();
await page.evaluate(() => { window.__mock.failFeed = true; });
await resetCalls();
await tap('.result__print');
ok(await waitEnd(), '급지 명령 전송만 실패 → 완료 화면(재출력 방지)');
ok((await logText()).includes('급지 명령 전송 실패') && (await logText()).includes('FEED 버튼'), '급지 실패 경고 로그');
await page.evaluate(() => { window.__mock.failFeed = false; });

// ── 7. 이미지 전송 실패 → 급지 안 보냄 ──
await tap('.end__home'); await toResult();
await page.evaluate(() => { window.__mock.n = 0; window.__mock.failImageAt = 25; window.__mock.calls = []; });
await tap('.result__print');
await page.waitForFunction(() => document.getElementById('print-error').textContent !== '', { timeout: 60000 }).catch(() => {});
c = await calls();
ok(await vis() === 'result' && !c.some((x) => x.bytes.length === 7), '이미지 전송 실패 → 결과 화면 유지, 급지 명령 안 보냄');
await page.evaluate(() => { window.__mock.failImageAt = -1; });

// ── 8. 이미지 전송 후 대기 중 연결 끊김 → 급지 미전송 로그, 완료 화면 ──
await page.evaluate(async () => { const S = window.__fortuneSlip; const n = (await S.printService.buildReceipt(S.state.result)).bytes.length; window.__mock.dropOnFeedWait = true; window.__mock.dropAfterBytes = n; window.__mock.blockReconnect = true; });
await resetCalls();
await tap('.result__print');
ok(await waitEnd(), '대기 중 BLE 끊김 → 이미지는 전송됐으므로 완료 화면');
lg = await logText();
ok(lg.includes('전송 직전 BLE 연결 끊김') || lg.includes('BLE 연결 끊김'), 'BLE 연결 끊김을 로그에 기록');
ok(!(await calls()).some((x) => x.bytes.length === 7), '끊긴 상태에서는 급지 명령 전송 시도 안 함');

// ── 9. 미연결 진단 ──
await page.evaluate(() => { window.__mock.dropOnFeedWait = false; });
await page.goto(`${BASE}?dev=1`, { waitUntil: 'networkidle0' });
await tap('.dev-printer__toggle');
await page.evaluate(() => { window.__mock.blockReconnect = false; });
await resetCalls();
await tap('[data-dev="feedA"]'); await wait(300);
ok((await calls()).length === 0 && (await logText()).includes('NOT_CONNECTED'), '미연결이면 진단 명령 실행 안 함 + 오류 기록');

// ── 10. 처음 설치(저장값 없음) ──
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}?dev=1`, { waitUntil: 'networkidle0' });
await tap('.dev-printer__toggle');
s = await sel();
ok(s.feedLines === '6' && s.feedMode === 'init' && s.feedDelayMs === '0' && s.chunkSize === '128', `저장값 없을 때 기본값: 6줄·B·자동, 청크 ${s.chunkSize}B`);

ok(page.__errors.length === 0, `콘솔 오류 없음 ${JSON.stringify(page.__errors)}`);
console.log(`\n합계 PASS ${pass} / FAIL ${fail}`);
await browser.close();
