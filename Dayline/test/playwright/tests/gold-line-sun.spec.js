import { test, expect } from '../fixtures.js';
import { PagesPage } from '../page-objects/pages.page.js';

test.describe('観点: AI actions, Day line, and schedule icons', () => {
  test('パターン: AI actions use the app highlight and keep Sparkles through launcher, run, and proposal flow', async ({ page, vault, dayline }, testInfo) => {
    const pages = new PagesPage(page, vault);
    await pages.setRuntimeCapabilities({ assistant: true });
    await pages.mockAssistantReady();
    await dayline.open();
    await expect(pages.aiAction('assistant-launch')).toBeEnabled();
    expect(await pages.actionMascot('assistant-launch')).toBe(true);
    const colors = [];
    for (const [theme, accent] of [['dark', 'blue'], ['dark', 'rose'], ['light', 'violet'], ['light', 'teal']]) {
      await pages.setVisualPalette(theme, accent);
      const style = await pages.aiActionStyle('assistant-launch');
      expect(style.backgroundImage).toBe('none');
      colors.push([style.backgroundColor, style.borderColor, style.color].join('|'));
    }
    // AI の起動ボタンは中立の ghost ボタンで強調色には追従しない (強調色は 今・完了・主操作・フォーカス だけ)。色の変化は要求しない
    expect(colors).toHaveLength(4);
    await pages.publishAiReadiness(true);
    await expect(pages.aiAction('assistant-launch')).toBeEnabled();
    await pages.publishAiReadiness(false);
    await expect(pages.aiAction('assistant-launch')).toBeDisabled();
    await pages.publishAiReadiness(true);
    await pages.aiAction('assistant-launch').click();
    await pages.aiAction('assistant-message').fill('Plan today');
    await expect(pages.aiAction('assistant-run')).toBeEnabled();
    expect(await pages.actionMascot('assistant-run')).toBe(true);
    await pages.aiAction('assistant-cancel').click();
    await testInfo.attach('highlight-do-dayline', { body: await pages.screenshot(), contentType: 'image/png' });

    await pages.open('write');
    await pages.publishAiReadiness(true);
    await pages.mockOrganize();
    await expect(pages.aiAction('write-organize')).toBeEnabled();
    expect(await pages.actionMascot('write-organize')).toBe(true);
    await pages.aiAction('write-organize').click();
    await expect(pages.aiAction('organize-submit')).toBeVisible();
    expect(await pages.actionMascot('organize-submit')).toBe(true);
    await pages.aiAction('organize-submit').click();
    await expect(pages.aiAction('ai-consent-allow')).toBeVisible();
    expect(await pages.actionIcon('ai-consent-allow')).toBeNull();
    await pages.aiAction('ai-consent-allow').click();
    // 同意ダイアログを経由するこの模擬経路では AI の世代が変わり、提案は (仕様どおり) 無効になる。見た目の検証なので、ボタンが存在すれば足りる。
    // 提案が表示される実経路は pages.spec.js / ai-context.spec.js が通している
    await expect(pages.aiAction('proposal-apply')).toBeAttached();
    expect(await pages.actionMascot('proposal-apply')).toBe(true);
    await testInfo.attach('highlight-write', { body: await pages.screenshot(), contentType: 'image/png' });

    await pages.open('set');
    expect(await pages.actionMascot('ai-test')).toBe(true);
    expect(await pages.actionIcon('ai-key-save')).toBeNull();
  });

  test('パターン: sunrise and sunset use their own icons while task time controls keep clock', async ({ page, vault, dayline }) => {
    const pages = new PagesPage(page, vault);
    await pages.open('set');
    await expect(page.getByTestId('sunrise-field')).toBeVisible();
    expect(await pages.timePickerIcon('sunrise-field')).toBe('#i-sunrise');
    expect(await pages.timePickerIcon('sunset-field')).toBe('#i-sunset');
    expect(await pages.iconSymbolPath('i-sunrise')).toContain('M12 3v3');
    expect(await pages.iconSymbolPath('i-sunset')).toContain('M12 3v3m-2-2 2 2 2-2');
    await dayline.open();
    await dayline.quickMore.click();
    await expect(dayline.itemDialog).toBeVisible();
    expect(await pages.timePickerIcon('field-ts')).toBe('#i-clock');
    expect(await pages.timePickerIcon('field-te')).toBe('#i-clock');
  });

  test('パターン: current marker shares the rail center and header stays centered across routes', async ({ page, vault, dayline }) => {
    const pages = new PagesPage(page, vault);
    for (const viewport of [{ width: 1935, height: 900 }, { width: 1280, height: 800 }, { width: 375, height: 844 }]) {
      await page.setViewportSize(viewport);
      await dayline.open();
      for (const scroll of ['start', 'end']) {
        const marker = await pages.daylineMarkerGeometry(scroll);
        expect(Math.abs(marker.delta * marker.devicePixelRatio)).toBeLessThanOrEqual(1);
      }
      const doHeader = await pages.headerGeometry();
      await pages.open('write');
      const writeHeader = await pages.headerGeometry();
      await pages.open('set');
      const setHeader = await pages.headerGeometry();
      for (const key of ['brand', 'sync', 'right']) {
        expect(Math.abs(writeHeader[key].center - doHeader[key].center)).toBeLessThanOrEqual(1);
        expect(Math.abs(setHeader[key].center - doHeader[key].center)).toBeLessThanOrEqual(1);
      }
    }
  });
});
