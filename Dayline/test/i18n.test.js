// 辞書: 4 言語でキーが揃っていて、コードが使うキーがすべて存在することを確認する。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DICT, LANGS } from '../public/i18n.js';
import { BACKGROUNDS, ACCENTS } from '../public/presets.js';

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public');
const keysOf = (l) => new Set(Object.keys(DICT[l]));

test('4言語のキーが一致する', () => {
  const base = keysOf('ja');
  for (const { code } of LANGS) {
    const k = keysOf(code);
    assert.deepEqual([...base].filter((x) => !k.has(x)), [], `${code} に無いキー`);
    assert.deepEqual([...k].filter((x) => !base.has(x)), [], `${code} だけにあるキー`);
  }
});

test('コード中の t() / h() / data-i18n のキーはすべて辞書にある', () => {
  const used = new Set(['prio.highest', 'prio.high', 'prio.medium', 'prio.low', 'prio.lowest']); // t(`prio.${x}`) の動的キー
  // 動的キーも実際の選択肢から列挙し、辞書欠落を検出する。
  for (const page of ['do', 'write', 'set']) used.add(`nav.${page}`);
  for (const name of ['light', 'dark', 'background', 'accent', 'sunrise', 'sunset']) used.add(`set.${name}`);
  for (const name of new Set([...Object.values(BACKGROUNDS).flat(), ...Object.values(ACCENTS).flat()])) used.add(`preset.${name}`);
  for (const f of fs.readdirSync(PUB)) {
    if (!/\.(js|html)$/.test(f) || f === 'i18n.js' || f === 'design.html') continue;
    const src = fs.readFileSync(path.join(PUB, f), 'utf8');
    for (const m of src.matchAll(/\b[th]\('([\w.]+)'\s*[,)]/g)) used.add(m[1]);
    for (const m of src.matchAll(/data-i18n(?:-\w+)?="([\w.]+)"/g)) used.add(m[1]);
  }
  const base = keysOf('ja');
  assert.deepEqual([...used].filter((k) => !base.has(k)), []);
  assert.ok(used.size > 100);
});

test('差し込み {name} が全言語で同じ', () => {
  const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
  for (const key of Object.keys(DICT.ja)) {
    for (const { code } of LANGS) assert.equal(ph(DICT[code][key]), ph(DICT.ja[key]), `${code}:${key}`);
  }
});

test('Assistant shortcut describes that it starts item-creating AI work in every language', () => {
  for (const { code } of LANGS) {
    const text = DICT[code]['key.assistantRun'];
    assert.match(text, /⌘\/Ctrl\+Enter/);
    assert.match(text, code === 'ja' ? /項目.*作成.*AI/ : code === 'ko' ? /항목.*만들기.*AI/ : code === 'en' ? /AI.*creating items/ : /创建项目.*AI/);
  }
});

test('S2 cursor hint describes dot, action ring and text caret in every language', () => {
  const shapes = { ja: ['点', 'リング', 'キャレット'], ko: ['점', '링', '캐럿'], en: ['dot', 'ring', 'caret'], zh: ['圆点', '圆环', '插入光标'] };
  for (const { code } of LANGS) for (const shape of shapes[code]) assert.ok(DICT[code]['set.cursorHint'].includes(shape), `${code}: ${shape}`);
});
