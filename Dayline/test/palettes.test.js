// 色のプリセット: palettes.css が生成スクリプトの出力と一致していること、全部の組み合わせでコントラスト基準を満たすこと。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCss, checkAll, color, contrast, parseHex, ACCENT_RECIPES } from '../scripts/palettes.mjs';
import { ACCENTS, BACKGROUNDS, DEFAULT_APPEARANCE, isAccent, isBackground } from '../public/presets.js';

test('public/palettes.css は scripts/palettes.mjs の出力と同じ (プリセットを変えたら npm run palettes)', () => {
  assert.equal(fs.readFileSync(new URL('../public/palettes.css', import.meta.url), 'utf8'), buildCss());
});

test('全部の (背景 × ハイライト × モード) で、本文・アクセント文字・塗りの上の文字・アイコン・フォーカス・ヒートマップが基準を満たす', () => {
  assert.deepEqual(checkAll(), []);
});

test('プリセットの一覧: 各モードに背景 5・ハイライト 6、先頭が既定、レシピがある', () => {
  for (const mode of ['light', 'dark']) {
    assert.equal(BACKGROUNDS[mode].length, 5);
    assert.equal(ACCENTS[mode].length, 6);
    assert.equal(DEFAULT_APPEARANCE[mode].background, BACKGROUNDS[mode][0]);
    assert.equal(DEFAULT_APPEARANCE[mode].accent, ACCENTS[mode][0]);
    for (const id of ACCENTS[mode]) assert.ok(ACCENT_RECIPES[id], `${mode} accent ${id} のレシピ`);
  }
  assert.ok(isBackground('dark', 'midnight') && !isBackground('light', 'midnight') && !isBackground('dark', 'constructor'));
  assert.ok(isAccent('light', 'teal') && !isAccent('light', 'orange'));
});

test('tokens.css: プレビュー (.pv) にも同じトークンが当たる / palettes.css は .pv と :root の両方に当てる', () => {
  const tokens = fs.readFileSync(new URL('../public/tokens.css', import.meta.url), 'utf8');
  assert.match(tokens, /^:root,\n\.pv\[data-theme='dark'\] \{/m);
  assert.match(tokens, /^:root\[data-theme='light'\],\n\.pv\[data-theme='light'\] \{/m);
  const css = buildCss();
  assert.equal((css.match(/^:root\[data-theme=/gm) ?? []).length, (css.match(/^\.pv\[data-theme=/gm) ?? []).length);
  // 既定 (ダーク = 黒 + 紫 / ライト = 白 + 橙) は tokens.css が持つので、生成しない。それ以外は全部ある
  for (const [mode, kind, id] of [['dark', 'accent', 'violet'], ['light', 'accent', 'amber'], ['dark', 'bg', 'black'], ['light', 'bg', 'white']]) assert.ok(!css.includes(`[data-theme='${mode}'][data-${kind}='${id}']`), `${mode} ${id} は生成しない`);
  for (const mode of ['light', 'dark']) {
    for (const id of BACKGROUNDS[mode].slice(1)) assert.ok(css.includes(`[data-theme='${mode}'][data-bg='${id}']`), `${mode} bg ${id}`);
    for (const id of ACCENTS[mode].slice(1)) assert.ok(css.includes(`[data-theme='${mode}'][data-accent='${id}']`), `${mode} accent ${id}`);
  }
});

test('OKLCH → sRGB: 既知の色と、色域の外の彩度は明るさ・色相を保ったまま下げる', () => {
  assert.equal(color(0.549, 0.185, 288).hex, '#7057d5'); // 既定の紫の塗り
  const wild = color(0.8, 0.4, 150); // sRGB に収まらない
  assert.ok(wild.rgb.every((c) => c >= 0 && c <= 255));
  assert.ok(contrast(parseHex('#ffffff'), parseHex('#000000')) > 20.9 && contrast(parseHex('#777777'), parseHex('#777777')) === 1);
});
