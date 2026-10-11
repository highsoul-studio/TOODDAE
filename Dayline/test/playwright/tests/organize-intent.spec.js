import {test,expect} from '../fixtures.js';
import {PagesPage} from '../page-objects/pages.page.js';
import {startMockAi} from '../helpers/mock-ai.js';

const ids=today=>({a:`${today}--00000000-0000-4000-8000-000000000201`,b:`${today}--00000000-0000-4000-8000-000000000202`});
async function ready(page,vault){
  const {a,b}=ids(vault.today);vault.write(`Write/${a}.md`,'# A\n\nA body');vault.write(`Write/${b}.md`,'# B\n\nB body');await vault.settle();
  const pages=new PagesPage(page,vault),mock=await startMockAi();await pages.open();await pages.setMockProvider(mock.baseUrl);await pages.noteLink(a).click();await expect.poll(()=>pages.currentNoteId()).toBe(a);return{a,b,pages,mock};
}

test('pending B selection invalidates A Organize before B GET resolves',async({page,vault})=>{
  const {a,b,pages,mock}=await ready(page,vault);try{const ai=await pages.delayOrganizeResponse(),note=await pages.delayWriteNote(b);await page.getByTestId('write-organize').click();await page.getByTestId('organize-submit').click();await ai.started;await pages.noteLink(b).click();await note.started;expect(await pages.currentNoteId()).toBe(a);ai.release();await expect(pages.proposal).toBeHidden();await expect(pages.conflict).toBeHidden();note.release();await expect.poll(()=>pages.currentNoteId()).toBe(b);await expect(pages.preview).toContainText('B body');await expect(pages.status).toBeEmpty();}finally{await mock.close();}
});

test('failed B selection cannot revive a late A proposal or AI error',async({page,vault,allowedConsoleErrors})=>{
  allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 500/);const {a,b,pages,mock}=await ready(page,vault);let release,start;const gate=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{start=resolve});
  await page.route('**/api/write/note?*',async route=>{if(new URL(route.request().url()).searchParams.get('noteId')===b){start();await gate;return route.fulfill({status:500,contentType:'application/json',body:'{"error":"internal"}'});}await route.continue();});
  try{const ai=await pages.delayOrganizeResponse();await page.getByTestId('write-organize').click();await page.getByTestId('organize-submit').click();await ai.started;await pages.noteLink(b).click();await started;release();await expect(pages.status).toContainText(/저장|save|保存|保存/);ai.release();await expect.poll(()=>pages.currentNoteId()).toBe(a);await expect(pages.proposal).toBeHidden();await expect(pages.conflict).toBeHidden();await expect(pages.status).toContainText(/저장|save|保存|保存/);}finally{await mock.close();}
});

test('selection during Organize own-save prevents any later A request even when B load fails',async({page,vault,allowedConsoleErrors})=>{
  allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 500/);const {a,b,pages,mock}=await ready(page,vault),saves=await pages.delayNextWriteSave(),organize=[];await page.route('**/api/write/organize',async route=>{organize.push(route.request().postDataJSON());await route.continue();});await page.route('**/api/write/note?*',route=>new URL(route.request().url()).searchParams.get('noteId')===b?route.fulfill({status:500,contentType:'application/json',body:'{"error":"internal"}'}):route.continue());
  try{await pages.openWriteEdit();await pages.editor.fill('A dirty body');await page.getByTestId('write-organize').evaluate(button=>button.click());await page.getByTestId('organize-submit').click();await saves.started;await pages.noteLink(b).click();saves.release();await expect.poll(()=>pages.noteFile(a)).toContain('A dirty body');await expect.poll(()=>pages.currentNoteId()).toBe(a);expect(organize).toHaveLength(0);await expect(pages.proposal).toBeHidden();}finally{await mock.close();}
});

