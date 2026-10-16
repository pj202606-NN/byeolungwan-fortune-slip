// 생년월일 검증·변환 — 화면과 분리된 순수 로직.
// 음력 계산은 korean-lunar-calendar(한국천문연구원 기준 데이터 내장, 로컬 vendor)만 사용하고,
// 존재하지 않는 날짜를 임의로 보정하지 않는다.

import KoreanLunarCalendar from '../../../vendor/korean-lunar-calendar/korean-lunar-calendar.js';
import { todayInKorea, solarDaysInMonth, compareYmd } from './date-utils.js';

// 생년월일로 받는 범위. 라이브러리 자체는 음력 1000-01-01 ~ 2050-11-18까지 지원한다.
export const MIN_BIRTH_YEAR = 1900;

const converter = new KoreanLunarCalendar();

function lunarToSolar(y, m, d, isLeapMonth) {
  if (!converter.setLunarDate(y, m, d, isLeapMonth)) return null;
  const s = converter.getSolarCalendar();
  return { y: s.year, m: s.month, d: s.day };
}

/** 음력 y년 m월의 정보: 윤달 존재 여부와 평달·윤달 각각의 일수(29 또는 30). */
export function getLunarMonthInfo(y, m) {
  const daysOf = (leap) => {
    if (!converter.setLunarDate(y, m, 1, leap)) return 0;
    return converter.setLunarDate(y, m, 30, leap) ? 30 : 29;
  };
  const normalDays = daysOf(false);
  const leapDays = daysOf(true);
  return { supported: normalDays > 0, normalDays, hasLeapMonth: leapDays > 0, leapDays };
}

const fail = (field, message) => ({ ok: false, field, message });

/**
 * @param {{calendar:'solar'|'lunar', year:string, month:string, day:string, isLeapMonth:boolean}} input
 * @returns {{ok:true, birth:BirthDate} | {ok:false, field:'year'|'month'|'day'|'leap', message:string}}
 *
 * BirthDate = {
 *   calendar: 'solar'|'lunar',      // 사용자가 고른 달력
 *   input: {y,m,d},                 // 사용자가 입력한 그대로의 연·월·일
 *   isLeapMonth: boolean,           // 음력 윤달 여부(양력이면 항상 false)
 *   solar: {y,m,d},                 // 양력 날짜(양력 입력이면 input과 같음, 음력이면 변환값)
 * }
 */
export function validateBirthInput(input, today = todayInKorea()) {
  const { calendar } = input;
  const raw = { year: input.year.trim(), month: input.month.trim(), day: input.day.trim() };

  for (const field of ['year', 'month', 'day']) {
    if (raw[field] === '') return fail(field, '생년월일을 모두 입력해 주세요.');
    if (!/^\d+$/.test(raw[field])) return fail(field, '숫자만 입력해 주세요.');
  }
  if (raw.year.length !== 4) return fail('year', '연도는 네 자리로 입력해 주세요.');

  const y = Number(raw.year);
  const m = Number(raw.month);
  const d = Number(raw.day);

  if (y < MIN_BIRTH_YEAR || y > today.y) {
    return fail('year', `${MIN_BIRTH_YEAR}년부터 ${today.y}년 사이로 입력해 주세요.`);
  }
  if (m < 1 || m > 12) return fail('month', '월은 1부터 12 사이로 입력해 주세요.');
  if (d < 1 || d > 31) return fail('day', '일은 1부터 31 사이로 입력해 주세요.');

  let solar;
  let isLeapMonth = false;

  if (calendar === 'solar') {
    const max = solarDaysInMonth(y, m);
    if (d > max) return fail('day', `양력 ${y}년 ${m}월은 ${max}일까지 있습니다.`);
    solar = { y, m, d };
  } else {
    const info = getLunarMonthInfo(y, m);
    if (!info.supported) return fail('year', '지원하지 않는 음력 날짜입니다.');
    isLeapMonth = Boolean(input.isLeapMonth);
    if (isLeapMonth && !info.hasLeapMonth) {
      return fail('leap', `음력 ${y}년 ${m}월에는 윤달이 없습니다.`);
    }
    const max = isLeapMonth ? info.leapDays : info.normalDays;
    if (d > max) {
      return fail('day', `음력 ${y}년 ${isLeapMonth ? '윤' : ''}${m}월은 ${max}일까지 있습니다.`);
    }
    solar = lunarToSolar(y, m, d, isLeapMonth);
    if (!solar) return fail('day', '음력 날짜를 양력으로 변환할 수 없습니다. 날짜를 다시 확인해 주세요.');
  }

  if (compareYmd(solar, today) > 0) return fail('day', '오늘 이후의 날짜는 입력할 수 없습니다.');

  return {
    ok: true,
    birth: { calendar, input: { y, m, d }, isLeapMonth, solar },
  };
}

/** 결과 화면 표기: 입력한 날짜 + (양력) / (음력) / (음력 윤달) */
export function calendarTag(birth) {
  if (birth.calendar === 'solar') return '(양력)';
  return birth.isLeapMonth ? '(음력 윤달)' : '(음력)';
}
