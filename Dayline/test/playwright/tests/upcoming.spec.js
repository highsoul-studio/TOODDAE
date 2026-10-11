import { test, expect } from '../fixtures.js';

const mmdd = (iso) => iso.slice(5).replace('-', '/');

test.describe('観点: 「今後の予定」の日付の列', () => {
  test('パターン: 내일・모레 は「相対名 / MM/DD」の 2 行、3 日以上先は MM/DD だけの 1 行。曜日は出さない', async ({ dayline, vault }) => {
    await dayline.open({ lang: 'ko' });
    await expect(dayline.upcomingDates).toHaveText([`내일 ${mmdd(vault.day(1))}`, `모레 ${mmdd(vault.day(2))}`, mmdd(vault.day(6)), mmdd(vault.day(10))], { useInnerText: true }); // 見た目の文字 (2 行 = 改行) で比べる
    expect(await dayline.upcomingDateLines()).toEqual([2, 2, 1, 1]);
    for (const text of await dayline.upcomingDates.allInnerTexts()) expect(text).not.toMatch(/[()（）]|[月火水木金土日]曜|[월화수목금토일]요일|[월화수목금토일]\)/);
  });

  test('パターン: 4 言語とも同じ構成 (相対名 + MM/DD)', async ({ dayline, vault }) => {
    for (const [lang, tomorrow] of [['ja', '明日'], ['en', 'Tomorrow'], ['zh', '明天']]) {
      await dayline.open({ lang });
      await expect(dayline.upcomingDates.first()).toHaveText(`${tomorrow} ${mmdd(vault.day(1))}`, { useInnerText: true });
    }
  });
});
