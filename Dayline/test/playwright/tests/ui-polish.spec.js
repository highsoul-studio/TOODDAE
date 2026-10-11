import {test,expect} from '../fixtures.js';
import {PagesPage} from '../page-objects/pages.page.js';

test('パターン: editable focus는 border색을 바꾸지 않고 soft shadow 하나만 쓰며 AI CTA 의미를 유지한다',async({page,vault,dayline})=>{
  const pages=new PagesPage(page,vault);await pages.open('set');
  expect(await pages.swatchLabels()).toEqual(['背景','ハイライト','背景','ハイライト']);
  const modelBorder=await pages.modelBorder();await page.getByTestId('ai-model').focus();const focus=await pages.modelFocusState();
  expect(await pages.modelBorder()).toBe(modelBorder);
  expect(focus.wrapperShadow).not.toBe('none');expect(focus.inputShadow).toBe('none');
  const baseBorder=await pages.borderColor('ai-base');await page.getByTestId('ai-base').focus();expect(await pages.borderColor('ai-base')).toBe(baseBorder);expect((await pages.focusState('ai-base')).shadow).not.toBe('none');
  const quickBorder=await dayline.quickBorder();await dayline.quickInput.focus();expect(await dayline.quickBorder()).toBe(quickBorder);
  await expect(page.getByTestId('ai-test')).toHaveClass(/btn--ai/);await expect(page.getByTestId('ai-test')).toHaveCSS('background-image','none');
  await page.getByTestId('nav-write').click();await expect(page.getByTestId('write-organize')).toHaveClass(/btn--ai/);
  await page.getByTestId('nav-do').click();await expect(page.getByTestId('assistant-launch')).toHaveClass(/btn--ai/);
  await page.getByTestId('nav-set').click();expect(await pages.timePickerIcon('sunrise-field')).toBe('#i-sunrise');expect(await pages.timePickerIcon('sunset-field')).toBe('#i-sunset');
  await page.emulateMedia({forcedColors:'active'});await page.getByTestId('ai-base').focus();expect((await pages.focusState('ai-base')).outline).not.toBe('none');
});

test('パターン: Light/Dark palette strip은 4개 언어에서 background/accent label을 보인다',async({page,vault})=>{
  const pages=new PagesPage(page,vault),cases=[['ja',['背景','ハイライト']],['ko',['배경','강조색']],['en',['Background','Accent']],['zh',['背景','强调色']]];
  for(const[lang,labels]of cases){await page.goto('/#/set');await page.evaluate(value=>localStorage.setItem('lang',value),lang);await page.reload();await expect(page.getByTestId('preview-light')).toBeVisible();expect(await pages.swatchLabels()).toEqual([...labels,...labels]);}
});

test('パターン: native title은 custom tooltip으로 바뀌고 focus/Escape/clamp/dialog top-layer/XSS를 지킨다',async({page,vault,dayline})=>{
  await dayline.open();const pages=new PagesPage(page,vault);await expect.poll(()=>pages.nativeTitleCount()).toBe(0);
  await dayline.themeToggle.focus();await expect(page.getByTestId('app-tooltip')).toBeVisible();let info=await pages.tooltipInfo();expect(info.pointer).toBe('none');expect(info.inside).toBe(true);
  await page.keyboard.press('Escape');await expect(page.getByTestId('app-tooltip')).toHaveCount(0);
  await page.getByTestId('nav-set').click();await expect(page.getByTestId('ai-base')).toBeVisible();await expect.poll(()=>pages.nativeTitleCount()).toBe(0);await expect(page.getByTestId('ai-base')).not.toHaveAttribute('data-tooltip');await page.getByTestId('nav-do').click();
  await dayline.openAddDialog();await dayline.setDialogTimeTitle('<img src=x onerror=alert(1)>');await dayline.field('ts').getByTestId('time-button').focus();
  await expect(page.getByTestId('app-tooltip')).toBeVisible();info=await pages.tooltipInfo();expect(info.parentDialog).toBe(true);expect(info.text).toBe('<img src=x onerror=alert(1)>');expect(await pages.tooltipMarkupCount('img')).toBe(0);
  await page.keyboard.press('Escape');await expect(page.getByTestId('app-tooltip')).toHaveCount(0);await expect(dayline.itemDialog).toBeVisible();
});

