// チームの Playwright 規約 (eslint-plugin-playwright の推奨セット相当) を、依存なしで検査する。使い方: npm run e2e:lint
// ルールの意味と理由は .claude/skills/dayline-verify/references/playwright-rules.md。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const list = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.js')).map((f) => `${dir}/${f}`);
const SPECS = list('tests');
const ALL = [...SPECS, ...list('page-objects'), ...list('helpers'), 'fixtures.js', 'playwright.config.js'];

const WEB_FIRST = 'toBeVisible|toBeHidden|toBeChecked|toBeDisabled|toBeEnabled|toBeFocused|toBeEmpty|toBeAttached|toHaveText|toContainText|toHaveCount|toHaveClass|toHaveAttribute|toHaveValue|toHaveCSS|toHaveAccessibleName|toHaveId|toHaveURL|toHaveTitle';

// 行ごとの規則: [名前, 対象ファイル, 正規表現, 理由]
const LINE_RULES = [
  ['no-wait-for-timeout', ALL, /\bwaitForTimeout\s*\(/, '固定の待ちは使わない。見える状態・ファイルの中身などの条件で待つ (expect / expect.poll)'],
  ['no-networkidle', ALL, /networkidle/, 'networkidle は使わない。ユーザーが待つ「見える状態」で待つ'],
  ['no-page-pause', ALL, /\.pause\s*\(\s*\)/, 'page.pause() を残さない'],
  ['no-focused-test', ALL, /\b(?:test|describe)\.only\b/, '.only を残さない'],
  ['no-skipped-test', ALL, /\b(?:test|describe)\.(?:skip|fixme)\s*\(\s*['"`]/, '題名つきの skip / fixme は不可 (環境による skip は test.skip(条件, 理由) の形で)'],
  ['no-force-option', ALL, /\.(?:click|check|uncheck|fill|hover|tap|dblclick|setChecked|press)\([^)]*\bforce:\s*true/, '{ force: true } で操作できない原因を隠さない'],
  ['no-conditional-in-test', SPECS, /^\s*(?:if\s*\(|else\b|switch\s*\()/, 'テストの中に分岐を書かない (パターンごとにテストを分ける。データ駆動の for は可)'],
  ['no-selector-in-spec', SPECS, /\.locator\s*\(|\.\$\$?\s*\(|querySelector|getComputedStyle|getBoundingClientRect|evaluateAll/, 'セレクタと DOM の計測は Page Object に置く (data-testid / role / 文言は getBy* でスペックに書いてよい)'],
  ['no-fixed-sleep', SPECS, /setTimeout\s*\(/, 'スペックで時間を置かない'],
  ['valid-expect', ALL, new RegExp(`^\\s*expect\\((?!await\\b)[^\\n]*\\)\\.(?:not\\.)?(?:${WEB_FIRST})\\(`), 'web-first のアサーションには await が要る (await が無いと待たずに素通りする)'],
];

const violations = [];
for (const rel of ALL) {
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  lines.forEach((text, i) => {
    if (/^\s*\/\//.test(text)) return; // コメント行
    const code = text.replace(/\s\/\/.*$/, ''); // 行末のコメント
    for (const [name, scope, re, why] of LINE_RULES) if (scope.includes(rel) && re.test(code)) violations.push(`${rel}:${i + 1}  ${name}: ${why}\n    ${text.trim().slice(0, 140)}`);
  });
}

// 使っていない fixture を受け取っていないか (@typescript-eslint/no-unused-vars 相当)
for (const rel of SPECS) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const m of src.matchAll(/async\s*\(\{([^}]*)\}[^)]*\)\s*=>\s*\{/g)) {
    let depth = 1;
    let end = m.index + m[0].length;
    while (depth && end < src.length) depth += src[end] === '{' ? 1 : src[end] === '}' ? -1 : 0, end++;
    const body = src.slice(m.index + m[0].length, end);
    for (const name of m[1].split(',').map((s) => s.trim().split(/[=:\s]/)[0]).filter(Boolean)) {
      if (!new RegExp(`\\b${name}\\b`).test(body)) violations.push(`${rel}:${src.slice(0, m.index).split('\n').length}  no-unused-vars: fixture '${name}' を受け取っているが使っていない`);
    }
  }
}

if (violations.length) {
  console.error(`${violations.length} 件の違反\n\n${violations.join('\n')}`);
  process.exit(1);
}
console.log(`OK — ${ALL.length} ファイルを ${LINE_RULES.length + 1} 規則で検査して、違反なし`);
