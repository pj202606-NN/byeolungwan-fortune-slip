// 운세지 발행일 — 발행일 표시와 운세 데이터 조회가 반드시 같은 날짜를 쓰도록 이 함수 하나로 정한다.
// 기준 시간대: Asia/Seoul (UTC 변환을 거치지 않고 한국 날짜의 연·월·일만 다룬다)

import { todayInKorea, pad2 } from './date-utils.js';

export const FORTUNE_FIRST_DAY = '2026-11-20'; // 운세 데이터가 시작되는 날
export const FORTUNE_LAST_DAY = '2026-11-24';  // 운세 데이터가 있는 마지막 날

export const toIso = ({ y, m, d }) => `${y}-${pad2(m)}-${pad2(d)}`;
export const fromIso = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
};

/**
 * 데이터 기간 밖의 날짜를 어떻게 다룰지 — 바꾸기 쉽도록 별도 함수로 둔다.
 * 지금 규칙: 시작일 이전 → 시작일(11/20), 마지막 날 이후 → 마지막 날(11/24). 없는 날의 운세를 만들지 않는다.
 */
export function clampToFortuneRange(iso) {
  if (iso < FORTUNE_FIRST_DAY) return FORTUNE_FIRST_DAY;
  if (iso > FORTUNE_LAST_DAY) return FORTUNE_LAST_DAY;
  return iso;
}

/**
 * 출력·표시에 쓸 발행일. 인쇄 버튼을 누를 때마다 다시 호출해 자정 이후 오래 켜진 화면도 당일 기준이 되게 한다.
 * @param {{ now?: Date, overrideIso?: string|null }} [opts] overrideIso는 개발 모드 테스트 날짜(일반 모드에서는 넘기지 않음)
 * @returns {{ y:number, m:number, d:number, iso:string, actualIso:string }}
 */
export function getIssueDate({ now = new Date(), overrideIso = null } = {}) {
  const actualIso = overrideIso || toIso(todayInKorea(now));
  const iso = clampToFortuneRange(actualIso);
  return { ...fromIso(iso), iso, actualIso };
}

/** 운세지 발행일 표기: 2026. 11. 20 */
export const formatIssueDate = ({ y, m, d }) => `${y}. ${pad2(m)}. ${pad2(d)}`;
