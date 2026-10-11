import {test,expect} from '../fixtures.js';
import {PagesPage} from '../page-objects/pages.page.js';
import {startMockAi} from '../helpers/mock-ai.js';

async function ready(page,vault){
  vault.write(`Write/${vault.today}.md`,'# Original\n\nOriginal body 42');await vault.settle();
  const pages=new PagesPage(page,vault),mock=await startMockAi();await pages.open();await pages.mockDeepseek(mock.baseUrl);await page.reload();await page.getByTestId('nav-write').click();await expect(page.getByTestId('write-organize')).toBeEnabled();return{pages,mock};
}

for(const kind of ['model','provider','effort','consent','test'])for(const phase of ['pending','apply','undo']){
  test(`S2 ${kind} change invalidates ${phase} before response and never revives after Test`,async({page,vault})=>{
    const {pages,mock}=await ready(page,vault);let gate,mutation;
    try{
      gate=await pages.prepareProposalPhase(phase);
      const before=pages.noteFile(vault.today),writes=pages.proposalWrites(),old=await pages.getSettings();
      await page.getByTestId('nav-set').click();mutation=await pages.holdAiMutation();await pages.changeAiControl(kind);await mutation.started;
      await expect(page.getByTestId('proposal-apply')).toBeDisabled();await expect(page.getByTestId('proposal-undo')).toBeDisabled();
      await pages.forceProposalAction('apply');await pages.forceProposalAction('undo');expect(writes).toHaveLength(0);
      mutation.release();await expect(page.getByTestId(kind==='test'?'ai-test-status':'settings-status')).not.toHaveText(/保存中|저장 중|Saving/);
      await expect.poll(async()=>(await pages.getSettings()).aiGeneration).toBeGreaterThan(old.aiGeneration);
      gate.release();
      await pages.mockDeepseek(mock.baseUrl);await pages.publishAiPayload(old);
      await page.getByTestId('nav-write').click();await expect(pages.proposal).toBeHidden();
      await pages.forceProposalAction('apply');await pages.forceProposalAction('undo');expect(writes).toHaveLength(0);expect(pages.noteFile(vault.today)).toBe(before);
    }finally{gate?.release();mutation?.release();await mock.close();}
  });
}

test('S2 delayed settings snapshot cannot dispatch old Organize after model change and fresh Test',async({page,vault})=>{
  const {pages,mock}=await ready(page,vault);const gate=await pages.delaySettingsSnapshot();
  try{const calls=mock.calls.length;await pages.beginOrganize();await gate.started;await pages.publishAiPayload(await pages.setSettings({ai:{models:{deepseek:'new-model'}}}));await pages.testAiConnection();gate.release();await expect(page.getByTestId('write-organize')).toBeEnabled();await expect(pages.proposal).toBeHidden();expect(mock.calls).toHaveLength(calls+1);}finally{gate.release();await mock.close();}
});

test('S2 appearance-only save preserves valid proposal Apply and Undo; ordinary autosave survives consent off',async({page,vault})=>{
  const {pages,mock}=await ready(page,vault);
  try{
    await pages.beginOrganize();await expect(pages.proposal).toBeVisible();const before=await pages.getSettings();
    await pages.publishAiPayload(await pages.setSettings({appearance:{light:{accent:'teal'}}}));expect((await pages.getSettings()).aiGeneration).toBe(before.aiGeneration);
    await expect(page.getByTestId('proposal-apply')).toBeEnabled();await page.getByTestId('proposal-apply').click();await expect(page.getByTestId('proposal-undo')).toBeEnabled();
    await page.getByTestId('proposal-undo').click();await expect.poll(()=>pages.noteFile(vault.today)).toContain('Original body 42');
    await pages.publishAiPayload(await pages.setSettings({ai:{consent:false}}));await pages.openWriteEdit();await pages.editor.fill('Ordinary autosave after consent off');await pages.openWriteRead();await expect.poll(()=>pages.noteFile(vault.today)).toContain('Ordinary autosave after consent off');
  }finally{await mock.close();}
});


test('S2 false readiness without a new generation cannot revive pending or displayed output',async({page,vault})=>{
  const {pages,mock}=await ready(page,vault);let gate;
  try{
    const readyPayload=await pages.getSettings();gate=await pages.delayOrganizeResponse();await pages.beginOrganize();await gate.started;
    await pages.publishAiPayload({aiReady:false});await pages.publishAiPayload(readyPayload);gate.release();await expect(page.getByTestId('write-organize')).toBeEnabled();await expect(pages.proposal).toBeHidden();
    await pages.beginOrganize();await expect(pages.proposal).toBeVisible();const writes=pages.proposalWrites();
    await pages.publishAiPayload({...readyPayload,aiReady:false});await pages.publishAiPayload(readyPayload);await expect(pages.proposal).toBeHidden();
    await pages.forceProposalAction('apply');expect(writes).toHaveLength(0);
  }finally{gate?.release();await mock.close();}
});
