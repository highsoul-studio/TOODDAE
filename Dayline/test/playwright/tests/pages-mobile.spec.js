import { test, expect } from '../fixtures.js';
import { PagesPage } from '../page-objects/pages.page.js';

test.describe('観点: Write と Set のモバイル操作', () => {
  test('パターン: Write は横スクロールせず、編集欄と操作にアクセシブルな名前がある', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    await pages.open('write');
    expect(await pages.hasHorizontalScroll()).toBe(false);
    await expect(page.getByTestId('write-organize')).toBeVisible();
    await pages.openWriteEdit();
    await expect(pages.editor).toHaveAccessibleName(/Write|メモ|日記|ノート/i);
    await pages.editor.fill('Mobile fake note');
    await expect.poll(() => pages.noteFile(vault.today)).toContain('Mobile fake note');
  });

  test('パターン: Set 의 팔레트와 자동 전환 설정은 좁은 화면에서도 조작 가능하고 초점 표시를 유지한다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    await pages.open('set');
    expect(await pages.hasHorizontalScroll()).toBe(false);
    const swatch = page.getByTestId('light-background-ivory');
    await expect(swatch).toHaveAccessibleName(/ivory|아이보리|象牙|アイボリー/i);
    await swatch.focus();
    await expect(swatch).toBeFocused();
    await swatch.tap();
    await expect(page.getByTestId('preview-light')).toHaveAttribute('data-bg', 'ivory');
    await expect(pages.autoEnabled).toBeVisible();
    for (const layout of await pages.swatchLayouts()) expect(layout).toEqual({ rows: 1, overflow: true, scrollbar:'none' });
    const choices = page.getByRole('radiogroup').first().getByRole('radio');
    await choices.first().focus();
    await page.keyboard.press('ArrowLeft');
    await expect(choices.last()).toBeFocused();
    await expect(page.getByTestId('settings-status')).toHaveText('');
  });
});
