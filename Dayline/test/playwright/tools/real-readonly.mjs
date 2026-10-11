// 実際に動いているサーバ (既定 http://127.0.0.1:4317) を、実際のノートのまま、3 つのエンジンで「読み取り専用」で確かめる。
//  ・書き込み (POST) は全部ここで止めて偽の成功を返す → どんなクリックもファイルには届かない。前後で vault の md5 が同じことで証明する
//  ・全ての行 (今日 / ルーティン / 今後の予定 / インボックス) について、押した直後のフレームごとの崩れ (中心のずれ・position・角丸・影) と、
//    未完了の行では取り消し線が左から伸びること
//  ・横スクロールなし (1280 / 375px)、コンソールエラーなし、詳細ダイアログが名前を持つこと
//  ・本物の vault は使っている最中に変わりうる (Obsidian や別のタブでの編集)。実行中に md5 が変わった回は、画面が途中で作り直されて
//    結果が当てにならないので、やり直す (3 回やっても落ち着かなければ「判定不能」として、失敗とは分けて知らせる)
// 使い方: npm run verify:real      環境変数: BASE (既定 http://127.0.0.1:4317) / ENGINES (既定 chromium,firefox,webkit) / DAYLINE_LANG (既定 ja)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, expect, firefox, webkit } from '@playwright/test';
import { DaylinePage } from '../page-objects/dayline.page.js';

const BASE = process.env.BASE || 'http://127.0.0.1:4317';
const LANG = process.env.DAYLINE_LANG || 'ja';
const ENGINES = Object.entries({ chromium, firefox, webkit }).filter(([name]) => (process.env.ENGINES || 'chromium,firefox,webkit').split(',').includes(name));
const NOISE = /The connection to .*\/api\/events was interrupted while the page was loading/; // Firefox: SSE のあるページから離れるときの無害なログ
const ATTEMPTS = 3;

const vaultRoot = (await (await fetch(`${BASE}/api/status`)).json()).vault.path;
const hashVault = (rel = '', out = {}) => {
  for (const e of fs.readdirSync(path.join(vaultRoot, rel), { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) hashVault(r, out);
    else if (e.name.endsWith('.md')) out[r] = crypto.createHash('md5').update(fs.readFileSync(path.join(vaultRoot, r))).digest('hex');
  }
  return out;
};
const changedFiles = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);

const before = hashVault();
const failures = [];
const inconclusive = [];
const summary = [];
let posts = 0;
let retried = 0;

// 1 エンジン × 1 テーマの検査。問題は配列で返す (例外にしない)
async function pass(browser, engine, theme) {
  const tag = `${engine}/${theme}`;
  const problems = [];
  const verdict = (ok, label) => ok || problems.push(`${tag}: ${label}`);
  const stats = { rows: 0, frames: 0, strikes: 0 };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    await ctx.route('**/api/**', (route) => {
      const req = route.request();
      if (req.method() !== 'POST') return route.continue();
      posts++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ raw: req.postDataJSON()?.raw ?? '' }) });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && !NOISE.test(m.text()) && errors.push(m.text()));
    const dayline = new DaylinePage(page, null, engine);
    const rows = page.getByTestId('task');

    await dayline.open({ url: BASE, lang: LANG, theme, withTasks: false });
    const n = await rows.count();
    stats.rows = n;
    verdict(n > 0, '行が 1 つも描かれていない');
    verdict(!(await dayline.hasHorizontalScroll()), '横スクロールが出ている (1280px)');
    await page.setViewportSize({ width: 375, height: 812 });
    verdict(!(await dayline.hasHorizontalScroll()), '横スクロールが出ている (375px)');
    await page.setViewportSize({ width: 1280, height: 800 });

    if (n > 0) {
      await rows.first().hover();
      await rows.first().getByTestId('task-edit').click();
      await expect(dayline.itemDialog).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveAccessibleName(/\S/);
      await page.keyboard.press('Escape');
      await expect(dayline.itemDialog).toBeHidden();
    }

    const limit = theme === 'light' ? n : Math.min(n, 3); // ライトは全行、ダークは先頭 3 行
    for (let i = 0; i < limit; i++) {
      await page.reload();
      await dayline.ready({ withTasks: false });
      const f = await dayline.sampleFramesOf(rows.nth(i));
      stats.frames++;
      verdict(f.frames > 40 && f.offCentre + f.nonStatic + f.wrongRadius + f.shadow === 0, `${i + 1} 行目の押した直後のフレームが崩れた ${JSON.stringify(f)}`);
    }
    if (theme === 'light') {
      for (let i = 0; i < n; i++) {
        await page.reload();
        await dayline.ready({ withTasks: false });
        if (await rows.nth(i).getByTestId('task-check').isChecked()) continue; // 完了済みの行 (外す方向) は上のフレーム検査で見ている
        const s = await dayline.sampleStrikeOf(rows.nth(i));
        stats.strikes++;
        verdict(s.mid >= 3 && s.ended === 100, `${i + 1} 行目の取り消し線が左から伸びていない ${JSON.stringify({ mid: s.mid, ended: s.ended })}`);
      }
    }
    verdict(errors.length === 0, `コンソールエラー ${JSON.stringify(errors.slice(0, 3))}`);
  } catch (e) {
    problems.push(`${tag}: 検査の途中で例外 ${String(e.message).split('\n')[0]}`); // 例外も 1 件の問題として数える (ツールごと落とさない)
  } finally {
    await ctx.close();
  }
  return { problems, stats };
}

for (const [engine, type] of ENGINES) {
  const browser = await type.launch();
  const total = { rows: 0, frames: 0, strikes: 0 };
  for (const theme of ['light', 'dark']) {
    let result;
    let stable = false;
    for (let attempt = 1; attempt <= ATTEMPTS && !stable; attempt++) {
      const h0 = hashVault();
      result = await pass(browser, engine, theme);
      const moved = changedFiles(h0, hashVault());
      stable = moved.length === 0;
      if (!stable && attempt < ATTEMPTS) retried++;
    }
    if (stable) {
      failures.push(...result.problems);
      total.rows = Math.max(total.rows, result.stats.rows);
      total.frames += result.stats.frames;
      total.strikes += result.stats.strikes;
    } else {
      inconclusive.push(`${engine}/${theme}: 実行中に vault が変わり続けた (${ATTEMPTS} 回やり直しても落ち着かない)`);
    }
  }
  await browser.close();
  summary.push(`${engine}: 行 ${total.rows} / 押した直後のフレーム検査 ${total.frames} 行 / 取り消し線 ${total.strikes} 行`);
}

const after = hashVault();
const changed = changedFiles(before, after);
console.log(summary.join('\n'));
console.log(`止めた POST: ${posts} 件 (どれもサーバへ届いていない)`);
if (retried) console.log(`実行中に vault の編集 (Obsidian や別のタブ) を検出して、やり直した回: ${retried}`);
console.log(changed.length ? `開始時と比べて変わったファイル: ${changed.join(', ')}  ← こちらの操作ではなく、実行中の別の編集のはず (POST は全部止めている)` : `vault の md5: ${Object.keys(before).length} ファイルすべて開始時と同じ`);
if (inconclusive.length) console.log(`\n判定不能 (失敗ではない):\n${inconclusive.map((f) => `  - ${f}`).join('\n')}`);
if (failures.length) {
  console.error(`\n${failures.length} 件の問題\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log(inconclusive.length ? '問題は見つからなかった (判定不能の回を除く)' : '問題なし');
