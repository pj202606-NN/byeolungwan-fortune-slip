// 날짜 공통 유틸 — 화면 표시와 검증 모두 한국 시간(Asia/Seoul)을 기준으로 한다.

export const pad2 = (n) => String(n).padStart(2, '0');

export function todayInKorea(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

export const formatYmd = ({ y, m, d }) => `${y}년 ${pad2(m)}월 ${pad2(d)}일`;

export const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function solarDaysInMonth(y, m) {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

export function compareYmd(a, b) {
  return (a.y - b.y) || (a.m - b.m) || (a.d - b.d);
}
