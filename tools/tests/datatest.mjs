// 데이터·규칙 검증 (Node, 프로젝트 모듈을 직접 불러옴)
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const ROOT = 'd:/대학/4학년/졸전/byeolungwan-fortune-slip/';
const imp = (p) => import(pathToFileURL(ROOT + p).href);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };

// 브라우저 fetch 대신 로컬 파일을 돌려주는 fetch
globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => JSON.parse(readFileSync(ROOT + url, 'utf8')), text: async () => readFileSync(ROOT + url, 'utf8') });

const { loadMansions, findMansion, GRAPHIC_FILES, LUCK_BY_SASHIN, PLANET_BY_CHILYO } = await imp('src/js/domain/mansions.js');
const { CHEERS } = await imp('src/js/data/cheers.js');
const { getTodayFortune, fortuneSourceFor } = await imp('src/js/domain/fortune-repo.js');
const { getIssueDate, clampToFortuneRange, formatIssueDate } = await imp('src/js/domain/receipt-date.js');

const ref = JSON.parse(readFileSync(ROOT + 'src/data/receipt/byeolungwan_28su_birthdate_reference.json', 'utf8')).mansions;
const primary = JSON.parse(readFileSync(ROOT + 'src/data/receipt/byeolungwan_fortunes_2026-11-20_24.json', 'utf8')).constellations;
const list = await loadMansions();

console.log('— 28개 매핑');
ok(list.length === 28 && ref.length === 28, `생일 기준 JSON 28개 (모듈 ${list.length})`);
const expectFiles = { 1: 'e01_gak', 2: 'e02_hang', 3: 'e03_jeo', 4: 'e04_bang', 5: 'e05_sim', 6: 'e06_mi', 7: 'e07_gi', 8: 'n01_du', 9: 'n02_u', 10: 'n03_yeo', 11: 'n04_heo', 12: 'n05_wi', 13: 'n06_sil', 14: 'n07_byeok', 15: 'w01_gyu', 16: 'w02_ru', 17: 'w03_wi', 18: 'w04_myo', 19: 'w05_pil', 20: 'w06_ja', 21: 'w07_sam', 22: 's01_jeong', 23: 's02_gwi', 24: 's03_ryu', 25: 's04_seong', 26: 's05_jang', 27: 's06_ik', 28: 's07_jin' };
ok(Object.entries(expectFiles).every(([id, f]) => GRAPHIC_FILES[id] === `${f}.svg`), 'ID ↔ 그래픽 파일 매핑이 요청 표와 일치');
ok(list.every((m) => existsSync(ROOT + m.graphicPath)), '28개 그래픽 파일 모두 존재');
ok(readdirSync(ROOT + 'public/assets/receipt/constellations').length === 28, '그래픽 폴더에 SVG 28개');
const m24 = list.find((m) => m.id === 24);
ok(m24.graphicPath.endsWith('s03_ryu.svg') && m24.suName === '류수' && m24.hanja === '柳宿' && m24.alias === '노루자리', `ID 24: ${m24.suName} ${m24.hanja} ${m24.alias} → ${m24.graphicPath.split('/').pop()}`);
const m12 = list.find((m) => m.id === 12), m17 = list.find((m) => m.id === 17);
ok(m12.suName === '위수' && m12.hanja === '危宿' && m12.alias === '제비자리' && m12.fortuneKey === '위수(危)', `ID 12: ${m12.suName} ${m12.hanja} ${m12.alias} (키 ${m12.fortuneKey})`);
ok(m17.suName === '위수' && m17.hanja === '胃宿' && m17.alias === '꿩자리' && m17.fortuneKey === '위수(胃)', `ID 17: ${m17.suName} ${m17.hanja} ${m17.alias} (키 ${m17.fortuneKey})`);
const m3 = list.find((m) => m.id === 3);
ok(`${m3.suName} ${m3.hanja}` === '저수 氐宿' && m3.alias === '너구리자리', `ID 3 표기: ${m3.suName} ${m3.hanja} / ${m3.alias}`);
ok(list.every((m) => primary[m.fortuneKey] && primary[m.fortuneKey].name === m.alias), '28개 모두 11/20~24 운세 키와 이름 일치');

