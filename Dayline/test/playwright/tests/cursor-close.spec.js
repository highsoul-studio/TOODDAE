import {test,expect} from '../fixtures.js';
import {PagesPage} from '../page-objects/pages.page.js';

test('パターン: modal에서 이동한 accent cursor는 dialog close 즉시 native fallback으로 돌아간다',async({page,vault})=>{
  const pages=new PagesPage(page,vault),mock=await pages.mockAssistant({response:{status:'completed',results:[],noops:1,message:'',requestId:'cursor-close',rootId:vault.rootId}});mock.release();
  await page.addInitScript(()=>localStorage.setItem('accentCursor','1'));await page.goto('/');await page.getByTestId('assistant-launch').click();await page.getByTestId('assistant-message').fill('noop');await page.getByTestId('assistant-run').hover();expect(await pages.cursorState()).toMatchObject({parentDialog:true,active:true,hidden:false});await page.getByTestId('assistant-run').click();await expect(page.getByTestId('assistant-result')).toBeVisible();await page.getByTestId('assistant-cancel').click();await expect(page.getByTestId('assistant-dialog')).toHaveCount(0);expect(await pages.cursorState()).toMatchObject({parentDialog:false,active:false,hidden:true});
});
