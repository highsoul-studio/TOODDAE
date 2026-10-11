// 観点 = 何を確かめたいか / パターン = 具体的なケース (チームの観点設計に合わせる)
import { test, expect } from '../fixtures.js';

const LANGS = [
  ['ja', '日本語', '今日のタスク', 'ルーティン'],
  ['ko', '한국어', '오늘 할 일', '루틴'],
  ['en', 'English', 'Today', 'Routine'],
  ['zh', '中文', '今日任务', '例行事项'],
];

test.describe('観点: 上部バーの構成', () => {
  test.beforeEach(async ({ dayline }) => {
    await dayline.open({ lang: 'ko', theme: 'light' });
  });

  test('パターン: 太陽/月ボタンは言語ボタンの直前 (左隣) にある', async ({ dayline }) => {
    expect(await dayline.langButton.evaluate((el) => el.previousElementSibling?.getAttribute('data-testid'))).toBe('theme-toggle');
  });

  test('パターン: 同期ピルは接続中 (live) を示す', async ({ dayline }) => {
    await expect(dayline.syncPill).toHaveAttribute('data-state', 'live');
  });

  test('パターン: 言語ボタンを押し直すと、開いたメニューが閉じる', async ({ dayline }) => {
    await dayline.langButton.click();
    await expect(dayline.popover).toBeVisible();
    await dayline.langButton.click();
    await expect(dayline.popover).toBeHidden();
  });
});

test.describe('観点: 言語の切り替え (4 言語) — 見出しが変わり、翻訳キーが画面に漏れない', () => {
  for (const [code, name, tasksTitle, routineTitle] of LANGS) {
    test(`パターン: ${name}`, async ({ dayline }) => {
      await dayline.open({ lang: code === 'ko' ? 'ja' : 'ko' }); // 別の言語から切り替える
      await dayline.langButton.click();
      await dayline.popover.getByRole('option', { name }).click();
      await expect(dayline.root).toHaveAttribute('lang', new RegExp(`^${code}`));
      await expect(dayline.panel('tasks').getByRole('heading', { level: 2 })).toHaveText(tasksTitle);
      await expect(dayline.panel('routine').getByRole('heading', { level: 2 })).toHaveText(routineTitle);
      // ダイアログのラベル・ボタン・ヒントが、翻訳キー (例: f.memo) のままになっていない
      await dayline.openAddDialog();
      const texts = await dayline.dialogTexts();
      expect(texts.length).toBeGreaterThan(10);
      for (const text of texts) expect(text, `未翻訳のキーが表示されている: ${text}`).not.toMatch(/^[a-z]+(\.[A-Za-z]+)+$/);
    });
  }
});

test.describe('観点: 初回起動の言語', () => {
  test('パターン: 保存された言語が無いと English で始まり、メニューは English → 한국어 → 日本語 → 中文 の順', async ({ page, dayline }) => {
    await page.addInitScript(() => { try { localStorage.removeItem('lang'); } catch {} }); // フィクスチャの日本語の既定を外す (= 本物の初回起動)
    await page.goto('/');
    await dayline.ready();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(dayline.langButton).toContainText('English');
    await dayline.langButton.click();
    await expect(dayline.popover.getByRole('option')).toHaveText(['English', '한국어', '日本語', '中文']);
  });
});
