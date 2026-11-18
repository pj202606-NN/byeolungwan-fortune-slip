// 생년월일 → 28수 별자리 판정.
// 기준: byeolungwan_28su_birthdate_reference.json 의 양력 월·일 구간(mansions.js).
// 음력으로 입력한 경우 birth.solar(양력 변환값)로 판정한다.

import { mansionForBirth } from './mansions.js';

export async function resolveStar(birth) {
  const mansion = await mansionForBirth(birth);
  return { mansion, isDemo: false, source: 'birthdate_reference' };
}
