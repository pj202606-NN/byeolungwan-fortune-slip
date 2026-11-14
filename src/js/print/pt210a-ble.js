// GOOJPRT PT210A — Web Bluetooth(BLE) 연결과 전송.
// nRF Connect로 확인된 경로: Service 49535343-fe7d-… / Write 49535343-8841-… (WRITE, WRITE NO RESPONSE)
//
// 상태: disconnected(연결 안 됨) → connecting(연결 중) → connected(연결됨)
//       → printing(출력 중) → printed(출력 성공) | failed(출력 실패)
// 이 모듈은 바이트 전송만 책임진다. 무엇을 인쇄할지는 print-service.js가 정한다.

export const PT210A = Object.freeze({
  service: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  write: '49535343-8841-43f4-a8d4-ecbe34729bb3',
  notify: '49535343-1e4d-4bd9-ba61-23c647249616',
  namePrefix: 'PT210',
});

export const STATUS_LABEL = Object.freeze({
  unsupported: '사용 불가',
  disconnected: '연결 안 됨',
  connecting: '연결 중',
  connected: '연결됨',
  printing: '출력 중',
  printed: '출력 성공',
  failed: '출력 실패',
});

export class PrinterError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'PrinterError';
    this.code = code;
    this.cause = cause;
  }
}

const STORAGE_KEY = 'byeolungwan.printer';
// 전송 설정(chunkSize·chunkDelayMs·writeMode)은 태블릿에 저장된 값이 이 기본값보다 우선한다 — 실기기에서 맞춘 값이 유지되도록.
// feedLines: 인쇄 후 종이 배출 줄 수(운세지·보정 출력의 마지막 ESC d n).
const DEFAULT_SETTINGS = Object.freeze({ chunkSize: 128, chunkDelayMs: 10, writeMode: 'auto', feedLines: 10 });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function loadStored() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}
function saveStored(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* 저장 실패해도 동작에는 지장 없음 */ }
}

function classify(err) {
  if (err instanceof PrinterError) return err;
  const name = err && err.name;
  if (name === 'NotFoundError') return new PrinterError('CANCELLED', '프린터 선택이 취소되었습니다.', err);
  if (name === 'SecurityError') return new PrinterError('NOT_ALLOWED', '블루투스 사용 권한이 없습니다. 화면을 눌러 다시 연결해 주세요.', err);
  if (name === 'NotSupportedError') return new PrinterError('UNSUPPORTED', '이 프린터에서 필요한 기능을 찾지 못했습니다.', err);
  if (name === 'NetworkError') return new PrinterError('CONNECT_FAILED', '프린터에 연결하지 못했습니다. 전원과 거리를 확인해 주세요.', err);
  return new PrinterError('UNKNOWN', (err && err.message) || '알 수 없는 오류', err);
}

