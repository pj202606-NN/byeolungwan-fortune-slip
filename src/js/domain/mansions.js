// 28수 별자리 — 생년월일 판정, 표기, 그래픽, 행운 정보
//
// 판정 기준: src/data/receipt/byeolungwan_28su_birthdate_reference.json 의 mansions(양력 월·일, 시작·끝 포함)
// ※ 오래된 28su_database_final*.js 의 생일 범위·행운방위·행운색은 쓰지 않는다.

import { CHEERS } from '../data/cheers.js';

const BIRTH_REFERENCE_URL = 'src/data/receipt/byeolungwan_28su_birthdate_reference.json';
const GRAPHIC_DIR = 'public/assets/receipt/constellations/';

// ID → 별자리 그래픽 파일(노루자리 = s03_ryu.svg)
export const GRAPHIC_FILES = Object.freeze({
  1: 'e01_gak.svg', 2: 'e02_hang.svg', 3: 'e03_jeo.svg', 4: 'e04_bang.svg', 5: 'e05_sim.svg', 6: 'e06_mi.svg', 7: 'e07_gi.svg',
  8: 'n01_du.svg', 9: 'n02_u.svg', 10: 'n03_yeo.svg', 11: 'n04_heo.svg', 12: 'n05_wi.svg', 13: 'n06_sil.svg', 14: 'n07_byeok.svg',
  15: 'w01_gyu.svg', 16: 'w02_ru.svg', 17: 'w03_wi.svg', 18: 'w04_myo.svg', 19: 'w05_pil.svg', 20: 'w06_ja.svg', 21: 'w07_sam.svg',
  22: 's01_jeong.svg', 23: 's02_gwi.svg', 24: 's03_ryu.svg', 25: 's04_seong.svg', 26: 's05_jang.svg', 27: 's06_ik.svg', 28: 's07_jin.svg',
});

// 확정 규칙: 사신수 → 행운의 방위·오방색, 칠요 → 행운의 행성
export const LUCK_BY_SASHIN = Object.freeze({
  동방청룡: { direction: '동쪽', color: '청색' },
  북방현무: { direction: '북쪽', color: '흑색' },
  서방백호: { direction: '서쪽', color: '백색' },
  남방주작: { direction: '남쪽', color: '적색' },
});
export const PLANET_BY_CHILYO = Object.freeze({ 목: '목성', 금: '금성', 토: '토성', 일: '태양', 월: '달', 화: '화성', 수: '수성' });

let mansionsPromise = null;

function toMansion(raw) {
  const m = /^(.)\((.)\)$/.exec(raw.mansion);
  if (!m) throw new Error(`mansion 형식 오류: ${raw.mansion}`);
  const [, ko, hanja] = m;
  const luck = LUCK_BY_SASHIN[raw.sashin];
  const planet = PLANET_BY_CHILYO[raw.chil_yo];
  if (!luck || !planet) throw new Error(`행운 정보 규칙 없음: ${raw.sashin} / ${raw.chil_yo}`);
  return Object.freeze({
    id: raw.id,
    suName: `${ko}수`,                 // 저수, 위수, 류수
    hanja: `${hanja}宿`,               // 氐宿, 危宿, 柳宿
    alias: raw.name,                   // 너구리자리
    sashin: raw.sashin,
    chilYo: raw.chil_yo,
    // 11/20~24 운세 JSON의 키: 두 위수만 한자로 구분 — 위수(危)·위수(胃)
    fortuneKey: ko === '위' ? `위수(${hanja})` : `${ko}수`,
    graphicPath: GRAPHIC_DIR + GRAPHIC_FILES[raw.id],
    cheer: CHEERS[raw.id],
    luck: { direction: luck.direction, color: luck.color, planet },
    start: raw.start,
    end: raw.end,
  });
}

/** 생년월일 기준 JSON을 읽어 28개 별자리 목록을 돌려준다(한 번만 읽고 재사용). */
export function loadMansions() {
  if (!mansionsPromise) {
    mansionsPromise = fetch(BIRTH_REFERENCE_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`생년월일 기준 파일을 읽지 못했습니다 (${res.status})`);
        return res.json();
      })
      .then((json) => {
        const list = json.mansions.map(toMansion).sort((a, b) => a.id - b.id);
        if (list.length !== 28) throw new Error(`별자리 수가 28개가 아닙니다: ${list.length}`);
        return list;
      })
      .catch((err) => { mansionsPromise = null; throw err; });
  }
  return mansionsPromise;
}

const md = ({ month, day }) => month * 100 + day;

/** 양력 월·일 → 별자리(시작·끝 포함, 12월~1월 구간 처리, 2/29 포함) */
export function findMansion(list, month, day) {
  const v = month * 100 + day;
  const hit = list.find((m) => {
    const s = md(m.start);
    const e = md(m.end);
    return s <= e ? v >= s && v <= e : v >= s || v <= e; // 연도 경계를 넘는 구간(두루미자리)
  });
  if (!hit) throw new Error(`해당하는 별자리가 없습니다: ${month}/${day}`);
  return hit;
}

export async function mansionForBirth(birth) {
  const list = await loadMansions();
  return findMansion(list, birth.solar.m, birth.solar.d); // 음력 입력은 이미 양력으로 변환된 값을 쓴다
}

export async function mansionById(id) {
  const list = await loadMansions();
  return list.find((m) => m.id === Number(id)) || null;
}
