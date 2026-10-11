import { test, expect } from '../fixtures.js';

test.describe('観点: ダイアログとポップアップの操作', () => {
  test.beforeEach(async ({ dayline }) => {
    await dayline.open();
  });
  test('パターン: desktop item dialog는 left form/right memo 2열이고 footer는 전체 폭이다', async ({ dayline }) => {
    await dayline.openAddDialog();
    const layout = await dayline.itemDialogLayout();
    expect(Math.abs(layout.main.y-layout.memo.y)).toBeLessThan(2);
    expect(layout.memo.x).toBeGreaterThan(layout.main.x+layout.main.w);
    expect(layout.foot.w).toBeGreaterThan(layout.main.w+layout.memo.w);
    expect(layout.resize).toBe('none');
  });

  test('パターン: カレンダーを開いたまま背景を押すと、まずカレンダーだけが閉じ、ダイアログと入力は残る。次の背景クリックでダイアログが閉じる', async ({ dayline, page }) => {
    await dayline.openEditDialog('折り返さない短いタイトル');
    await dayline.textField.fill('入力途中の文字');
    await dayline.field('start').getByTestId('date-button').click();
    await expect(dayline.popover).toBeVisible();
    await page.mouse.click(5, 400); // ダイアログの外 (背景)
    await expect(dayline.popover).toBeHidden();
    await expect(dayline.itemDialog).toBeVisible();
    await expect(dayline.textField).toHaveValue('入力途中の文字');
    await expect(async () => {
      await page.mouse.click(5, 400);
      await expect(dayline.itemDialog).toBeHidden({ timeout: 500 });
    }).toPass();
  });

  test('パターン: Esc は、開いているポップアップ → ダイアログの順に閉じる', async ({ dayline, page }) => {
    await dayline.openEditDialog('折り返さない短いタイトル');
    await dayline.field('start').getByTestId('date-button').click();
    await expect(dayline.popover).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dayline.popover).toBeHidden();
    await expect(dayline.itemDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dayline.itemDialog).toBeHidden();
  });

  test('パターン: 開始日・締切日の両方が空になるように保存すると、インボックスへ移る', async ({ dayline, vault }) => {
    await dayline.openEditDialog('折り返さない短いタイトル'); // ⏳ だけ (📅 なし)
    await dayline.field('start').getByTestId('date-clear').click();
    await dayline.saveDialog();
    await expect.poll(() => vault.inbox()).toContain('折り返さない短いタイトル');
    expect(vault.note()).not.toContain('折り返さない短いタイトル');
  });

  test('パターン: 時刻欄は全角の数字・コロン (IME 入力) も受け付ける', async ({ dayline }) => {
    await dayline.openEditDialog('折り返さない短いタイトル');
    const ts = dayline.field('ts').getByTestId('time-input');
    await ts.fill('１０：３０');
    await ts.blur();
    await expect(ts).toHaveValue('10:30');
  });
});

test.describe('観点: セクションの追加・名前変更・削除', () => {
  test('パターン: 追加 → 名前変更 → 削除 (空のとき)。項目が残る節は削除できない', async ({ dayline, vault }) => {
    await dayline.open();
    const dlg = dayline.sectionDialog;
    await dayline.panel('tasks').getByTestId('section-add').click();
    await dlg.getByTestId('section-name-input').fill('私用');
    await dlg.getByTestId('dialog-submit').click();
    await expect(dayline.section('私用')).toBeVisible();
    await expect.poll(() => vault.template()).toContain('### 私用');

    await dayline.section('私用').hover();
    await dayline.section('私用').getByTestId('section-edit').click();
    await dlg.getByTestId('section-name-input').fill('私用2');
    await dlg.getByTestId('dialog-submit').click();
    await expect(dayline.section('私用2')).toBeVisible();
    await expect(dayline.section('私用')).toHaveCount(0);

    await dayline.section('私用2').hover();
    await dayline.section('私用2').getByTestId('section-edit').click();
    await dlg.getByTestId('section-delete').click();
    await dayline.confirm(true);
    await expect(dayline.section('私用2')).toHaveCount(0);
    await expect.poll(() => vault.template()).not.toContain('私用');

    // 項目が残るルーティンの節 G は削除ボタンが押せない
    await dayline.section('G', 'routine').hover();
    await dayline.section('G', 'routine').getByTestId('section-edit').click();
    await expect(dlg.getByTestId('section-delete')).toBeDisabled();
  });
});
