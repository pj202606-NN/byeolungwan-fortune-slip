// 오늘의 운세 조회 — 날짜별로 정해진 출처만 쓴다(문장을 섞거나 새로 만들지 않음).
//   2026-11-20 ~ 24 : byeolungwan_fortunes_2026-11-20_24.json  constellations[키].daily[날짜]["종합"].short
// (오래된 28su_database_final*.js는 쓰지 않는다)

const PRIMARY_URL = 'src/data/receipt/byeolungwan_fortunes_2026-11-20_24.json';

const PRIMARY_DATES = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'];

const cache = new Map();
function loadJson(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`운세 데이터를 읽지 못했습니다 (${res.status}) ${url}`);
        return res.json();
      })
      .catch((err) => { cache.delete(url); throw err; }));
  }
  return cache.get(url);
}

/** 앱 시작 때 미리 읽어 두기(출력 버튼을 누를 때 기다리지 않도록) */
export function preloadFortunes() {
  return loadJson(PRIMARY_URL);
}

/** 날짜별 출처 규칙 — 어느 파일에서 읽는지 */
export function fortuneSourceFor(iso) {
  if (PRIMARY_DATES.includes(iso)) return 'primary';
  return null;
}

/**
 * @param {{ mansion: object, dateIso: string }} p  dateIso는 receipt-date.js의 발행일(iso)
 * @returns {Promise<{ date: string, text: string, source: string }>}
 */
export async function getTodayFortune({ mansion, dateIso }) {
  const source = fortuneSourceFor(dateIso);
  if (source === 'primary') {
    const json = await loadJson(PRIMARY_URL);
    const text = json.constellations?.[mansion.fortuneKey]?.daily?.[dateIso]?.['종합']?.short;
    if (!text) throw new Error(`${dateIso} ${mansion.fortuneKey} 종합 운세가 없습니다`);
    return { date: dateIso, text, source: 'byeolungwan_fortunes_2026-11-20_24.json · 종합.short' };
  }
  throw new Error(`운세 데이터가 없는 날짜입니다: ${dateIso}`);
}
