// 양력·음력 드롭다운과 평달·윤달 선택.
// 드롭다운은 항목을 고르거나 바깥을 누르면 닫힌다(터치·마우스 모두 pointerdown 기준).

const LABEL = { solar: '양력', lunar: '음력' };

export function createCalendarSelect(form, { onChange }) {
  const toggle = form.querySelector('#calendar-toggle');
  const menu = form.querySelector('#calendar-menu');
  const options = [...menu.querySelectorAll('[data-calendar]')];
  let value = 'solar';

  function render() {
    toggle.textContent = LABEL[value];
    options.forEach((opt) => opt.setAttribute('aria-selected', String(opt.dataset.calendar === value)));
  }

  function onOutsidePointer(event) {
    if (!menu.contains(event.target) && !toggle.contains(event.target)) close();
  }

  function open() {
    if (!menu.hidden) return;
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutsidePointer, true);
  }

  function close() {
    if (menu.hidden) return;
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutsidePointer, true);
  }

  function set(next, { silent = false } = {}) {
    const changed = next !== value;
    value = next;
    render();
    if (changed && !silent) onChange(value);
  }

  toggle.addEventListener('click', () => (menu.hidden ? open() : close()));
  options.forEach((opt) => opt.addEventListener('click', () => {
    set(opt.dataset.calendar);
    close();
  }));
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  render();
  return { get value() { return value; }, set, close };
}

export function createLeapToggle(form, { onChange }) {
  const root = form.querySelector('#leap-toggle');
  const options = [...root.querySelectorAll('[data-leap]')];
  let isLeap = false;

  function render() {
    options.forEach((opt) => opt.setAttribute('aria-checked', String((opt.dataset.leap === 'true') === isLeap)));
  }

  function set(next, { silent = false } = {}) {
    const changed = next !== isLeap;
    isLeap = next;
    render();
    if (changed && !silent) onChange(isLeap);
  }

  options.forEach((opt) => opt.addEventListener('click', () => set(opt.dataset.leap === 'true')));

  render();
  return {
    get isLeap() { return isLeap; },
    get visible() { return !root.hidden; },
    set,
    show(on) { root.hidden = !on; },
  };
}
