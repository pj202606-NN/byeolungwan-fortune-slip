import { initStage } from './stage.js';
import { createHelpModal } from './ui/help-modal.js';
import { createBirthForm } from './ui/birth-form.js';
import { renderIcon } from './ui/star-icon.js';
import { resolveStar } from './domain/star-resolver.js';
import { getTodayFortune, preloadFortunes } from './domain/fortune-repo.js';
import { loadMansions, mansionById } from './domain/mansions.js';
import { getIssueDate, FORTUNE_FIRST_DAY, FORTUNE_LAST_DAY } from './domain/receipt-date.js';
import { formatYmd } from './domain/date-utils.js';
import { calendarTag } from './domain/birthdate.js';
import { initPwa } from './pwa.js';
import { createPt210aPrinter } from './print/pt210a-ble.js';
import { createPrintService } from './print/print-service.js';
import { createPrinterUi } from './ui/printer-ui.js';

const PAGES = ['start', 'birth', 'result', 'end'];

const params = new URLSearchParams(location.search);
const DEV = params.get('dev') === '1';
// 개발 모드 전용 테스트 날짜(?dev=1&date=2026-11-23 또는 개발 패널). 일반 모드에서는 항상 실제 한국 날짜.
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
let devDateIso = DEV && ISO_RE.test(params.get('date') || '') ? params.get('date') : null;

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
printerUi = createPrinterUi(stage, {
  printer,
  printService,
  dev: DEV,
  getResult: () => state.result,
  // 개발 패널: 테스트 날짜·별자리 선택 미리보기
  preview: {
    dateRange: [FORTUNE_FIRST_DAY, FORTUNE_LAST_DAY],
    getTestDate: () => devDateIso,
    setTestDate: (iso) => { devDateIso = DEV && ISO_RE.test(iso || '') ? iso : null; },
    listStars: () => loadMansions(),
    buildResultForStar: async (id) => resultFor(await mansionById(id), null),
  },
});

