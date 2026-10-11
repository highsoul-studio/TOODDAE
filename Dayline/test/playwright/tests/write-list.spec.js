import {test,expect} from '../fixtures.js';
import {PagesPage} from '../page-objects/pages.page.js';

// 観点: Write本文のリスト編集（Enterで次の項目、Tab / Shift+Tabで字下げ）とツールチップ不在
const openEditor=async(page,vault)=>{const pages=new PagesPage(page,vault);await pages.open();await pages.openWriteEdit();await pages.editor.fill('');await pages.editor.focus();return pages;};
const typeLines=async(page,lines)=>{for(const [index,line] of lines.entries()){if(index)await page.keyboard.press('Enter');if(line)await page.keyboard.type(line);}};

test('パターン: Write本文にはツールチップが付かず、ホバーしても出ない',async({page,vault})=>{
  const pages=await openEditor(page,vault);
  // title は共有ツールチップが data-tooltip に移すため、両方を見る
  await expect(pages.editor).not.toHaveAttribute('title',/.+/);await expect(pages.editor).not.toHaveAttribute('data-tooltip',/.+/);
  await pages.editor.hover();await page.mouse.move(5,5);await pages.editor.hover({position:{x:40,y:40}});
  await expect(page.getByTestId('app-tooltip')).toHaveCount(0);
});

test('パターン: 箇条書きでEnterすると次の箇条書きが出て、空の項目でEnterすると記号が消える',async({page,vault})=>{
  const pages=await openEditor(page,vault);
  await page.keyboard.type('- 一');await page.keyboard.press('Enter');await page.keyboard.type('二');
  expect((await pages.editorSelection()).text).toBe('- 一\n- 二');
  await page.keyboard.press('Enter');await page.keyboard.press('Enter');
  expect((await pages.editorSelection()).text.replace(/\n$/,'')).toBe('- 一\n- 二\n');
});

test('パターン: 番号リストでEnterすると次の番号が出る(末尾以外でも分割して続く)',async({page,vault})=>{
  const pages=await openEditor(page,vault);
  await page.keyboard.type('1. a');await page.keyboard.press('Enter');await page.keyboard.type('b');await page.keyboard.press('Enter');await page.keyboard.type('c');
  expect((await pages.editorSelection()).text).toBe('1. a\n2. b\n3. c');
  await page.keyboard.press('ArrowLeft');await page.keyboard.press('Enter');
  expect((await pages.editorSelection()).text).toBe('1. a\n2. b\n3. \n4. c');
});

test('パターン: リスト外のEnterは通常の改行のまま',async({page,vault})=>{
  const pages=await openEditor(page,vault);
  await typeLines(page,['plain','','next']);
  expect((await pages.editorSelection()).text).toBe('plain\n\nnext');
});

test('パターン: リスト行でTabは字下げ、Shift+Tabは解除し、キャレット位置と入力が保たれる',async({page,vault})=>{
  const pages=await openEditor(page,vault);
  await page.keyboard.type('- 親');await page.keyboard.press('Enter');await page.keyboard.type('子');
  await page.keyboard.press('Tab');
  expect((await pages.editorSelection()).text).toBe('- 親\n  - 子');
  await page.keyboard.type('!');
  expect((await pages.editorSelection()).text).toBe('- 親\n  - 子!');
  await page.keyboard.press('Shift+Tab');await page.keyboard.type('?');
  expect((await pages.editorSelection()).text).toBe('- 親\n- 子!?');
  await expect(pages.editor).toBeFocused();
});

test('パターン: リスト外のTabはフォーカス移動を妨げない',async({page,vault})=>{
  const pages=await openEditor(page,vault);
  await page.keyboard.type('plain');await page.keyboard.press('Tab');
  await expect(pages.editor).not.toBeFocused();
});
