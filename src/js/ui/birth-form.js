// PAGE 02 생년월일 입력 폼: 입력 정리, 윤달 선택 노출, 오류 표시, 제출.
// 검증·변환 자체는 domain/birthdate.js가 담당한다.

import { createCalendarSelect, createLeapToggle } from './calendar-select.js';
import { validateBirthInput, getLunarMonthInfo, MIN_BIRTH_YEAR } from '../domain/birthdate.js';

export function createBirthForm(form, { onValid }) {
  const fields = {
    year: form.querySelector('#birth-year'),
    month: form.querySelector('#birth-month'),
    day: form.querySelector('#birth-day'),
  };
  const errorEl = form.querySelector('#birth-error');
  let shownError = null; // { field, message }

  const calendar = createCalendarSelect(form, { onChange: () => { refreshLeap(); revalidate(); } });
  const leap = createLeapToggle(form, { onChange: () => revalidate() });

  function readInput() {
    return {
      calendar: calendar.value,
      year: fields.year.value,
      month: fields.month.value,
      day: fields.day.value,
      isLeapMonth: leap.visible && leap.isLeap,
    };
  }

  // 음력이고 연·월이 완성됐을 때만 그 달에 윤달이 있는지 확인해 선택지를 보여 준다.
  // 윤달이 없는 연월로 바뀌면 평달로 되돌린다(존재하지 않는 윤달을 남겨 두지 않음).
  function refreshLeap() {
    const y = Number(fields.year.value);
    const m = Number(fields.month.value);
    const ready = calendar.value === 'lunar'
      && fields.year.value.length === 4 && y >= MIN_BIRTH_YEAR
      && m >= 1 && m <= 12;
    const hasLeap = ready && getLunarMonthInfo(y, m).hasLeapMonth;
    if (!hasLeap) leap.set(false, { silent: true });
    leap.show(hasLeap);
  }

  function showError(result) {
    shownError = { field: result.field, message: result.message };
    errorEl.textContent = result.message;
    Object.entries(fields).forEach(([name, el]) => {
      el.setAttribute('aria-invalid', String(name === result.field));
    });
  }

  function clearError() {
    shownError = null;
    errorEl.textContent = '';
    Object.values(fields).forEach((el) => el.removeAttribute('aria-invalid'));
  }

  // 오류가 떠 있을 때 입력이 바뀌면 다시 검사해, 해결됐으면 문구를 지운다.
  function revalidate() {
    if (!shownError) return;
    const result = validateBirthInput(readInput());
    if (result.ok || result.field !== shownError.field) clearError();
    else showError(result);
  }

  // 입력 정리 + 자동으로 다음 칸 이동
  const nextOf = { year: fields.month, month: fields.day, day: null };
  function isComplete(name, value) {
    if (name === 'year') return value.length === 4;
    if (name === 'month') return value.length === 2 || Number(value) >= 2;
    return value.length === 2 || Number(value) >= 4;
  }
  function advance(name) {
    const next = nextOf[name];
    if (next) next.focus({ preventScroll: true });
    else fields[name].blur(); // 마지막 칸이 끝나면 키보드를 닫아 확인 버튼이 보이게
  }

  Object.entries(fields).forEach(([name, el]) => {
    el.addEventListener('input', (event) => {
      const digits = el.value.replace(/\D/g, '').slice(0, el.maxLength);
      if (digits !== el.value) el.value = digits;
      refreshLeap();
      revalidate();
      const typed = event.inputType && event.inputType.startsWith('insert');
      if (typed && isComplete(name, digits)) advance(name);
    });
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        advance(name);
      }
    });
  });

  form.addEventListener('submit', (event) => event.preventDefault());

  function submit() {
    calendar.close();
    const result = validateBirthInput(readInput());
    if (!result.ok) {
      showError(result);
      return null;
    }
    clearError();
    onValid(result.birth);
    return result.birth;
  }

  function reset() {
    form.reset();
    calendar.close();
    calendar.set('solar', { silent: true });
    leap.set(false, { silent: true });
    leap.show(false);
    clearError();
  }

  return { submit, reset, closeMenu: () => calendar.close() };
}
