import { test, expect } from '../fixtures.js';

// 過去に「時刻付きの行だけ取り消し線が描かれない」不具合があった (Day line のピルが同じ data-id を持つ)。
const PATTERNS = [
  ['時刻なし', 'とても長いタイトルのタスクで', false],
  ['時刻付き (Day line にピルがある)', '時刻付きのタスク', true],
  ['ルーティン', '日報', false],
];

test.describe('観点: チェックを押すと取り消し線が文の左から描かれ、md に保存される', () => {
  for (const [label, title, timed] of PATTERNS) {
    test(`パターン: ${label}`, async ({ dayline, vault }) => {
      await dayline.open();
      await expect(dayline.dayPill(title)).toHaveCount(timed ? 1 : 0);
      const panel = title === '日報' ? 'routine' : 'tasks';
      const r = await dayline.sampleStrike(title, panel);
      expect(r.mid, '0% と 100% の間の途中経過のフレーム数 (即時なら 0)').toBeGreaterThanOrEqual(3);
      expect(r.spanMs, '描き始めから描き終わりまでの ms').toBeGreaterThan(300);
      expect(r.spanMs).toBeLessThan(900);
      expect(r.ended, '最後は 100%').toBe(100);
      await expect.poll(() => vault.note()).toMatch(new RegExp(`^- \\[x\\] .*${title.slice(0, 6)}.* ✅ ${vault.today}`, 'm'));
    });
  }

  test('パターン: 視覚効果を減らす設定では即座に引かれる (アニメなし) が、保存は同じ', async ({ dayline, page, vault }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dayline.open();
    const r = await dayline.sampleStrike('折り返さない短いタイトル', 'tasks');
    expect(r.mid).toBe(0);
    expect(r.ended).toBe(100);
    await expect.poll(() => vault.note()).toMatch(/^- \[x\] 折り返さない短いタイトル/m);
  });

  test('パターン: チェックを外すと取り消し線は右から左へ滑らかに消える', async ({ dayline }) => {
    await dayline.open();
    const result = await dayline.sampleUnstrike('完了済みのタスク', 'tasks');
    expect(result.mid).toBeGreaterThanOrEqual(3);
    expect(result.ended).toBe(0);
    for (let i = 1; i < result.sizes.length; i++) expect(result.sizes[i]).toBeLessThanOrEqual(result.sizes[i - 1] + .01);
  });

  test('パターン: reduced motion에서는 체크 해제선도 즉시 사라진다', async ({ dayline, page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dayline.open();
    const result = await dayline.sampleUnstrike('完了済みのタスク', 'tasks');
    expect(result.mid).toBe(0);
    expect(result.ended).toBe(0);
  });

  test('パターン: 描いている途中で保存通知による再描画が来ても、線が途切れず単調に伸びる', async ({ dayline }) => {
    await dayline.open();
    const { sizes } = await dayline.sampleStrike('折り返さない短いタイトル', 'tasks', 1600);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i], `幅が戻った (${sizes[i - 1]} → ${sizes[i]})`).toBeGreaterThanOrEqual(sizes[i - 1] - 0.01);
  });
});
