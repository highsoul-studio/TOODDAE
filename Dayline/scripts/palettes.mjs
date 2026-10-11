#!/usr/bin/env node
// 色のプリセット (public/presets.js の一覧) から public/palettes.css を作り、全部の組み合わせでコントラストを検査する。
//   node scripts/palettes.mjs           palettes.css を書き出す (npm run palettes)
//   node scripts/palettes.mjs --check   書き出さずに検査だけ。足りない組み合わせがあれば終了コード 1
// 既存の既定 (ダーク = 黒 + 紫 / ライト = 白 + 橙) の L・C の構造 (OKLCH) をそのまま他の色相へ写すので、どれも同じ品の良さで並ぶ。
// 既定の値は tokens.css に直接書いてあるので、ここでは作らない。このファイルの出力は手で編集しない。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ACCENTS, BACKGROUNDS, DEFAULT_APPEARANCE } from '../public/presets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'public/palettes.css');

// ---------- OKLCH → sRGB と WCAG コントラスト ----------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function linearRgb(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const inGamut = (rgb) => rgb.every((c) => c >= -1e-6 && c <= 1 + 1e-6);
const hex = (rgb) => `#${rgb.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
// OKLCH の色を sRGB にする。色域からはみ出すときは、明るさと色相を保ったまま彩度だけ下げる
export function color(L, C, H) {
  let c = C;
  if (!inGamut(linearRgb(L, C, H))) {
    let [lo, hi] = [0, C];
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(linearRgb(L, mid, H))) lo = mid;
      else hi = mid;
    }
    c = lo;
  }
  const rgb = linearRgb(L, c, H).map((v) => Math.round(clamp01(toGamma(clamp01(v))) * 255));
  return { rgb, hex: hex(rgb) };
}
export const parseHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const luminance = ([r, g, b]) => 0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(b / 255);
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}
const rgba = ({ rgb }, a) => `rgb(${rgb.join(' ')} / ${a})`;
// 背景に対して比率 target を満たす、いちばん近い明るさの色を探す (dir: 暗くする方向 = -1 / 明るくする方向 = +1)
function fit(startL, C, H, bg, target, dir) {
  let L = startL;
  for (let i = 0; i < 200; i++) {
    const c = color(L, C, H);
    if (contrast(c.rgb, bg) >= target) return c;
    L += dir * 0.004;
  }
  throw new Error(`fit failed: L=${startL} C=${C} H=${H} target=${target}`);
}

// ---------- 既存の既定 (tokens.css) から、基準になる値を読む ----------
function baseTokens(mode) {
  const css = fs.readFileSync(path.join(ROOT, 'public/tokens.css'), 'utf8');
  const read = (from) => {
    const block = css.slice(from, css.indexOf('\n}\n', from));
    const t = {};
    for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) t[m[1]] = parseHex(m[2]);
    return t;
  };
  const dark = read(css.indexOf(".pv[data-theme='dark'] {")); // tokens.css の最初のブロック (:root と同じ値)
  return mode === 'dark' ? dark : { ...dark, ...read(css.indexOf(".pv[data-theme='light'] {")) }; // ライトが宣言しない値 (danger など) はダークと共通
}
// 既定のハイライトの値 (tokens.css では var(--p-…) で書いてあるので、ランプから引く)
function defaultAccent(mode, base) {
  const hexOf = (rgb) => hex(rgb);
  return mode === 'dark'
    ? { accent: hexOf(base['p-600']), 'accent-hover': hexOf(base['p-550']), 'accent-press': hexOf(base['p-700']), 'on-accent': hexOf(base['on-accent']), 'accent-text': hexOf(base['p-300']), 'accent-icon': hexOf(base['p-400']), focus: hexOf(base['p-400']), 'heat-1': hexOf(base['p-800']), 'heat-2': hexOf(base['p-700']), 'heat-3': hexOf(base['p-600']), 'heat-4': hexOf(base['p-500']) }
    : { accent: hexOf(base['p-500']), 'accent-hover': hexOf(base['p-400']), 'accent-press': hexOf(base['p-600']), 'on-accent': hexOf(base['on-accent']), 'accent-text': hexOf(base['accent-text']), 'accent-icon': hexOf(base['accent-icon']), focus: hexOf(base.focus), 'heat-1': hexOf(base['p-200']), 'heat-2': hexOf(base['p-400']), 'heat-3': hexOf(base['p-500']), 'heat-4': hexOf(base['p-600']) };
}

// ---------- ハイライト (accent) ----------
// 2 種類のランプ。A = 中くらいの明るさの塗り + 白い文字 (既定のダークの紫)。B = 明るい塗り + 暗い文字 (既定のライトの橙)
const PROFILE = {
  A: { L: { 50: 0.97, 100: 0.929, 200: 0.871, 300: 0.8, 400: 0.719, 500: 0.641, 550: 0.585, 600: 0.549, 700: 0.46, 800: 0.369, 900: 0.291, 950: 0.21 }, C: { 50: 0.015, 100: 0.03, 200: 0.059, 300: 0.1, 400: 0.15, 500: 0.179, 550: 0.185, 600: 0.185, 700: 0.159, 800: 0.126, 900: 0.091, 950: 0.061 } },
  B: { L: { 50: 0.985, 100: 0.96, 200: 0.921, 300: 0.872, 400: 0.824, 500: 0.774, 550: 0.735, 600: 0.691, 700: 0.57, 800: 0.459, 900: 0.37, 950: 0.271 }, C: { 50: 0.02, 100: 0.05, 200: 0.094, 300: 0.136, 400: 0.163, 500: 0.17, 550: 0.168, 600: 0.169, 700: 0.149, 800: 0.115, 900: 0.084, 950: 0.055 } },
};
// h = 色相。dark / light = そのモードで使うランプ (どちらのモードでも映えるよう、色ごとに選ぶ)
// k = 彩度の倍率 (色域の端で蛍光色にならないよう、色ごとに少し抑える)
export const ACCENT_RECIPES = {
  violet: { h: 288, dark: 'A', light: 'A' },
  blue: { h: 255, dark: 'A', light: 'A' },
  teal: { h: 195, dark: 'B', light: 'A', k: 0.78 },
  green: { h: 152, dark: 'B', light: 'A', k: 0.88 },
  amber: { h: 68, dark: 'B', light: 'B' },
  rose: { h: 355, dark: 'A', light: 'A' },
};
const WHITE = [255, 255, 255];

function accentVars(mode, id, base) {
  const { h, [mode]: kind, k: chroma = 1 } = ACCENT_RECIPES[id];
  const P = { L: PROFILE[kind].L, C: Object.fromEntries(Object.entries(PROFILE[kind].C).map(([k, c]) => [k, c * chroma])) };
  const step = (k, dL = 0) => color(P.L[k] + dL, P.C[k], h);
  const ramp = Object.fromEntries(Object.keys(P.L).map((k) => [k, step(k)]));
  const v = {};
  for (const k of Object.keys(ramp)) v[`p-${k}`] = ramp[k].hex;
  const page = base['n-1'];
  const sheet = base['n-2'];
  let fill;
  let on;
  let text;
  let icon;
  let focus;
  if (kind === 'A' && mode === 'dark') {
    fill = fit(P.L[600], P.C[600], h, WHITE, 4.7, -1);
    const hover = contrast(ramp[550].rgb, WHITE) >= 4.5 ? ramp[550] : fill;
    v.accent = fill.hex;
    v['accent-hover'] = hover.hex;
    v['accent-press'] = ramp[700].hex;
    on = { hex: '#ffffff', rgb: WHITE };
    text = ramp[300];
    icon = ramp[400];
    focus = ramp[400];
    Object.assign(v, { 'heat-1': ramp[800].hex, 'heat-2': ramp[700].hex, 'heat-3': fill.hex, 'heat-4': ramp[500].hex, 'brand-a': ramp[500].hex, 'brand-b': ramp[700].hex, 'brand-ink': '#ffffff', 'sel-bg': ramp[700].hex, 'sel-fg': '#ffffff' });
  } else if (kind === 'B' && mode === 'dark') {
    fill = ramp[500];
    on = color(0.225, 0.045, h);
    v.accent = fill.hex;
    v['accent-hover'] = ramp[400].hex;
    v['accent-press'] = ramp[600].hex;
    text = ramp[300];
    icon = ramp[400];
    focus = ramp[400];
    Object.assign(v, { 'heat-1': ramp[800].hex, 'heat-2': ramp[600].hex, 'heat-3': ramp[500].hex, 'heat-4': ramp[400].hex, 'brand-a': ramp[400].hex, 'brand-b': ramp[600].hex, 'brand-ink': on.hex, 'sel-bg': ramp[800].hex, 'sel-fg': '#ffffff' });
  } else if (kind === 'A') {
    // ライト + 白い文字の塗り
    fill = fit(0.54, P.C[600], h, WHITE, 4.8, -1);
    const hover = color(P.L[500] - 0.02, P.C[500], h);
    v.accent = fill.hex;
    v['accent-hover'] = contrast(hover.rgb, WHITE) >= 4.5 ? hover.hex : color(0.5, P.C[600], h).hex; // 白文字 4.5:1 を割らない範囲で、少しだけ明るく
    v['accent-press'] = ramp[700].hex;
    on = { hex: '#ffffff', rgb: WHITE };
    text = fit(0.5, P.C[600], h, WHITE, 5.4, -1);
    icon = fit(0.62, P.C[500], h, WHITE, 3.4, -1);
    focus = fit(0.53, P.C[600], h, WHITE, 4.8, -1);
    Object.assign(v, { 'heat-1': ramp[200].hex, 'heat-2': ramp[400].hex, 'heat-3': ramp[500].hex, 'heat-4': ramp[600].hex, 'brand-a': ramp[400].hex, 'brand-b': ramp[600].hex, 'brand-ink': '#ffffff', 'sel-bg': ramp[200].hex, 'sel-fg': color(0.25, 0.05, h).hex });
  } else {
    // ライト + 明るい塗りに暗い文字 (既定の橙と同じ作り)
    fill = ramp[500];
    on = color(0.225, 0.049, h);
    v.accent = fill.hex;
    v['accent-hover'] = ramp[400].hex;
    v['accent-press'] = ramp[600].hex;
    text = fit(0.55, P.C[700], h - 20, WHITE, 5.2, -1);
    icon = fit(0.64, P.C[600], h - 17, WHITE, 3.5, -1);
    focus = fit(0.56, P.C[700], h - 22, WHITE, 4.8, -1);
    Object.assign(v, { 'heat-1': ramp[200].hex, 'heat-2': ramp[400].hex, 'heat-3': ramp[500].hex, 'heat-4': ramp[600].hex, 'brand-a': ramp[400].hex, 'brand-b': ramp[600].hex, 'brand-ink': on.hex, 'sel-bg': ramp[300].hex, 'sel-fg': on.hex });
  }
  v['on-accent'] = on.hex;
  v['accent-text'] = text.hex;
  v['accent-icon'] = icon.hex;
  v.focus = focus.hex;
  v.tag = mode === 'dark' ? icon.hex : text.hex;
  v['accent-wash'] = rgba(mode === 'dark' ? fill : icon, mode === 'dark' ? 0.14 : 0.14);
  v['accent-line'] = rgba(icon, mode === 'dark' ? 0.36 : 0.42);
  v.glow = rgba(icon, mode === 'dark' ? 0.18 : 0.2);
  v['now-glow'] = rgba(icon, mode === 'dark' ? 0.2 : 0.22);
  void page;
  void sheet;
  return v;
}

// ---------- 背景 (neutral) ----------
// 既定の n-0…n-5 の明るさ (OKLCH の L)。色味は彩度 c を少し足して作る
const NEUTRAL_L = { dark: [0.108, 0.141, 0.169, 0.201, 0.236, 0.274], light: [1, 0.973, 1, 0.959, 0.938, 0.905] };
const BG_RECIPES = {
  dark: {
    graphite: { h: 286, c: 0.006, dL: 0.036 },
    midnight: { h: 255, c: 0.026, dL: 0.012 },
    forest: { h: 160, c: 0.017, dL: 0.01 },
    plum: { h: 328, c: 0.021, dL: 0.012 },
  },
  light: {
    ivory: { h: 85, c: 0.013 },
    mist: { h: 250, c: 0.009 },
    sage: { h: 150, c: 0.011 },
    blush: { h: 12, c: 0.01 },
  },
};
// ページ背景の縦のグラデーション (上 / 中 / 下) の、n-1 からの明るさの差。既定の値から測ったもの
const PAGE_OFFSET = { dark: [0.04, -0.02, -0.036], light: [0.012, -0.008, -0.028] };

function backgroundVars(mode, id) {
  const { h, c, dL = 0 } = BG_RECIPES[mode][id];
  const Ls = NEUTRAL_L[mode];
  const v = {};
  const n = Ls.map((L, i) => {
    // 明るい側のモードでは、シート (n-2) と n-0 をほぼ白に保つ。色味は n-1 と、段が進むほど濃い面に載せる
    const k = mode === 'light' ? [0.3, 1, 0.3, 1.1, 1.3, 1.5][i] : 0.55 + 0.09 * i;
    return color(L + (mode === 'dark' ? dL : 0), c * k, h);
  });
  n.forEach((col, i) => (v[`n-${i}`] = col.hex));
  // ページ背景の縦のグラデーションの 3 色。形 (放射状の光など) は tokens.css が持つ
  const stops = PAGE_OFFSET[mode].map((d) => color(Ls[1] + (mode === 'dark' ? dL : 0) + d, c * 0.9, h).hex);
  [v['pg-top'], v['pg-mid'], v['pg-bot']] = stops;
  v['top-bg'] = rgba(n[1], mode === 'dark' ? 0.74 : 0.8);
  return v;
}

// ---------- 書き出し ----------
const decl = (vars) => Object.entries(vars).map(([k, val]) => `  --${k}: ${val};`).join('\n');
const skip = (mode, kind, id) => DEFAULT_APPEARANCE[mode][kind] === id; // 既定は tokens.css が持つ

export function buildCss() {
  const out = [
    '/* 自動生成: scripts/palettes.mjs (npm run palettes)。手で編集しない。 */',
    '/* 色のプリセット。<html data-theme data-bg data-accent> で選ぶ。.pv は設定ページのプレビュー (同じ値をその要素の中だけに当てる) */',
  ];
  for (const mode of ['dark', 'light']) {
    const base = baseTokens(mode);
    const scope = (extra) => `:root[data-theme='${mode}']${extra},\n.pv[data-theme='${mode}']${extra}`;
    for (const id of BACKGROUNDS[mode]) {
      if (skip(mode, 'background', id)) continue;
      out.push(`\n/* ${mode} / background: ${id} */\n${scope(`[data-bg='${id}']`)} {\n${decl(backgroundVars(mode, id))}\n}`);
    }
    for (const id of ACCENTS[mode]) {
      if (skip(mode, 'accent', id)) continue;
      out.push(`\n/* ${mode} / accent: ${id} */\n${scope(`[data-accent='${id}']`)} {\n${decl(accentVars(mode, id, base))}\n}`);
    }
  }
  return `${out.join('\n')}\n`;
}

// ---------- 検査 ----------
// 全部の (背景 × ハイライト) の組み合わせで、本文・アクセント文字・塗りの上の文字・アイコン・フォーカスの比率を確かめる。失敗の一覧を返す
export function checkAll() {
  const fails = [];
  const need = (label, got, min) => got >= min || fails.push(`${label}: ${got.toFixed(2)} < ${min}`);
  for (const mode of ['dark', 'light']) {
    const base = baseTokens(mode);
    for (const bgId of BACKGROUNDS[mode]) {
      const bgv = skip(mode, 'background', bgId) ? {} : backgroundVars(mode, bgId);
      const n = (k) => parseHex(bgv[`n-${k}`] ?? `#${base[`n-${k}`].map((x) => x.toString(16).padStart(2, '0')).join('')}`);
      for (const t of ['text-1', 'text-2', 'text-3']) for (const s of [1, 2, 3]) need(`${mode}/${bgId} ${t} on n-${s}`, contrast(base[t], n(s)), 4.5);
      for (const sig of ['coral', 'amber']) need(`${mode}/${bgId} ${sig} on n-2`, contrast(base[sig], n(2)), 4.5);
      need(`${mode}/${bgId} danger text`, contrast(base['on-danger'], base.danger), 4.5);
      // 面の段が見分けられる (n-1 < n-2 < n-3 < n-4 < n-5 の並びが保たれる)
      for (let i = 1; i < 5; i++) if (mode === 'dark') need(`${mode}/${bgId} n-${i + 1} lighter than n-${i}`, contrast(n(i + 1), n(i)), 1.03);
      for (const acId of ACCENTS[mode]) {
        const acv = skip(mode, 'accent', acId) ? defaultAccent(mode, base) : accentVars(mode, acId, base);
        const a = (k) => parseHex(acv[k]);
        const tag = `${mode}/${bgId}/${acId}`;
        const [fill, on, text, icon, focus] = ['accent', 'on-accent', 'accent-text', 'accent-icon', 'focus'].map(a);
        need(`${tag} on-accent on accent`, contrast(on, fill), 4.5);
        need(`${tag} on-accent on hover`, contrast(on, a('accent-hover')), 4.5);
        need(`${tag} on-accent on press`, contrast(on, a('accent-press')), 4.5);
        for (const s of [1, 2]) {
          need(`${tag} accent-text on n-${s}`, contrast(text, n(s)), 4.5);
          need(`${tag} accent-icon on n-${s} (non-text)`, contrast(icon, n(s)), 3);
          need(`${tag} focus on n-${s} (non-text)`, contrast(focus, n(s)), 3);
        }
        // ヒートマップ: 一番薄い段でも面から見分けられ、段ごとに明るさが単調に変わる
        const heat = [1, 2, 3, 4].map((i) => a(`heat-${i}`));
        need(`${tag} heat-1 vs n-2`, contrast(heat[0], n(2)), 1.2);
        for (let i = 1; i < 4; i++) need(`${tag} heat-${i + 1} vs heat-${i}`, contrast(heat[i], heat[i - 1]), 1.12);
      }
    }
  }
  return fails;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fails = checkAll();
  if (fails.length) {
    console.error(`コントラストが足りない組み合わせ: ${fails.length} 件\n${fails.map((f) => `  - ${f}`).join('\n')}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('OK — 全ての組み合わせで基準を満たしている');
  else {
    fs.writeFileSync(OUT, buildCss());
    console.log(`wrote ${path.relative(ROOT, OUT)} (${buildCss().split('\n').length} lines); contrast OK`);
  }
}
