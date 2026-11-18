// 기존 기능 회귀 검사 + 배포본(프린터 기능 이전)과의 화면 비교
import puppeteer from 'puppeteer-core';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const LOCAL = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const LIVE = 'https://pj202606-nn.github.io/byeolungwan-fortune-slip/index.html';
const SHOTS = 'd:/대학/4학년/졸전/byeolungwan-fortune-slip/tools/tests/output/';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const wait = (ms = 130) => new Promise((r) => setTimeout(r, ms));

const MOCK = () => {
  const device = new EventTarget();
  Object.assign(device, { id: 'm', name: 'PT210A_22CD' });
  const ch = { properties: { writeWithoutResponse: true, write: true }, async writeValueWithoutResponse() { await new Promise((r) => setTimeout(r, 1)); }, async writeValueWithResponse() {} };
  const svc = { async getCharacteristic(u) { if (u.startsWith('49535343-8841')) return ch; return { async startNotifications() {}, addEventListener() {} }; } };
  device.gatt = { connected: false, async connect() { this.connected = true; return this; }, disconnect() { this.connected = false; }, async getPrimaryService() { return svc; } };
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { async requestDevice() { return device; } } });
};

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: mkdtempSync(join(tmpdir(), 'reg-')) });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.evaluateOnNewDocument(MOCK);
await page.emulate({ viewport: { width: 1280, height: 800, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, isLandscape: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X210) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
const tap = async (s) => { await page.tap(s); await wait(); };
const vis = () => page.$$eval('.page', (els) => els.filter((e) => !e.hidden).map((e) => e.dataset.page).join(','));
const err = () => page.$eval('#birth-error', (e) => e.textContent);
const label = () => page.$eval('.star__birth', (e) => e.textContent);
async function fill(y, m, d) {
  for (const [id, v] of [['#birth-year', y], ['#birth-month', m], ['#birth-day', d]]) {
    await page.$eval(id, (e) => { e.value = ''; e.dispatchEvent(new Event('input')); });
    if (v !== '') { await page.tap(id); await page.keyboard.type(String(v)); }
  }
  await page.evaluate(() => document.activeElement && document.activeElement.blur()); await wait();
}
const setCal = async (k) => { await tap('#calendar-toggle'); await tap(`.calendar-menu__option[data-calendar="${k}"]`); };

await page.goto(LOCAL, { waitUntil: 'networkidle0' });
ok(await vis() === 'start', '첫 화면');
await tap('.help-btn'); ok(await page.$eval('#help-modal', (m) => !m.hidden), '도움말 열림');
await tap('.modal__close'); ok(await page.$eval('#help-modal', (m) => m.hidden), '도움말 닫힘');
await tap('.start__btn'); ok(await vis() === 'birth', '시작하기 → 입력');
await tap('.birth__submit'); ok((await err()).includes('모두 입력'), '빈 입력 오류');
await fill('2023', '2', '29'); await tap('.birth__submit'); ok((await err()).includes('28일까지'), '양력 2023-02-29 차단');
await fill('2024', '2', '29'); await tap('.birth__submit'); ok(await vis() === 'result' && await label() === '생년월일 2024년 02월 29일 (양력)', '양력 윤년 허용 → 결과');
await tap('[data-page="result"] .page__btn-left');
ok(await page.$$eval('#birth-form input', (els) => els.map((e) => e.value).join('-')) === '2024-2-29', '다시 입력 시 값 유지');
await setCal('lunar'); await fill('2023', '2', '1');
ok(await page.$eval('#leap-toggle', (e) => !e.hidden), '음력 2023년 2월 윤달 선택 표시');
await tap('.leap-toggle__option[data-leap="true"]'); await tap('.birth__submit');
ok(await label() === '생년월일 2023년 02월 01일 (음력 윤달)', '음력 윤달 결과 표기');
ok(await page.evaluate(() => [...document.querySelectorAll('.star__icon svg circle')].length) > 0, '별자리 아이콘');
await tap('[data-page="result"] .page__btn-left');
await fill('2024', '1', '30'); await tap('.birth__submit'); ok((await err()).includes('29일까지'), '음력 29일 달 30일 차단');
await fill('2026', '12', '1'); await tap('.birth__submit'); ok((await err()).includes('오늘 이후'), '미래 날짜 차단');
await tap('[data-page="birth"] .page__btn-left');
const reset = await page.evaluate(() => [...document.querySelectorAll('#birth-form input')].map((e) => e.value).join('') + document.getElementById('calendar-toggle').textContent);
ok(reset === '양력', '처음으로 → 초기화');
// 키보드: 높이만 줄어도 배율 유지, 입력 줄 보임
await tap('.start__btn'); await page.tap('#birth-year'); await wait();
await page.setViewport({ width: 1280, height: 440, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
await wait(250);
const kb = await page.evaluate(() => ({ s: getComputedStyle(document.getElementById('stage')).getPropertyValue('--stage-scale'), b: document.getElementById('birth-year').getBoundingClientRect().bottom, ih: innerHeight }));
ok(Math.abs(kb.s - 2 / 3) < 1e-6 && kb.b <= kb.ih, `키보드 표시 중 배율 유지·입력칸 보임 (${kb.b.toFixed(0)}/${kb.ih})`);
await page.evaluate(() => document.activeElement.blur());
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true }); await wait(250);
ok((await page.evaluate(() => getComputedStyle(document.getElementById('stage')).getPropertyValue('--stage-y'))).trim() === '0px', '키보드 닫힘 → 원위치');
ok(errors.length === 0, `콘솔 오류 없음 ${JSON.stringify(errors)}`);

// ── 화면 비교: 배포본(프린터 기능 이전) vs 로컬(프린터 연결됨) ──
async function shotFlow(url, name, connect) {
  const p = await browser.newPage();
  await p.evaluateOnNewDocument(MOCK);
  await p.setViewport({ width: 1920, height: 1200, deviceScaleFactor: 1 });
  await p.goto(url, { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.fonts.ready);
  await p.click('.start__btn'); await wait();
  await p.type('#birth-year', '1995'); await p.type('#birth-month', '3'); await p.type('#birth-day', '7');
  await p.evaluate(() => document.activeElement.blur());
  await p.click('.birth__submit'); await wait(300);
  if (connect) { await p.click('#printer-chip'); await wait(300); }
  await p.mouse.move(5, 5);
  await p.screenshot({ path: `${SHOTS}${name}-result.png` });
  await p.close();
}
await shotFlow(LIVE, 'live', false);
await shotFlow(LOCAL, 'local-connected', true);
console.log(`\n합계 PASS ${pass} / FAIL ${fail}`);
await browser.close();
