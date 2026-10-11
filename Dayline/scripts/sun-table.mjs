#!/usr/bin/env node
// 国ごとの「平均の日の出・日の入り」(現地の時計の時刻、1 年の平均) を計算して、public/sun.js の表に貼る値を出力する。
//   node scripts/sun-table.mjs [年]
// 式は NOAA の太陽位置の近似 (https://gml.noaa.gov/grad/solcalc/calcdetails.html)。代表都市の緯度・経度で 365 日ぶん計算し、
// 夏時間がある国は夏時間も含めた「時計の時刻」で平均する (人が見るのは時計の時刻なので)。5 分単位に丸める。
import { pathToFileURL } from 'node:url';

// code: [代表都市, 緯度, 経度, タイムゾーン]
export const CITIES = {
  JP: ['Tokyo', 35.68, 139.69, 'Asia/Tokyo'],
  KR: ['Seoul', 37.57, 126.98, 'Asia/Seoul'],
  CN: ['Beijing', 39.9, 116.4, 'Asia/Shanghai'],
  TW: ['Taipei', 25.03, 121.57, 'Asia/Taipei'],
  HK: ['Hong Kong', 22.32, 114.17, 'Asia/Hong_Kong'],
  SG: ['Singapore', 1.35, 103.82, 'Asia/Singapore'],
  IN: ['New Delhi', 28.61, 77.21, 'Asia/Kolkata'],
  GB: ['London', 51.51, -0.13, 'Europe/London'],
  DE: ['Berlin', 52.52, 13.4, 'Europe/Berlin'],
  FR: ['Paris', 48.86, 2.35, 'Europe/Paris'],
  US: ['New York', 40.71, -74.01, 'America/New_York'],
  CA: ['Toronto', 43.65, -79.38, 'America/Toronto'],
  BR: ['São Paulo', -23.55, -46.63, 'America/Sao_Paulo'],
  AU: ['Sydney', -33.87, 151.21, 'Australia/Sydney'],
};

const rad = Math.PI / 180;
// その日の日の出・日の入りを、UTC の「分」で返す (UTC の 0:00 からの分。日をまたぐことがある)
function sunUtcMinutes(dayOfYear, lat, lon) {
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)) / rad;
  return { rise: 720 - 4 * (lon + ha) - eqTime, set: 720 - 4 * (lon - ha) - eqTime };
}

// UTC の時刻 (その年の 1 月 1 日 0:00 UTC からの分) を、タイムゾーンの時計の「0:00 からの分」にする
function localMinutes(utcMs, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(utcMs));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return (get('hour') % 24) * 60 + get('minute'); // 24 時表記の 0 時 ("24") を 0 に
}

// その日 (dayOfYear: 1〜365) の、現地の時計の「0 時からの分」での日の出・日の入り
export function sunLocal(code, dayOfYear, year = 2026) {
  const [, lat, lon, tz] = CITIES[code];
  const t = sunUtcMinutes(dayOfYear, lat, lon);
  const base = Date.UTC(year, 0, 1) + (dayOfYear - 1) * 864e5;
  return { rise: localMinutes(base + t.rise * 6e4, tz), set: localMinutes(base + t.set * 6e4, tz) };
}

export function averageSun(code, year = 2026) {
  let rise = 0;
  let set = 0;
  for (let d = 1; d <= 365; d++) {
    const t = sunLocal(code, d, year);
    rise += t.rise;
    set += t.set;
  }
  const hhmm = (m) => {
    const r = Math.round(m / 5) * 5;
    return `${String(Math.floor(r / 60) % 24).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`;
  };
  return { sunrise: hhmm(rise / 365), sunset: hhmm(set / 365) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const year = Number(process.argv[2]) || 2026;
  for (const [code, [city, , , tz]] of Object.entries(CITIES)) {
    const { sunrise, sunset } = averageSun(code, year);
    console.log(`  ${code}: { city: '${city}', tz: '${tz}', sunrise: '${sunrise}', sunset: '${sunset}' },`);
  }
}
