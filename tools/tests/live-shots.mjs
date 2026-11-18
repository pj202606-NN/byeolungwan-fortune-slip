import puppeteer from 'puppeteer-core';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const SHOTS = 'd:/대학/4학년/졸전/byeolungwan-fortune-slip/tools/tests/output/';
const [,, base, prefix] = process.argv;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: mkdtempSync(join(tmpdir(), 'ls-')) });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
for (const [name, q] of [['start', 'dev=1&screen=start'], ['help', 'dev=1&screen=start&help=1'], ['birth', 'dev=1&screen=birth'], ['result', 'dev=1&screen=result'], ['end', 'dev=1&screen=end']]) {
  await page.goto(`${base}index.html?${q}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  const s = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
  console.log(name, s[0] <= 1280 && s[1] <= 800 ? '스크롤 없음' : `스크롤 발생 ${s}`);
  await page.screenshot({ path: `${SHOTS}${prefix}-${name}.png` });
}
await browser.close();
