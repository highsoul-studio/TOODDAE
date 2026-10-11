import { test, expect } from '../fixtures.js';

test.describe('観点: 素早い連続操作でも、保存が欠けたり競合したりしない', () => {
  test.beforeEach(async ({ dayline }) => {
    await dayline.open();
  });

  test('パターン: 別々の 3 つのタスクを続けて素早く押すと、全部保存される (同じファイルへの並行書き込み)', async ({ dayline, vault }) => {
    for (const title of ['時刻付きのタスク', 'メモ付きのタスク', '折り返さない短いタイトル']) await dayline.taskCheck(title).click();
    await expect.poll(() => (vault.note().match(/^- \[x\] /gm) ?? []).length).toBe(4); // 3 つ + 最初から完了していた 1 つ
    await expect(dayline.toasts.filter({ hasText: /競合|conflict|충돌|変わっ|바뀌/ })).toHaveCount(0);
  });

  test('パターン: 同じチェックボックスのダブルクリック → 最終的に元の状態で、競合の通知は出ない', async ({ dayline, vault }) => {
    const title = '折り返さない短いタイトル';
    await dayline.taskCheck(title).dblclick();
    await expect(dayline.taskCheck(title)).not.toBeChecked();
    await expect.poll(() => vault.note()).toContain(`- [ ] ${title} ⏳ ${vault.today}`);
    expect(vault.note()).not.toMatch(new RegExp(`\\[x\\] ${title}`));
    await expect(dayline.toasts).toHaveCount(0);
  });

  test('パターン: 状態の取得が遅れて古い内容が届いても、押した結果は画面で巻き戻らない', async ({ dayline, vault }) => {
    const title = '折り返さない短いタイトル';
    await dayline.delayStateResponses(500, 1500); // 1 回目の取り直しは 500ms 遅れて古くなる。そのあとの取り直し (新しい内容) はもっと遅れて届く
    const echo = dayline.page.waitForRequest((r) => r.url().endsWith('/api/state')); // 1 回目の保存の通知 (SSE) で、取り直しが始まる
    await dayline.taskCheck(title).click(); // 完了にする
    await echo;
    await dayline.taskCheck(title).click(); // 取り直しの応答を待っている間に、もう一度押して未完了へ戻す
    const states = await dayline.sampleChecked(title, 'tasks');
    expect(states.filter(Boolean), '未完了へ戻したあとに、完了へ巻き戻ったフレーム').toHaveLength(0);
    await expect.poll(() => vault.note()).toContain(`- [ ] ${title}`);
    await dayline.stopDelayingState();
  });

  test('パターン: 同じチェックボックスを 5 回続けて押すと、最後の状態 (完了) で止まる', async ({ dayline, vault }) => {
    const title = '折り返さない短いタイトル';
    for (let i = 0; i < 5; i++) await dayline.taskCheck(title).click();
    await expect(dayline.taskCheck(title)).toBeChecked();
    await expect.poll(() => vault.note()).toMatch(new RegExp(`\\[x\\] ${title}`));
    await expect(dayline.toasts).toHaveCount(0);
  });
});
