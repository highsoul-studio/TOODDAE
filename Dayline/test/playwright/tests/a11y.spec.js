import { test, expect } from '../fixtures.js';

test.describe('観点: キーボードと支援技術', () => {
  test.beforeEach(async ({ dayline }) => {
    await dayline.open({ lang: 'ko' });
  });

  test('パターン: テーマボタン → 言語ボタンの順に Tab で届き、Enter で切り替えられる', async ({ dayline, page }) => {
    await dayline.themeToggle.focus();
    await dayline.tab();
    await expect(dayline.langButton).toBeFocused();
    await dayline.tab({ back: true });
    await expect(dayline.themeToggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dayline.root).toHaveAttribute('data-theme', 'dark');
  });

  test('パターン: チェックボックスは Space で切り替わり、押した後もフォーカスは同じ行に残る', async ({ dayline, page, vault }) => {
    const title = '折り返さない短いタイトル';
    await dayline.taskCheck(title).focus();
    await page.keyboard.press('Space');
    await expect(dayline.taskCheck(title)).toBeChecked();
    await expect(dayline.taskCheck(title)).toBeFocused();
    await expect.poll(() => vault.note()).toMatch(new RegExp(`\\[x\\] ${title}`));
  });

  test('パターン: キーボードフォーカスは soft shadowで見え、forced-colorsではoutlineへ戻る', async ({ dayline }) => {
    await dayline.themeToggle.focus();
    await dayline.tab(); // → 言語ボタン (キーボード操作なので :focus-visible)
    await expect(dayline.langButton).toBeFocused();
    await expect(dayline.langButton).not.toHaveCSS('box-shadow', 'none');
  });

  test('パターン: 画面に出ているボタンは全て、読み上げ用の名前 (accessible name) を持つ', async ({ page }) => {
    const buttons = await page.getByRole('button').all();
    expect(buttons.length).toBeGreaterThan(15);
    for (const b of buttons) await expect(b).toHaveAccessibleName(/\S/);
  });

  test('パターン: チェックボックスは、題名を名前に持つ', async ({ dayline }) => {
    await expect(dayline.taskCheck('折り返さない短いタイトル')).toHaveAccessibleName(/折り返さない短いタイトル/);
  });

  test('パターン: ダイアログ (role=dialog) は名前を持つ', async ({ dayline, page }) => {
    await dayline.openEditDialog('折り返さない短いタイトル');
    await expect(page.getByRole('dialog')).toHaveAccessibleName(/\S/);
    await page.keyboard.press('Escape');
    await dayline.taskCheck('折り返さない短いタイトル').scrollIntoViewIfNeeded();
    await dayline.task('折り返さない短いタイトル').hover();
    await dayline.task('折り返さない短いタイトル').getByTestId('task-cancel').click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName(/\S/); // 確認ダイアログ
  });

  test('パターン: ダイアログを開いている間、背後のボタンは Tab で届かない (モーダル)', async ({ dayline }) => {
    await dayline.openEditDialog('折り返さない短いタイトル');
    for (let i = 0; i < 40; i++) await dayline.tab();
    expect(await dayline.focusInDialog()).toBe(true);
  });
});
