import { test, expect } from '../fixtures.js';

// モバイル端末 (iPhone 13 = WebKit / Pixel 7 = Chromium) のエミュレーション: タッチ操作・狭い幅
test.describe('観点: モバイルの画面', () => {
  test.beforeEach(async ({ dayline }) => {
    await dayline.open();
  });
  test('パターン: item dialog는 mobile에서 left form 다음 memo로 1열 배치된다', async ({ dayline }) => {
    await dayline.openAddDialog();
    const layout = await dayline.itemDialogLayout();
    expect(layout.memo.y).toBeGreaterThan(layout.main.y);
    expect(Math.abs(layout.memo.x-layout.main.x)).toBeLessThan(2);
  });

  test('パターン: 横スクロールが出ない', async ({ dayline }) => {
    expect(await dayline.hasHorizontalScroll()).toBe(false);
  });

  test('パターン: タップでチェックが入り、保存され、タイトルの上下中央のまま', async ({ dayline, vault }) => {
    const title = '折り返さない短いタイトル';
    await dayline.taskCheck(title).tap();
    await expect(dayline.taskCheck(title)).toBeChecked();
    await expect.poll(() => vault.note()).toMatch(new RegExp(`\\[x\\] ${title}`));
    const [off] = await dayline.centreOffsets(dayline.task(title));
    expect(off).toBeLessThan(0.6);
  });

  test('パターン: 操作ボタン (編集・取消) は、ホバーできない端末でも常に見える', async ({ dayline }) => {
    const row = dayline.task('メモ付きのタスク');
    await expect(row.getByTestId('task-edit')).toBeVisible();
    await expect(row.getByTestId('task-edit')).toHaveCSS('opacity', '1');
  });

  test('パターン: 詳細ダイアログが画面の幅に収まり、保存できる', async ({ dayline, page, vault }) => {
    await dayline.task('折り返さない短いタイトル').getByTestId('task-edit').tap();
    await expect(dayline.itemDialog).toBeVisible();
    const box = await dayline.itemDialog.boundingBox();
    const width = page.viewportSize().width;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await dayline.memoField.fill('モバイルで書いたメモ');
    await dayline.submit.tap();
    await expect(dayline.itemDialog).toBeHidden();
    await expect.poll(() => vault.note()).toContain('  モバイルで書いたメモ');
  });
});
