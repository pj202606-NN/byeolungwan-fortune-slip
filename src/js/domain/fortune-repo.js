// 오늘의 운세 조회.
// ⚠ 지금은 시연용 고정 문구를 돌려준다. 실제 운세 데이터(별자리·날짜별)가 준비되면 이 함수만 교체한다.

import { DEMO_FORTUNE_LINES } from '../data/demo-result.js';

export function getTodayFortune({ date /* , star, birth */ }) {
  return { date, lines: [...DEMO_FORTUNE_LINES], isDemo: true, source: 'demo-fixed' };
}
