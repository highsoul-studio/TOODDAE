import { test, expect } from '../fixtures.js';

const T = '折り返さない短いタイトル'; // 日付 ⏳ 今日だけのタスク

test.describe('観点: 取り消しと締切の先送り — 元に戻せる', () => {
  test.beforeEach(async ({ dayline }) => {
    await dayline.open();
  });

  test('パターン: タスクの ✕ → 確認 → 一覧から消える ([-] と ❌ で残る) → 元に戻す で復活', async ({ dayline, vault }) => {
    const row = dayline.task(T, 'tasks');
    await row.hover();
    await row.getByTestId('task-cancel').click();
    await dayline.confirm(true);
    await expect(dayline.task(T)).toHaveCount(0);
    await expect.poll(() => vault.note()).toMatch(new RegExp(`^- \\[-\\] ${T}.* ❌ ${vault.today}`, 'm'));
    await dayline.toasts.getByTestId('toast-undo').click();
    await expect(dayline.task(T, 'tasks')).toBeVisible();
    await expect.poll(() => vault.note()).toContain(`- [ ] ${T} ⏳ ${vault.today}`);
    expect(vault.note()).not.toContain('❌');
  });

  test('パターン: 締切を1日延ばしても開始日は今日のまま、元に戻すと締切だけ消える', async ({ dayline, vault }) => {
    const row = dayline.task(T, 'tasks');
    await row.hover();
    await row.getByTestId('task-tomorrow').click();
    await expect(dayline.task(T, 'tasks')).toBeVisible();
    await expect.poll(() => vault.note()).toContain(`- [ ] ${T} ⏳ ${vault.today} 📅 ${vault.day(1)}`);
    await dayline.toasts.getByTestId('toast-undo').click();
    await expect(dayline.task(T, 'tasks')).toBeVisible();
    await expect.poll(() => vault.note()).toMatch(new RegExp(`^- \\[ \\] ${T} ⏳ ${vault.today}$`, 'm'));
  });

  test('パターン: 日付のない行의 마감만 연장하고 원복해도 인박스로 이동하지 않는다', async ({ dayline, vault }) => {
    vault.editNote((s) => s.replace('## 今日のタスク\n', '## 今日のタスク\n- [ ] 日付なしの行\n'));
    await expect(dayline.task('日付なしの行', 'tasks')).toBeVisible();
    const row = dayline.task('日付なしの行', 'tasks');
    await row.hover();
    await row.getByTestId('task-tomorrow').click();
    await expect(dayline.task('日付なしの行', 'tasks')).toBeVisible();
    await dayline.toasts.getByTestId('toast-undo').click();
    await expect(dayline.task('日付なしの行', 'tasks')).toBeVisible();
    await expect.poll(() => vault.note()).toMatch(/^- \[ \] 日付なしの行$/m);
    expect(vault.inbox()).not.toContain('日付なしの行');
  });

  test('パターン: 미래 due는 당기지 않고 기존 due 다음 날로 연장한다', async ({ dayline, vault }) => {
    vault.editNote((s) => s.replace('## 今日のタスク\n', `## 今日のタスク\n- [ ] 미래 마감 ⏳ ${vault.today} 📅 ${vault.day(4)}\n`));
    await expect(dayline.task('미래 마감', 'tasks')).toBeVisible();
    const row = dayline.task('미래 마감', 'tasks');
    await row.hover();
    await row.getByTestId('task-tomorrow').click();
    await expect.poll(() => vault.note()).toContain(`📅 ${vault.day(5)}`);
  });

  test('パターン: Postpone Undo도 비정규 공백/metadata 순서를 exact 복구한다', async ({ dayline, vault }) => {
    const original = `- [ ]   Keep  spacing  📅 ${vault.day(4)}   ⏫   ⏳  ${vault.today} ^keep`;
    vault.editNote((s) => s.replace('## 今日のタスク\n', `## 今日のタスク\n${original}\n  memo stays\n`));
    await dayline.open();
    const before = vault.note();
    const row = dayline.task('Keep spacing', 'tasks');
    await row.hover();
    await row.getByTestId('task-tomorrow').click();
    await dayline.toasts.getByTestId('toast-undo').click();
    await expect.poll(() => vault.note()).toBe(before);
  });
});

