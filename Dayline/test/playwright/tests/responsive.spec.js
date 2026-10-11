import { test, expect } from '../fixtures.js';

// 3 列 (≥1181px) → 2 列 → 1 列 (≤760px)。どの幅でも横スクロールが出ず、ダイアログが画面に収まる
const WIDTHS = [[1440, 3], [1280, 3], [1100, 2], [900, 2], [700, 1], [480, 1], [375, 1]];

test.describe('観点: 画面幅ごとのレイアウト', () => {
  test('パターン: 좁은 화면 Day line은 스크롤 가능하지만 scrollbar는 보이지 않는다', async ({dayline,page})=>{await page.setViewportSize({width:375,height:800});await dayline.open();expect(await dayline.dayLineScrollProbe()).toEqual({scrollbar:'none',left:120,scrollable:true});});
  for (const [width, columns] of WIDTHS) {
    test(`パターン: 幅 ${width}px (${columns} 列) — 横スクロールなし・ダイアログが収まる`, async ({ dayline, page }) => {
      await page.setViewportSize({ width, height: 800 });
      await dayline.open();
      expect(await dayline.hasHorizontalScroll(), '横スクロールが出ている').toBe(false);
      const xs = await Promise.all(['tasks', 'routine', 'side'].map(async (p) => Math.round((await dayline.panel(p).boundingBox()).x)));
      expect(new Set(xs).size, `列の数 (x 座標 ${xs})`).toBe(columns);
      await dayline.openEditDialog('時刻付きのタスク');
      const box = await dayline.itemDialog.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(await dayline.overflowsHorizontally(dayline.itemDialog), 'ダイアログの中が横にあふれている').toBe(false);
    });
  }
});
