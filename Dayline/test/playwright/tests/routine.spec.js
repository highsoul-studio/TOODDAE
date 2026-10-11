import { test, expect } from '../fixtures.js';

const mmdd = (iso) => iso.slice(5).replace('-', '/');

test.describe('観点: ルーティンの終了日 (until)', () => {
  test('パターン: 毎日 + 終了日 → 一覧のチップ・Day line・ダイアログ・テンプレート・最終日と翌日の挙動', async ({ dayline, vault, request, server }) => {
    await dayline.open();
    const headers = { 'x-tooddae-root': vault.rootId };
    const state = await (await request.get('/api/state', { headers })).json();
    const sweep = state.routine.flatMap((g) => g.items).find((x) => x.text === '掃除');
    const res = await request.post('/api/save', {
      headers: { origin: server.url, ...headers },
      data: { from: 'routine', to: 'routine', ref: { file: sweep.file, line: sweep.line, raw: sweep.raw, kind: 'routine' }, text: '11:00-12:00 掃除', repeat: { type: 'daily', until: vault.day(3) } },
    });
    expect(res.ok()).toBe(true);
    await dayline.page.reload();
    await expect(dayline.task('掃除', 'routine')).toContainText(`매일 ${mmdd(vault.day(3))}까지`);
    await expect(dayline.dayPill('掃除')).toBeVisible();
    await dayline.openEditDialog('掃除', 'routine');
    await expect(dayline.field('ts').getByTestId('time-input')).toHaveValue('11:00');
    await expect(dayline.field('te').getByTestId('time-input')).toHaveValue('12:00');
    await expect(dayline.field('until')).toContainText(vault.day(3).replaceAll('-', '/'));
    expect(vault.template()).toContain(`- [ ] 11:00-12:00 掃除 🔁 every day until ${vault.day(3)}`);
    expect(await vault.ensureDaily(vault.day(3))).toContain('11:00-12:00 掃除'); // 最終日は出る
    expect(await vault.ensureDaily(vault.day(4))).not.toContain('掃除'); // 翌日からは出ない
    expect(await vault.ensureDaily(vault.day(4))).toContain('朝会'); // ほかの項目は影響なし
  });

  test('パターン: ダイアログで終了日を選んで保存 → テンプレートに until が書かれる。空にして保存 → 外れる', async ({ dayline, vault }) => {
    await dayline.open();
    await dayline.openEditDialog('日報', 'routine');
    await dayline.field('until').getByTestId('date-button').click();
    await dayline.calDay(vault.day(2)).click();
    await expect(dayline.field('until')).toContainText(vault.day(2).replaceAll('-', '/'));
    await dayline.saveDialog();
    await expect.poll(() => vault.template()).toContain(`- [ ] 日報 🔁 every day until ${vault.day(2)}`);
    await expect(dayline.task('日報', 'routine')).toContainText(`매일 ${mmdd(vault.day(2))}까지`);
    await dayline.openEditDialog('日報', 'routine');
    await dayline.field('until').getByTestId('date-clear').click();
    await dayline.saveDialog();
    await expect.poll(() => vault.template()).toMatch(/- \[ \] 日報\n/);
    expect(vault.template()).not.toContain('日報 🔁');
  });
});

test.describe('観点: ルーティンの削除 (✕ = 本当に削除)', () => {
  test('パターン: 確認文 → 돌아가기 は何も変えない → 루틴 삭제 で今日の行とテンプレートが消え、明日のノートに出ず、前日のノートは残る', async ({ dayline, vault }) => {
    await dayline.open();
    const row = dayline.task('GPS', 'routine');
    await row.hover();
    await expect(row.getByTestId('task-cancel')).toHaveAccessibleName('루틴 삭제');
    await dayline.deleteRoutine('GPS');
    await expect(dayline.confirmDialog.getByTestId('confirm-title')).toHaveText('이 루틴을 삭제하시겠습니까?');
    await expect(dayline.confirmDialog.getByTestId('confirm-body')).toContainText('내일부터는 나타나지 않아요');
    await expect(dayline.confirmDialog.getByTestId('confirm-body')).toContainText('지난 날짜의 노트는 그대로');
    await expect(dayline.confirmDialog.getByTestId('confirm-body')).not.toContainText('다시 나타'); // 「戻ってくる」と言ってはいけない
    await dayline.confirm(false);
    expect(vault.note()).toContain('- [ ] GPS(KPI・KGI)の明確化'); // 돌아가기: 変わらない
    expect(vault.template()).toContain('GPS(KPI・KGI)の明確化');
    await dayline.deleteRoutine('GPS');
    await dayline.confirm(true);
    await expect.poll(() => vault.note()).not.toContain('GPS(KPI・KGI)'); // [-] も残さず消える
    expect(vault.template()).not.toContain('GPS(KPI・KGI)');
    await expect(dayline.toasts.first()).toContainText('내일부터는 나타나지 않아요');
    await expect(dayline.task('GPS', 'routine')).toHaveCount(0);
    const tomorrow = await vault.ensureDaily(vault.day(1));
    expect(tomorrow).not.toContain('GPS');
    expect(tomorrow).toContain('朝会');
    expect(vault.note(vault.day(-1))).toContain('- [x] GPS(KPI・KGI)の明確化'); // 前日のノートは残る
  });

  test('パターン: 詳細ダイアログの赤いボタンも「루틴 삭제」で、同じ確認を通る', async ({ dayline, vault }) => {
    await dayline.open();
    await dayline.openEditDialog('掃除', 'routine');
    await expect(dayline.danger).toHaveText('루틴 삭제');
    await dayline.danger.click();
    await dayline.confirm(true);
    await expect(dayline.itemDialog).toBeHidden();
    await expect.poll(() => vault.template()).not.toContain('掃除');
  });
});

test.describe('観点: ルーティンの追加と変換', () => {
  test('パターン: ダイアログから「毎週 月・金」のルーティンを作ると、テンプレートに書かれる', async ({ dayline, vault }) => {
    await dayline.open();
    await dayline.openAddDialog();
    await dayline.routineBox.check();
    await dayline.textField.fill('週次レビュー');
    await dayline.pickOption('repeat', 'weekly');
    await dayline.setWeekdays([0, 4]);
    await dayline.saveDialog();
    await expect.poll(() => vault.template()).toContain('- [ ] 週次レビュー 🔁 every week on Monday, Friday');
  });

  test('パターン: タスク → ルーティンに変換すると、元のタスクは消えてテンプレートに入る', async ({ dayline, vault }) => {
    await dayline.open();
    await dayline.openEditDialog('折り返さない短いタイトル');
    await dayline.routineBox.check();
    await dayline.saveDialog();
    await expect.poll(() => vault.template()).toContain('折り返さない短いタイトル');
    await expect(dayline.task('折り返さない短いタイトル', 'tasks')).toHaveCount(0);
    await expect(dayline.task('折り返さない短いタイトル', 'routine')).toBeVisible();
  });
});
