import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const base = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let pass = 0;
const check = (value, message) => {
  assert.ok(value, message);
  console.log(`PASS ${++pass}: ${message}`);
};
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, isMobile: true, hasTouch: true });
  await page.setBypassServiceWorker(true);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const current = () => page.$eval('.page:not([hidden])', (el) => el.dataset.page);
  await page.goto(`${base}?dev=1&screen=end`, { waitUntil: 'networkidle0' });
  await page.bringToFront();
  check(await current() === 'end', '완료 화면 진입');
  await wait(6000);
  await page.touchscreen.tap(5, 400);
  await wait(4500);
  check(await current() === 'end', '빈 곳 터치 후 기존 10초가 지나도 완료 화면 유지');
  await page.keyboard.press('Shift');
  await wait(6000);
  check(await current() === 'end', '키보드 입력 후 10초 다시 계산');
  await page.tap('.help-btn');
  check(await page.$eval('#help-modal', (el) => !el.hidden), '완료 화면 도움말 열림');
  await page.waitForFunction(() => window.__fortuneSlip.state.page === 'start', { timeout: 12000 });
  check(await page.$eval('#help-modal', (el) => el.hidden), '10초 무조작 시 도움말을 닫고 첫 화면 복귀');
  check(await page.evaluate(() => {
    const { birth, result } = window.__fortuneSlip.state;
    return birth === null && result === null
      && [...document.querySelectorAll('#birth-form input')].every((el) => el.value === '');
  }), '자동 복귀 시 생년월일·결과 초기화');

  await page.goto(`${base}?dev=1&screen=end`, { waitUntil: 'networkidle0' });
  await page.tap('[data-page="end"] [data-action="go"][data-to="start"]');
  await page.tap('.start__btn');
  await wait(11000);
  check(await current() === 'birth', '완료 화면에서 수동 이동하면 타이머 취소·입력 화면 유지');

  await page.goto(`${base}?dev=1&screen=result`, { waitUntil: 'networkidle0' });
  await wait(11000);
  check(await current() === 'result', '결과 화면은 10초 무조작이어도 유지');
  check(errors.length === 0, `브라우저 오류 없음: ${JSON.stringify(errors)}`);
} finally {
  await browser.close();
}
