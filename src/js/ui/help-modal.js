// 도움말 모달 — 모든 페이지가 같은 모달 하나를 공유한다.
// 열려 있는 동안 뒤쪽 요소는 inert 처리해 터치·포커스를 막고, 닫으면 원래 상태 그대로 돌아간다.

export function createHelpModal(stage) {
  const modal = stage.querySelector('#help-modal');
  const background = () => [...stage.children].filter((el) => el !== modal);
  let returnFocus = null;

  function open() {
    if (!modal.hidden) return;
    returnFocus = document.activeElement;
    if (returnFocus && returnFocus.tagName === 'INPUT') returnFocus.blur();
    background().forEach((el) => { el.inert = true; });
    modal.hidden = false;
    modal.querySelector('.modal__close').focus({ preventScroll: true });
  }

  function close() {
    if (modal.hidden) return;
    modal.hidden = true;
    background().forEach((el) => { el.inert = false; });
    if (returnFocus && returnFocus.tagName !== 'INPUT') returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }

  return { open, close, isOpen: () => !modal.hidden };
}