test('パターン: language 변경은 unfinished draft를 막고 clean 상태에서만 reload한다',async({page,dayline})=>{
  await dayline.open();await dayline.quickInput.fill('keep this draft');await dayline.langButton.click();await dayline.option('en').click();
  await expect(dayline.quickInput).toHaveValue('keep this draft');expect(await page.evaluate(()=>localStorage.getItem('lang'))).toBe('ko');
  await dayline.quickInput.fill('');await dayline.prepareLanguageFrameProbe();await dayline.langButton.click();const loaded=page.waitForEvent('domcontentloaded');await dayline.option('en').click();await loaded;await dayline.ready();
  expect(await page.evaluate(()=>localStorage.getItem('lang'))).toBe('en');await expect(dayline.root).toHaveAttribute('lang','en');expect(await dayline.languageFrameProbe()).toBeNull();
});

test('パターン: item dialog memo geometry와 Cmd/Ctrl+Enter는 IME/repeat 없이 한 번만 저장한다',async({page,dayline})=>{
  await dayline.open();const calls=[];await page.route('**/api/save',async route=>{calls.push(route.request().postDataJSON());await route.continue();});
  await dayline.openAddDialog();await dayline.textField.fill('S keyboard item');const geometry=await dayline.itemMemoGeometry();
  await expect(page.getByTestId('item-key-hint')).toContainText(/저장|Save|保存/);
  expect(geometry.labelBottom).toBeLessThanOrEqual(geometry.hintTop);expect(geometry.hintBottom).toBeLessThanOrEqual(geometry.memoTop);expect(Math.abs(geometry.memoBottom-geometry.mainBottom)).toBeLessThanOrEqual(1);expect(Math.abs(geometry.routineBottom-geometry.mainBottom)).toBeLessThanOrEqual(1);
  const borders=await dayline.itemControlBorders();await dayline.textField.focus();expect((await dayline.itemControlBorders()).text).toBe(borders.text);await dayline.memoField.focus();expect((await dayline.itemControlBorders()).memo).toBe(borders.memo);await dayline.timeInput('ts').focus();expect((await dayline.itemControlBorders()).time).toBe(borders.time);await dayline.field('prio').getByTestId('select-button').click();expect((await dayline.itemControlBorders()).select).toBe(borders.select);await page.keyboard.press('Escape');
  await dayline.dispatchItemShortcut({isComposing:true});await dayline.dispatchItemShortcut({repeat:true});expect(calls).toHaveLength(0);
  await dayline.textField.focus();await page.keyboard.press('ControlOrMeta+Enter');await expect(dayline.itemDialog).toBeHidden();expect(calls).toHaveLength(1);
});

test('パターン: item footer action과 action-specific hint는 320/375/480px와 4언어에서 넘치지 않는다',async({page,dayline})=>{
  for(const[width,lang]of[[320,'ja'],[375,'ko'],[480,'en'],[375,'zh']]){await page.setViewportSize({width,height:600});await dayline.open({lang});await dayline.openAddDialog();const fit=await dayline.itemDialogFit();expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth);expect(fit.hint.top).toBeGreaterThanOrEqual(fit.footer.bottom);expect(fit.buttons.every(button=>button.left>=fit.footer.left-1&&button.right<=fit.footer.right+1)).toBe(true);await dayline.itemDialog.getByTestId('dialog-close').click();}
});

