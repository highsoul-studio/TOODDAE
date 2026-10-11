import { test, expect } from '../fixtures.js';

test.describe('観点: 読み取り専用モード (READONLY=1)', () => {
  test('パターン: 編集・取消・セクション・追加の操作が出ず、チェックも押せない。Day line の予定も反応しない', async ({ dayline, readonlyServer, page }) => {
    await dayline.open({ url: readonlyServer.url });
    await expect(dayline.syncPill).toHaveAttribute('data-state', 'ro');
    for (const id of ['task-edit', 'task-cancel', 'task-tomorrow', 'task-today', 'section-add', 'section-edit']) await expect(page.getByTestId(id)).toHaveCount(0);
    await expect(dayline.quickInput).toBeDisabled();
    for (const check of await page.getByTestId('task-check').all()) await expect(check).toBeDisabled();
    await expect(dayline.dayPills.first()).not.toHaveAttribute('data-act', /.+/);
    await dayline.dayPills.first().click();
    await expect(dayline.itemDialog).toBeHidden();
  });

  test('パターン: 書き込み API は 403 で断られる', async ({ readonlyServer, request }) => {
    const res = await request.post(`${readonlyServer.url}/api/add`, { headers: { origin: readonlyServer.url }, data: { text: 'x' } });
    expect(res.status()).toBe(403);
  });
});