export function createPt210aPrinter({ log = () => {} } = {}) {
  const stored = loadStored();
  const settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  const supported = typeof navigator !== 'undefined' && !!navigator.bluetooth && window.isSecureContext;

  let status = supported ? 'disconnected' : 'unsupported';
  let device = null;
  let writeChar = null;
  let lastError = null;
  let manualDisconnect = false;
  let reconnectTimer = 0;
  let activeWriteMode = null; // 실제로 성공한 쓰기 방식(디버깅 표시용)
  const listeners = new Set();

  function emit() {
    const snap = snapshot();
    listeners.forEach((fn) => fn(snap));
  }

  function setStatus(next, error = null) {
    status = next;
    lastError = error;
    emit();
  }

  function snapshot() {
    return {
      status,
      label: STATUS_LABEL[status],
      supported,
      deviceName: device ? device.name || '(이름 없음)' : stored.name || null,
      connected: isConnected(),
      error: lastError,
      settings: { ...settings },
      activeWriteMode,
      canAutoReconnect: !!(navigator.bluetooth && navigator.bluetooth.getDevices),
    };
  }

  function isConnected() {
    return !!(device && device.gatt && device.gatt.connected && writeChar);
  }

  async function setupGatt(dev) {
    const server = await dev.gatt.connect();
    activeWriteMode = null; // 새 연결에서는 빠른 방식(without response)부터 다시 시도
    const service = await server.getPrimaryService(PT210A.service);
    writeChar = await service.getCharacteristic(PT210A.write);
    const p = writeChar.properties || {};
    log(`쓰기 특성 확보 (write=${!!p.write}, writeWithoutResponse=${!!p.writeWithoutResponse})`);
    // Notify는 선택 사항: 상태 응답이 오면 로그로만 남긴다(출력 성공 판정에는 쓰지 않음)
    try {
      const notifyChar = await service.getCharacteristic(PT210A.notify);
      await notifyChar.startNotifications();
      notifyChar.addEventListener('characteristicvaluechanged', (e) => {
        const v = new Uint8Array(e.target.value.buffer);
        log(`프린터 응답(notify): ${[...v].map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
      });
      log('Notify 구독');
    } catch (err) {
      log(`Notify 구독 생략: ${err.message}`);
    }
  }

  function onDisconnected() {
    writeChar = null;
    log('프린터 연결 끊김');
    if (status !== 'connecting') setStatus('disconnected', lastError);
    if (!manualDisconnect) scheduleReconnect(1);
  }

  // 끊긴 같은 기기에는 사용자 터치 없이 다시 연결할 수 있다(같은 페이지 세션 안).
  function scheduleReconnect(attempt) {
    clearTimeout(reconnectTimer);
    if (!device || attempt > 4) return;
    const delay = 1500 * 2 ** (attempt - 1);
    reconnectTimer = setTimeout(async () => {
      if (isConnected() || manualDisconnect) return;
      log(`자동 재연결 시도 ${attempt}`);
      try {
        setStatus('connecting');
        await setupGatt(device);
        setStatus('connected');
        log('자동 재연결 성공');
      } catch (err) {
        setStatus('disconnected', classify(err));
        scheduleReconnect(attempt + 1);
      }
    }, delay);
  }

  async function attach(dev) {
    if (device && device !== dev) device.removeEventListener('gattserverdisconnected', onDisconnected);
    device = dev;
    device.removeEventListener('gattserverdisconnected', onDisconnected);
    device.addEventListener('gattserverdisconnected', onDisconnected);
    manualDisconnect = false;
    setStatus('connecting');
    try {
      await setupGatt(dev);
      saveStored({ ...loadStored(), id: dev.id, name: dev.name, settings });
      setStatus('connected');
      log(`연결됨: ${dev.name || dev.id}`);
    } catch (err) {
      const e = classify(err);
      setStatus('disconnected', e);
      throw e;
    }
  }

  /** 사용자 터치(버튼 클릭) 안에서 호출해야 한다 — 브라우저의 기기 선택 창이 열린다. */
  async function connect() {
    if (!supported) throw new PrinterError('UNSUPPORTED', '이 브라우저에서는 블루투스 프린터를 쓸 수 없습니다. (Android Chrome, HTTPS 필요)');
    if (isConnected()) return;
    let dev;
    try {
      dev = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: PT210A.namePrefix }, { services: [PT210A.service] }],
        optionalServices: [PT210A.service],
      });
    } catch (err) {
      const e = classify(err);
      setStatus(isConnected() ? 'connected' : 'disconnected', e);
      throw e;
    }
    await attach(dev);
  }

  /** 새로고침·재실행 후: 이전에 허용한 프린터를 사용자 터치 없이 다시 연결(브라우저가 지원할 때만) */
  async function reconnectRemembered() {
    if (!supported || isConnected() || !navigator.bluetooth.getDevices) return false;
    const { id } = loadStored();
    if (!id) return false;
    try {
      const devices = await navigator.bluetooth.getDevices();
      const dev = devices.find((d) => d.id === id);
      if (!dev) return false;
      log('이전에 연결한 프린터 재연결 시도');
      await attach(dev);
      return true;
    } catch (err) {
      log(`자동 재연결 실패: ${classify(err).message}`);
      return false;
    }
  }

  function disconnect() {
    manualDisconnect = true;
    clearTimeout(reconnectTimer);
    if (device && device.gatt && device.gatt.connected) device.gatt.disconnect();
    writeChar = null;
    setStatus('disconnected');
  }

  async function writeChunk(chunk) {
    const canNoResp = writeChar.properties ? writeChar.properties.writeWithoutResponse : true;
    const preferNoResp = settings.writeMode === 'without-response'
      || (settings.writeMode === 'auto' && canNoResp && activeWriteMode !== 'with-response');
    if (preferNoResp && writeChar.writeValueWithoutResponse) {
      try {
        await writeChar.writeValueWithoutResponse(chunk);
        activeWriteMode = 'without-response';
        return;
      } catch (err) {
        if (settings.writeMode === 'without-response') throw err;
        log(`writeValueWithoutResponse 실패 → writeValue로 전환: ${err.message}`);
      }
    }
    if (writeChar.writeValueWithResponse) await writeChar.writeValueWithResponse(chunk);
    else await writeChar.writeValue(chunk);
    activeWriteMode = 'with-response';
  }

  /** 바이트 배열을 청크로 나눠 순서대로 보낸다. 끊기거나 실패하면 PrinterError를 던진다. */
  async function write(bytes, { onProgress } = {}) {
    if (!isConnected()) throw new PrinterError('NOT_CONNECTED', '프린터가 연결되어 있지 않습니다.');
    const size = Math.max(20, Math.min(512, settings.chunkSize | 0));
    const total = bytes.length;
    const t0 = performance.now();
    for (let off = 0; off < total; off += size) {
      if (!isConnected()) throw new PrinterError('DISCONNECTED', '출력 중 프린터 연결이 끊겼습니다.');
      const chunk = bytes.slice(off, off + size);
      try {
        await writeChunk(chunk);
      } catch (err) {
        if (!isConnected()) throw new PrinterError('DISCONNECTED', '출력 중 프린터 연결이 끊겼습니다.', err);
        throw new PrinterError('WRITE_FAILED', `프린터로 전송하지 못했습니다. (${err.message})`, err);
      }
      if (onProgress) onProgress(Math.min(total, off + size), total);
      if (settings.chunkDelayMs > 0) await wait(settings.chunkDelayMs);
    }
    const ms = Math.round(performance.now() - t0);
    log(`전송 완료 ${total} bytes / ${Math.ceil(total / size)}개 청크(${size}B) / ${ms}ms / ${activeWriteMode}`);
    return { bytes: total, ms };
  }

  function updateSettings(patch) {
    Object.assign(settings, patch);
    saveStored({ ...loadStored(), settings });
    emit();
  }

  /** 출력 작업 단계 표시용(print-service가 호출) */
  function setJobPhase(phase, error = null) {
    if (phase === 'printing' || phase === 'printed' || phase === 'failed') setStatus(phase, error);
  }

  // 화면이 다시 켜졌을 때 끊겨 있으면 재연결
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && device && !isConnected() && !manualDisconnect) scheduleReconnect(1);
  });

  return {
    connect, disconnect, reconnectRemembered, write, isConnected, updateSettings, setJobPhase,
    snapshot,
    subscribe(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); },
  };
}
