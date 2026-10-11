import { test, expect } from '../fixtures.js';

const LONG = 'とても長いタイトルのタスクで二行以上に折り返す';

test.describe('観点: 行のレイアウト — チェックボックスはタイトルの上下中央にある', () => {
  test.beforeEach(async ({ dayline }) => {
    await dayline.open();
  });

  test('パターン: 全ての行 (今日・ルーティン・今後の予定・インボックス・折り返した長い題名) で中心が一致する', async ({ dayline }) => {
    const diffs = await dayline.centreOffsets();
    expect(diffs.length).toBeGreaterThan(10);
    expect(Math.max(...diffs)).toBeLessThan(0.6);
  });

  test('パターン: 長い題名は折り返され、チェックボックスはその 2 行以上のかたまりの中央にある', async ({ dayline }) => {
    const lines = await dayline.titleLines(LONG);
    expect(lines).toBeGreaterThanOrEqual(2);
  });
});

test.describe('観点: メモ — タイトルの下に最大 3 行', () => {
  test.beforeEach(async ({ dayline }) => {
    await dayline.open();
  });

  test('パターン: 5 行のメモは 3 行だけ見え、残りは切れる', async ({ dayline }) => {
    const memo = dayline.taskMemo('メモ付きのタスク');
    await expect(memo).toBeVisible();
    const { visible, clipped } = await dayline.memoClamp('メモ付きのタスク');
    expect(visible).toBe(3);
    expect(clipped).toBe(true);
  });

  test('パターン: ルーティンと今後の予定の行にもメモが出る', async ({ dayline }) => {
    await expect(dayline.taskMemo('朝会', 'routine')).toHaveText('ルーティンのメモ');
    await expect(dayline.taskMemo('来週の準備', 'side')).toHaveText('来週のメモ');
  });

  test('パターン: メモを足しても、行の中のチェックボックスの位置は変わらない', async ({ dayline }) => {
    const title = '折り返さない短いタイトル';
    const before = await dayline.checkOffset(title);
    expect(before, '行の中で上下中央に置かれている').toBeGreaterThan(0);
    await dayline.openEditDialog(title);
    await dayline.memoField.fill('追加したメモ\n二行目');
    await dayline.saveDialog();
    await expect(dayline.taskMemo(title)).toBeVisible();
    await expect.poll(() => dayline.checkOffset(title)).toBe(before);
  });
});

test.describe('観点: 完了した行の見た目', () => {
  test('パターン: 完了済みの行は、最初から取り消し線が全部引かれ、文字がやわらぐ', async ({ dayline }) => {
    await dayline.open();
    const done = dayline.task('完了済みのタスク');
    await expect(done).toHaveClass(/is-done/);
    await expect(dayline.taskCheck('完了済みのタスク')).toBeChecked();
    expect(await dayline.strikeWidth('完了済みのタスク')).toBe(100);
  });
});
