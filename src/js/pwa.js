// 서비스 워커 등록과 '안전한 시점'에만 새 버전을 적용하는 로직.
// - 새 버전이 설치되면 대기시켜 두고,
// - 시작 화면에 있고 모달이 닫혀 있으며 최근 몇 초간 조작이 없을 때만 교체 후 새로고침한다.
// - 체험 중(입력·결과·완료 화면)에는 절대 새로고침하지 않는다.

const QUIET_MS = 8000;               // 마지막 터치 후 이만큼 조용하면 적용
const RETRY_MS = 5000;               // 아직 안전하지 않으면 다시 확인하는 간격
const UPDATE_CHECK_MS = 30 * 60e3;   // 새 버전 확인 주기(전시 중 장시간 켜 두는 경우 대비)

export function initPwa({ isSafeToReload, log = () => {} }) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    log('서비스 워커 사용 불가(HTTPS 또는 localhost 필요)');
    return { notifySafePoint() {} };
  }

  let registration = null;
  let waitingWorker = null;
  let applyRequested = false;
  let retryTimer = 0;
  let lastInteraction = Date.now();

  document.addEventListener('pointerdown', () => { lastInteraction = Date.now(); }, true);

  // 우리가 SKIP_WAITING을 요청한 경우에만 새로고침(첫 설치 때의 clients.claim으로는 새로고침하지 않음)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!applyRequested) return;
    applyRequested = false;
    log('새 버전 적용 → 새로고침');
    window.location.reload();
  });

  function tryApply() {
    clearTimeout(retryTimer);
    if (!waitingWorker || applyRequested) return;
    const quiet = Date.now() - lastInteraction >= QUIET_MS;
    if (isSafeToReload() && quiet) {
      applyRequested = true;
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    retryTimer = setTimeout(tryApply, RETRY_MS);
  }

  function trackInstalling(worker) {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        waitingWorker = worker;
        log('새 버전 설치 완료 — 시작 화면에서 적용 대기');
        tryApply();
      }
    });
  }

  navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then((reg) => {
      registration = reg;
      log(`서비스 워커 등록: scope=${reg.scope}`);
      if (reg.waiting && navigator.serviceWorker.controller) {
        waitingWorker = reg.waiting;
        tryApply();
      }
      if (reg.installing) trackInstalling(reg.installing);
      reg.addEventListener('updatefound', () => trackInstalling(reg.installing));
      setInterval(() => reg.update().catch(() => {}), UPDATE_CHECK_MS);
    })
    .catch((err) => log(`서비스 워커 등록 실패: ${err.message}`));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && registration) registration.update().catch(() => {});
  });

  return {
    /** 시작 화면으로 돌아오는 등 안전해질 수 있는 시점에 호출 */
    notifySafePoint() {
      if (waitingWorker) tryApply();
    },
  };
}
