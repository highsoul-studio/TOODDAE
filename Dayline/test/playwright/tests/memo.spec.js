import { test, expect } from '../fixtures.js';

test.describe('観点: メモの編集 (詳細ダイアログ) と md への保存', () => {
  test.beforeEach(async ({ dayline }) => {
    await dayline.open();
  });

  test('パターン: ⌘/Ctrl+Enter で保存。タスク行の下に 2 マス字下げで書かれ、チェックボックス風・コードフェンス風の行は逃がされる', async ({ dayline, vault, page }) => {
    await dayline.openEditDialog('折り返さない短いタイトル');
    await dayline.memoField.fill('追加したメモ\n- 箇条書き\n- [ ] チェック風の行\n```\nコード風');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(dayline.itemDialog).toBeHidden();
    await expect.poll(() => vault.note()).toContain('- [ ] 折り返さない短いタイトル');
    const lines = vault.note().split('\n');
    const i = lines.findIndex((l) => l.startsWith('- [ ] 折り返さない短いタイトル'));
    expect(lines.slice(i + 1, i + 6)).toEqual(['  追加したメモ', '  - 箇条書き', '  - \\[ ] チェック風の行', '  \\```', '  コード風']);
    // 画面には元の形で戻り、別のタスクやコードブロックとして解釈されない
    await expect(dayline.page.getByTestId('task-title').filter({ hasText: 'チェック風の行' })).toHaveCount(0); // 題名として現れない (メモの中の文字としてだけ出る)
    await expect(dayline.taskMemo('折り返さない短いタイトル')).toContainText('- [ ] チェック風の行');
  });

  test('パターン: メモを空にして保存すると、メモの行が消える', async ({ dayline, vault }) => {
    await dayline.openEditDialog('メモ付きのタスク');
    await expect(dayline.memoField).toHaveValue(/一行目のメモ/);
    await dayline.memoField.fill('');
    await dayline.saveDialog();
    await expect.poll(() => vault.note()).not.toContain('一行目のメモ');
    await expect(dayline.taskMemo('メモ付きのタスク')).toHaveCount(0);
  });

  test('パターン: 長いメモは切り詰められない (80 行)', async ({ dayline, vault }) => {
    const long = Array.from({ length: 80 }, (_, i) => `行${i + 1}`).join('\n');
    await dayline.openEditDialog('折り返さない短いタイトル');
    await dayline.memoField.fill(long);
    await dayline.saveDialog();
    await expect.poll(() => vault.note()).toContain('  行80');
    await dayline.openEditDialog('折り返さない短いタイトル');
    await expect(dayline.memoField).toHaveValue(long);
  });

  test('パターン: ルーティンのメモは、今日のノートとテンプレートの両方に書かれる', async ({ dayline, vault }) => {
    await dayline.openEditDialog('日報', 'routine');
    await dayline.memoField.fill('日報のメモ');
    await dayline.saveDialog();
    await expect.poll(() => vault.template()).toMatch(/- \[ \] 日報\n  日報のメモ\n/);
    expect(vault.note()).toMatch(/- \[ \] 日報\n  日報のメモ\n/);
  });

  test('パターン: 触れていないメモは、タイトルだけ変えて保存しても書き換わらない (Obsidian で書いた字下げを保つ)', async ({ dayline, vault }) => {
    vault.editNote((s) => s.replace('  一行目のメモ', '\t一行目のメモ')); // タブで字下げしたメモ
    await dayline.page.reload();
    await dayline.openEditDialog('メモ付きのタスク');
    await dayline.textField.fill('メモ付きのタスク改');
    await dayline.saveDialog();
    await expect.poll(() => vault.note()).toContain('メモ付きのタスク改');
    expect(vault.note()).toContain('\t一行目のメモ');
  });
});
