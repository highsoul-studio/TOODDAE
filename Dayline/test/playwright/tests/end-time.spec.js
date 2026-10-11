import { test, expect } from '../fixtures.js';
import { overlappingPairs } from '../helpers/geometry.js';

// 終了だけの時刻 (〜12:00) = 締切の時刻。タスクもルーティンも、開始時刻なしで保存できる。
// 表示: 一覧・Day line とも終了の時刻だけを出す。Day line では終了の 1 時間前から終了までの幅を取り、右端を終了に揃える。長い題名は … で切る。
const add = (vault, ...lines) => vault.editNote((s) => s.replace('## 今日のタスク\n', `## 今日のタスク\n${lines.map((l) => `- [ ] ${l} ⏳ ${vault.today} 📅 ${vault.today}\n`).join('')}`));

test.describe('観点: ダイアログ — 終了時刻だけでタスクもルーティンも保存できる', () => {
  test.beforeEach(async ({ dayline }) => {
    await dayline.open();
  });

  test('パターン: タスクは終了時刻だけで保存でき、先頭に 〜HH:MM で書かれる。開き直すと終了欄にだけ入っている', async ({ dayline, vault }) => {
    const title = '折り返さない短いタイトル';
    await dayline.openEditDialog(title);
    await dayline.setTime('te', '12:00');
    await dayline.saveDialog();
    await expect.poll(() => vault.note()).toContain(`- [ ] 〜12:00 ${title} ⏳`);
    await dayline.openEditDialog(title);
    await expect(dayline.timeInput('ts')).toHaveValue('');
    await expect(dayline.timeInput('te')).toHaveValue('12:00');
    await expect(dayline.textField).toHaveValue(title); // 時刻は本文に混ざらない
  });

  test('パターン: 終了を消せば元に戻り、開始も入れると「開始-終了」の範囲になる', async ({ dayline, vault }) => {
    const title = '折り返さない短いタイトル';
    await dayline.openEditDialog(title);
    await dayline.setTime('te', '12:00');
    await dayline.saveDialog();
    await dayline.openEditDialog(title);
    await dayline.setTime('te', '');
    await dayline.saveDialog();
    await expect.poll(() => vault.note()).toContain(`- [ ] ${title} ⏳`);
    await dayline.openEditDialog(title);
    await dayline.setTime('ts', '11:00');
    await dayline.setTime('te', '12:00');
    await dayline.saveDialog();
    await expect.poll(() => vault.note()).toContain(`- [ ] 11:00-12:00 ${title} ⏳`);
  });

  test('パターン: 終了が開始以前なら、保存できない (タスクでも)', async ({ dayline, vault }) => {
    await dayline.openEditDialog('折り返さない短いタイトル');
    await dayline.setTime('ts', '12:00');
    await dayline.setTime('te', '11:00');
    await dayline.submit.click();
    await expect(dayline.formError).toBeVisible();
    expect(vault.note()).toContain('- [ ] 折り返さない短いタイトル ⏳');
  });

  test('パターン: 23:00→01:00 は締切日が翌日なら保存でき、同日へ戻すと保存できない', async ({ dayline, vault }) => {
    const title = '折り返さない短いタイトル';
    await dayline.openEditDialog(title);
    await dayline.setTime('ts', '23:00');
    await dayline.setTime('te', '01:00');
    await dayline.field('due').getByTestId('date-button').click();
    await dayline.calDay(vault.day(1)).click();
    await dayline.saveDialog();
    await expect.poll(() => vault.note()).toContain(`23:00-01:00 ${title} ⏳ ${vault.today} 📅 ${vault.day(1)}`);
    await dayline.openEditDialog(title);
    await dayline.field('due').getByTestId('date-button').click();
    await dayline.calDay(vault.today).click();
    await dayline.submit.click();
    await expect(dayline.formError).toBeVisible();
  });

  test('パターン: ルーティンも終了時刻だけ・開始だけ・時刻なしで保存でき、先頭に書かれる', async ({ dayline, vault }) => {
    await dayline.openEditDialog('日報', 'routine');
    await dayline.setTime('te', '12:00');
    await dayline.saveDialog();
    await expect.poll(() => vault.template()).toContain('- [ ] 〜12:00 日報');
    await dayline.openEditDialog('日報', 'routine');
    await expect(dayline.timeInput('ts')).toHaveValue('');
    await expect(dayline.timeInput('te')).toHaveValue('12:00');
    await dayline.setTime('te', '');
    await dayline.setTime('ts', '11:00');
    await dayline.saveDialog();
    await expect.poll(() => vault.template()).toContain('- [ ] 11:00 日報');
    await dayline.openEditDialog('日報', 'routine');
    await dayline.setTime('ts', '');
    await dayline.saveDialog();
    await expect.poll(() => vault.template()).toMatch(/- \[ \] 日報/);
  });

  test('パターン: 時刻が本文の途中・末尾にあっても、編集ダイアログの時刻欄に入る (一覧と同じ規則)。変えずに保存すれば本文はそのまま', async ({ dayline, vault }) => {
    vault.editNote((s) => s.replace('## 今日のタスク\n', `## 今日のタスク\n- [ ] 약 먹기 〜13:00 ⏳ ${vault.today} 📅 ${vault.today}\n`));
    await dayline.open();
    await dayline.openEditDialog('약 먹기');
    await expect(dayline.timeInput('ts')).toHaveValue('');
    await expect(dayline.timeInput('te')).toHaveValue('13:00');
    await expect(dayline.textField).toHaveValue('약 먹기');
    await dayline.saveDialog(); // 何も変えていない
    await expect.poll(() => vault.note()).toContain('- [ ] 약 먹기 〜13:00 ⏳');
    await dayline.openEditDialog('약 먹기');
    await dayline.setTime('te', '14:00');
    await dayline.saveDialog();
    await expect.poll(() => vault.note()).toContain('- [ ] 〜14:00 약 먹기 ⏳');
  });

  test('パターン: 時刻欄の下のヒントは、タスクでは「終了だけでよい」、ルーティンでは「どちらか一方・なしでもよい」に変わる', async ({ dayline }) => {
    await dayline.openAddDialog();
    await expect(dayline.hintTime).toContainText('종료 시간만 넣으면');
    await dayline.routineBox.check();
    await expect(dayline.hintTime).toContainText('시작만, 종료만');
    await dayline.routineBox.uncheck();
    await expect(dayline.hintTime).toContainText('종료 시간만 넣으면');
  });
});

