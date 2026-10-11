// 色のプリセット。パレットは自由に選ばせず、モード (ライト / ダーク) ごとに「背景 5 つ」×「ハイライト 6 つ」だけを用意する。
// 値そのものは scripts/palettes.mjs が OKLCH から作って public/palettes.css に書き出す (npm run palettes)。ここは「何があるか」だけを持つ。
// サーバ (設定の検証) とブラウザ (選択肢・ラベル) の両方から読む。DOM にも Node 固有の API にも触れないこと。

export const MODES = ['light', 'dark'];

// 先頭は、そのモードの既定 (tokens.css に直接書いてある値)
export const BACKGROUNDS = {
  light: ['white', 'ivory', 'mist', 'sage', 'blush'],
  dark: ['black', 'graphite', 'midnight', 'forest', 'plum'],
};
export const ACCENTS = {
  light: ['amber', 'violet', 'blue', 'teal', 'green', 'rose'],
  dark: ['violet', 'blue', 'teal', 'green', 'amber', 'rose'],
};

export const DEFAULT_APPEARANCE = {
  light: { background: BACKGROUNDS.light[0], accent: ACCENTS.light[0] },
  dark: { background: BACKGROUNDS.dark[0], accent: ACCENTS.dark[0] },
};

export const isBackground = (mode, id) => BACKGROUNDS[mode]?.includes(id) ?? false;
export const isAccent = (mode, id) => ACCENTS[mode]?.includes(id) ?? false;
