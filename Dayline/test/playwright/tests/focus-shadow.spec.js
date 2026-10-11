import { test, expect } from '../fixtures.js';
import { PagesPage } from '../page-objects/pages.page.js';

const expectShadow = (style) => { expect(style.outlineStyle).toBe('none'); expect(style.boxShadow).not.toBe('none'); };

test('패턴: Set과 Write의 text/composite entry는 한 개의 soft shadow만 쓰고 note cards는 sheet shadow를 유지한다', async ({ page, vault, dayline }) => {
  const pages = new PagesPage(page, vault);
  vault.write(`Write/${vault.day(-1)}.md`, '# Earlier note');
  await vault.settle();
  await pages.open('set');
  const model = page.getByTestId('ai-model'), picker = page.getByTestId('ai-model-picker'), modelEntry = pages.modelEntry;
  expectShadow(await pages.focusAppearance(model, modelEntry));
  await expect(model).toHaveCSS('outline-style', 'none');
  await expect(model).toHaveCSS('box-shadow', 'none');
  expectShadow(await pages.focusAppearance(picker, modelEntry));
  await expect(picker).toHaveCSS('outline-style', 'none');
  for (const id of ['ai-base', 'ai-key']) expectShadow(await pages.focusAppearance(page.getByTestId(id)));
  const provider = page.getByTestId('provider-field').getByTestId('select-button');
  expectShadow(await pages.focusAppearance(provider));
  await page.getByTestId('auto-enabled').check();
  const sunrise = page.getByTestId('sunrise-field').getByTestId('time-input'), sunriseSurface = pages.timeSurface('sunrise-field');
  expectShadow(await pages.focusAppearance(sunrise, sunriseSurface));
  await expect(sunrise).toHaveCSS('outline-style', 'none');
  await dayline.open();
  await dayline.openEditDialog('折り返さない短いタイトル');
  expectShadow(await pages.focusAppearance(dayline.memoField));
  await page.getByTestId('dialog-close').click();
  await pages.open('write');
  await pages.openWriteEdit();
  for (const field of [pages.titleInput, pages.editor, pages.noteSearch]) expectShadow(await pages.focusAppearance(field));
  const note = pages.noteLinks.first();
  const card = await pages.focusAppearance(note), sheet = await pages.computedStyle(pages.writeSheet, 'boxShadow');
  expect(card.boxShadow).toBe(sheet);
  expect(card.outlineColor).toBe(await pages.computedStyle(pages.writeSheet, 'color'));
  await expect(note).toHaveAttribute('aria-current', 'date');
  const other = pages.nonCurrentNote();
  expect(await pages.computedStyle(note, 'backgroundColor')).not.toBe(await pages.computedStyle(other, 'backgroundColor'));
});

test('패턴: dark/light, forced-colors, 375px에서도 focus와 note rail이 보이고 잘리지 않는다', async ({ page, vault }) => {
  const pages = new PagesPage(page, vault);
  for (const theme of ['light', 'dark']) {
    await pages.open('write');
    await pages.setTheme(theme);
    await expect(page.getByTestId('page-write')).toHaveAttribute('data-ready', 'true');
    const note = pages.noteLinks.first(), card = await pages.focusAppearance(note);
    expect(card.boxShadow).toBe(await pages.computedStyle(pages.writeSheet, 'boxShadow'));
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await pages.hasHorizontalScroll()).toBe(false);
    expect(await pages.noteCardGeometry()).toMatchObject({ clipped: false });
  }
  await page.emulateMedia({ forcedColors: 'active' });
  await pages.open('set');
  const model = page.getByTestId('ai-model'), modelEntry = pages.modelEntry;
  const forced = await pages.focusAppearance(model, modelEntry);
  expect(forced.outlineStyle).toBe('solid');
  expect(forced.boxShadow).toBe('none');
  await expect(model).toHaveCSS('outline-style', 'none');
  const picker = page.getByTestId('ai-model-picker');
  expect((await pages.focusAppearance(picker, modelEntry)).outlineStyle).toBe('solid');
  await expect(picker).toHaveCSS('outline-style', 'none');
  await page.getByTestId('auto-enabled').focus();
  await expect(pages.settingCheckIndicator).toHaveCSS('outline-style', 'solid');
});