const birthForm = createBirthForm(stage.querySelector('#birth-form'), {
  onValid: async (birth) => {
    try {
      state.birth = birth;
      state.result = await buildResult(birth);
      renderResult(state.result);
      go('result');
    } catch (err) {
      console.error(err);
      stage.querySelector('#birth-error').textContent = '운세 정보를 불러오지 못했습니다. 다시 눌러 주세요.';
    }
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
    printer.tryReconnect(); // 끊겨 있으면 터치 없이 가능한 재연결만 시도(실패 시 상단 버튼으로 연결)
    pwa.notifySafePoint(); // 대기 중인 새 버전이 있으면 이때만 적용
  }
  if (page === 'result' || page === 'end') fitFortuneCards();
}

// 화면 카드(R-03·R-04)의 운세 문장: 카드 크기는 그대로 두고, 넘칠 때만 글자를 줄여 카드 안에 맞춘다.
function fitFortuneCards() {
  stage.querySelectorAll('.page:not([hidden]) .fortune-card__body').forEach((el) => {
    el.style.fontSize = '';
    el.style.lineHeight = '';
    const card = el.closest('.fortune-card');
    const foot = card.querySelector('.fortune-card__foot');
    const maxH = foot.offsetTop - el.offsetTop - 12;
    let size = parseFloat(getComputedStyle(el).fontSize);
    const ratio = parseFloat(getComputedStyle(el).lineHeight) / size;
    while (el.scrollHeight > maxH && size > 18) {
      size -= 1;
      el.style.fontSize = `${size}px`;
      el.style.lineHeight = `${Math.round(size * Math.min(ratio, 1.55))}px`;
    }
  });
}

function resetSession() {
  state.birth = null;
  state.result = null;
  birthForm.reset();
  setDevPrintBadge(false);
}

// ── 결과 구성: 판정(star-resolver)·발행일(receipt-date)·운세 조회(fortune-repo)를 한 객체로 ──
// 발행일은 부를 때마다 다시 계산한다(인쇄 버튼을 누른 시점 기준).
async function resultFor(mansion, birth) {
  const issue = getIssueDate({ overrideIso: DEV ? devDateIso : null });
  const fortune = await getTodayFortune({ mansion, dateIso: issue.iso });
  return {
    isDemo: false,
    mansionId: mansion.id,
    star: {
      id: mansion.id,
      name: mansion.suName,
      hanja: mansion.hanja,
      alias: mansion.alias,
      iconPath: mansion.graphicPath,
      footer: `${mansion.suName} · ${mansion.hanja} · ${mansion.alias}`,
    },
    birth: birth ? { ...birth, label: `${formatYmd(birth.input)} ${calendarTag(birth)}` } : null,
    fortune: { date: issue.iso, dateLabel: formatYmd(issue), lines: [fortune.text], text: fortune.text, source: fortune.source },
    // 운세지(영수증) 전용 데이터 — 화면과 같은 값
    receipt: {
      issueDate: { y: issue.y, m: issue.m, d: issue.d },
      issueIso: issue.iso,
      actualIso: issue.actualIso,
      suName: mansion.suName,
      hanja: mansion.hanja,
      alias: mansion.alias,
      graphicPath: mansion.graphicPath,
      fortuneText: fortune.text,
      fortuneSource: fortune.source,
      luck: { ...mansion.luck },
      cheer: mansion.cheer,
      sashin: mansion.sashin,
      chilYo: mansion.chilYo,
    },
  };
}

async function buildResult(birth) {
  const { mansion } = await resolveStar(birth);
  return resultFor(mansion, birth);
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
    // 인쇄 시점에 발행일·운세를 다시 계산(자정이 지난 뒤 오래 켜진 화면도 당일 기준) — 바뀌었으면 화면도 갱신
    let fresh;
    try {
      fresh = await buildResult(state.birth);
    } catch (err) {
      console.error(err);
      printerUi.showError({ code: 'DATA' });
      return;
    }
    if (fresh.fortune.date !== state.result.fortune.date || fresh.fortune.text !== state.result.fortune.text) {
      state.result = fresh;
      renderResult(state.result);
      fitFortuneCards();
    }
    const result = await printService.printReceipt(state.result);
    if (result.status === 'printed') {
      setDevPrintBadge(false);
      if (state.page === 'result') go('end'); // 실제 전송 성공 후에만 완료 화면
    } else if (result.status === 'failed') {
      printerUi.showError(result.error);
    }
  },
  'printer-connect': (btn) => printerUi.connect(btn.id === 'start-printer'),
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
// 출력에 필요한 데이터를 미리 읽어 둔다(서비스 워커 캐시로 오프라인에서도 동작)
loadMansions().catch((err) => console.error('생년월일 기준 데이터', err));
preloadFortunes().catch((err) => console.error('운세 데이터', err));
printer.reconnectRemembered(); // 새로고침·재실행 후: 이전에 허용한 프린터를 터치 없이 다시 연결(지원 브라우저만)

if (DEV) {
  // 화면 확인용: ?dev=1&screen=result&help=1
  const screen = params.get('screen');
  const openScreen = async () => {
    if (screen === 'result' || screen === 'end') {
      state.birth = { calendar: 'solar', input: { y: 2000, m: 1, d: 1 }, isLeapMonth: false, solar: { y: 2000, m: 1, d: 1 } };
      state.result = await buildResult(state.birth);
      renderResult(state.result);
    }
    if (PAGES.includes(screen)) go(screen);
    if (params.get('help') === '1') help.open();
  };
  openScreen().catch((err) => console.error(err));
  window.__fortuneSlip = { state, printer, printService, buildResult, resultFor, mansionById, getIssueDate: () => getIssueDate({ overrideIso: devDateIso }) }; // 개발 모드 전용
}