test('パターン: Write Cmd/Ctrl+Enter는 IME/repeat를 무시하고 실제 Save 완료 뒤 Read로 전환한다',async({page,vault})=>{
  const pages=new PagesPage(page,vault);await pages.open();await pages.openWriteEdit();await pages.editor.fill('S Write shortcut');await expect(page.getByTestId('write-format-hint')).toContainText(/S\/Enter/);
  await pages.dispatchWriteShortcut({isComposing:true});await pages.dispatchWriteShortcut({repeat:true});await expect(pages.editor).toBeVisible();
  await pages.editor.focus();await page.keyboard.press('ControlOrMeta+Enter');await expect(pages.preview).toBeVisible();await expect.poll(()=>pages.noteFile(vault.today)).toContain('S Write shortcut');
});

test('パターン: Assistant Cmd/Ctrl+Enter는 readiness/nonempty/IME/repeat를 지키고 실제 receipt만 표시한다',async({page,vault})=>{
  const pages=new PagesPage(page,vault),mock=await pages.mockAssistant({response:{status:'completed',results:[{tool:'add_task',action:'created',changed:true,itemId:'item-1',destination:{panel:'tasks',section:'Plan',bucket:'today',date:vault.today},created:{text:'S AI item',file:`Daily/${vault.today}.md`}}],message:'',requestId:'echo',rootId:vault.rootId}});
  await page.addInitScript(()=>localStorage.setItem('accentCursor','1'));await page.goto('/');await page.getByTestId('assistant-launch').click();await expect(page.getByTestId('assistant-key-hint')).toContainText(/項目の作成など|항목 만들기 등|creating items|创建项目等/);await page.getByTestId('assistant-message').fill('S AI item 만들어 줘');await page.getByTestId('assistant-run').hover();expect(await pages.cursorState()).toMatchObject({parentDialog:true,mode:'action',active:true});
  await pages.dispatchAssistantShortcut({isComposing:true});await pages.dispatchAssistantShortcut({repeat:true});expect(mock.calls).toHaveLength(0);
  await page.getByTestId('assistant-message').focus();await page.keyboard.press('ControlOrMeta+Enter');await mock.started;expect(mock.calls).toHaveLength(1);await expect(page.getByTestId('assistant-run')).toBeDisabled();
  mock.release();await expect(page.getByTestId('assistant-result')).toContainText(/생성|Created|作成|创建/);await expect(page.getByTestId('assistant-result')).toContainText('Plan');await expect(page.getByTestId('assistant-result')).not.toContainText('[object Object]');await page.getByTestId('assistant-cancel').click();await expect(page.getByTestId('assistant-dialog')).toHaveCount(0);expect(await pages.cursorState()).toMatchObject({hidden:true,active:false,parentDialog:false});
});

test('パターン: Assistant no-op은 0개 생성 실패가 아니라 변경 불필요로 표시한다',async({page,vault})=>{
  const pages=new PagesPage(page,vault),mock=await pages.mockAssistant({response:{status:'completed',results:[],noops:2,message:'',requestId:'noop',rootId:vault.rootId}});
  await page.goto('/');await page.getByTestId('assistant-launch').click();await page.getByTestId('assistant-message').fill('이미 있으면 그대로 둬');await page.getByTestId('assistant-run').click();await mock.started;mock.release();
  await expect(page.getByTestId('assistant-result')).toContainText(/변경할 필요|No change|変更は不要|无需更改/);await expect(page.getByTestId('assistant-result')).not.toContainText(/0.*생성|0.*created|0.*作成|创建.*0/i);
});