test.describe('観点: Inbox/Upcoming の Today action', () => {
  test('パターン: Inbox의 memo/nested를 유지해 오늘로 옮기고 undo는 원문을 복구한다', async ({ dayline, vault }) => {
    const block = '- [ ] Today 대상\n  메모 한 줄\n  - [ ] nested 보존';
    vault.write('Inbox.md', `# Inbox\n\n${block}\n`);
    await dayline.open();
    const row = dayline.task('Today 대상', 'side');
    await row.hover();
    await row.getByTestId('task-today').click();
    await expect(dayline.task('Today 대상', 'tasks')).toBeVisible();
    await expect.poll(() => vault.inbox()).toContain(`- [ ] Today 대상 ⏳ ${vault.today}\n  메모 한 줄\n  - [ ] nested 보존`);
    await dayline.toasts.getByTestId('toast-undo').click();
    await expect.poll(() => vault.inbox()).toBe(`# Inbox\n\n${block}\n`);
  });

  test('パターン: Upcoming을 오늘로 옮길 때 과거 due는 오늘로 맞추고 undo는 두 날짜를 복구한다', async ({ dayline, vault }) => {
    const original = `- [ ] 날짜 조정 ⏳ ${vault.day(2)} 📅 ${vault.day(-1)}`;
    vault.write('Inbox.md', `# Inbox\n\n${original}\n`);
    await dayline.open();
    const row = dayline.task('날짜 조정', 'side');
    await row.hover();
    await row.getByTestId('task-today').click();
    await expect.poll(() => vault.inbox()).toContain(`⏳ ${vault.today} 📅 ${vault.today}`);
    await dayline.toasts.getByTestId('toast-undo').click();
    await expect.poll(() => vault.inbox()).toContain(original);
  });
});

test.describe('観点: 編集の往復 — 何も変えなければファイルは 1 バイトも変わらない', () => {
  for (const [title, panel] of [['時刻付きのタスク', 'tasks'], ['メモ付きのタスク', 'tasks'], ['完了済みのタスク', 'tasks'], ['朝会', 'routine'], ['来週の準備', 'side']]) {
    test(`パターン: ${title}`, async ({ dayline, vault }) => {
      await dayline.open();
      const before = { note: vault.note(), template: vault.template(), inbox: vault.inbox() };
      await dayline.openEditDialog(title, panel);
      await dayline.saveDialog();
      await expect(dayline.toasts.first()).toBeVisible(); // 保存の完了
      expect({ note: vault.note(), template: vault.template(), inbox: vault.inbox() }).toEqual(before);
    });
  }
});

