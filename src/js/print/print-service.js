// 출력 작업 관리 — 한 번에 하나의 작업만, 결과는 printed / failed / busy 중 하나.
// "출력 성공" = 모든 ESC/POS 바이트가 오류 없이 프린터로 전송됨.
// (PT210A는 용지 배출 완료를 알려 주지 않으므로, 종이 걸림·용지 없음까지는 판정할 수 없다)

import { buildTestPrint, buildRasterPrint } from './escpos.js';
import { renderReceipt, renderCalibrationBitmap } from './receipt-render.js';
import { PrinterError } from './pt210a-ble.js';

const DOTS_PER_SEC = 50 * 8; // PT210A 인쇄 속도 약 50mm/s(보수적) × 8 dots/mm

export function createPrintService(printer, { log = () => {} } = {}) {
  let busy = false;

  // buildBytes는 { bytes, rows }를 돌려준다(rows = 래스터 이미지 줄 수, 급지 대기 시간 계산용)
  async function run(kind, buildBytes) {
    if (busy) return { status: 'busy' };
    busy = true;
    try {
      if (!printer.snapshot().supported) throw new PrinterError('UNSUPPORTED', 'Web Bluetooth를 사용할 수 없습니다.');
      if (!printer.isConnected()) throw new PrinterError('NOT_CONNECTED', '프린터가 연결되어 있지 않습니다.');
      printer.setJobPhase('printing');
      const { bytes, rows = 0 } = await buildBytes();
      log(`${kind}: ${bytes.length} bytes 전송 시작`);
      await printer.write(bytes);
      // 전송이 끝나도 프린터가 마지막 줄을 찍고 급지하는 동안 잠시 기다린다
      await new Promise((r) => setTimeout(r, Math.min(3000, 400 + (rows / DOTS_PER_SEC) * 1000)));
      printer.setJobPhase('printed');
      log(`${kind}: 데이터 전송 완료 — 실제 종이 인쇄 여부는 프린터가 알려주지 않으므로 종이로 확인`);
      return { status: 'printed', bytes: bytes.length };
    } catch (err) {
      const e = err instanceof PrinterError ? err : new PrinterError('UNKNOWN', err.message, err);
      printer.setJobPhase('failed', e);
      log(`${kind}: 출력 실패 [${e.code}] ${e.message}`);
      return { status: 'failed', error: e };
    } finally {
      busy = false;
    }
  }

  async function buildReceipt(result) {
    const bitmap = await renderReceipt(result);
    return { bitmap, bytes: buildRasterPrint(bitmap) };
  }

  return {
    get busy() { return busy; },
    buildReceipt,
    printTest: () => run('TEST 출력', async () => ({ bytes: buildTestPrint(['BYEOLUNGWAN TEST']) })),
    printCalibration: (label) => run('보정 출력', async () => {
      const bitmap = renderCalibrationBitmap(label);
      return { bytes: buildRasterPrint(bitmap, { feed: 3 }), rows: bitmap.height };
    }),
    printReceipt: (result) => run('운세지 출력', async () => {
      const { bytes, bitmap } = await buildReceipt(result);
      return { bytes, rows: bitmap.height };
    }),
  };
}
