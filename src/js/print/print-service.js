// 출력 작업 관리 — 한 번에 하나의 작업만, 결과는 printed / failed / busy 중 하나.
// "출력 성공" = 모든 ESC/POS 바이트가 오류 없이 프린터로 전송됨.
// (PT210A는 용지 배출 완료를 알려 주지 않으므로, 종이 걸림·용지 없음까지는 판정할 수 없다)

import { buildTestPrint, buildRasterPrint, buildFeedOnly, buildFeedAfterPrint, DEFAULT_FEED_LINES } from './escpos.js';
import { renderReceipt, renderCalibrationBitmap } from './receipt-render.js';
import { PrinterError } from './pt210a-ble.js';

const DOTS_PER_SEC = 50 * 8; // PT210A 인쇄 속도 약 50mm/s(보수적) × 8 dots/mm
const DOTS_PER_FEED_LINE = 28; // PT210A 실측 줄당 약 3.5mm × 8 dots/mm (급지 대기 시간 추정용)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function createPrintService(printer, { log = () => {} } = {}) {
  let busy = false;

  // buildBytes는 { bytes, rows, feedAfter }를 돌려준다.
  //   rows      = 래스터 이미지 줄 수(인쇄 대기 시간 계산용)
  //   feedAfter = 이미지 인쇄가 끝난 뒤 '별도 쓰기'로 보낼 급지 줄 수(0이면 없음)
  async function run(kind, buildBytes) {
    if (busy) return { status: 'busy' };
    busy = true;
    try {
      if (!printer.snapshot().supported) throw new PrinterError('UNSUPPORTED', 'Web Bluetooth를 사용할 수 없습니다.');
      if (!printer.isConnected()) throw new PrinterError('NOT_CONNECTED', '프린터가 연결되어 있지 않습니다.');
      printer.setJobPhase('printing');
      const { bytes, rows = 0, feed = 0, feedAfter = 0 } = await buildBytes();
      const label = feedAfter ? `${kind} 이미지` : kind;
      log(`${label}: ${bytes.length} bytes 전송 시작`);
      await printer.write(bytes);
      log(`${label}: 데이터 전송 완료`);
      // 전송이 끝나도 프린터가 마지막 줄을 찍는 동안 잠시 기다린다
      await wait(Math.min(3000, 400 + (rows / DOTS_PER_SEC) * 1000));

      // 이미지 뒤 급지: 인쇄가 끝난 뒤 별도 BLE 쓰기로 보낸다(이미지와 한 덩어리로 보내면 PT210A가 반영하지 않음).
      // 급지만 실패한 경우 운세지는 이미 인쇄됐으므로 완료로 처리하고(재출력 방지) 로그에 경고를 남긴다.
      let feedResult = 'none';
      if (feedAfter) {
        const feedBytes = buildFeedAfterPrint(feedAfter);
        try {
          await printer.write(feedBytes);
          feedResult = 'ok';
          log(`${kind} 급지: ESC d ${feedAfter} 별도 전송 완료 (${feedBytes.length} bytes)`);
          await wait(Math.min(1500, 200 + ((feedAfter * DOTS_PER_FEED_LINE) / DOTS_PER_SEC) * 1000));
        } catch (err) {
          feedResult = 'failed';
          log(`${kind} 급지: 별도 전송 실패 [${err.code || err.name}] ${err.message} — 이미지는 전송됨, 프린터 FEED 버튼으로 배출 필요`);
        }
      } else if (feed) {
        await wait(Math.min(1500, ((feed * DOTS_PER_FEED_LINE) / DOTS_PER_SEC) * 1000));
      }

      printer.setJobPhase('printed');
      log(`${kind}: 전송 완료 — 실제 종이 인쇄 여부는 프린터가 알려주지 않으므로 종이로 확인`);
      return { status: 'printed', bytes: bytes.length, feedResult };
    } catch (err) {
      const e = err instanceof PrinterError ? err : new PrinterError('UNKNOWN', err.message, err);
      printer.setJobPhase('failed', e);
      log(`${kind}: 출력 실패 [${e.code}] ${e.message}`);
      return { status: 'failed', error: e };
    } finally {
      busy = false;
    }
  }

  // 급지량은 태블릿에 저장된 설정을 따른다(이미지 렌더링과는 무관)
  const feedLines = () => {
    const n = Number(printer.snapshot().settings.feedLines);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_FEED_LINES;
  };

  async function buildReceipt(result) {
    const bitmap = await renderReceipt(result);
    const feed = feedLines();
    return { bitmap, feed, bytes: buildRasterPrint(bitmap) };
  }

  return {
    get busy() { return busy; },
    buildReceipt,
    printTest: () => run('TEST 출력', async () => ({ bytes: buildTestPrint(['BYEOLUNGWAN TEST']) })),
    printCalibration: (label) => run('보정 출력', async () => {
      const bitmap = renderCalibrationBitmap(label);
      return { bytes: buildRasterPrint(bitmap), rows: bitmap.height, feedAfter: feedLines() };
    }),
    printFeedTest: () => run('종이 배출 테스트', async () => {
      const feed = feedLines();
      return { bytes: buildFeedOnly(feed), feed };
    }),
    printReceipt: (result) => run('운세지 출력', async () => {
      const { bytes, bitmap, feed } = await buildReceipt(result);
      return { bytes, rows: bitmap.height, feedAfter: feed };
    }),
  };
}
