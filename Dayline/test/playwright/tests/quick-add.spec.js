import { test, expect } from '../fixtures.js';

test.describe('観点: 上部の入力欄からの追加', () => {
  test.beforeEach(async ({ dayline }) => {
    await dayline.open();
  });
  test('パターン: placeholder는 번역 pool 중 하나로 유지되고 입력 중에는 바뀌지 않으며 추가 후 새 문구가 된다', async ({ dayline }) => {
    const ko=['할 일을 추가하고 Enter','⌘K를 두 번 눌러 세부 설정','오늘 할 일을 추가해 보세요','10:00 회의 준비','떠오른 일을 바로 추가'];
    const before=await dayline.quickInput.getAttribute('placeholder');
    expect(ko).toContain(before);
    await dayline.quickInput.fill('placeholder stability');
    expect(await dayline.quickInput.getAttribute('placeholder')).toBe(before);
    await dayline.quickInput.press('Enter');
    await expect.poll(()=>dayline.quickInput.getAttribute('placeholder')).not.toBe(before);
    const after=await dayline.quickInput.getAttribute('placeholder');
    expect(ko).toContain(after); expect(after).not.toBe(before);
    await dayline.langButton.click(); await dayline.popover.getByRole('option',{name:'English'}).click();
    await expect(dayline.langButton).toContainText('English'); await dayline.ready({withTasks:false}); // 言語の切り替えは再読み込みを伴うので、終わってから読む
    expect(['Add a task and press Enter','Press ⌘K twice for details','Add something for today','10:00 Prepare for the meeting','Capture the next thing to do']).toContain(await dayline.quickInput.getAttribute('placeholder'));
  });

  test('パターン: 文だけ入力して Enter → 今日のタスク (開始・締切 = 今日) に入る', async ({ dayline, vault }) => {
    await dayline.quickInput.fill('買い物リスト作成');
    await dayline.quickInput.press('Enter');
    await expect(dayline.task('買い物リスト作成', 'tasks')).toBeVisible();
    expect(vault.note()).toContain(`- [ ] 買い物リスト作成 ⏳ ${vault.today} 📅 ${vault.today}`);
    await expect(dayline.quickInput).toHaveValue('');
  });

  test('パターン: 文中に 📅 を書いたときは、その日付が優先される (今日で上書きしない)', async ({ dayline, vault }) => {
    await dayline.quickInput.fill(`見積り 📅 ${vault.day(10)}`);
    await dayline.quickInput.press('Enter');
    await expect.poll(() => vault.inbox()).toContain(`- [ ] 見積り 📅 ${vault.day(10)}`);
    expect(vault.inbox()).not.toMatch(/見積り.*⏳/);
  });

  test('パターン: ⌘/Ctrl+K で入力欄にフォーカスが移る', async ({ dayline, page }) => {
    await page.keyboard.press('ControlOrMeta+K');
    await expect(dayline.quickInput).toBeFocused();
  });
});

test.describe('観点: ⌘/Ctrl+K — 1 回は入力欄へ、続けて 2 回は日付や優先度を決める詳細ダイアログ', () => {
  const press = (page) => page.keyboard.press('ControlOrMeta+K');

  test('パターン: 1 回だけなら、入力欄にフォーカスが移るだけでダイアログは開かない', async ({ dayline, page }) => {
    await dayline.open();
    await press(page);
    await expect(dayline.quickInput).toBeFocused();
    await expect(dayline.itemDialog).toBeHidden();
  });

  test('パターン: 続けて 2 回押すと、追加の詳細ダイアログが開く (入力欄に書いた文は持っていかれる)', async ({ dayline, page, vault }) => {
    await dayline.open();
    await dayline.quickInput.fill('会議の準備');
    await press(page);
    await press(page);
    await expect(dayline.itemDialog).toBeVisible();
    await expect(dayline.textField).toHaveValue('会議の準備');
    await expect(dayline.dialogTitle).toBeFocused();
    await dayline.tab();
    await expect(dayline.textField).toBeFocused();
    await dayline.saveDialog();
    await expect.poll(() => vault.note()).toContain('- [ ] 会議の準備');
    await expect(dayline.quickInput).toHaveValue(''); // 追加したら入力欄は空になる (横のボタンから開いたときと同じ)
  });

  test('パターン: 間が空くと (500ms より後) 2 回目は 1 回目として数え、ダイアログは開かない', async ({ dayline, page }) => {
    await page.clock.install(); // ブラウザの時計を自分で進める (待ち時間を使わずに「間が空いた」状態を作る)
    await dayline.open();
    await press(page);
    await page.clock.fastForward(1000);
    await press(page);
    await expect(dayline.itemDialog).toBeHidden();
    await expect(dayline.quickInput).toBeFocused();
  });

  test('パターン: 押しっぱなしの自動リピートは、2 回と数えない', async ({ dayline, page }) => {
    await dayline.open();
    await page.keyboard.down('ControlOrMeta');
    await page.keyboard.down('k');
    await page.keyboard.down('k'); // 押したまま = repeat
    await page.keyboard.down('k');
    await page.keyboard.up('k');
    await page.keyboard.up('ControlOrMeta');
    await expect(dayline.quickInput).toBeFocused();
    await expect(dayline.itemDialog).toBeHidden();
  });

  test('パターン: ダイアログが開いている間は、2 回押しても入力中の内容は作り直されない', async ({ dayline, page }) => {
    await dayline.open();
    await dayline.openEditDialog('折り返さない短いタイトル');
    await dayline.textField.fill('書きかけの内容');
    await press(page);
    await press(page);
    await expect(dayline.itemDialog).toBeVisible();
    await expect(dayline.textField).toHaveValue('書きかけの内容');
  });

  test('パターン: 読み取り専用のときは、2 回押しても開かない', async ({ dayline, page, readonlyServer }) => {
    await dayline.open({ url: readonlyServer.url });
    await press(page);
    await press(page);
    await expect(dayline.itemDialog).toBeHidden();
  });

  test('パターン: 詳細ボタンの説明に「⌘K 2 回」の案内が出る (4 言語)', async ({ dayline }) => {
    for (const [lang, hint] of [['ja', '⌘K を 2 回'], ['ko', '⌘K 두 번'], ['en', '⌘K twice'], ['zh', '⌘K 两次']]) {
      await dayline.open({ lang });
      await expect(dayline.quickMore).toHaveAccessibleName(new RegExp(hint));
      expect((await dayline.tooltipFor(dayline.quickMore)).text).toMatch(new RegExp(hint));
    }
  });
});