console.log('— 운세 데이터');
for (const d of ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24']) {
  const texts = await Promise.all(list.map((m) => getTodayFortune({ mansion: m, dateIso: d })));
  ok(texts.every((t, i) => t.text === primary[list[i].fortuneKey].daily[d]['종합'].short && t.source.includes('2026-11-20_24')), `${d}: 28개 종합 short (전용 JSON)`);
}
const rejected25 = await Promise.allSettled(list.map((m) => getTodayFortune({ mansion: m, dateIso: '2026-11-25' })));
ok(rejected25.every((r) => r.status === 'rejected') && fortuneSourceFor('2026-11-25') === null, '11/25 운세 조회 경로 제거(28개 모두 거부)');
const t20 = await getTodayFortune({ mansion: m3, dateIso: '2026-11-20' });
ok(t20.text === primary['저수'].daily['2026-11-20']['종합'].short, '11/20은 전용 JSON 종합.short만 사용');
ok(t20.text !== primary['저수'].daily['2026-11-20']['종합'].detail && t20.text !== primary['저수'].daily['2026-11-20']['종합'].ultraShort, 'detail·ultraShort·advice 아님');
ok(fortuneSourceFor('2026-11-19') === null && fortuneSourceFor('2026-11-26') === null, '데이터 범위 밖 날짜는 출처 없음(임의 생성 안 함)');

console.log('— 응원 문구');
const md = readFileSync(ROOT + 'src/data/receipt/별운관_28수_운세지_응원문구_최종안.md', 'utf8');
const mdItems = [...md.matchAll(/^(\d{2})\.\s+\*\*(.+?)\*\*\s*\n\s+"(.+?)"\s*$/gm)].map((m) => [Number(m[1]), m[3]]);
ok(mdItems.length === 28 && mdItems.every(([id, t]) => CHEERS[id] === t), '28개 응원 문구가 MD 원문과 글자 그대로 일치');
ok(CHEERS[3] === '변화 속에서도 당신의 자리를 찾아가기를.' && CHEERS[21] === '당신의 기준으로 후회 없는 길을 고르기를.' && CHEERS[24] === '건넨 작은 친절이 따뜻하게 돌아오기를.', 'ID 3·21·24 예시 문구');
ok(Object.values(CHEERS).every((t) => !/["“”]/.test(t)), '문구 데이터에 따옴표 없음(출력 때 “ ” 한 번만 붙임)');

console.log('— 행운 정보');
ok(list.every((m) => m.luck.direction === LUCK_BY_SASHIN[m.sashin].direction && m.luck.color === LUCK_BY_SASHIN[m.sashin].color && m.luck.planet === PLANET_BY_CHILYO[m.chilYo]), '28개 모두 사신수·칠요 규칙대로');
ok(m3.luck.direction === '동쪽' && m3.luck.color === '청색' && m3.luck.planet === '토성', `저수: ${m3.luck.direction} / ${m3.luck.color} / ${m3.luck.planet}`);
const bySashin = Object.groupBy(list, (m) => m.sashin);
for (const [s, ms] of Object.entries(bySashin)) ok(ms.length === 7 && new Set(ms.map((m) => m.luck.direction + m.luck.color)).size === 1, `${s} 7개 동일: ${ms[0].luck.direction}·${ms[0].luck.color}`);
ok(list.find((m) => m.chilYo === '일').luck.planet === '태양' && list.find((m) => m.chilYo === '월').luck.planet === '달', '칠요 일→태양, 월→달');
const oldJs = readFileSync(ROOT + 'src/data/receipt/28su_database_final_updated_20261119.js', 'utf8');
const srcFiles = ['src/js/app.js', 'src/js/domain/mansions.js', 'src/js/domain/fortune-repo.js', 'src/js/print/receipt-render.js', 'src/js/domain/star-resolver.js'];
const usesOld = (txt) => /['"`][^'"`]*28su_database_final[^'"`]*['"`]/.test(txt.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''));
ok(srcFiles.every((f) => !usesOld(readFileSync(ROOT + f, 'utf8'))) && !usesOld(readFileSync(ROOT + 'sw.js', 'utf8')), '오래된 28su_database_final*.js를 import·fetch·캐시 경로로 쓰지 않음(주석 제외)');
ok(oldJs.length > 0, '(오래된 JS 파일은 데이터 폴더에 그대로 보존)');

console.log('— 생년월일 판정');
const dayBefore = (mm, dd) => { const t = new Date(Date.UTC(2024, mm - 1, dd - 1)); return [t.getUTCMonth() + 1, t.getUTCDate()]; };
let boundaryOk = true;
for (const m of ref) {
  if (findMansion(list, m.start.month, m.start.day).id !== m.id || findMansion(list, m.end.month, m.end.day).id !== m.id) boundaryOk = false;
  const [bm, bd] = dayBefore(m.start.month, m.start.day);
  const prev = findMansion(list, bm, bd);
  if (!(prev.end.month === bm && prev.end.day === bd)) boundaryOk = false;
}
ok(boundaryOk, '28개 시작일·종료일 포함, 시작 전날은 앞 별자리');
let all = 0, covered = true;
for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2025, 0, 1); t += 864e5) { const d = new Date(t); try { findMansion(list, d.getUTCMonth() + 1, d.getUTCDate()); all++; } catch { covered = false; } }
ok(covered && all === 366, `윤년 366일 모두 판정 가능 (${all}일)`);
ok(findMansion(list, 12, 28).id === 22 && findMansion(list, 12, 31).id === 22 && findMansion(list, 1, 1).id === 22 && findMansion(list, 1, 17).id === 22 && findMansion(list, 1, 18).id === 23, '12/28~1/17 두루미자리, 1/18 염소자리');
ok(findMansion(list, 2, 29).id === 26 && findMansion(list, 2, 29).alias === '사슴자리', '2/29 → 사슴자리');
ok(findMansion(list, 5, 1).id === 3, '5/1 → 저수(너구리자리)');

