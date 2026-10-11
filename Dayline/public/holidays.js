// 公休日 (カレンダーの赤表示用)。対応は JP と KR。DOM にも Node 固有の API にも触れない。
// 日付はすべて UTC 0 時の 'YYYY-MM-DD'。年ごとの結果は国ごとにキャッシュする。
// 計算で求められない臨時の休日 (選挙日・臨時公休日) は KR_EXTRA に手で足す。
const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const addDays = (value, n) => { const [y, m, d] = value.split('-').map(Number); return iso(y, m, d + n); };
const dow = (value) => new Date(`${value}T00:00:00Z`).getUTCDay(); // 0=日
const nthMonday = (y, m, n) => { const first = dow(iso(y, m, 1)); return iso(y, m, 1 + ((8 - first) % 7) + (n - 1) * 7); };

// ---------- 日本 ----------
// 春分・秋分は 1980〜2099 年で有効な近似式
const equinox = (y, base) => Math.floor(base + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
function japan(y) {
  const map = new Map();
  const add = (value, name) => map.set(value, name);
  add(iso(y, 1, 1), '元日'); add(nthMonday(y, 1, 2), '成人の日'); add(iso(y, 2, 11), '建国記念の日');
  if (y >= 2020) add(iso(y, 2, 23), '天皇誕生日');
  add(iso(y, 3, equinox(y, 20.8431)), '春分の日'); add(iso(y, 4, 29), '昭和の日'); add(iso(y, 5, 3), '憲法記念日');
  add(iso(y, 5, 4), 'みどりの日'); add(iso(y, 5, 5), 'こどもの日');
  const olympic = { 2020: ['07-23', '07-24', '08-10'], 2021: ['07-22', '07-23', '08-08'] }[y];
  add(olympic ? `${y}-${olympic[0]}` : nthMonday(y, 7, 3), '海の日');
  if (y >= 2016) add(olympic ? `${y}-${olympic[2]}` : iso(y, 8, 11), '山の日');
  add(nthMonday(y, 9, 3), '敬老の日'); add(iso(y, 9, equinox(y, 23.2488)), '秋分の日');
  add(olympic ? `${y}-${olympic[1]}` : nthMonday(y, 10, 2), y >= 2020 ? 'スポーツの日' : '体育の日');
  add(iso(y, 11, 3), '文化の日'); add(iso(y, 11, 23), '勤労感謝の日');
  // 国民の休日: 前後を祝日に挟まれた平日
  for (const value of [...map.keys()]) { const next = addDays(value, 2); if (map.has(next) && !map.has(addDays(value, 1)) && dow(addDays(value, 1)) !== 0) add(addDays(value, 1), '国民の休日'); }
  // 振替休日: 日曜の祝日は、次の祝日でない日に回る
  for (const value of [...map.keys()].sort()) { if (dow(value) !== 0) continue; let next = addDays(value, 1); while (map.has(next)) next = addDays(next, 1); add(next, '振替休日'); }
  return map;
}

// ---------- 韓国 ----------
const KR_EXTRA = { '2024-04-10': '국회의원선거일', '2024-10-01': '임시공휴일', '2025-01-27': '임시공휴일', '2025-06-03': '대통령선거일', '2026-06-03': '지방선거일' };
let lunarFormat;
// 旧暦 (閏月は対象外) の月日。祝日の旧暦日は ICU の中国暦で求める
function lunarDays(y) {
  lunarFormat ??= new Intl.DateTimeFormat('en-u-ca-chinese-nu-latn', { timeZone: 'UTC', month: 'numeric', day: 'numeric' });
  const found = {};
  for (let value = iso(y, 1, 1); value.startsWith(String(y)); value = addDays(value, 1)) {
    const parts = Object.fromEntries(lunarFormat.formatToParts(new Date(`${value}T00:00:00Z`)).map((p) => [p.type, p.value]));
    if (/^\d+$/.test(parts.month)) found[`${Number(parts.month)}-${Number(parts.day)}`] = value;
  }
  return found;
}
function korea(y) {
  const map = new Map(), count = new Map(), groups = [], dated = [];
  // 同じ日に祝日が重なったら数える (重なりは代替公休日の条件)。名前は先に入れたものを残す
  const add = (value, name) => { count.set(value, (count.get(value) ?? 0) + 1); if (!map.has(value)) map.set(value, name); dated.push([value, name]); };
  const lunar = lunarDays(y);
  const fixed = [[1, 1, '신정'], [3, 1, '삼일절'], [5, 5, '어린이날'], [6, 6, '현충일'], [8, 15, '광복절'], [10, 3, '개천절'], [10, 9, '한글날'], [12, 25, '성탄절']];
  for (const [m, d, name] of fixed) add(iso(y, m, d), name);
  if (lunar['4-8']) add(lunar['4-8'], '부처님오신날');
  // 설날・추석は前後を含む 3 日連休 (日曜か他の祝日に重なると代替休日)
  for (const [key, name] of [['1-1', '설날'], ['8-15', '추석']]) if (lunar[key]) { const days = [-1, 0, 1].map((n) => addDays(lunar[key], n)); for (const day of days) add(day, name); groups.push(days); }
  for (const [value, name] of Object.entries(KR_EXTRA)) if (value.startsWith(String(y))) add(value, name);
  const triggers = [];
  // 설날・추석 (2014〜): 3 日のどれかが日曜、または他の祝日と重なる
  for (const days of groups) if (y >= 2014 && days.some((day) => dow(day) === 0 || count.get(day) > 1)) triggers.push(days.at(-1));
  // その他 (2021〜): 土日、または他の祝日と重なる。부처님오신날・성탄절は 2023 年から。어린이날は 2018 年から土日も対象
  const from = { '어린이날': 2018, '삼일절': 2021, '광복절': 2021, '개천절': 2021, '한글날': 2021, '부처님오신날': 2023, '성탄절': 2023 };
  for (const [value, name] of dated) {
    if (!from[name] || y < from[name]) continue;
    const overlap = y >= 2021 && count.get(value) > 1;
    if (overlap || dow(value) === 0 || dow(value) === 6) triggers.push(value);
  }
  for (const value of [...new Set(triggers)].sort()) { let next = addDays(value, 1); while (map.has(next) || dow(next) === 0 || dow(next) === 6) next = addDays(next, 1); map.set(next, '대체공휴일'); }
  return map;
}

const rules = { JP: japan, KR: korea };
const cache = new Map();
export const hasHolidays = (country) => Object.hasOwn(rules, country);
// 日付 'YYYY-MM-DD' の休日名 (なければ '')
export function holidayName(country, value) {
  if (!hasHolidays(country) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const year = Number(value.slice(0, 4)), key = `${country}${year}`;
  if (!cache.has(key)) { try { cache.set(key, rules[country](year)); } catch { cache.set(key, new Map()); } }
  return cache.get(key).get(value) ?? '';
}
