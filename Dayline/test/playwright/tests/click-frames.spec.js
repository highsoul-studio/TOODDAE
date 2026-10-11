import { test, expect } from '../fixtures.js';

// 過去に「押した直後だけ、チェックボックスがタスク全体の中央へ飛ぶ」不具合があった (アニメ用クラスが .pop と衝突)。
// 定常状態ではなく、押した直後から再描画の後までの「全フレーム」を見る。
const PATTERNS = [
  ['優先度チップ + メモ付きの行', 'メモ付きのタスク', 'tasks'],
  ['時刻付きの行 (Day line にピルがある)', '時刻付きのタスク', 'tasks'],
  ['ルーティンの行 (メモ付き)', '朝会', 'routine'],
  ['今後の予定の行 (メモ付き)', '来週の準備', 'side'],
  ['折り返した長い題名の行', 'とても長いタイトルのタスクで', 'tasks'],
];

test.describe('観点: 押した直後もチェックボックスはタイトル行から動かない', () => {
  for (const [label, title, panel] of PATTERNS) {
    test(`パターン: ${label}`, async ({ dayline }) => {
      await dayline.open();
      const r = await dayline.sampleFrames(title, panel);
      expect(r.frames, '計測できたフレーム数').toBeGreaterThan(40);
      expect(r.offCentre, 'タイトルの中心からずれたフレーム').toBe(0);
      expect(r.nonStatic, 'position が static でないフレーム (流れから外れた)').toBe(0);
      expect(r.wrongRadius, '角丸が 6px でないフレーム (丸くなった)').toBe(0);
      expect(r.shadow, '影が付いたフレーム').toBe(0);
    });
  }

  test('パターン: チェックを外す操作でも同じ', async ({ dayline }) => {
    await dayline.open();
    const r = await dayline.sampleFrames('完了済みのタスク', 'tasks');
    expect(r.offCentre + r.nonStatic + r.wrongRadius + r.shadow).toBe(0);
  });
});