test.describe('観点: タスクの編集 (優先度・日付・セクション)', () => {
  test.beforeEach(async ({ dayline }) => {
    await dayline.open();
  });

  test('パターン: 優先度「高」と締切日を選んで保存 → ⏫ と 📅 が書かれる', async ({ dayline, vault }) => {
    await dayline.openEditDialog(T);
    await dayline.pickOption('prio', 'high');
    await dayline.field('due').getByTestId('date-button').click();
    await dayline.calDay(vault.day(2)).click();
    await dayline.saveDialog();
    await expect.poll(() => vault.note()).toContain(`- [ ] ${T} ⏫ ⏳ ${vault.today} 📅 ${vault.day(2)}`);
  });

  test('パターン: 開始日を締切日より後にすると、締切日が開始日に追従する', async ({ dayline, vault }) => {
    await dayline.openEditDialog('メモ付きのタスク'); // ⏳ 今日 📅 今日
    await dayline.field('start').getByTestId('date-button').click();
    await dayline.calDay(vault.day(3)).click();
    await expect(dayline.field('due')).toContainText(vault.day(3).replaceAll('-', '/'));
  });

  test('パターン: セクション「仕事」へ移すと、ノートのそのセクションの下へ移動する', async ({ dayline, vault }) => {
    await dayline.openEditDialog(T);
    await dayline.pickOption('section', '仕事');
    await dayline.saveDialog();
    await expect(dayline.section('仕事').getByTestId('task').filter({ hasText: T })).toBeVisible();
    await expect.poll(() => vault.note()).toMatch(new RegExp(`### 仕事\\n(.*\\n)*?- \\[ \\] ${T}`));
  });

  test('パターン: 題名が空のままでは保存できず、エラーが出る', async ({ dayline, vault }) => {
    await dayline.openEditDialog(T);
    await dayline.textField.fill('');
    await dayline.submit.click();
    await expect(dayline.formError).toBeVisible();
    await expect(dayline.itemDialog).toBeVisible();
    expect(vault.note()).toContain(`- [ ] ${T}`);
  });
});

test.describe('観点: ルーティンの今日だけ / 変換', () => {
  test('パターン: 新規作成の繰り返しに「今日のみ」は無い (一度きりは普通のタスクにする)', async ({ dayline }) => {
    await dayline.open();
    await dayline.openAddDialog();
    await dayline.routineBox.check();
    await dayline.field('repeat').getByTestId('select-button').click();
    await expect(dayline.popover.getByRole('option')).toHaveCount(4); // 毎日 / 平日 / 毎週 / 毎月
    await expect(dayline.option('once')).toHaveCount(0);
  });

  test('パターン: テンプレートに無い (手書きの) 今日だけのルーティンは「오늘만」と出て、そのまま保存してもテンプレートは変わらない。繰り返しを選ぶとテンプレートに入る', async ({ dayline, vault }) => {
    vault.editNote((s) => s.replace('### G\n', '### G\n- [ ] 今日だけのルーティン\n'));
    await dayline.open();
    await expect(dayline.task('今日だけのルーティン', 'routine')).toContainText('오늘만');
    const template = vault.template();
    await dayline.openEditDialog('今日だけのルーティン', 'routine');
    await expect(dayline.field('repeat').getByTestId('select-button')).toContainText('오늘만');
    await dayline.saveDialog();
    expect(vault.template()).toBe(template);
    await dayline.openEditDialog('今日だけのルーティン', 'routine');
    await dayline.pickOption('repeat', 'daily');
    await dayline.saveDialog();
    await expect.poll(() => vault.template()).toContain('- [ ] 今日だけのルーティン');
  });

  test('パターン: ルーティン → タスクへ変換すると、今日のタスク (開始・締切 = 今日) になり、テンプレートの定義が消える', async ({ dayline, vault }) => {
    await dayline.open();
    await dayline.openEditDialog('日報', 'routine');
    await dayline.routineBox.uncheck();
    await dayline.submit.click();
    await dayline.confirm(true); // 保存するとき「ルーティンを外す = テンプレートの定義も消える」の確認が出る
    await expect(dayline.itemDialog).toBeHidden();
    await expect(dayline.task('日報', 'routine')).toHaveCount(0);
    await expect(dayline.task('日報', 'tasks')).toBeVisible();
    await expect.poll(() => vault.note()).toContain(`- [ ] 日報 ⏳ ${vault.today} 📅 ${vault.today}`);
    expect(vault.template()).not.toContain('日報');
  });
});