test.describe('観点: 表示 — 一覧と Day line には終了の時刻だけが出る', () => {
  test('パターン: 終了だけのルーティンも、一覧に「〜13:00」と出て Day line にピルが載る', async ({ dayline, vault }) => {
    vault.editNote((s) => s.replace('## ルーティン\n', '## ルーティン\n- [ ] 〜13:00 약 먹기\n'));
    await dayline.open();
    await expect(dayline.dayPill('약 먹기')).toHaveCount(1);
    await expect(dayline.pillTime('약 먹기')).toHaveText('〜13:00');
  });

  test('パターン: 一覧の題名には「〜12:00」だけが出て、Day line のピルも「〜12:00」と題名を出す', async ({ dayline, vault }) => {
    add(vault, '〜12:00 提出資料');
    await dayline.open();
    await expect(dayline.taskTitle('提出資料')).toContainText('〜12:00');
    await expect(dayline.dayPill('提出資料')).toHaveCount(1);
    await expect(dayline.pillTime('提出資料')).toHaveText('〜12:00');
    await expect(dayline.dayPill('提出資料')).toHaveClass(/is-until/);
    expect(await dayline.pillTruncates('提出資料'), '短い題名は切れない').toBe(false);
  });

  test('パターン: ピルの右端は終了の目盛りに揃い、幅は 1 時間ぶん以上 (左は 1 時間以上前へ伸びる)', async ({ dayline, vault }) => {
    add(vault, '〜12:00 提出資料');
    await dayline.open();
    const [box] = await dayline.dayPillBoxes(['提出資料']);
    const [x12, x13] = [await dayline.hourX(12), await dayline.hourX(13)];
    expect(Math.abs(box.x + box.width - x12), 'ピルの右端と 12 時の目盛りのずれ (px)').toBeLessThan(2);
    expect(box.width, '1 時間ぶんの幅 (px) 以上').toBeGreaterThanOrEqual(x13 - x12 - 1);
    expect(box.x, '左へ伸びている').toBeLessThan(x12 - (x13 - x12) + 1);
  });

  test('パターン: 長い題名は260pxで省略され、全文はcustom tooltipに残る', async ({ dayline, vault }) => {
    const long = '四半期の経営会議に出す全社横断のすり合わせ資料をまとめて関係者へ共有するための準備作業';
    add(vault, `〜15:00 ${long}`);
    await dayline.open();
    const [box] = await dayline.dayPillBoxes([long.slice(0, 10)]);
    expect(box.width).toBeLessThanOrEqual(261);
    expect(await dayline.pillTruncates(long.slice(0, 10)), '切れて … になる').toBe(true);
    const tooltip=await dayline.tooltipFor(dayline.dayPill(long.slice(0,10)));expect(tooltip.text).toContain(long);expect(tooltip.width).toBeGreaterThan(0);expect(tooltip.height).toBeGreaterThan(0);
  });

  test('パターン: 朝早い終了 (〜07:30) でも、ピルが Day line の左端からはみ出して切れない', async ({ dayline, vault }) => {
    add(vault, '〜07:30 早朝の連絡');
    await dayline.open();
    const [box] = await dayline.dayPillBoxes(['早朝の連絡']);
    const line = await dayline.dayLineBox();
    expect(box.x).toBeGreaterThanOrEqual(line.x - 0.5);
    await expect(dayline.pillTime('早朝の連絡')).toHaveText('〜07:30');
  });

  test('パターン: 同じ終了の項目や、範囲のある予定と重なっても、ピルは段に分かれて重ならない', async ({ dayline, vault }) => {
    add(vault, '〜12:00 提出A', '〜12:00 提出B', '11:30-12:30 会議C', '〜12:15 提出D');
    await dayline.open();
    const boxes = await dayline.dayPillBoxes(['提出A', '提出B', '会議C', '提出D']);
    expect(overlappingPairs(boxes), '重なっている予定の組 (番号)').toEqual([]);
  });

  test('パターン: 完了にすると、ピルは薄くなる (開始のある予定と同じ)', async ({ dayline, vault }) => {
    add(vault, '〜12:00 提出資料');
    await dayline.open();
    await dayline.taskCheck('提出資料').click();
    await expect(dayline.dayPill('提出資料')).toHaveClass(/is-done/);
  });

  test('パターン: ピルを押すと、その項目の詳細ダイアログが開き、終了欄に入っている', async ({ dayline, vault }) => {
    add(vault, '〜12:00 提出資料');
    await dayline.open();
    await dayline.dayPill('提出資料').click();
    await expect(dayline.itemDialog).toBeVisible();
    await expect(dayline.timeInput('te')).toHaveValue('12:00');
    await expect(dayline.timeInput('ts')).toHaveValue('');
  });
});

