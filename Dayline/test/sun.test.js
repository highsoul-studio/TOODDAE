// 国ごとの平均の日の出・日の入りの表 (public/sun.js) が、計算スクリプトの結果と合っていること、式が既知の日付で正しいこと。
import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, averageSun, sunLocal } from '../scripts/sun-table.mjs';
import { COUNTRIES, OTHER, countryFromTimeZone, isCountry, sunOf } from '../public/sun.js';

const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;

test('式: 東京の冬至・夏至・春分の日の出と日の入りが、公表されている値と数分以内で合う', () => {
  const near = (got, want, label) => assert.ok(Math.abs(got - want) <= 3, `${label}: ${hm(got)} (想定 ${hm(want)})`);
  const dec21 = sunLocal('JP', 355); // 冬至: 日の出 06:47 / 日の入り 16:32 前後
  near(dec21.rise, 6 * 60 + 47, '冬至の日の出');
  near(dec21.set, 16 * 60 + 32, '冬至の日の入り');
  const jun21 = sunLocal('JP', 172); // 夏至: 04:25 / 19:00 前後
  near(jun21.rise, 4 * 60 + 25, '夏至の日の出');
  near(jun21.set, 19 * 60, '夏至の日の入り');
  const mar20 = sunLocal('JP', 79); // 春分: 05:46 / 17:53 前後
  near(mar20.rise, 5 * 60 + 46, '春分の日の出');
  near(mar20.set, 17 * 60 + 53, '春分の日の入り');
});

test('式: 夏時間のある国は、夏と冬で時計の時刻が 1 時間ずれる (ロンドン)', () => {
  const summer = sunLocal('GB', 172); // 6 月: BST
  const winter = sunLocal('GB', 355); // 12 月: GMT
  assert.ok(summer.rise < 5 * 60 + 5 && summer.rise > 4 * 60 + 30, `夏の日の出 ${hm(summer.rise)}`); // 04:43 前後
  assert.ok(winter.rise > 7 * 60 + 50 && winter.rise < 8 * 60 + 10, `冬の日の出 ${hm(winter.rise)}`); // 08:04 前後
});

test('public/sun.js の表は、計算スクリプトの結果と一致している (表だけ手で直したときのずれを見張る)', () => {
  assert.deepEqual(Object.keys(COUNTRIES), Object.keys(CITIES));
  for (const [code, row] of Object.entries(COUNTRIES)) {
    assert.equal(row.city, CITIES[code][0], `${code} city`);
    assert.equal(row.tz, CITIES[code][3], `${code} tz`);
    const { sunrise, sunset } = averageSun(code);
    assert.deepEqual({ sunrise: row.sunrise, sunset: row.sunset }, { sunrise, sunset }, code);
  }
});

test('平均値は妥当な範囲で、日の入りは日の出より後 (どの国でも)', () => {
  const min = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  for (const [code, r] of Object.entries(COUNTRIES)) {
    assert.ok(min(r.sunrise) >= 5 * 60 && min(r.sunrise) <= 7 * 60 + 30, `${code} sunrise ${r.sunrise}`);
    assert.ok(min(r.sunset) >= 17 * 60 && min(r.sunset) <= 19 * 60 + 45, `${code} sunset ${r.sunset}`);
    assert.ok(min(r.sunset) - min(r.sunrise) > 10 * 60, `${code} は昼が 10 時間以上`);
  }
});

test('タイムゾーンから国を推す。分からなければ空 (= 一覧にない国)', () => {
  assert.equal(countryFromTimeZone('Asia/Tokyo'), 'JP');
  assert.equal(countryFromTimeZone('Asia/Seoul'), 'KR');
  assert.equal(countryFromTimeZone('America/Los_Angeles'), 'US');
  assert.equal(countryFromTimeZone('Australia/Perth'), 'AU');
  assert.equal(countryFromTimeZone('Africa/Nairobi'), '');
  assert.equal(countryFromTimeZone(undefined), '');
  assert.equal(sunOf('').sunrise, OTHER.sunrise);
  assert.equal(sunOf('JP').city, 'Tokyo');
  assert.ok(isCountry('') && isCountry('JP') && !isCountry('XX') && !isCountry('constructor'));
});
