import { test, expect } from '../fixtures.js';
import { overlappingPairs } from '../helpers/geometry.js';

test.describe('観点: 壊れやすい入力 — 文字として安全に表示する', () => {
  test('パターン: HTML やスクリプトを含む題名・メモ・セクション名は、文字のまま表示され、実行されない', async ({ dayline, vault, page }) => {
    vault.editNote((s) => s.replace('## 今日のタスク\n', `## 今日のタスク\n- [ ] <img src=x onerror="window.__xss=1"> と <script>window.__xss=2</script> ⏳ ${vault.today}\n  <b>太字?</b> & <i>x</i> <svg onload="window.__xss=3">\n### <u>下線</u>セクション\n`));
    await dayline.open();
    await expect(dayline.taskTitle('<img src=x')).toContainText('<script>window.__xss=2</script>');
    await expect(dayline.taskMemo('<img src=x')).toContainText('<b>太字?</b>');
    await expect(dayline.panel('tasks')).toContainText('<u>下線</u>セクション');
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    // 勝手に要素へ解釈されていない: 題名には取り消し線用の span だけ、メモとセクション名には子要素が無い
    await expect(dayline.injectedMarkup(dayline.taskTitle('<img src=x'))).toHaveCount(0);
    await expect(dayline.childElements(dayline.taskMemo('<img src=x'))).toHaveCount(0);
    await expect(dayline.childElements(page.getByTestId('section-name').filter({ hasText: '<u>' }))).toHaveCount(0);
  });

  test('パターン: リンク — markdown リンクと URL は新しいタブで安全に開き、[[ノート]] は Obsidian を開く。javascript: は文字のまま', async ({ dayline, vault, page }) => {
    vault.editNote((s) => s.replace('## 今日のタスク\n', `## 今日のタスク\n- [ ] リンク確認 [公式](https://example.com/a?b=1) と https://example.org/x と [[別のノート]] と [罠](javascript:alert(1)) ⏳ ${vault.today}\n`));
    await dayline.open();
    const title = dayline.taskTitle('リンク確認');
    const web = title.getByRole('link', { name: '公式' });
    await expect(web).toHaveAttribute('href', 'https://example.com/a?b=1');
    await expect(web).toHaveAttribute('target', '_blank');
    await expect(web).toHaveAttribute('rel', /noopener/);
    await expect(web).toHaveAttribute('rel', /noreferrer/);
    await expect(title.getByRole('link', { name: 'example.org/x' })).toHaveAttribute('href', 'https://example.org/x');
    await expect(title.getByRole('link', { name: '別のノート' })).toHaveAttribute('href', /^obsidian:\/\/open\?vault=.+&file=%E5%88%A5%E3%81%AE%E3%83%8E%E3%83%BC%E3%83%88$/);
    await expect(title).toContainText('[罠](javascript:alert(1))'); // リンクにならず、文字のまま
    await expect(dayline.injectedMarkup(title)).toHaveCount(0);
    expect(await page.evaluate(() => window.__x)).toBeUndefined();
  });

  test('パターン: 絵文字・結合文字・サロゲートペアも崩れず、編集して保存しても元のまま', async ({ dayline, vault }) => {
    const title = '🚀 出発 👨‍👩‍👧 家族 é(e+´) 𠮷野家';
    vault.editNote((s) => s.replace('## 今日のタスク\n', `## 今日のタスク\n- [ ] ${title} ⏳ ${vault.today}\n  🧪 メモにも 𠮷\n`));
    await dayline.open();
    await expect(dayline.taskTitle('出発')).toContainText(title);
    const before = vault.note();
    await dayline.openEditDialog('出発');
    await expect(dayline.textField).toHaveValue(title);
    const saved=dayline.waitForPost('/api/save');
    await dayline.saveDialog();
    expect((await saved).status()).toBe(200);
    await expect.poll(()=>vault.note()).toBe(before);
  });
});

test.describe('観点: 長い・多い入力でも画面が崩れない', () => {
  for (const width of [1280, 375]) {
    test(`パターン: 区切りのない 300 文字の題名・メモ・セクション名 (幅 ${width}px) — 横にあふれない`, async ({ dayline, vault, page }) => {
      const blob = 'あ'.repeat(300);
      const latin = `https://example.com/${'x'.repeat(200)}`;
      vault.editNote((s) => s.replace('## 今日のタスク\n', `## 今日のタスク\n- [ ] ${blob} ⏳ ${vault.today}\n  ${latin}\n  ${blob}\n### ${blob.slice(0, 80)}\n`));
      await page.setViewportSize({ width, height: 800 });
      await dayline.open();
      expect(await dayline.hasHorizontalScroll(), '横スクロールが出ている').toBe(false);
      expect(await dayline.overflowingChildren('tasks'), '一覧の枠からはみ出した要素の数').toBe(0);
    });
  }

  test('パターン: 200 件のタスクでも、数秒以内に描画され、操作できる', async ({ dayline, vault }) => {
    vault.editNote((s) => s.replace('## 今日のタスク\n', `## 今日のタスク\n${Array.from({ length: 200 }, (_, i) => `- [ ] 大量${i + 1} ⏳ ${vault.today} 📅 ${vault.today}`).join('\n')}\n`));
    const t0 = Date.now();
    await dayline.open();
    await expect(dayline.task('大量200')).toBeVisible();
    expect(Date.now() - t0, '開くまでの ms (reload を含む)').toBeLessThan(6000);
    await dayline.taskCheck('大量200').click();
    await expect(dayline.taskCheck('大量200')).toBeChecked();
    await expect.poll(() => vault.note()).toContain(`- [x] 大量200 ⏳ ${vault.today} 📅 ${vault.today} ✅ ${vault.today}`);
  });

  test('パターン: 時刻が重なる予定でも、Day line の予定は重ならずに段に分かれる', async ({ dayline, vault }) => {
    vault.editNote((s) => s.replace('## 今日のタスク\n', `## 今日のタスク\n- [ ] 09:00-11:00 重なりA ⏳ ${vault.today}\n- [ ] 09:30-10:30 重なりB ⏳ ${vault.today}\n- [ ] 10:00-12:00 重なりC ⏳ ${vault.today}\n- [ ] 10:15-10:45 重なりD ⏳ ${vault.today}\n`));
    await dayline.open();
    const boxes = await dayline.dayPillBoxes(['重なりA', '重なりB', '重なりC', '重なりD']);
    expect(overlappingPairs(boxes), '重なっている予定の組 (番号)').toEqual([]);
  });
});

test.describe('観点: サーバが止まっても、戻れば自動で復帰する', () => {
  test.use({ allowedConsoleErrors: [/./] }); // サーバを止めるので、接続エラーのログは出てよい

  test('パターン: 落ちると「再接続中」になり、同じポートで戻ると自動で「同期中」に戻る (再読み込みなし)', async ({ spawnServer, dayline }) => {
    const first = await spawnServer();
    await dayline.open({ url: first.url });
    await expect(dayline.syncPill).toHaveAttribute('data-state', 'live');
    first.proc.kill();
    await expect(dayline.syncPill).toHaveAttribute('data-state', 'retry');
    await spawnServer({ port: Number(new URL(first.url).port) });
    await expect(dayline.syncPill).toHaveAttribute('data-state', 'live', { timeout: 15_000 });
    await expect(dayline.task('折り返さない短いタイトル')).toBeVisible();
  });
});