test.describe('観点: Overnight/multiday Day line 교집합', () => {
  test('パターン: 전날 23→오늘01은 00→01, 오늘23→내일01은 23→24로 그리고 연속 라벨을 표시한다', async ({ dayline, vault }) => {
    vault.write(`Daily/${vault.day(-1)}.md`, `## 今日のタスク\n- [ ] 23:00-01:00 전날 시작 ⏳ ${vault.day(-1)} 📅 ${vault.today}\n`);
    vault.editNote((s) => s.replace('## 今日のタスク\n', `## 今日のタスク\n- [ ] 23:00-01:00 오늘 시작 ⏳ ${vault.today} 📅 ${vault.day(1)}\n`));
    await dayline.open({ lang: 'ko' });
    await expect(dayline.dayPill('전날 시작')).toContainText('전날부터 계속');
    await expect(dayline.dayPill('오늘 시작')).toContainText('다음 날까지 계속');
    const [previous, next] = await dayline.dayPillBoxes(['전날 시작', '오늘 시작']);
    expect(previous.width).toBeGreaterThan(0);
    expect(next.width).toBeGreaterThan(0);
    expect(previous.x).toBeLessThan(next.x);
  });
});

test.describe('観点: 入力 — 上の入力欄や Obsidian で書いた「〜12:00」も同じに扱う', () => {
  test('パターン: 入力欄に「〜12:00 提出」と書いて Enter → 今日のタスクに入り、Day line に出る', async ({ dayline, vault }) => {
    await dayline.open();
    await dayline.quickInput.fill('〜12:00 提出');
    await dayline.quickInput.press('Enter');
    await expect(dayline.dayPill('提出')).toHaveCount(1);
    expect(vault.note()).toContain(`- [ ] 〜12:00 提出 ⏳ ${vault.today} 📅 ${vault.today}`);
  });

  test('パターン: 区切りの揺れ (半角の ~ / 全角の ～ / 1 桁の時) も終了だけの時刻として読む', async ({ dayline, vault }) => {
    add(vault, '~9:05 半角', '～23:59 全角');
    await dayline.open();
    await expect(dayline.pillTime('半角')).toHaveText('〜09:05');
    await expect(dayline.pillTime('全角')).toHaveText('〜23:59');
  });

  test('パターン: 入力欄の文章を「詳細」ダイアログへ持っていくと、先頭の 〜12:00 は終了欄に入る', async ({ dayline }) => {
    await dayline.open();
    await dayline.quickInput.fill('〜12:00 提出');
    await dayline.quickMore.click();
    await expect(dayline.timeInput('te')).toHaveValue('12:00');
    await expect(dayline.timeInput('ts')).toHaveValue('');
    await expect(dayline.textField).toHaveValue('提出');
  });
});

