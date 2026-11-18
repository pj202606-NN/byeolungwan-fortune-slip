// 출력 작업 관리 — 한 번에 하나의 작업만, 결과는 printed / failed / busy 중 하나.
// "출력 성공" = 모든 ESC/POS 바이트가 오류 없이 프린터로 전송됨.
// (PT210A는 용지 배출 완료를 알려 주지 않으므로, 종이 걸림·용지 없음까지는 판정할 수 없다)

import {
  buildTestPrint, buildRasterPrint, buildFeedOnly, buildPostPrintFeed, rasterSummary, toHex,
  DEFAULT_FEED_LINES, DEFAULT_FEED_MODE, FEED_MODES,
} from './escpos.js';
import { renderReceipt, renderCalibrationBitmap } from './receipt-render.js';
import { PrinterError } from './pt210a-ble.js';

const DOTS_PER_SEC = 50 * 8; // PT210A 인쇄 속도 약 50mm/s(보수적) × 8 dots/mm
const DOTS_PER_FEED_LINE = 28; // PT210A 실측 줄당 약 3.5mm × 8 dots/mm (급지 대기 시간 추정용)
const MIN_DELAY_BEFORE_INIT_MS = 1500; // ESC @는 미인쇄 버퍼를 지우므로, 7B 방식은 최소 이만큼 기다린 뒤 보낸다
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// 확대된 운세지에도 기존 400 dots/s 추정치를 적용한다. BLE 전송·급지 명령과 사용자 고정 대기는 유지한다.
const printWaitMs = (rows) => Math.min(5000, Math.round(400 + (rows / DOTS_PER_SEC) * 1000));
const feedWaitMs = (n) => Math.min(1500, Math.round(200 + ((n * DOTS_PER_FEED_LINE) / DOTS_PER_SEC) * 1000));