test('normal dirty Organize saves first and proposes against the saved base',async({page,vault})=>{
  const {a,pages,mock}=await ready(page,vault);try{const ai=await pages.delayOrganizeResponse();await pages.openWriteEdit();await pages.editor.fill('A freshly saved body');await page.getByTestId('write-organize').evaluate(button=>button.click());await page.getByTestId('organize-submit').click();await ai.started;expect(ai.calls).toHaveLength(1);expect(ai.calls[0].text).toContain('A freshly saved body');await expect.poll(()=>pages.noteFile(a)).toContain('A freshly saved body');ai.release();await expect(pages.proposal).toBeVisible();await expect(page.getByTestId('proposal-apply')).toBeEnabled();}finally{await mock.close();}
});

test('late settings error yields to the newer selected note',async({page,vault,allowedConsoleErrors})=>{
  allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 500/);const {b,pages,mock}=await ready(page,vault);try{
    let releaseGet,startGet,delayedGet=false;const getGate=new Promise(resolve=>{releaseGet=resolve}),getStarted=new Promise(resolve=>{startGet=resolve});await page.route('**/api/settings',async route=>{if(!delayedGet&&route.request().method()==='GET'){delayedGet=true;startGet();await getGate;return route.fulfill({status:500,contentType:'application/json',body:'{"error":"internal"}'});}await route.continue();});
    await page.getByTestId('write-organize').click();await page.getByTestId('organize-submit').click();await getStarted;await pages.noteLink(b).click();await expect.poll(()=>pages.currentNoteId()).toBe(b);releaseGet();await expect(page.getByTestId('write-organize')).toBeEnabled();await expect(pages.proposal).toBeHidden();await expect(pages.conflict).toBeHidden();await expect(pages.status).toBeEmpty();
  }finally{await mock.close();}
});

test('late consent error yields to the newer selected note',async({page,vault,allowedConsoleErrors})=>{
  allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 500/);const {b,pages,mock}=await ready(page,vault);try{const payload=await pages.getSettings();payload.settings.ai.consent=false;payload.aiReady=true;let releasePost,startPost;const postGate=new Promise(resolve=>{releasePost=resolve}),postStarted=new Promise(resolve=>{startPost=resolve});await page.route('**/api/settings',async route=>{if(route.request().method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});const body=route.request().postDataJSON();if(typeof body?.ai?.consent==='boolean'){startPost();await postGate;return route.fulfill({status:500,contentType:'application/json',body:'{"error":"internal"}'});}await route.continue();});
    await page.getByTestId('write-organize').click();await page.getByTestId('organize-submit').click();await expect(pages.consent).toBeVisible();await page.getByTestId('ai-consent-allow').click();await postStarted;await pages.noteLink(b).click();await expect.poll(()=>pages.currentNoteId()).toBe(b);releasePost();await expect(pages.proposal).toBeHidden();await expect(pages.conflict).toBeHidden();await expect(pages.status).toBeEmpty();
  }finally{await mock.close();}
});

test('pending B selection immediately hides and disables an existing A Apply or Undo receipt',async({page,vault})=>{
  const {b,pages,mock}=await ready(page,vault);try{const ai=await pages.delayOrganizeResponse();await page.getByTestId('write-organize').click();await page.getByTestId('organize-submit').click();await ai.started;ai.release();await expect(pages.proposal).toBeVisible();await page.getByTestId('proposal-apply').click();await expect(page.getByTestId('proposal-undo')).toBeEnabled();const calls=[];await page.route('**/api/write/save',async route=>{calls.push(route.request().postDataJSON());await route.continue();});const note=await pages.delayWriteNote(b);await pages.noteLink(b).click();await note.started;await expect(pages.proposal).toBeHidden();await page.getByTestId('proposal-apply').evaluate(button=>button.click());await page.getByTestId('proposal-undo').evaluate(button=>button.click());expect(calls).toHaveLength(0);note.release();await expect.poll(()=>pages.currentNoteId()).toBe(b);expect(calls).toHaveLength(0);}finally{await mock.close();}
});
