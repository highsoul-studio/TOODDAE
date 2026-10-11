import { test, expect } from '../fixtures.js';

test.describe('観点: Obsidian 側の編集が、再読み込みなしで画面に届く (SSE)', () => {
  test.beforeEach(async ({ dayline }) => {
    await dayline.open();
  });

  test('パターン: タスクの追加 → 完了 → メモの追加 → 削除', async ({ dayline, vault }) => {
    const title = '外から追加したタスク';
    vault.editNote((s) => s.replace('## 今日のタスク\n', `## 今日のタスク\n- [ ] ${title} ⏳ ${vault.today} 📅 ${vault.today}\n`));
    await expect(dayline.task(title)).toBeVisible();
    vault.editNote((s) => s.replace(`- [ ] ${title}`, `- [x] ${title}`));
    await expect(dayline.taskCheck(title)).toBeChecked();
    vault.editNote((s) => s.replace(new RegExp(`(- \\[x\\] ${title}.*\\n)`), '$1  外で書いたメモ\n'));
    await expect(dayline.taskMemo(title)).toHaveText('外で書いたメモ');
    vault.editNote((s) => s.replace(new RegExp(`- \\[x\\] ${title}.*\\n  外で書いたメモ\\n`), ''));
    await expect(dayline.task(title)).toHaveCount(0);
  });

  test('パターン: 完了数の表示も追従する', async ({ dayline, vault }) => {
    const before = await dayline.progressNum.innerText();
    vault.editNote((s) => s.replace('- [ ] 折り返さない短いタイトル', '- [x] 折り返さない短いタイトル'));
    await expect.poll(() => dayline.progressNum.innerText()).not.toBe(before);
  });

  test('パターン: タブを 8 つ開いても fetch が詰まらず、変更が他のタブにも届く (SSE は全タブで 1 本)', async ({ dayline, vault, page }) => {
    const title = '他のタブから見える変更';
    const tabs = [];
    for (let i = 0; i < 7; i++) { const tab = await page.context().newPage(); await tab.goto('/'); tabs.push(tab); }
    const last = tabs.at(-1);
    // 接続が詰まっていれば、最後のタブの取得はここで返らない
    await expect(last.getByTestId('progress')).toBeVisible();
    vault.editNote((s) => s.replace('## 今日のタスク\n', `## 今日のタスク\n- [ ] ${title} ⏳ ${vault.today} 📅 ${vault.today}\n`));
    await expect(last.getByTestId('task').filter({ hasText: title })).toBeVisible();
    await expect(dayline.task(title)).toBeVisible();
    await last.getByTestId('task-check').first().click();
    await expect(last.getByTestId('task-check').first()).toBeChecked();
  });
});

test.describe('観点: 操作の最中に外部の更新が届いても、その操作は失われない', () => {
  test.beforeEach(async ({ dayline }) => {
    await dayline.open();
  });

  // 押した要素が、離す前に作り直されると click が成立しない。押している間は更新を受け取っても描かず、離したあとに描く。
  async function updateWhilePressed(dayline, vault, press) {
    await press();
    const echo = dayline.page.waitForResponse((r) => r.url().endsWith('/api/state')); // Obsidian 側の保存 → 通知 (SSE) → 状態の取り直し
    vault.editNote((s) => s.replace('メモ付きのタスク', '外から書き換えたタスク'));
    await echo;
    await dayline.nextFrames(); // 取り直しの結果がページに処理された (押したままの状態で)
    await dayline.release();
  }

  test('パターン: チェックを押している最中に外部の更新が届いても、離したときにチェックが入り、更新もそのあと描かれる', async ({ dayline, vault }) => {
    const title = '折り返さない短いタイトル';
    await updateWhilePressed(dayline, vault, () => dayline.pressDown(dayline.taskCheck(title)));
    await expect(dayline.taskCheck(title)).toBeChecked();
    await expect(dayline.task('外から書き換えたタスク')).toBeVisible();
    await expect.poll(() => vault.note()).toMatch(new RegExp(`\\[x\\] ${title}`));
  });

  test('パターン: 編集ボタンを押している最中に外部の更新が届いても、離したときに詳細ダイアログが開く', async ({ dayline, vault }) => {
    const row = dayline.task('折り返さない短いタイトル');
    await row.hover();
    await updateWhilePressed(dayline, vault, () => dayline.pressDown(row.getByTestId('task-edit')));
    await expect(dayline.itemDialog).toBeVisible();
    await expect(dayline.task('外から書き換えたタスク')).toBeVisible();
  });
});