test('パターン: Assistant 8개 tool receipt는 4언어 action-neutral heading과 localized tool/panel을 쓴다',async({page,vault})=>{
  const results=[
    {tool:'add_task',action:'created',changed:true,created:{text:'A',file:'Daily/x.md'}},{tool:'add_routine',action:'created',changed:true,created:{text:'R',file:'Daily/x.md'}},
    {tool:'add_section',action:'created',changed:true,created:{name:'Plan',panel:'tasks'}},{tool:'edit_task',action:'updated',changed:true,created:{text:'E',file:'Daily/x.md'}},
    {tool:'edit_routine',action:'updated',changed:true,created:{text:'ER',file:'Daily/x.md'}},{tool:'move_task',action:'moved',changed:true,destination:{panel:'tasks',bucket:'inbox'},created:{text:'M'}},
    {tool:'find_items',action:'updated',changed:true,created:{text:'F'}},{tool:'reorder_sections',action:'reordered',changed:true,created:{name:'Order',panel:'routine'}},
  ],pages=new PagesPage(page,vault),mock=await pages.mockAssistant({response:{status:'completed',results,message:'',requestId:'mixed',rootId:vault.rootId}});mock.release();
  for(const[lang,heading,move,reorder]of[['ja','8件の変更','タスクを移動','セクションを並べ替え'],['ko','8개 변경','할 일 이동','섹션 순서 변경'],['en','Applied 8 changes','Move task','Reorder sections'],['zh','已应用 8 项更改','移动任务','调整分区顺序']]){await page.goto('/');await page.evaluate(value=>localStorage.setItem('lang',value),lang);await page.reload();await page.getByTestId('assistant-launch').click();await page.getByTestId('assistant-message').fill('mixed');await page.getByTestId('assistant-run').click();const receipt=page.getByTestId('assistant-result');await expect(receipt).toContainText(heading);await expect(receipt).toContainText(move);await expect(receipt).toContainText(reorder);await expect(receipt).not.toContainText(/assistant\.tool|\[object Object\]|· tasks|· routine/);await page.getByTestId('assistant-cancel').click();}
});

test('パターン: Assistant partial의 changedFiles는 mutation receipt가 0개여도 최신 state를 다시 읽는다',async({page,vault})=>{
  const pages=new PagesPage(page,vault),states=await pages.countStateRequests(),mock=await pages.mockAssistant({response:{status:'partial',results:[],message:'',error:{code:'write-failed',changedFiles:[`Daily/${vault.today}.md`]},requestId:'partial',rootId:vault.rootId}});
  await page.goto('/');const before=states.length;await page.getByTestId('assistant-launch').click();await page.getByTestId('assistant-message').fill('부분 반영 테스트');await page.getByTestId('assistant-run').click();await mock.started;mock.release();await expect(page.getByTestId('assistant-result')).toContainText(/일부|partial|一部|部分/);await expect.poll(()=>states.length).toBeGreaterThan(before);
});

test('パターン: Day line done/undo는 현재 fraction에서 opacity와 strike 방향을 이어가고 now dot은 rail에 맞는다',async({page,vault,dayline})=>{
  const daily=`## 今日のタスク\n- [ ] 10:00 S timed ⏳ ${vault.today} 📅 ${vault.today}\n\n## ルーティン\n`;vault.write(`Daily/${vault.today}.md`,daily);vault.write('Templates/Daily.md','## 今日のタスク\n\n## ルーティン\n');await dayline.open();
  expect((await dayline.nowGeometry()).diff).toBeLessThanOrEqual(.6);await dayline.startDayPillSampling('S timed');await dayline.taskCheck('S timed','tasks').click();let values=await dayline.dayPillSamples();
  expect(new Set(values.map(value=>value.strike.toFixed(1))).size).toBeGreaterThan(3);
  expect(values.some(value=>value.strike>5&&value.strike<95)).toBe(true);
  await expect.poll(()=>dayline.dayPillFilter('S timed')).toContain('0.45');
  await dayline.startDayPillSampling('S timed');await dayline.taskCheck('S timed','tasks').click();values=await dayline.dayPillSamples();
  expect(values.some(value=>value.strike>5&&value.strike<95)).toBe(true);
  await expect.poll(()=>dayline.dayPillFilter('S timed')).toContain('1');
  await dayline.taskCheck('S timed','tasks').click();await dayline.taskCheck('S timed','tasks').click();await expect.poll(()=>dayline.dayPillVisual('S timed')).toMatchObject({opacity:1,strike:0});
  await page.emulateMedia({reducedMotion:'reduce'});await dayline.taskCheck('S timed','tasks').click();await expect.poll(()=>dayline.dayPillVisual('S timed')).toMatchObject({opacity:.45,strike:1});await expect.poll(()=>vault.note()).toContain('[x] 10:00 S timed');
  await page.reload();await dayline.ready();await expect.poll(()=>dayline.dayPillVisual('S timed')).toMatchObject({opacity:.45,strike:1});
});

