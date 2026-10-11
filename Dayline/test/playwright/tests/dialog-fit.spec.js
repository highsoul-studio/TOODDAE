import {test,expect} from '../fixtures.js';
import {PagesPage} from '../page-objects/pages.page.js';

const assertContained=geometry=>{
  expect(geometry.dialog.left).toBeGreaterThanOrEqual(0);
  expect(geometry.dialog.right).toBeLessThanOrEqual(geometry.viewport.width);
  expect(geometry.form.left).toBeGreaterThanOrEqual(geometry.dialog.left);
  expect(geometry.form.right).toBeLessThanOrEqual(geometry.dialog.right);
  expect(geometry.dialogScroll.width).toBeLessThanOrEqual(geometry.dialogScroll.clientWidth);
  expect(geometry.footer.bottom).toBeLessThanOrEqual(geometry.dialog.bottom+1);
};
const assertResultContained=geometry=>{assertContained(geometry);expect(geometry.result.scrollWidth).toBeLessThanOrEqual(geometry.result.clientWidth);};

test('パターン: Assistant와 consent dialog는 wide/mobile/short viewport에서 잘리지 않고 footer까지 닿는다',async({page,vault},testInfo)=>{
  const pages=new PagesPage(page,vault);await page.goto('/');const payload=await pages.getSettings();
  payload.aiReady=true;payload.assistantReady=true;payload.settings.ai.consent=false;
  await page.route('**/api/settings',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)}));
  const long=`Daily/${'unbroken-path-'.repeat(45)}.md`;
  await page.route('**/api/assistant/run',route=>{const body=route.request().postDataJSON();return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'partial',results:[{tool:'add_task',created:{text:'Long result',file:long}}],message:long,error:{code:'needs-input',changedFiles:[long]},requestId:body.requestId,rootId:vault.rootId})});});
  await page.evaluate(()=>localStorage.setItem('lang','en'));
  for(const viewport of [{width:2230,height:900},{width:1280,height:800},{width:390,height:844},{width:320,height:568},{width:390,height:360}]){
    await page.setViewportSize(viewport);await page.goto('/');await page.getByTestId('assistant-launch').click();
    await testInfo.attach(`assistant-empty-${viewport.width}x${viewport.height}`,{body:await page.screenshot(),contentType:'image/png'});
    const before=await pages.textareaBox('assistant-message');await page.getByTestId('assistant-message').fill(Array.from({length:80},(_,i)=>`line-${i}`).join('\n'));const after=await pages.textareaBox('assistant-message');expect(after.height).toBeCloseTo(before.height,0);expect(after.scrollHeight).toBeGreaterThan(after.clientHeight);expect(after.overflow).toBe('auto');expect(after.resize).toBe('none');await page.getByTestId('assistant-message').fill('mock only');await page.getByTestId('assistant-run').click();await expect(page.getByTestId('assistant-result')).toBeVisible();
    assertResultContained(await pages.dialogGeometry('assistant-dialog'));
    await testInfo.attach(`assistant-result-scrolled-${viewport.width}x${viewport.height}`,{body:await page.screenshot(),contentType:'image/png'});
    await page.getByTestId('assistant-cancel').click();
  }
  await page.setViewportSize({width:320,height:480});
  for(const lang of ['ja','ko','en','zh']){
    await page.evaluate(value=>localStorage.setItem('lang',value),lang);await page.goto('/#/write');await page.getByTestId('write-organize').click();const before=await pages.textareaBox('organize-extra');await page.getByTestId('organize-extra').fill(Array.from({length:80},(_,i)=>`line-${i}`).join('\n'));const after=await pages.textareaBox('organize-extra');expect(after.height).toBeCloseTo(before.height,0);expect(after.scrollHeight).toBeGreaterThan(after.clientHeight);expect(after.overflow).toBe('auto');expect(after.resize).toBe('none');await page.getByTestId('organize-extra').fill('');await page.getByTestId('organize-submit').click();await expect(page.getByTestId('ai-consent-dialog')).toBeVisible();
    assertContained(await pages.dialogGeometry('ai-consent-dialog'));
    await testInfo.attach(`consent-320x480-${lang}`,{body:await page.screenshot(),contentType:'image/png'});
    await page.getByTestId('ai-consent-cancel').click();
  }
});
