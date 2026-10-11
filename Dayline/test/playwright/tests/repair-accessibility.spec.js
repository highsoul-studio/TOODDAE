import {test,expect} from '../fixtures.js';
import {PagesPage} from '../page-objects/pages.page.js';

test('S2 actual model input and picker retain keyboard focus in forced colors',async({page,vault})=>{
  const pages=new PagesPage(page,vault);await pages.open('set');await page.emulateMedia({forcedColors:'active'});await pages.focusModelWithKeyboard();
  let style=await pages.modelForcedFocus();expect(style.wrapper.outline).toBe('solid');expect(style.wrapper.width).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Tab');await expect(page.getByTestId('ai-model-picker')).toBeFocused();style=await pages.modelForcedFocus();expect(style.wrapper.outline).toBe('solid');expect(style.wrapper.width).toBeGreaterThanOrEqual(2);
});

test('S2 actual plaintext-only body and nested editables use caret with native forced-colors fallback',async({page,vault})=>{
  await page.addInitScript(()=>localStorage.setItem('accentCursor','1'));const pages=new PagesPage(page,vault);await pages.open();await pages.openWriteEdit();
  await expect(pages.editor).toHaveAttribute('contenteditable','plaintext-only');await pages.editor.hover();await expect.poll(async()=>(await pages.cursorState()).mode).toBe('text');
  await pages.hoverNestedWriteText();expect((await pages.cursorState()).mode).toBe('text');
  await pages.hoverNonEditableWriteText();expect((await pages.cursorState()).mode).toBe('dot');
  await page.getByTestId('write-title-input').hover();expect((await pages.cursorState()).mode).toBe('text');
  await page.getByTestId('write-read').hover();expect((await pages.cursorState()).mode).toBe('action');
  await page.emulateMedia({forcedColors:'active'});await pages.editor.hover();await expect.poll(async()=>(await pages.cursorState()).active).toBe(false);expect(await pages.cursorStyle('write-editor')).not.toBe('none');
});
