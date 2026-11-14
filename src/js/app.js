import { initStage } from './stage.js';
import { createHelpModal } from './ui/help-modal.js';
import { createBirthForm } from './ui/birth-form.js';
import { renderIcon, preloadIcon } from './ui/star-icon.js';
import { resolveStar } from './domain/star-resolver.js';
import { getTodayFortune } from './domain/fortune-repo.js';
import { todayInKorea, formatYmd } from './domain/date-utils.js';
import { calendarTag } from './domain/birthdate.js';
import { DEMO_STAR } from './data/demo-result.js';
import { initPwa } from './pwa.js';
import { createPt210aPrinter } from './print/pt210a-ble.js';
import { createPrintService } from './print/print-service.js';
import { createPrinterUi } from './ui/printer-ui.js';

const PAGES = ['start', 'birth', 'result', 'end'];

const params = new URLSearchParams(location.search);
const DEV = params.get('dev') === '1';

const stage = document.getElementById('stage');
const help = createHelpModal(stage);

// 체험 한 회차의 상태. 메모리에만 두고 저장·전송하지 않는다.
const state = {
  page: 'start',
  birth: null,   // domain/birthdate.js의 BirthDate
  result: null,  // 화면(PAGE 03·04)과 출력이 함께 쓰는 결과
};

// ── 프린터: 페이지를 오가도 연결은 유지된다(체험 상태 초기화와 무관) ──
let printerUi = null;
const printerLog = (msg) => printerUi && printerUi.log(msg);
const printer = createPt210aPrinter({ log: printerLog });
const printService = createPrintService(printer, { log: printerLog });
printerUi = createPrinterUi(stage, { printer, printService, dev: DEV, getResult: () => state.result });

const birthForm = createBirthForm(stage.querySelector('#birth-form'), {
  onValid: (birth) => {
    state.birth = birth;
    state.result = buildResult(birth);
    renderResult(state.result);
    go('result');
  },
});

// ── 화면 전환: 섹션의 hidden만 바꾼다(배경·헤더는 그대로 유지) ──
function go(page) {
  if (!PAGES.includes(page)) return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') {
    document.activeElement.blur();
  }
  birthForm.closeMenu();
  printerUi.clearError();
  stage.querySelectorAll('.page').forEach((el) => {
    el.hidden = el.dataset.page !== page;
  });
  state.page = page;
  if (page === 'start') {
    resetSession();
    pwa.notifySafePoint(); // 대기 중인 새 버전이 있으면 이때만 적용
  }
}

function resetSession() {
  state.birth = null;
  state.result = null;
  birthForm.reset();
  setDevPrintBadge(false);
}

// ── 결과 구성: 판정(star-resolver)·운세 조회(fortune-repo)·표시용 문구를 한 객체로 ──
function buildResult(birth) {
  const { star, isDemo: starIsDemo } = resolveStar(birth);
  const date = todayInKorea();
  const fortune = getTodayFortune({ star, birth, date });
  return {
    isDemo: starIsDemo || fortune.isDemo,
    star: { ...star, footer: `${star.name} · ${star.hanja} · ${star.alias}` },
    birth: { ...birth, label: `${formatYmd(birth.input)} ${calendarTag(birth)}` },
    fortune: { ...fortune, dateLabel: formatYmd(date) },
  };
}

function readPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

// PAGE 03과 PAGE 04는 같은 result 객체 하나로 그린다.
function renderResult(result) {
  stage.querySelectorAll('[data-bind]').forEach((el) => {
    el.textContent = readPath(result, el.dataset.bind) ?? '';
  });
  stage.querySelectorAll('[data-bind-icon]').forEach((el) => {
    renderIcon(el, readPath(result, el.dataset.bindIcon));
  });
  stage.querySelectorAll('[data-bind-lines]').forEach((el) => {
    const lines = readPath(result, el.dataset.bindLines) ?? [];
    el.replaceChildren(...lines.flatMap((line, i) => (i ? [document.createElement('br'), line] : [line])));
  });
}

// ── 개발 모드 표시: 실제 인쇄가 아님을 화면 구석에 명시(운영 모드에서는 생성되지 않음) ──
let devBadge = null;
function setDevPrintBadge(on) {
  if (!DEV) return;
  if (!devBadge) {
    devBadge = document.createElement('div');
    devBadge.className = 'dev-badge';
    devBadge.textContent = 'DEV · 시연 흐름 — 실제 인쇄되지 않았습니다';
    stage.appendChild(devBadge);
  }
  devBadge.hidden = !on;
}

// ── 버튼 동작 ──
const actions = {
  go: (btn) => go(btn.dataset.to),
  'open-help': () => {
    birthForm.closeMenu();
    help.open();
  },
  'close-help': () => help.close(),
  'submit-birth': () => birthForm.submit(),
  print: async () => {
    if (printService.busy || !state.result) return; // 출력 중 중복 클릭 방지
    printerUi.clearError();
    // 개발 모드 + 프린터 없음: 기존 시연 흐름(실제 인쇄 아님을 표시)
    if (DEV && !printer.isConnected()) {
      setDevPrintBadge(true);
      go('end');
      return;
    }
    const result = await printService.printReceipt(state.result);
    if (result.status === 'printed') {
      setDevPrintBadge(false);
      if (state.page === 'result') go('end'); // 실제 전송 성공 후에만 완료 화면
    } else if (result.status === 'failed') {
      printerUi.showError(result.error);
    }
  },
  'printer-connect': () => printerUi.connect(),
};

stage.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-action]');
  if (!btn || !stage.contains(btn)) return;
  actions[btn.dataset.action]?.(btn);
});

// 입력칸 밖을 누르면 키보드를 닫는다(확인 버튼이 키보드에 가려지지 않게).
stage.addEventListener('pointerdown', (event) => {
  const active = document.activeElement;
  if (active && active.tagName === 'INPUT' && !event.target.closest('input')) active.blur();
});

// ── 시작 ──
const pwa = initPwa({
  // 시작 화면 + 모달 닫힘 + 입력 중 아님일 때만 새 버전으로 새로고침 가능
  isSafeToReload: () => state.page === 'start' && !help.isOpen()
    && !(document.activeElement && document.activeElement.tagName === 'INPUT'),
  log: DEV ? (msg) => console.info('[PWA]', msg) : undefined,
});

initStage(stage);
preloadIcon(DEMO_STAR.iconPath);
printer.reconnectRemembered(); // 새로고침·재실행 후: 이전에 허용한 프린터를 터치 없이 다시 연결(지원 브라우저만)

if (DEV) {
  // 화면 확인용: ?dev=1&screen=result&help=1
  const screen = params.get('screen');
  if (screen === 'result' || screen === 'end') {
    state.birth = { calendar: 'solar', input: { y: 2000, m: 1, d: 1 }, isLeapMonth: false, solar: { y: 2000, m: 1, d: 1 } };
    state.result = buildResult(state.birth);
    renderResult(state.result);
  }
  if (PAGES.includes(screen)) go(screen);
  if (params.get('help') === '1') help.open();
  window.__fortuneSlip = { state, printer, printService }; // 개발 모드에서만 상태 확인용으로 노출
}