console.log('— 발행일 규칙');
const kst = (iso, hh = 12, mi = 0) => new Date(`${iso}T${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00+09:00`);
const cases = [['2026-11-01', '2026-11-20'], ['2026-11-19', '2026-11-20'], ['2026-11-20', '2026-11-20'], ['2026-11-21', '2026-11-21'], ['2026-11-22', '2026-11-22'], ['2026-11-23', '2026-11-23'], ['2026-11-24', '2026-11-24'], ['2026-11-25', '2026-11-24'], ['2026-11-26', '2026-11-24'], ['2026-12-10', '2026-11-24']];
for (const [actual, want] of cases) ok(getIssueDate({ now: kst(actual) }).iso === want, `실제 ${actual} → 발행일 ${getIssueDate({ now: kst(actual) }).iso}`);
ok(getIssueDate({ now: new Date('2026-11-20T15:30:00Z') }).iso === '2026-11-21', 'UTC 11/20 15:30 = 한국 11/21 00:30 → 11/21 (UTC 하루 차이 없음)');
ok(getIssueDate({ now: new Date('2026-11-21T14:59:59Z') }).iso === '2026-11-21' && getIssueDate({ now: new Date('2026-11-21T15:00:00Z') }).iso === '2026-11-22', '한국 자정 경계(23:59:59 → 21일, 00:00 → 22일)');
ok(getIssueDate({ overrideIso: '2026-11-23' }).iso === '2026-11-23' && getIssueDate({ overrideIso: '2026-11-19' }).iso === '2026-11-20' && getIssueDate({ overrideIso: '2026-11-25' }).iso === '2026-11-24' && getIssueDate({ overrideIso: '2026-11-26' }).iso === '2026-11-24', '테스트 날짜 주입(개발 모드용)');
ok(formatIssueDate({ y: 2026, m: 11, d: 20 }) === '2026. 11. 20', '발행일 표기 YYYY. MM. DD');
ok(clampToFortuneRange('2026-11-30') === '2026-11-24', '범위 밖 규칙은 clampToFortuneRange 한 곳에서 변경 가능');

console.log(`\n합계 PASS ${pass} / FAIL ${fail}`);

process.exitCode = fail ? 1 : 0;
