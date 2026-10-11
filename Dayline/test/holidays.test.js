import test from 'node:test';
import assert from 'node:assert/strict';
import { holidayName, hasHolidays } from '../public/holidays.js';

const list = (country, year) => {
  const out = [];
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d = new Date(d.getTime() + 864e5)) {
    const day = d.toISOString().slice(0, 10), name = holidayName(country, day);
    if (name) out.push(`${day.slice(5)} ${name}`);
  }
  return out;
};

test('韓国 2025: 旧暦の連休・臨時公休日・代替公休日 (3.1 の土曜、어린이날と부처님오신날の重なり、추석の日曜)', () => {
  assert.deepEqual(list('KR', 2025), ['01-01 신정', '01-27 임시공휴일', '01-28 설날', '01-29 설날', '01-30 설날', '03-01 삼일절', '03-03 대체공휴일', '05-05 어린이날', '05-06 대체공휴일', '06-03 대통령선거일', '06-06 현충일', '08-15 광복절', '10-03 개천절', '10-05 추석', '10-06 추석', '10-07 추석', '10-08 대체공휴일', '10-09 한글날', '12-25 성탄절']);
});

test('韓国 2026: 3.1・부처님오신날(日曜)・광복절・개천절(土曜)の代替公休日、추석は日曜を含まないので代替なし', () => {
  assert.deepEqual(list('KR', 2026), ['01-01 신정', '02-16 설날', '02-17 설날', '02-18 설날', '03-01 삼일절', '03-02 대체공휴일', '05-05 어린이날', '05-24 부처님오신날', '05-25 대체공휴일', '06-03 지방선거일', '06-06 현충일', '08-15 광복절', '08-17 대체공휴일', '09-24 추석', '09-25 추석', '09-26 추석', '10-03 개천절', '10-05 대체공휴일', '10-09 한글날', '12-25 성탄절']);
});

test('日本 2026: 振替休日 (5/3 が日曜)・国民の休日 (9/22)・春分/秋分', () => {
  assert.deepEqual(list('JP', 2026), ['01-01 元日', '01-12 成人の日', '02-11 建国記念の日', '02-23 天皇誕生日', '03-20 春分の日', '04-29 昭和の日', '05-03 憲法記念日', '05-04 みどりの日', '05-05 こどもの日', '05-06 振替休日', '07-20 海の日', '08-11 山の日', '09-21 敬老の日', '09-22 国民の休日', '09-23 秋分の日', '10-12 スポーツの日', '11-03 文化の日', '11-23 勤労感謝の日']);
});

test('対応外の国・不正な日付は休日なし', () => {
  assert.equal(hasHolidays('KR'), true);
  assert.equal(hasHolidays('US'), false);
  assert.equal(holidayName('US', '2026-07-04'), '');
  assert.equal(holidayName('', '2026-01-01'), '');
  assert.equal(holidayName('KR', 'bad'), '');
  assert.equal(holidayName('KR', '2026-10-08'), '');
});
