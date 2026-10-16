// 생년월일 → 28수 별자리 판정.
// ⚠ 실제 판정 규칙은 아직 확정되지 않았다. 지금은 생년월일과 무관하게 시연용 고정 별자리를 돌려주며,
//   결과에 isDemo: true를 붙여 실제 판정 결과와 구분한다. (임시 계산식 dayOfYear % 28 등은 사용하지 않는다)
// 실제 규칙이 정해지면 이 함수만 교체한다. 입력으로 birth.solar / birth.input / birth.calendar /
// birth.isLeapMonth를 모두 받을 수 있으므로 양력·음력 어느 기준의 규칙이든 연결할 수 있다.

import { DEMO_STAR } from '../data/demo-result.js';

export function resolveStar(/* birth */) {
  return { star: DEMO_STAR, isDemo: true, source: 'demo-fixed' };
}
