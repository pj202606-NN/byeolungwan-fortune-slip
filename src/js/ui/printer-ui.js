// 프린터 관련 화면 요소.
// - 관람객 화면(운영 모드): 결과 화면의 작은 "프린터 연결" 버튼(연결 안 됐을 때만), 출력 오류 한 줄, 출력 중 버튼 잠금
// - 개발 모드(?dev=1): 상태·기기·전송 설정·TEST 출력·보정 출력·로그·운세지 미리보기 패널

import { bitmapPreview } from '../print/receipt-render.js';

const ERROR_TEXT = {
  NOT_CONNECTED: '프린터가 연결되어 있지 않습니다. 프린터를 연결한 뒤 다시 눌러 주세요.',
  DISCONNECTED: '출력 중 프린터 연결이 끊겼습니다. 다시 눌러 주세요.',
  WRITE_FAILED: '프린터로 보내지 못했습니다. 다시 눌러 주세요.',
  CANCELLED: '프린터 선택이 취소되었습니다.',
  CONNECT_FAILED: '프린터에 연결하지 못했습니다. 프린터 전원을 확인해 주세요.',
  NOT_ALLOWED: '블루투스 권한이 없습니다. 프린터 연결을 다시 눌러 주세요.',
  UNSUPPORTED: '이 기기에서는 블루투스 프린터를 쓸 수 없습니다.',
};

export function errorText(err) {
  return (err && ERROR_TEXT[err.code]) || '출력하지 못했습니다. 다시 눌러 주세요.';
}

