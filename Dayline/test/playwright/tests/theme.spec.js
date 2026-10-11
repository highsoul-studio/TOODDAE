import { test, expect } from '../fixtures.js';
import { decodePng, hue, contrast } from '../helpers/pixels.js';

const POINTS = [[640, 20], [20, 400], [1200, 760]]; // 背景だけの場所 (上部バー・左端・右下)

// 画面の遷移 (テーマ切り替えのふわっとした入れ替え、CSS transition) が全部終わるまで待つ
const settled = (page) => page.waitForFunction(() => document.getAnimations().length === 0);
async function pixels(page, points) {
  const dpr = await page.evaluate(() => devicePixelRatio);
  const png = decodePng(await page.screenshot());
  return points.map(([x, y]) => png.at(Math.round(x * dpr), Math.round(y * dpr)));
}

test.describe('観点: テーマ (ダーク / ライト) の切り替え', () => {
  test('パターン: ボタンでライトへ切り替わり、太陽の絵になり、選択が保存されて再読み込みでも残る', async ({ dayline, page }) => {
    await dayline.open({ theme: 'dark' });
    await expect(dayline.root).toHaveAttribute('data-theme', 'dark');
    await expect(dayline.themeIcon('moon')).toHaveCSS('opacity', '1');
    await dayline.themeToggle.click();
    await expect(dayline.root).toHaveAttribute('data-theme', 'light');
    await expect(dayline.themeIcon('sun')).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');
    await page.reload();
    await expect(dayline.root).toHaveAttribute('data-theme', 'light'); // 描画前に決まる (ちらつかない)
    await dayline.themeToggle.click();
    await expect(dayline.root).toHaveAttribute('data-theme', 'dark'); // もう一度で戻る
  });

  test('パターン: 視覚効果を減らす設定でも切り替わる (ふわっとした入れ替えを使わない経路)', async ({ dayline, page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dayline.open({ theme: 'dark' });
    await dayline.themeToggle.click();
    await expect(dayline.root).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('観点: 実際に描かれた色 (ダーク = 黒 + 紫 / ライト = 白系 + 橙〜黄)', () => {
  test('パターン: ダークの背景は暗く、ハイライトは紫', async ({ dayline, page }) => {
    await dayline.open({ theme: 'dark' });
    await settled(page);
    for (const p of await pixels(page, POINTS)) expect(Math.max(...p), `背景が明るすぎる: ${p}`).toBeLessThanOrEqual(30);
    const box = await dayline.syncDot.boundingBox();
    const [dot] = await pixels(page, [[box.x + box.width / 2, box.y + box.height / 2]]);
    expect(hue(dot), `ハイライトの色相: ${dot}`).toBeGreaterThanOrEqual(240);
    expect(hue(dot)).toBeLessThanOrEqual(280);
  });

  test('パターン: ライトの背景は白系 (全チャンネル 225 以上)、ハイライトは橙〜黄 (色相 25–55°)', async ({ dayline, page }) => {
    await dayline.open({ theme: 'light' });
    await settled(page);
    for (const p of await pixels(page, POINTS)) expect(Math.min(...p), `背景が白系でない: ${p}`).toBeGreaterThanOrEqual(225);
    const box = await dayline.syncDot.boundingBox();
    const [dot] = await pixels(page, [[box.x + box.width / 2, box.y + box.height / 2]]);
    expect(hue(dot), `ハイライトの色相: ${dot}`).toBeGreaterThanOrEqual(25);
    expect(hue(dot)).toBeLessThanOrEqual(55);
  });
});

test.describe('観点: 文字のコントラスト (WCAG 4.5:1) がトークンの値で満たされている', () => {
  for (const theme of ['dark', 'light']) {
    test(`パターン: ${theme}`, async ({ dayline }) => {
      await dayline.open({ theme });
      const t = await dayline.tokenColours(['--text-1', '--text-2', '--text-3', '--accent-text', '--on-accent', '--accent', '--on-danger', '--danger', '--n-1', '--n-2', '--n-3', '--coral', '--amber']);
      for (const fg of ['--text-1', '--text-2', '--text-3']) for (const bg of ['--n-1', '--n-2', '--n-3']) expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      for (const [fg, bg] of [['--accent-text', '--n-2'], ['--on-accent', '--accent'], ['--on-danger', '--danger'], ['--coral', '--n-2'], ['--amber', '--n-2']]) expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    });
  }
});