export function createPrintService(printer, { log = () => {} } = {}) {
  let busy = false;

  const settings = () => printer.snapshot().settings;
  const feedLines = () => {
    const n = Number(settings().feedLines);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_FEED_LINES;
  };
  const feedMode = () => (FEED_MODES[settings().feedMode] ? settings().feedMode : DEFAULT_FEED_MODE);

  /** 이미지 전송 완료 → 급지 전송까지 대기. 설정값(ms)이 있으면 그대로, 0이면 이미지 인쇄 시간으로 자동 계산 */
  function delayBeforeFeed(rows, mode) {
    const fixed = Number(settings().feedDelayMs);
    if (fixed > 0) return { ms: fixed, how: '설정값' };
    let ms = printWaitMs(rows);
    if (mode === 'init') ms = Math.max(ms, MIN_DELAY_BEFORE_INIT_MS);
    return { ms, how: '자동' };
  }

  /**
   * buildBytes()는 { bytes, rows, raster, feedAfter, feedMode, extraWaitMs }를 돌려준다.
   *   raster    = rasterSummary(bitmap) — 로그용(이미지 작업일 때만)
   *   feedAfter = 이미지 인쇄 뒤 '별도 쓰기'로 보낼 급지 줄 수(0이면 없음)
   */
  async function run(kind, buildBytes) {
    if (busy) return { status: 'busy' };
    busy = true;
    try {
      if (!printer.snapshot().supported) throw new PrinterError('UNSUPPORTED', 'Web Bluetooth를 사용할 수 없습니다.');
      if (!printer.isConnected()) throw new PrinterError('NOT_CONNECTED', '프린터가 연결되어 있지 않습니다.');
      printer.setJobPhase('printing');
      const job = await buildBytes();
      const { bytes, rows = 0, raster = null, feedAfter = 0, extraWaitMs = 0 } = job;
      const mode = job.feedMode || feedMode();
      const label = raster ? `${kind} 이미지` : kind;

      log(raster
        ? `${label}: 전송 시작 — 전체 ${bytes.length} bytes (래스터 ${raster.bands}개 밴드, 마지막 밴드 ${raster.lastRows}줄, 래스터 데이터 ${raster.rasterBytes} bytes)`
        : `${label}: 전송 시작 — ${bytes.length} bytes [${toHex(bytes, 16)}]`);
      await printer.write(bytes);
      log(raster
        ? `${label}: 마지막 밴드 포함 전체 ${bytes.length} bytes BLE 전송 완료 (프린터의 실제 인쇄 완료 신호는 없음)`
        : `${label}: BLE 전송 완료`);

      // 이미지 뒤 급지: 인쇄가 끝났을 시점까지 기다린 뒤 별도 BLE 쓰기로 보낸다.
      // 급지만 실패한 경우 운세지는 이미 인쇄됐으므로 완료로 처리하고(재출력 방지) 로그에 경고를 남긴다.
      let feedResult = 'none';
      if (feedAfter) {
        const d = delayBeforeFeed(rows, mode);
        log(`${kind} 급지: 이미지 전송 후 ${d.ms}ms 대기(${d.how}) 후 전송`);
        await wait(d.ms);
        const feedBytes = buildPostPrintFeed(feedAfter, mode);
        if (!printer.isConnected()) {
          feedResult = 'failed';
          log(`${kind} 급지: 전송 직전 BLE 연결 끊김 — 급지 명령을 보내지 못함. 이미지는 전송됨, 프린터 FEED 버튼으로 배출 필요`);
        } else {
          try {
            log(`${kind} 급지: ${FEED_MODES[mode].label} [${toHex(feedBytes)}] 전송 시작`);
            await printer.write(feedBytes);
            feedResult = 'ok';
            log(`${kind} 급지: 급지 명령 전송 완료 (실제 종이 배출 여부는 종이로 확인)`);
            await wait(feedWaitMs(feedAfter));
          } catch (err) {
            feedResult = 'failed';
            log(`${kind} 급지: 급지 명령 전송 실패 [${err.code || err.name}] ${err.message}${printer.isConnected() ? '' : ' (BLE 연결 끊김)'} — 이미지는 전송됨, 프린터 FEED 버튼으로 배출 필요`);
          }
        }
      } else {
        await wait(printWaitMs(rows) + extraWaitMs);
      }

      printer.setJobPhase('printed');
      log(`${kind}: 모든 명령 전송 완료 — 실제 인쇄·배출 여부는 프린터가 알려주지 않으므로 종이로 확인`);
      return { status: 'printed', bytes: bytes.length, feedResult };
    } catch (err) {
      const e = err instanceof PrinterError ? err : new PrinterError('UNKNOWN', err.message, err);
      printer.setJobPhase('failed', e);
      log(`${kind}: 전송 실패 [${e.code}] ${e.message}${printer.isConnected() ? '' : ' (BLE 연결 끊김 상태)'}`);
      return { status: 'failed', error: e };
    } finally {
      busy = false;
    }
  }

  async function buildReceipt(result) {
    const bitmap = await renderReceipt(result);
    const feed = feedLines();
    return { bitmap, feed, bytes: buildRasterPrint(bitmap) };
  }

  return {
    get busy() { return busy; },
    buildReceipt,
    printTest: () => run('TEST 출력', async () => ({ bytes: buildTestPrint(['BYEOLUNGWAN TEST']) })),
    /** 보정 출력. mode를 주면 이번 한 번만 그 급지 방식을 쓴다(진단: 짧은 이미지 직후 A/B 비교) */
    printCalibration: (label, mode) => run(mode ? `보정+급지 ${mode === 'init' ? 'B' : 'A'}` : '보정 출력', async () => {
      const bitmap = renderCalibrationBitmap(label);
      return { bytes: buildRasterPrint(bitmap), rows: bitmap.height, raster: rasterSummary(bitmap), feedAfter: feedLines(), feedMode: mode || feedMode() };
    }),
    /** 기존 종이 배출 테스트(B, 7바이트) */
    printFeedTest: () => run('종이 배출 테스트', async () => ({ bytes: buildFeedOnly(feedLines()), extraWaitMs: feedWaitMs(feedLines()) })),
    /** 진단: 급지 명령만 단독 전송(A 5바이트 / B 7바이트) */
    printFeedDiag: (mode) => run(`급지 ${mode === 'init' ? 'B' : 'A'} 단독`, async () => ({ bytes: buildPostPrintFeed(feedLines(), mode), extraWaitMs: feedWaitMs(feedLines()) })),
    printReceipt: (result) => run('운세지 출력', async () => {
      const { bytes, bitmap, feed } = await buildReceipt(result);
      return { bytes, rows: bitmap.height, raster: rasterSummary(bitmap), feedAfter: feed };
    }),
  };
}
