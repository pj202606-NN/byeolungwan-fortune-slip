// 1920×1200 무대를 실제 뷰포트에 비율 그대로 맞춘다(남는 쪽은 가운데 정렬).
//
// 안드로이드 키보드 대응:
// - viewport 메타의 interactive-widget=resizes-content로 키보드가 뜨면 화면 높이가 줄어든다.
// - 입력 중에 높이만 줄어든 경우에는 배율을 유지하고(화면이 쪼그라들지 않게),
//   입력 영역(data-kb-top ~ data-kb-bottom)이 보이는 범위로 무대를 위로만 옮긴다.
// - 키보드가 닫히면 원래 위치로 돌아간다.

const STAGE_W = 1920;
const STAGE_H = 1200;
const KB_MARGIN = 12;

let stageEl = null;
let base = { scale: 1, x: 0, y: 0, width: 0 };

function focusedInput() {
  const el = document.activeElement;
  return el && el.tagName === 'INPUT' && stageEl.contains(el) ? el : null;
}

function apply(x, y, scale) {
  stageEl.style.setProperty('--stage-scale', String(scale));
  stageEl.style.setProperty('--stage-x', `${x}px`);
  stageEl.style.setProperty('--stage-y', `${y}px`);
}

function visibleBand() {
  const vv = window.visualViewport;
  if (!vv) return { top: 0, bottom: window.innerHeight };
  return { top: vv.offsetTop, bottom: vv.offsetTop + vv.height };
}

function layout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const input = focusedInput();

  // 입력 중 너비가 그대로면 키보드로 높이만 줄어든 것으로 보고 배율을 다시 계산하지 않는다.
  if (!(input && vw === base.width)) {
    const scale = Math.min(vw / STAGE_W, vh / STAGE_H);
    base = { scale, x: (vw - STAGE_W * scale) / 2, y: (vh - STAGE_H * scale) / 2, width: vw };
  }

  let y = base.y;
  const area = input && input.closest('[data-kb-top]');
  if (area) {
    const band = visibleBand();
    const top = base.y + Number(area.dataset.kbTop) * base.scale;
    const bottom = base.y + Number(area.dataset.kbBottom) * base.scale;
    let shift = Math.min(0, band.bottom - KB_MARGIN - bottom); // 아래가 가려지면 위로
    shift = Math.max(shift, band.top + KB_MARGIN - top);        // 단, 입력 줄 위쪽이 잘리지 않게
    y += Math.min(0, shift);
  }
  apply(base.x, y, base.scale);
}

export function initStage(stage) {
  stageEl = stage;
  layout();
  stage.classList.add('is-ready');

  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', layout);
    window.visualViewport.addEventListener('scroll', layout);
  }
  stage.addEventListener('focusin', layout);
  // 칸 사이를 옮겨 다닐 때 깜빡이지 않도록, 포커스가 완전히 빠진 뒤에만 원위치
  stage.addEventListener('focusout', () => setTimeout(layout, 0));
  // 문서가 스크롤되면 무대 좌표가 어긋나므로 항상 맨 위로 고정
  window.addEventListener('scroll', () => {
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  });
}
