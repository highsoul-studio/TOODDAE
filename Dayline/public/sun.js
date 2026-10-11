// 国ごとの「平均の日の出・日の入り」(現地の時計の時刻、1 年の平均、代表都市)。自動切り替えの初期値に使う。
// 値は scripts/sun-table.mjs が NOAA の式で計算したもの (test/palettes.test.js ではなく test/sun.test.js が、この表と計算結果のずれを見張る)。
// サーバ (設定の既定値) とブラウザ (国の選択・「国の平均に戻す」) の両方から読む。DOM にも Node 固有の API にも触れないこと。

export const COUNTRIES = {
  JP: { city: 'Tokyo', tz: 'Asia/Tokyo', sunrise: '05:35', sunset: '17:45' },
  KR: { city: 'Seoul', tz: 'Asia/Seoul', sunrise: '06:25', sunset: '18:35' },
  CN: { city: 'Beijing', tz: 'Asia/Shanghai', sunrise: '06:10', sunset: '18:20' },
  TW: { city: 'Taipei', tz: 'Asia/Taipei', sunrise: '05:50', sunset: '18:00' },
  HK: { city: 'Hong Kong', tz: 'Asia/Hong_Kong', sunrise: '06:20', sunset: '18:25' },
  SG: { city: 'Singapore', tz: 'Asia/Singapore', sunrise: '07:00', sunset: '19:10' },
  IN: { city: 'New Delhi', tz: 'Asia/Kolkata', sunrise: '06:15', sunset: '18:25' },
  GB: { city: 'London', tz: 'Europe/London', sunrise: '06:25', sunset: '18:45' },
  DE: { city: 'Berlin', tz: 'Europe/Berlin', sunrise: '06:30', sunset: '18:50' },
  FR: { city: 'Paris', tz: 'Europe/Paris', sunrise: '07:15', sunset: '19:30' },
  US: { city: 'New York', tz: 'America/New_York', sunrise: '06:30', sunset: '18:40' },
  CA: { city: 'Toronto', tz: 'America/Toronto', sunrise: '06:50', sunset: '19:05' },
  BR: { city: 'São Paulo', tz: 'America/Sao_Paulo', sunrise: '06:05', sunset: '18:10' },
  AU: { city: 'Sydney', tz: 'Australia/Sydney', sunrise: '06:20', sunset: '18:30' },
};

// 一覧にない国・地域 (ここでの値は目安。ユーザーが自分で時刻を決める)
export const OTHER = { city: '', tz: '', sunrise: '06:00', sunset: '18:00' };

export const countryCodes = () => Object.keys(COUNTRIES);
export const isCountry = (code) => code === '' || Object.hasOwn(COUNTRIES, code);
export const sunOf = (code) => (Object.hasOwn(COUNTRIES, code) ? COUNTRIES[code] : OTHER);

// タイムゾーン名 (Intl が返す "Asia/Tokyo" など) から国を推す。国が複数のタイムゾーンにまたがるものは、よく使うものを並べてある
const ZONES = {
  JP: ['Asia/Tokyo'],
  KR: ['Asia/Seoul'],
  CN: ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Urumqi'],
  TW: ['Asia/Taipei'],
  HK: ['Asia/Hong_Kong'],
  SG: ['Asia/Singapore'],
  IN: ['Asia/Kolkata', 'Asia/Calcutta'],
  GB: ['Europe/London'],
  DE: ['Europe/Berlin'],
  FR: ['Europe/Paris'],
  US: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'America/Detroit', 'Pacific/Honolulu'],
  CA: ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/Montreal'],
  BR: ['America/Sao_Paulo'],
  AU: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Hobart'],
};
export function countryFromTimeZone(tz) {
  for (const [code, zones] of Object.entries(ZONES)) if (zones.includes(tz)) return code;
  return '';
}