test.describe('観点: 表示の全体 (進捗・履歴・もっと見る・空の状態)', () => {
  test('パターン: 완료 task와 uncheck 후 Upcoming에서도 explicit start date chip을 계속 표시한다', async ({ dayline, vault }) => {
    const title='미래 개시 완료';vault.editNote(s=>s.replace('## 今日のタスク\n',`## 今日のタスク\n- [x] ${title} ⏳ ${vault.day(2)} ✅ ${vault.today}\n`));await dayline.open();await expect(dayline.task(title,'tasks')).toContainText(`개시 ${vault.day(2).slice(5).replace('-','/')}`);await dayline.taskCheck(title,'tasks').click();await expect(dayline.task(title,'side')).toContainText(`개시 ${vault.day(2).slice(5).replace('-','/')}`);
  });
  test('パターン: 完了の数は、チェックで増え、外すと戻る', async ({ dayline }) => {
    await dayline.open();
    const num = dayline.panel('hero').getByTestId('progress');
    const first = await num.innerText();
    await dayline.taskCheck(T).click();
    await expect.poll(() => num.innerText()).not.toBe(first);
    await dayline.taskCheck(T).click();
    await expect.poll(() => num.innerText()).toBe(first);
  });

  test('パターン: 履歴は 84 マスで、今日のマスに印が付く', async ({ dayline, page }) => {
    await dayline.open();
    await expect(page.getByTestId('heat-cell')).toHaveCount(84);
    await expect(dayline.todayHeatCell).toHaveCount(1);
  });

  test('パターン: 84일 heatmap은 0/부분/완료/future를 색상 외 aria text와 함께 표시한다', async ({ dayline, vault }) => {
    const rows = [
      ['- [ ] open', 1],
      ['- [x] one ✅ DATE', 1],
      ['- [x] one ✅ DATE\n- [ ] two\n- [ ] three', 1],
      ['- [x] one ✅ DATE\n- [x] two ✅ DATE\n- [ ] three', 1],
      [Array.from({ length: 100 }, (_, i) => `- [${i < 99 ? 'x' : ' '}] item${i}${i < 99 ? ' ✅ DATE' : ''}`).join('\n'), 1],
      ['- [x] done ✅ DATE\n- [-] canceled ❌ DATE', 1],
    ];
    rows.forEach(([body], index) => { const date = vault.day(-index - 2); vault.write(`Daily/${date}.md`, `## 今日のタスク\n${body.replaceAll('DATE', date)}\n`); });
    vault.write('Inbox.md', `${vault.inbox()}- [x] carried across midnight ⏳ ${vault.day(-1)} ✅ ${vault.today}\n`);
    await dayline.open();
    const cells = await dayline.heatSummary();
    expect(cells).toHaveLength(84);
    expect(new Set(cells.map((cell) => cell.level))).toEqual(new Set(['0', '1', '2', '3', '4']));
    expect(cells.every((cell) => cell.label && !/NaN|undefined/.test(cell.label))).toBe(true);
    expect(cells.some((cell) => cell.future)).toBe(true);
  });

  test('パターン: インボックスが 6 件を超えると「もっと見る」が出て、押すと全部出る', async ({ dayline, vault }) => {
    vault.write('Inbox.md', `# Inbox\n\n${Array.from({ length: 10 }, (_, i) => `- [ ] 溜まったメモ${i + 1}`).join('\n')}\n`);
    await dayline.open();
    await expect(dayline.panel('side').getByTestId('task').filter({ hasText: '溜まったメモ' })).toHaveCount(6);
    await dayline.panel('side').getByTestId('more').click();
    await expect(dayline.panel('side').getByTestId('task').filter({ hasText: '溜まったメモ' })).toHaveCount(10);
  });

  test('パターン: 何もない日でも、空の案内が出て、エラーにならない', async ({ dayline, vault, page }) => {
    vault.write('Inbox.md', '# Inbox\n');
    vault.editNote(() => '---\ndate: x\n---\n\n## 今日のタスク\n\n## ルーティン\n\n## メモ\n');
    await dayline.open({ withTasks: false });
    await expect(page.getByTestId('task')).toHaveCount(0);
    await expect(dayline.panel('tasks')).toContainText('오늘 할 일');
    await expect(dayline.panel('hero').getByTestId('progress')).toContainText('0');
  });
});