test('パターン: custom sunset 18:10은 즉시 평가·분단위 scheduler·reload에서 유지되고 cursor는 opt-in이다',async({page,vault})=>{
  const pages=new PagesPage(page,vault);await pages.installClockAtLocalTime(18,9);await pages.open('set');await page.evaluate(()=>localStorage.removeItem('themeOverride'));
  await pages.setSettings({auto:{enabled:true,country:'JP',sunrise:'05:35',sunset:'18:10'}});await page.reload();await page.getByTestId('nav-set').click();await expect(pages.root).toHaveAttribute('data-theme','light');
  await page.clock.runFor(61000);await expect(pages.root).toHaveAttribute('data-theme','dark');await expect(page.getByTestId('sunset-field').getByTestId('time-input')).toHaveValue('18:10');
  await page.getByTestId('accent-cursor').check();expect(await pages.cursorState()).toMatchObject({hidden:true,active:false});await pages.hoverCursorSurface();expect(await pages.cursorState()).toMatchObject({hidden:false,mode:'dot',active:true});await page.getByTestId('ai-test').hover();expect(await pages.cursorState()).toMatchObject({hidden:false,mode:'action',active:true});await page.getByTestId('ai-base').hover();expect(await pages.cursorState()).toMatchObject({hidden:false,mode:'text',active:true});expect(await page.evaluate(()=>localStorage.getItem('accentCursor'))).toBe('1');await page.getByTestId('theme-toggle').hover();await pages.startCursorThemeSampling();await page.getByTestId('theme-toggle').click();const cursorSamples=await pages.cursorThemeSamples(),first=cursorSamples[0],changed=cursorSamples.filter(sample=>sample.border!==first.border||sample.background!==first.background||sample.shadow!==first.shadow);expect(Math.min(...cursorSamples.map(sample=>sample.opacity))).toBeLessThan(.1);expect(cursorSamples.at(-1).opacity).toBeGreaterThan(.9);expect(changed.length).toBeGreaterThan(0);expect(changed[0].opacity).toBeLessThan(.1);
  await page.emulateMedia({forcedColors:'active'});await page.getByTestId('ai-test').hover();expect(await pages.cursorState()).toMatchObject({hidden:true,active:false});expect(await pages.cursorStyle('ai-test')).not.toBe('none');await page.emulateMedia({forcedColors:'none'});
  await page.evaluate(()=>localStorage.removeItem('themeOverride'));await page.reload();await page.getByTestId('nav-set').click();await expect(page.getByTestId('accent-cursor')).toBeChecked();await expect(pages.root).toHaveAttribute('data-theme','dark');
  await page.evaluate(()=>localStorage.setItem('themeOverride',JSON.stringify({mode:'light',until:Date.now()+3600000})));await page.reload();await page.getByTestId('nav-set').click();await expect(pages.root).toHaveAttribute('data-theme','dark');expect(await pages.themeOverride()).toBeNull();
  await page.evaluate(()=>localStorage.setItem('themeOverride',JSON.stringify({mode:'light',until:Date.now()+3600000,schedule:'1|05:35|19:00'})));await page.reload();await page.getByTestId('nav-set').click();await expect(pages.root).toHaveAttribute('data-theme','dark');expect(await pages.themeOverride()).toBeNull();
  await page.evaluate(()=>localStorage.setItem('themeOverride',JSON.stringify({mode:'light',until:Date.now()+3600000,schedule:'1|05:35|18:10'})));await page.reload();await page.getByTestId('nav-set').click();await expect(pages.root).toHaveAttribute('data-theme','light');expect(await pages.themeOverride()).toMatchObject({mode:'light',schedule:'1|05:35|18:10'});
});