export function createPrinterUi(stage, { printer, printService, dev, getResult }) {
  const chip = stage.querySelector('#printer-chip');
  const chipLabel = chip.querySelector('.printer-chip__label');
  const errorEl = stage.querySelector('#print-error');
  // 시작 화면(R-01) 상단 가운데 상태 버튼 — 일반 모드에서만 쓴다(개발 모드는 DEV 패널이 같은 자리를 씀)
  const startBtn = stage.querySelector('#start-printer');
  const startLabel = startBtn.querySelector('.printer-status__label');
  const startMsg = stage.querySelector('#start-printer-msg');
  let startMsgTimer = 0;
  const printBtn = stage.querySelector('.result__print');
  const printBtnText = printBtn.textContent;
  const logs = [];
  let panel = null;

  function log(msg) {
    const line = `${new Date().toLocaleTimeString('ko-KR', { hour12: false })} ${msg}`;
    logs.push(line);
    if (logs.length > 40) logs.shift();
    if (dev) console.info('[PRINTER]', msg);
    if (panel) panel.querySelector('.dev-printer__log').textContent = logs.slice(-8).join('\n');
  }

  function render(snap) {
    // 시작 화면 버튼: 미연결 → "프린터 연결"(누르면 기기 선택 창), 연결됨 → "프린터 연결됨"(누를 동작 없음)
    startBtn.hidden = dev || !snap.supported;
    const startState = snap.status === 'connecting' ? 'connecting' : snap.connected ? 'connected' : 'disconnected';
    startBtn.dataset.status = startState;
    startLabel.textContent = startState === 'connecting' ? '프린터 연결 중…'
      : startState === 'connected' ? '프린터 연결됨' : '프린터 연결';
    startBtn.setAttribute('aria-disabled', String(startState !== 'disconnected'));
    if (startState === 'connected') setStartMsg('');

    // 결과 화면의 작은 연결 버튼: 일반 모드에서는 연결이 끊긴 경우에만 복구용으로 표시, 개발 모드에서는 항상 표시
    const showChip = snap.supported && (dev || !(snap.connected));
    chip.hidden = !showChip;
    chip.dataset.status = snap.connected && snap.status !== 'printing' ? 'connected' : snap.status;
    chipLabel.textContent = snap.status === 'connecting' ? '프린터 연결 중…'
      : snap.connected ? `프린터 ${snap.label}` : '프린터 연결';
    chip.disabled = snap.status === 'connecting' || snap.status === 'printing';

    const printing = snap.status === 'printing';
    printBtn.disabled = printing;
    printBtn.setAttribute('aria-busy', String(printing));
    printBtn.textContent = printing ? '출력 중…' : printBtnText;

    if (panel) renderPanel(snap);
  }

  function setStartMsg(text) {
    clearTimeout(startMsgTimer);
    startMsg.textContent = text;
    if (text) startMsgTimer = setTimeout(() => { startMsg.textContent = ''; }, 6000);
  }

  function showError(err) { errorEl.textContent = errorText(err); }
  function clearError() { errorEl.textContent = ''; }

  // ── 개발 패널 ──
  function buildPanel() {
    panel = document.createElement('section');
    panel.className = 'dev-printer';
    panel.innerHTML = `
      <button type="button" class="dev-printer__toggle" aria-expanded="false">DEV · 프린터 <span class="dev-printer__status"></span></button>
      <div class="dev-printer__body" hidden>
        <p class="dev-printer__info"></p>
        <div class="dev-printer__row">
          <button type="button" data-dev="connect">연결</button>
          <button type="button" data-dev="disconnect">연결 해제</button>
          <button type="button" data-dev="test">TEST 출력</button>
          <button type="button" data-dev="calib">보정 출력</button>
          <button type="button" data-dev="preview">운세지 미리보기</button>
          <button type="button" data-dev="feed">종이 배출 테스트</button>
        </div>
        <div class="dev-printer__row">
          <label>청크 <select data-setting="chunkSize">${[20, 64, 128, 180, 244, 512].map((v) => `<option value="${v}">${v}B</option>`).join('')}</select></label>
          <label>간격 <select data-setting="chunkDelayMs">${[0, 5, 10, 20, 40, 80].map((v) => `<option value="${v}">${v}ms</option>`).join('')}</select></label>
          <label>쓰기 <select data-setting="writeMode"><option value="auto">자동</option><option value="without-response">without response</option><option value="with-response">with response</option></select></label>
          <label>인쇄 후 급지 <select data-setting="feedLines">${[4, 5, 6, 7, 8, 10, 12, 14, 16].map((v) => `<option value="${v}">${v}줄</option>`).join('')}</select></label>
        </div>
        <div class="dev-printer__row">
          <label>인쇄 후 급지 명령 <select data-setting="feedMode"><option value="init">B · ESC @ 포함 (7B)</option><option value="plain">A · ESC @ 없음 (5B)</option></select></label>
          <label>급지 전 대기 <select data-setting="feedDelayMs"><option value="0">자동</option>${[1000, 2000, 3000, 5000].map((v) => `<option value="${v}">${v}ms</option>`).join('')}</select></label>
        </div>
        <div class="dev-printer__row" aria-label="급지 진단">
          <span class="dev-printer__hint">급지 진단 ·</span>
          <button type="button" data-dev="feedA">급지 A 단독 (5B)</button>
          <button type="button" data-dev="feedB">급지 B 단독 (7B)</button>
          <button type="button" data-dev="calibA">보정+급지 A</button>
          <button type="button" data-dev="calibB">보정+급지 B</button>
        </div>
        <pre class="dev-printer__log"></pre>
        <div class="dev-printer__preview" hidden></div>
      </div>`;
    stage.appendChild(panel);

    const toggle = panel.querySelector('.dev-printer__toggle');
    const body = panel.querySelector('.dev-printer__body');
    toggle.addEventListener('click', () => {
      body.hidden = !body.hidden;
      toggle.setAttribute('aria-expanded', String(!body.hidden));
    });
    panel.querySelectorAll('[data-setting]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const key = sel.dataset.setting;
        printer.updateSettings({ [key]: key === 'writeMode' || key === 'feedMode' ? sel.value : Number(sel.value) });
        log(`설정 변경: ${key} = ${sel.value}`);
      });
    });
    panel.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-dev]');
      if (!btn) return;
      const act = btn.dataset.dev;
      if (act === 'connect') await connect();
      if (act === 'disconnect') printer.disconnect();
      if (act === 'test') await printService.printTest();
      if (act === 'calib') await printService.printCalibration(`${printer.snapshot().settings.chunkSize}B`);
      if (act === 'preview') await togglePreview();
      // 진단 명령은 다른 출력(운세지 포함)이 진행 중이면 print-service가 거부한다(busy)
      const calibLabel = `${printer.snapshot().settings.chunkSize}B`;
      const diag = {
        feed: ['종이 배출 테스트', () => printService.printFeedTest()],
        feedA: ['급지 A 단독', () => printService.printFeedDiag('plain')],
        feedB: ['급지 B 단독', () => printService.printFeedDiag('init')],
        calibA: ['보정+급지 A', () => printService.printCalibration(calibLabel, 'plain')],
        calibB: ['보정+급지 B', () => printService.printCalibration(calibLabel, 'init')],
      }[act];
      if (diag) {
        const r = await diag[1]();
        if (r.status === 'busy') log(`${diag[0]}: 다른 출력이 진행 중이라 실행하지 않음`);
        if (r.status === 'failed') showError(r.error);
      }
    });
  }

  async function togglePreview() {
    const box = panel.querySelector('.dev-printer__preview');
    if (!box.hidden) { box.hidden = true; return; }
    const result = getResult();
    if (!result) { log('미리보기: 결과 데이터가 없습니다(결과 화면에서 눌러 주세요)'); return; }
    const { bitmap, bytes, feed } = await printService.buildReceipt(result);
    const img = bitmapPreview(bitmap);
    img.className = 'dev-printer__receipt';
    box.replaceChildren(img, Object.assign(document.createElement('p'), {
      textContent: `${bitmap.widthBytes * 8}×${bitmap.height} dots · 이미지 ESC/POS ${bytes.length} bytes · 인쇄 후 별도 급지 ${feed}줄`,
    }));
    box.hidden = false;
    log(`미리보기 생성 ${bitmap.height}줄, ${bytes.length} bytes`);
  }

  function renderPanel(snap) {
    panel.querySelector('.dev-printer__status').textContent = `· ${snap.label}`;
    panel.querySelector('.dev-printer__info').textContent = [
      `상태: ${snap.label}${snap.status === 'printed' ? '(데이터 전송 완료 · 종이 인쇄는 실물로 확인)' : ''}${snap.error ? ` (${snap.error.code}: ${snap.error.message})` : ''}`,
      `기기: ${snap.deviceName || '-'}`,
      `쓰기 방식: ${snap.activeWriteMode || '-'}`,
      `새로고침 후 자동 재연결: ${snap.canAutoReconnect ? '지원' : '미지원(연결 버튼 필요)'}`,
      snap.supported ? '' : 'Web Bluetooth 사용 불가(Chrome + HTTPS 필요)',
    ].filter(Boolean).join('\n');
    for (const [key, val] of Object.entries(snap.settings)) {
      const sel = panel.querySelector(`[data-setting="${key}"]`);
      if (sel && sel.value !== String(val)) sel.value = String(val);
    }
  }

  /** 기존 PT210A 연결 로직을 그대로 쓴다. 실패 안내는 버튼을 누른 화면(시작/결과)에 표시 */
  async function connect(fromStart = false) {
    if (printer.isConnected()) return true;
    clearError();
    setStartMsg('');
    try {
      await printer.connect();
      return true;
    } catch (err) {
      log(`연결 실패 [${err.code}] ${err.message}`);
      if (fromStart) setStartMsg(errorText(err));
      else if (err.code !== 'CANCELLED' || !dev) showError(err);
      return false;
    }
  }

  if (dev) buildPanel();
  printer.subscribe(render);

  return { log, connect, showError, clearError };
}
