// ⚠ 시연용 고정 데이터 — 실제 28수 판정 결과가 아니다.
// 피그마 레퍼런스(R-03)에 실린 예시를 그대로 옮긴 것으로, 생년월일과 무관하게 반환된다.
// 실제 판정 로직과 28수 데이터가 준비되면 star-resolver / fortune-repo 모듈에서 교체한다.

export const DEMO_STAR = Object.freeze({
  id: 'demo-jeo',          // 실제 28수 식별값 체계가 정해지면 교체
  name: '저수',
  hanja: '氐宿',
  alias: '너구리자리',
  description: '',
  iconPath: 'public/assets/icon-s.svg',
  isDemo: true,
});

export const DEMO_FORTUNE_LINES = Object.freeze([
  '오늘의 당신에게 필요한 것은',
  '거창한 변화보다 작은 용기입니다.',
  '마음이 향하는 곳을 따라가 보세요.',
]);