test.describe('観点: 通知 — 終了だけの時刻は、その時刻 (締切) の 10 分前から知らせる', () => {
  // 通知 (Notification) を差し替えて記録し、ブラウザの時計を 11:52 にして、20 秒おきの確認を 1 回走らせる
  async function remindAt(dayline, vault, page, time) {
    await page.addInitScript(() => {
      localStorage.setItem('notify', '1');
      window.__notes = [];
      window.Notification = class {
        static permission = 'granted';
        constructor(title, opts) {
          window.__notes.push({ title, body: opts.body });
        }
      };
    });
    await page.clock.install({ time: new Date(`${vault.today}T${time}:00`) });
    await dayline.open({ lang: 'ja' });
    await page.clock.runFor(21_000);
    return page.evaluate(() => window.__notes);
  }

  test('パターン: 〜12:00 は 11:52 に「締切まであと 8 分」(見出しは 〜12:00 と題名)', async ({ dayline, vault, page }) => {
    add(vault, '〜12:00 提出資料');
    expect(await remindAt(dayline, vault, page, '11:52')).toEqual([{ title: '〜12:00 提出資料', body: '締切まであと8分です' }]);
  });

  test('パターン: 開始のある予定は今まで通り「N 分後に開始します」', async ({ dayline, vault, page }) => {
    add(vault, '12:00 会議');
    expect(await remindAt(dayline, vault, page, '11:52')).toEqual([{ title: '12:00 会議', body: '8分後に開始します' }]);
  });

  test('パターン: 10 分より前には知らせない', async ({ dayline, vault, page }) => {
    add(vault, '〜12:00 提出資料');
    expect(await remindAt(dayline, vault, page, '11:30')).toEqual([]);
  });
});
