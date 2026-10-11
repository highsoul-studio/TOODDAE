import {test,expect} from '../fixtures.js';
import {PagesPage} from '../page-objects/pages.page.js';

// 観点: カレンダー(日曜始まり・土曜=青・日曜/休日=赤)、テーマ/言語/ページ移動のショートカット、チェックボックスのカーソル、フォーカスの輪
const dow=iso=>new Date(`${iso}T00:00:00Z`).getUTCDay();
const openStartCalendar=async(dayline)=>{await dayline.openAddDialog();await dayline.field('start').getByTestId('date-button').click();await expect(dayline.page.getByTestId('cal-day').first()).toBeVisible();};

test('パターン: カレンダーは日曜始まりで、土曜と日曜に色のクラスが付く',async({dayline})=>{
  await dayline.open();await openStartCalendar(dayline);
  const cells=await dayline.page.getByTestId('cal-day').evaluateAll(list=>list.map(el=>({d:el.dataset.d,cls:el.className})));
  expect(cells).toHaveLength(42);
  // 平日の祝日にも is-sun が付くのは仕様なので、日曜の列だけを厳密に見る
  for(const [index,cell] of cells.entries()){expect(dow(cell.d),`column ${index}`).toBe(index%7);if(index%7===0)expect(cell.cls.includes('is-sun')).toBe(true);expect(cell.cls.includes('is-sat')).toBe(index%7===6);}
  const heads=await dayline.page.locator('.cal__wd span').allTextContents();
  expect(heads).toHaveLength(7);expect(heads[0]).toBe('일');expect(heads[6]).toBe('토');
  const colors=await dayline.page.evaluate(()=>{const c=s=>getComputedStyle(document.querySelector(s)).color;return{sun:c('.cal__d.is-sun:not(.is-out):not(.is-today):not(.is-sel)'),sat:c('.cal__d.is-sat:not(.is-out):not(.is-today):not(.is-sel)'),plain:c('.cal__d:not(.is-sun):not(.is-sat):not(.is-out):not(.is-today):not(.is-sel)')};});
  expect(new Set(Object.values(colors)).size).toBe(3);
});

test('パターン: 国の設定が KR のとき、休日(代替公休日を含む)は赤、平日は赤にならない',async({page,dayline,vault})=>{
  await dayline.open();await new PagesPage(page,vault).setSettings({auto:{country:'KR'}});await page.reload();await dayline.ready();
  await openStartCalendar(dayline);
  const [y,m]=vault.today.split('-').map(Number),steps=(2026-y)*12+(10-m);
  for(let i=0;i<Math.abs(steps);i++)await page.keyboard.press(steps>0?'PageDown':'PageUp');
  await expect(page.locator('.cal__title')).toContainText('2026');
  const day=iso=>dayline.calDay(iso);
  await expect(day('2026-10-09')).toHaveClass(/is-sun/);await expect(day('2026-10-09')).toHaveAttribute('aria-label',/한글날/);
  await expect(day('2026-10-05')).toHaveClass(/is-sun/);await expect(day('2026-10-05')).toHaveAttribute('aria-label',/대체공휴일/);
  await expect(day('2026-10-03')).toHaveClass(/is-sun/); // 土曜の개천절は休日として赤
  await expect(day('2026-10-08')).not.toHaveClass(/is-sun|is-sat/);
});

test('パターン: ⌘/Ctrl+Shift+Y でライト/ダークが切り替わり、ツールチップにショートカットが出る',async({page,dayline})=>{
  await dayline.open({theme:'light'});
  const root=page.locator('html');await expect(root).toHaveAttribute('data-theme','light');
  await expect(dayline.themeToggle).toHaveAttribute('data-tooltip',/(⌘⇧|Ctrl\+Shift\+)Y/);
  await page.keyboard.press('ControlOrMeta+Shift+Y');await expect(root).toHaveAttribute('data-theme','dark');
  await page.keyboard.press('ControlOrMeta+Shift+Y');await expect(root).toHaveAttribute('data-theme','light');
});

test('パターン: ⌘/Ctrl+Shift+U で次の言語へ切り替わり、ツールチップにショートカットが出る',async({page,dayline})=>{
  await dayline.open({lang:'ko'});
  await expect(dayline.langButton).toHaveAttribute('data-tooltip',/(⌘⇧|Ctrl\+Shift\+)U/);
  await page.keyboard.press('ControlOrMeta+Shift+U');
  await expect(dayline.langButton).toContainText('日本語'); // 言語メニューの順は English → 한국어 → 日本語 → 中文
  await dayline.ready();
  await page.keyboard.press('ControlOrMeta+Shift+U');
  await expect(dayline.langButton).toContainText('中文');
});

test('パターン: Shift+1/2/3 でページを移動し、文字入力中は移動しない',async({page,dayline})=>{
  await dayline.open();
  await page.keyboard.press('Shift+Digit2');await expect(page).toHaveURL(/#\/write$/);
  await page.keyboard.press('Shift+Digit3');await expect(page).toHaveURL(/#\/set$/);
  await page.keyboard.press('Shift+Digit1');await expect(page).toHaveURL(/#\/do$/);
  await dayline.ready({withTasks:false}); // 画面の作り直しが終わってから入力欄へ (途中だとフォーカスが外れて Shift+2 が移動として働く)
  await dayline.quickInput.focus();await expect(dayline.quickInput).toBeFocused();await page.keyboard.press('Shift+Digit2');await expect(page).toHaveURL(/#\/do$/);
  await expect(dayline.quickInput).toHaveValue('@');
});

test('パターン: クイック入力のフォーカスの輪は外側の1つだけ',async({dayline})=>{
  await dayline.open();await dayline.quickInput.focus();
  const shadows=await dayline.quickFocusShadows();
  expect(shadows.outer).not.toBe('none');expect(shadows.inner).toBe('none');
});

test('パターン: アクセントカーソルは、チェックボックスの上では入力用ではなく操作用の形になる',async({page,vault})=>{
  const pages=new PagesPage(page,vault);await pages.open('set');
  await page.getByTestId('accent-cursor').check();await pages.hoverCursorSurface();
  await page.getByTestId('auto-enabled').hover();
  expect(await pages.cursorState()).toMatchObject({hidden:false,mode:'action'});
});

test('パターン: ノートカードの影はリストの余白に収まり、クリップで切れない',async({page,vault})=>{
  const pages=new PagesPage(page,vault);await pages.open('write');
  const room=await page.getByTestId('notes-rail').locator('.notes-list').evaluate(list=>{const style=getComputedStyle(list);return{bottom:Number.parseFloat(style.paddingBottom),side:Number.parseFloat(style.paddingLeft)};});
  expect(room.bottom).toBeGreaterThanOrEqual(52);expect(room.side).toBeGreaterThanOrEqual(26);
});
