import { test, expect } from '../fixtures.js';
import { PagesPage } from '../page-objects/pages.page.js';
import { startMockAi } from '../helpers/mock-ai.js';

test.describe('観点: Write と Set の 페이지 전환', () => {
  test('パターン: Do AI는 readiness 전 setup을 안내하고 준비되면 실제 생성 결과만 요약한다', async ({ page, vault }) => {const pages=new PagesPage(page,vault),mock=await pages.mockAssistant({response:{status:'partial',results:[{tool:'add_task',created:{text:'10:00 회의',file:`Daily/${vault.today}.md`}}],message:'한 항목은 만들었고 나머지는 날짜가 필요합니다.',error:{code:'needs-input',changedFiles:[`Daily/${vault.today}.md`]},requestId:'server-echo',rootId:vault.rootId}});await page.goto('/');const launch=page.getByTestId('assistant-launch');await expect(launch).toBeEnabled();const layout=await pages.assistantLayout();expect(layout.buttonRight).toBeLessThanOrEqual(layout.progressLeft);await launch.click();const dialog=page.getByTestId('assistant-dialog');await expect(dialog).toBeVisible();await expect(dialog).toContainText(/현재 폴더|current folder|現在のフォルダ|当前文件夹/);await page.getByTestId('assistant-message').fill('10시에 회의를 만들고 모호한 항목은 질문해 줘');await page.getByTestId('assistant-run').click();await mock.started;await expect(page.getByTestId('assistant-run')).toBeDisabled();await expect(page.getByTestId('assistant-cancel')).toBeDisabled();await page.getByTestId('assistant-run').evaluate(button=>button.click());expect(mock.calls).toHaveLength(1);expect(mock.calls[0].root).toBe(vault.rootId);expect(mock.calls[0].body.message).toContain('10시');expect(mock.calls[0].body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);mock.release();await expect(page.getByTestId('assistant-result')).toContainText(/일부|some|一部|部分/);await expect(page.getByTestId('assistant-result')).toContainText('10:00 회의');await expect(page.getByTestId('assistant-result')).toContainText(`Daily/${vault.today}.md`);await expect(page.getByTestId('assistant-message')).toHaveValue('');});
  test('パターン: Do AI readiness가 없으면 비활성 버튼과 Set 안내를 표시한다',async({page,vault})=>{const pages=new PagesPage(page,vault);await pages.mockAssistant({ready:false});await page.goto('/');await expect(page.getByTestId('assistant-launch')).toBeDisabled();await expect(page.getByTestId('assistant-setup')).toBeVisible();await expect(page.getByTestId('assistant-setup')).toHaveAttribute('href','#/set');});
  test('パターン: unsaved AI 설정 blocker는 backend proof가 남아 있어도 Do Assistant를 즉시 끈다',async({page,vault})=>{const pages=new PagesPage(page,vault);await pages.mockAssistant({ready:true});await page.goto('/');await expect(page.getByTestId('assistant-launch')).toBeEnabled();await pages.publishAiReadiness(false);await expect(page.getByTestId('assistant-launch')).toBeDisabled();});
  test('パターン: Do AI network retry는 같은 requestId를 재사용해 중복 생성을 막는다',async({page,vault,allowedConsoleErrors})=>{allowedConsoleErrors.push(/Failed to load resource: net::ERR_FAILED/);const pages=new PagesPage(page,vault),calls=await pages.mockAssistantRetry();await page.goto('/');await page.getByTestId('assistant-launch').click();await page.getByTestId('assistant-message').fill('Plan 섹션을 만들어 줘');await page.getByTestId('assistant-run').click();await expect(page.getByTestId('assistant-result')).toContainText(/확인|Check|確認|检查/);await expect(page.getByTestId('assistant-message')).toHaveValue('Plan 섹션을 만들어 줘');await page.getByTestId('assistant-run').click();await expect(page.getByTestId('assistant-result')).toContainText('Plan');expect(calls).toHaveLength(2);expect(calls[1].requestId).toBe(calls[0].requestId);});
  test('パターン: capability 없는 old server 문서에는 Assistant, Delete, subscription auth를 노출하지 않는다',async({page,vault})=>{vault.write(`Write/${vault.today}.md`,'saved');const pages=new PagesPage(page,vault);await pages.setRuntimeCapabilities({assistant:false,notesDelete:false,subscriptionAuth:false});await page.goto('/');await expect(page.getByTestId('assistant-launch')).toHaveCount(0);await page.getByTestId('nav-write').click();await expect(pages.deleteNote).toBeHidden();await page.getByTestId('nav-set').click();await expect(page.getByTestId('auth-mode-field')).toHaveCount(0);});
  test('パターン: subscription auth mode는 key를 지우지 않고 token 입력 없이 공식 로그인을 시작한다',async({page,vault})=>{const pages=new PagesPage(page,vault),opened=await pages.captureWindowOpen(),starts=await pages.mockAuthStart();await pages.open('set');await pages.setSettings({ai:{baseUrls:{openai:'https://example.com/v1'}}});await page.reload();await pages.saveAiKey('openai','saved-openai-key');await page.getByTestId('provider-field').getByRole('button').click();await page.getByTestId('popover').getByRole('option',{name:'OpenAI'}).click();await page.getByTestId('ai-key').fill('unsaved-key-draft');await page.getByTestId('auth-mode-field').getByRole('button').click();await page.getByTestId('popover').getByRole('option',{name:/ChatGPT/}).click();await expect(pages.keyRow).toBeHidden();await expect(page.getByTestId('ai-base')).toBeHidden();await expect(page.getByTestId('auth-start')).toHaveText(/ChatGPT/);await expect(page.getByTestId('subscription-token')).toHaveCount(0);await page.getByTestId('auth-start').click();await expect.poll(()=>starts.length).toBe(1);expect(starts[0]).toEqual({provider:'openai'});await expect.poll(async()=>await opened()).toContain('https://auth.openai.com/api/accounts/authorize?state=test');await expect(page.getByTestId('auth-start')).toBeEnabled();await page.getByTestId('auth-add-account').click();await expect.poll(()=>starts.length).toBe(2);expect(starts[1]).toEqual({provider:'openai',accountId:''});await expect(page.getByTestId('auth-start')).toBeEnabled();await page.getByTestId('auth-mode-field').getByRole('button').click();await page.getByTestId('popover').getByRole('option',{name:/API/}).click();await expect(pages.keyRow).toBeVisible();await expect(page.getByTestId('ai-base')).toBeVisible();await expect(page.getByTestId('ai-base')).toHaveValue('https://example.com/v1');await expect(page.getByTestId('ai-key')).toHaveValue('unsaved-key-draft');expect((await pages.getSettings()).keys.openai.hasKey).toBe(true);});
  test('パターン: subscription account 전환은 응답 전부터 기존 AI proof를 막고 Test 상태를 지운다',async({page,vault})=>{const pages=new PagesPage(page,vault);await page.goto('/');const payload=await pages.getSettings(),a='a'.repeat(64),b='b'.repeat(64);payload.settings.ai.provider='openai';payload.settings.ai.authModes.openai='chatgpt';payload.settings.ai.consent=true;Object.assign(payload,{aiReady:true,assistantReady:true,subscriptions:{openai:{available:true,connected:true,label:'one@example.com',accounts:[{id:a,label:'one@example.com · aaaaaaaa',active:true,connected:true},{id:b,label:'two@example.com · bbbbbbbb',active:false,connected:true}]},anthropic:{available:true,connected:false,accounts:[]}}});await page.route('**/api/settings',route=>route.request().method()==='GET'?route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)}):route.continue());let release,start;const gate=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{start=resolve});await page.route('**/api/auth/select',async route=>{start();await gate;const next=structuredClone(payload);next.aiReady=false;next.assistantReady=false;next.subscriptions.openai.accounts.forEach(account=>account.active=account.id===b);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(next)});});await page.reload();await page.getByTestId('nav-set').click();await page.route('**/api/ai/test',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({aiReady:true,rootId:vault.rootId})}));await page.getByTestId('ai-test').click();await expect(page.getByTestId('ai-test-status')).not.toBeEmpty();await page.evaluate(()=>{window.__aiReady=[];addEventListener('tooddae-ai-readiness',event=>window.__aiReady.push(event.detail.aiReady));});await page.getByTestId('auth-account-field').getByRole('button').click();await page.getByTestId('popover').getByRole('option',{name:/two@example\.com/}).click();await started;await expect(page.getByTestId('ai-test-status')).toBeEmpty();await expect.poll(()=>page.evaluate(()=>window.__aiReady.at(-1))).toBe(false);release();await expect(page.getByTestId('auth-start')).toBeEnabled();});
  test('パターン: route init 실패는 빈 화면 대신 오류와 retry를 표시하고 복구한다', async ({ page, vault, allowedConsoleErrors }) => {
    allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 500/);
    const pages = new PagesPage(page, vault);
    await pages.open('write');
    await pages.failNextSettingsRequest();
    await page.getByTestId('nav-set').click();
    await expect(page.getByTestId('route-state')).toBeVisible();
    await page.getByTestId('route-retry').click();
    await expect(page.getByTestId('preview-light')).toBeVisible();
  });
  test('パターン: Write 첫 note load 실패도 Retry로 실제 note를 다시 불러온다', async ({ page, vault, allowedConsoleErrors }) => {
    allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 500/);
    const pages = new PagesPage(page, vault);
    await page.goto('/');
    await pages.failNextWriteNoteRequest();
    await page.getByTestId('nav-write').click();
    await expect(page.getByTestId('route-state')).toBeVisible();
    await page.getByTestId('route-retry').click();
    await expect(pages.preview).toBeVisible();
    await expect(pages.noteRail.getByTestId('note-link')).toHaveAttribute('aria-current', 'date');
  });
  test('パターン: Write가 두 번 실패한 뒤 성공해도 document pointer listener는 한 번만 붙는다', async ({ page, vault, allowedConsoleErrors }) => {
    allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 500/);
    await page.addInitScript(() => {
      window.__pointerAdds = 0;
      const original = Document.prototype.addEventListener;
      Document.prototype.addEventListener = function(type, ...args) { if (type === 'pointerup') window.__pointerAdds++; return original.call(this, type, ...args); };
    });
    const pages = new PagesPage(page, vault);
    await page.goto('/');
    const baseline=await page.evaluate(()=>window.__pointerAdds);
    await pages.failWriteNoteRequests(2);
    await page.getByTestId('nav-write').click();
    await page.getByTestId('route-retry').click();
    await page.getByTestId('route-retry').click();
    await expect(pages.preview).toBeVisible();
    expect((await page.evaluate(() => window.__pointerAdds))-baseline).toBe(1);
  });
  test('パターン: theme 색상 보간 중 nav는 응답하고 연속 토글 후 원래 테마가 유지된다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    await pages.open('write');
    await pages.setTheme('dark');
    const frames = pages.sampleNeutralColor();
    await page.getByTestId('theme-toggle').click();
    await page.getByTestId('nav-set').click();
    await expect(page.getByTestId('nav-set')).toHaveAttribute('aria-current', 'page');
    await page.getByTestId('theme-toggle').click();
    const sample = await frames;
    await expect(pages.root).toHaveAttribute('data-theme', 'dark');
    expect(sample.values.some((value) => value !== sample.start && value !== sample.end)).toBe(true);
    expect(await pages.isClickableAtCenter('nav-set')).toBe(true);
  });

  test('パターン: 브랜드는 기존색 fade-out 뒤 숨겨진 상태에서 새색으로 바꾸고 fade-in 한다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    await pages.open('write');
    await pages.setTheme('dark');
    const sample = pages.sampleBrandColor();
    await pages.toggleTheme();
    const frames = await sample;
    const changed=frames.values.findIndex(value=>value.ink!==frames.start.ink);
    expect(changed).toBeGreaterThan(0);
    expect(Math.min(...frames.values.slice(0,changed+1).map(value=>value.opacity))).toBeLessThanOrEqual(.05);
    expect(frames.values[changed].opacity).toBeLessThanOrEqual(.05);
    expect(frames.values.slice(0,changed).filter(value=>value.opacity>.1).every(value=>value.ink===frames.start.ink)).toBe(true);
    expect(frames.values.slice(changed).some(value=>value.opacity>0&&value.opacity<1)).toBe(true);
    expect(frames.end.opacity).toBeGreaterThan(.99);
    expect(frames.end.ink).not.toBe(frames.start.ink);
    expect(frames.values.filter(value=>value.opacity>.1).some(value=>/rgb\(255, 255, 255\)|rgb\(0, 0, 0\)/.test(value.ink))).toBe(false);
  });
  test('パターン: 브랜드 rapid theme toggle도 현재 opacity에서 이어지고 마지막 색으로 복구한다', async ({ page, vault }) => {const pages=new PagesPage(page,vault);await pages.open('write');await pages.setTheme('dark');const sample=pages.sampleBrandColor({expected:'start',maxMs:3000});await pages.toggleTheme();await expect.poll(async()=>(await pages.brandState()).opacity).toBeLessThan(.8);await pages.toggleTheme();const frames=await sample;expect(frames.timedOut).toBe(false);expect(Math.min(...frames.values.map(value=>value.opacity))).toBeLessThanOrEqual(.05);expect(frames.end.opacity).toBeGreaterThan(.99);expect(frames.end.ink).toBe(frames.start.ink);expect(frames.values.filter(value=>value.opacity>.1).some(value=>/rgb\(255, 255, 255\)|rgb\(0, 0, 0\)/.test(value.ink))).toBe(false);});
  test('パターン: 같은 설정 configure가 brand fade를 중간에 끊거나 색을 노출하지 않는다', async ({ page, vault }) => {const pages=new PagesPage(page,vault);await pages.open('write');await pages.setTheme('dark');const sample=pages.sampleBrandColor();await pages.toggleTheme();await expect.poll(async()=>(await pages.brandState()).opacity).toBeLessThan(.8);const before=await pages.brandState();await pages.configureThemeFromBoot();const after=await pages.brandState();expect(after.fill).toBe(before.fill);expect(after.opacity).toBeLessThanOrEqual(before.opacity+.05);const frames=await sample;const changed=frames.values.findIndex(value=>value.ink!==frames.start.ink);expect(changed).toBeGreaterThan(0);expect(frames.values[changed].opacity).toBeLessThanOrEqual(.05);expect(frames.end.opacity).toBeGreaterThan(.99);});
  test('パターン: reduced motion에서는 브랜드 색을 fade 없이 즉시 바꾼다', async ({ page, vault }) => {const pages=new PagesPage(page,vault);await page.emulateMedia({reducedMotion:'reduce'});await pages.open('write');await pages.setTheme('dark');const before=await pages.brandState();await pages.toggleTheme();await expect.poll(async()=>(await pages.brandState()).fill).not.toBe(before.fill);const after=await pages.brandState();expect(after.opacity).toBe(1);expect(after.opacityAnimations).toBe(0);});
  test('パターン: nav と deep link が選択状態を同期し、⌘K で Do の入力へ戻る', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    await pages.open('write');
    await page.goto('/#/set');
    await expect(page.getByTestId('nav-set')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('folder-button')).toBeVisible();
    await expect(page.getByTestId('footer')).toContainText(/TOODDAE.*HIGHSOUL/);
    await page.keyboard.press('Meta+k');
    await expect(page.getByTestId('nav-do')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('quick-input')).toBeFocused();
  });

  test('パターン: 편집 중 언어 전환은 autosave를 완료한 뒤 reload하고 저장된 초안을 보여 준다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    await pages.open();
    await pages.openWriteEdit();
    await pages.editor.fill('Draft survives language switch');
    await page.getByTestId('lang-button').click();
    await page.getByTestId('popover').getByRole('option', { name: 'English' }).click();
    await expect(pages.preview).toContainText('Draft survives language switch');
    await expect.poll(()=>pages.noteFile(vault.today)).toContain('Draft survives language switch');
  });
  test('パターン: AI setup hint는 4개 언어의 현재 문구로 표시된다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    for (const [lang,text] of [['ja','「Set」でAIを設定し、接続テストを完了してください。'],['ko','설정(Set)에서 AI를 연결하고 연결 테스트를 완료해 주세요.'],['en','Configure AI in Set and complete a connection test.'],['zh','请在 Set 中配置 AI 并完成连接测试。']]) {
      await page.goto('/#/write'); await page.evaluate((value)=>localStorage.setItem('lang',value),lang); await page.reload();
      await expect(page.getByTestId('write-ai-hint')).toHaveText(text);
    }
  });

  test('パターン: truncated organize proposal은 identity/base를 확인하고 Apply를 막는다',async({page,vault})=>{const pages=new PagesPage(page,vault),mock=await startMockAi();try{vault.write(`Write/${vault.today}.md`,'# Long original\n\nThis original note contains enough content to be sent for organizing.');await vault.settle();await pages.open();await pages.setMockProvider(mock.baseUrl);const bodies=[];await page.route('**/api/write/organize',async route=>{const body=route.request().postDataJSON();bodies.push(body);const real=await(await route.fetch()).json();await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...real,text:'# Cut',warnings:['truncated']})});});await page.getByTestId('write-organize').click();await page.getByTestId('organize-submit').click();await expect(pages.proposal).toBeVisible();await expect(page.getByTestId('proposal-warning')).toContainText(/잘려|truncated|途中|截断/);await expect(page.getByTestId('proposal-apply')).toBeDisabled();expect(bodies).toHaveLength(1);expect(bodies[0].noteId).toBe(vault.today);expect(typeof bodies[0].base).toBe('string');await page.getByTestId('proposal-apply').evaluate(button=>button.click());expect(pages.noteFile(vault.today)).not.toContain('# Cut');}finally{await mock.close();}});

  test('パターン: shorter organize proposal은 경고를 표시하되 사용자가 검토 후 Apply할 수 있다',async({page,vault})=>{const pages=new PagesPage(page,vault),mock=await startMockAi({text:'# Short'});try{vault.write(`Write/${vault.today}.md`,'# Long original\n\nThis original note contains enough content to be longer than the proposal.');await vault.settle();await pages.open();await pages.setMockProvider(mock.baseUrl);await page.route('**/api/write/organize',async route=>{const body=route.request().postDataJSON();const real=await(await route.fetch()).json();await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...real,text:'# Short',warnings:['shorter']})});});await page.getByTestId('write-organize').click();await page.getByTestId('organize-submit').click();await expect(page.getByTestId('proposal-warning')).toContainText(/짧|shorter|短|更短/);await expect(page.getByTestId('proposal-apply')).toBeEnabled();}finally{await mock.close();}});

  test('パターン: A Organize 응답보다 사용자의 B 선택이 먼저면 B에 conflict/status를 남기지 않는다',async({page,vault})=>{const a=`${vault.today}--00000000-0000-4000-8000-000000000101`,b=`${vault.today}--00000000-0000-4000-8000-000000000102`;vault.write(`Write/${a}.md`,'# A\n\nA body');vault.write(`Write/${b}.md`,'# B\n\nB body');await vault.settle();const pages=new PagesPage(page,vault),mock=await startMockAi();try{await pages.open();await pages.setMockProvider(mock.baseUrl);await pages.noteLink(a).click();const delayed=await pages.delayOrganizeResponse();await page.getByTestId('write-organize').click();await page.getByTestId('organize-submit').click();await delayed.started;await pages.noteLink(b).click();await expect.poll(()=>pages.currentNoteId()).toBe(b);delayed.release();await expect(pages.preview).toContainText('B body');await expect(pages.conflict).toBeHidden();await expect(pages.status).toBeEmpty();await expect(page.getByTestId('write-proposal')).toBeHidden();}finally{await mock.close();}});

  test('パターン: Organize 중 같은 note draft/409는 현재 draft를 보존하고 conflict를 표시한다',async({page,vault,allowedConsoleErrors})=>{allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 409/);const pages=new PagesPage(page,vault),mock=await startMockAi();try{await pages.open();await pages.setMockProvider(mock.baseUrl);let delayed=await pages.delayOrganizeResponse();await page.getByTestId('write-organize').click();await page.getByTestId('organize-submit').click();await delayed.started;await pages.openWriteEdit();await pages.editor.fill('local during organize');delayed.release();await expect(pages.conflict).toBeVisible();await expect(pages.editor).toHaveText('local during organize');await page.getByTestId('write-reload').click();delayed=await pages.delayOrganizeResponse({status:409});await page.getByTestId('write-organize').click();await page.getByTestId('organize-submit').click();await delayed.started;delayed.release();await expect(pages.conflict).toBeVisible();}finally{await mock.close();}});

  test('パターン: B note GET 대기 중 A SSE refresh는 B 선택 intent를 취소하지 않는다',async({page,vault})=>{const a=`${vault.today}--00000000-0000-4000-8000-000000000111`,b=`${vault.today}--00000000-0000-4000-8000-000000000112`;vault.write(`Write/${a}.md`,'# A\n\nA old');vault.write(`Write/${b}.md`,'# B\n\nB body');await vault.settle();const pages=new PagesPage(page,vault);await pages.open();await pages.noteLink(a).click();const delayed=await pages.delayWriteNote(b);await pages.noteLink(b).click();await delayed.started;vault.write(`Write/${a}.md`,'# A\n\nA external');await vault.settle();expect(await pages.currentNoteId()).toBe(a);delayed.release();await expect.poll(()=>pages.currentNoteId()).toBe(b);await expect(pages.preview).toContainText('B body');await expect(pages.noteLink(b)).toHaveAttribute('aria-current','date');});
});

test.describe('観点: Write ノートの保存と競合', () => {
  test('パターン: 편집 내용이 저장되고 재진입 후에도 유지된다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    await pages.open();
    await pages.openWriteEdit();
    await pages.editor.fill('# E2E fake note\n\nPlain text persists.');
    await expect.poll(() => pages.noteFile(vault.today)).toContain('Plain text persists.');
    await expect(pages.noteRail.getByTestId('note-link')).toHaveAttribute('aria-current', 'date');
    await expect(pages.noteRail.getByTestId('note-link')).toContainText('E2E fake note');
    await page.reload();
    await expect(pages.preview).toContainText('Plain text persists.');
    await pages.openWriteEdit();
    await expect(pages.editor).toHaveText(/Plain text persists\./);
  });

  test('パターン: 저장 대기 중 vault 변경은 충돌 배너를 표시한다', async ({ page, vault, allowedConsoleErrors }) => {
    allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 409 \(Conflict\)/);
    const pages = new PagesPage(page, vault);
    await pages.open();
    await pages.openWriteEdit();
    await pages.editor.fill('Local edit waiting to autosave');
    vault.write(`Write/${vault.today}.md`, 'Remote edit from another client');
    await expect(pages.conflict).toBeVisible();
  });

  test('パターン: Read 미리보기는 HTML 주입을 실행하지 않는다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    await pages.open();
    await pages.openWriteEdit();
    await pages.editor.fill('<img src=x onerror=alert(1)>\n\n<script>alert(2)</script>');
    await pages.openWriteRead();
    expect(await pages.previewHasUnsafeMarkup()).toBe(0);
  });
  test('パターン: Read는 ordered/unordered list와 heading/link/code/quote를 구조적으로 렌더링한다', async ({ page, vault }) => {const pages=new PagesPage(page,vault);await pages.open();await pages.openWriteEdit();await pages.editor.fill('## Heading\n3. third\n4. fourth\n\n- bullet\n\n[link](https://example.com) `code`\n\n> quote');await pages.openWriteRead();expect(await pages.markdownStructure()).toEqual({ol:'3',ordered:['third','fourth'],ul:['bullet'],heading:'Heading',link:'https://example.com',code:'code',blockquote:'quote'});});
  test('パターン: Read는 표준 emphasis/strike/hr/task list를 렌더링하고 escape와 code는 건드리지 않는다',async({page,vault})=>{const pages=new PagesPage(page,vault);await pages.open();await pages.openWriteEdit();await pages.editor.fill('__bold__ _italic_ ~~gone~~ --kept-- \\_\\_plain\\_\\_ `~~code~~`\n\n---\n- [ ] open\n- [x] done');await pages.openWriteRead();expect(await pages.markdownExtended()).toEqual({strong:['bold'],em:['italic'],del:['gone'],tasks:[{text:'open',checked:false,disabled:true},{text:'done',checked:true,disabled:true}],hr:1});await expect(pages.preview).toContainText('--kept-- __plain__ ~~code~~');expect(await pages.previewHasUnsafeMarkup()).toBe(0);});
  test('パターン: Read는 정렬·escaped pipe를 포함한 Markdown table을 안전하게 렌더링한다', async ({ page, vault }) => {const pages=new PagesPage(page,vault);await pages.open();await pages.openWriteEdit();await pages.editor.fill('| 항목 | 값 |\n| :--- | ---: |\n| `a|b` | 42 |\n| x\\|y | <img> |');await pages.openWriteRead();expect(await pages.markdownTable()).toEqual({headers:['항목','값'],rows:[['a|b','42'],['x|y','<img>']],align:['left','right'],overflow:'auto'});expect(await pages.previewHasUnsafeMarkup()).toBe(0);});

  test('パターン: History UI는 없지만 backend snapshot은 보존된다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    await pages.open();
    await pages.openWriteEdit();
    await pages.editor.fill('Earlier version');
    await expect.poll(() => pages.noteFile(vault.today)).toContain('Earlier version');
    await pages.saveSnapshot('Later version');
    await expect(page.getByTestId('write-history')).toHaveCount(0);
    const response = await page.request.get(`/api/write/history?date=${vault.today}`, { headers: pages.apiHeaders });
    expect((await response.json()).versions).toHaveLength(1);
  });

  test('パターン: 기본 Read/편집 Only Read, 제목 H1과 여러 줄 본문을 숨은 autosave에서도 원자적으로 저장한다', async ({ page, vault }) => {
    vault.write(`Write/${vault.today}.md`, '기존 첫 줄\n\n그대로 둘 빈 줄\n');
    const pages = new PagesPage(page, vault);
    await pages.open();
    await expect(page.getByTestId('write-edit')).toBeVisible();
    await expect(page.getByTestId('write-organize')).toBeVisible();
    await expect(page.getByTestId('write-read')).toBeHidden();
    expect(pages.noteFile(vault.today)).toBe('기존 첫 줄\n\n그대로 둘 빈 줄\n');
    await pages.openWriteEdit();
    await expect(page.getByTestId('write-read')).toBeVisible();
    await expect(page.getByTestId('write-edit')).toBeHidden();
    await expect(page.getByTestId('write-organize')).toBeHidden();
    await pages.titleInput.fill('사용자 제목');
    await pages.editor.fill('첫 줄\n\n둘째 줄');
    await pages.openWriteRead();
    await expect.poll(() => pages.noteFile(vault.today)).toBe('# 사용자 제목\n\n첫 줄\n\n둘째 줄');
    await expect(pages.readTitle).toHaveText('사용자 제목');
  });
  test('パターン: 편집의 저장 action은 title/body save queue 성공 뒤에만 Read로 전환한다',async({page,vault})=>{const pages=new PagesPage(page,vault);await pages.open();await pages.openWriteEdit();const delayed=await pages.delayNextWriteSave();await pages.titleInput.fill('저장 제목');await pages.editor.fill('A\n\nB');await expect(pages.saveMode).toHaveAttribute('aria-label',/저장|保存|Save/);await pages.saveMode.click();await delayed.started;await expect(pages.editor).toBeVisible();await expect(pages.saveMode).toBeDisabled();delayed.release();await expect(pages.preview).toBeVisible();await expect.poll(()=>pages.noteFile(vault.today)).toBe('# 저장 제목\n\nA\n\nB');});
  test('パターン: 저장 실패 시 editor와 draft를 유지하고 Read로 전환하지 않는다',async({page,vault,allowedConsoleErrors})=>{allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 500/);const pages=new PagesPage(page,vault);await pages.open();await pages.openWriteEdit();await pages.editor.fill('실패해도 남는 draft');await page.route('**/api/write/save',route=>route.fulfill({status:500,contentType:'application/json',body:'{"error":"internal"}'}));await pages.saveMode.click();await expect(pages.editor).toBeVisible();await expect(pages.preview).toBeHidden();await expect(pages.editor).toHaveText('실패해도 남는 draft');await expect(pages.status).not.toBeEmpty();});
  test('パターン: editor 전용 Markdown shortcuts는 plain source/undo/caret를 보존하고 밖에서는 실행되지 않는다',async({page,vault})=>{const pages=new PagesPage(page,vault);await pages.open();await pages.openWriteEdit();for(const[key,expected]of[['B','**alpha**'],['I','*alpha*'],['Shift+X','~~alpha~~']]){await pages.editor.fill('alpha');await pages.selectEditorAll();await page.keyboard.press(`ControlOrMeta+${key}`);await expect(pages.editor).toHaveText(expected);expect((await pages.editorSelection()).selected).toBe('alpha');await page.keyboard.press(`ControlOrMeta+${key}`);await expect(pages.editor).toHaveText('alpha');expect((await pages.editorSelection()).selected).toBe('alpha');}for(const[key,expected]of[['E','`alpha`'],['K','[alpha](https://)']]){await pages.editor.fill('alpha');await pages.selectEditorAll();await page.keyboard.press(`ControlOrMeta+${key}`);await expect(pages.editor).toHaveText(expected);}await pages.editor.fill('');await pages.placeEditorCaretAtEnd();await page.keyboard.press('ControlOrMeta+B');expect(await pages.editorSelection()).toEqual({text:'****',selected:'',offset:2,node:3});await page.keyboard.press('ControlOrMeta+B');await expect(pages.editor).toHaveText('');await page.keyboard.press('ControlOrMeta+Z');await expect(pages.editor).toHaveText('****');await page.keyboard.press('ControlOrMeta+Z');await expect(pages.editor).toHaveText('');await pages.editor.fill('a');await pages.selectEditorAll();await page.keyboard.press('ControlOrMeta+B');await expect(pages.editor).toHaveText('**a**');await pages.editor.fill('abcdefghi');await pages.selectEditorRange(3,6);await page.keyboard.press('ControlOrMeta+I');await pages.openWriteRead();expect((await pages.markdownExtended()).em).toEqual(['def']);await pages.openWriteEdit();await pages.editor.fill('**alpha**');await pages.selectEditorAll();await page.keyboard.press('ControlOrMeta+B');await expect(pages.editor).toHaveText('alpha');await pages.editor.fill('A\nB');await pages.selectEditorAll();await page.keyboard.press('ControlOrMeta+B');expect((await pages.editorSelection()).text).toBe('**A**\n**B**');await pages.editor.fill('A\nB');await pages.selectEditorAll();await page.keyboard.press('ControlOrMeta+E');expect((await pages.editorSelection()).text).toBe('```\nA\nB\n```');await pages.editor.fill('Heading');await pages.selectEditorAll();await page.keyboard.press('ControlOrMeta+Alt+2');await expect(pages.editor).toHaveText('## Heading');await pages.editor.fill('item');await pages.selectEditorAll();await page.keyboard.press('ControlOrMeta+Shift+7');await expect(pages.editor).toHaveText('1. item');await pages.editor.fill('alpha');await pages.selectEditorAll();await page.keyboard.press('ControlOrMeta+B');await page.keyboard.press('ControlOrMeta+Z');await expect(pages.editor).toHaveText('alpha');await pages.editor.fill('alpha');await pages.placeEditorCaretAtEnd();await page.keyboard.press('ControlOrMeta+E');expect(await pages.editorSelection()).toEqual({text:'alpha``',selected:'',offset:6,node:3});await pages.titleInput.fill('제목');await pages.titleInput.focus();await page.keyboard.press('ControlOrMeta+B');await expect(pages.titleInput).toHaveValue('제목');await expect(page).toHaveURL(/#\/write$/);await page.keyboard.press('ControlOrMeta+S');await expect(pages.preview).toBeVisible();await expect.poll(()=>pages.noteFile(vault.today)).toContain('# 제목');});
  test('パターン: 같은 날짜에 노트를 두 개 추가하고 noteId별 title/body를 독립 저장한다',async({page,vault})=>{await page.addInitScript(()=>localStorage.setItem('lang','ko'));const pages=new PagesPage(page,vault);await pages.open();await pages.noteAdd.click();await expect(pages.readTitle).toHaveText('새로운 노트');const first=await pages.currentNoteId();expect(first).toMatch(new RegExp(`^${vault.today}--`));await pages.openWriteEdit();await pages.titleInput.fill('첫 노트');await pages.editor.fill('첫 본문');await pages.saveMode.click();await expect(pages.preview).toContainText('첫 본문');await expect(pages.noteLinks.filter({hasText:'첫 노트'})).toBeVisible();for(const width of [1280,390]){await page.setViewportSize({width,height:800});const card=await pages.noteCardGeometry();expect(Math.abs(card.addHeight-card.noteHeight)).toBeLessThanOrEqual(1);expect(card.borderStyle).toBe('dashed');expect(card.clipped).toBe(false);}await pages.noteAdd.click();await expect.poll(()=>pages.currentNoteId()).not.toBe(first);const second=await pages.currentNoteId();expect(second).toMatch(new RegExp(`^${vault.today}--`));await pages.openWriteEdit();await pages.titleInput.fill('둘째 노트');await pages.editor.fill('둘째 본문');await pages.saveMode.click();await pages.noteLinks.filter({hasText:'첫 노트'}).click();await expect(pages.readTitle).toHaveText('첫 노트');await expect(pages.preview).toContainText('첫 본문');await pages.noteLinks.filter({hasText:'둘째 노트'}).click();await expect(pages.preview).toContainText('둘째 본문');expect(new Set((await pages.noteIds()).filter(id=>id.includes('--')))).toEqual(new Set([first,second]));});
  test('パターン: Create 응답이 늦어도 최신 B 선택·draft를 유지하고 C는 한 번만 rail에 추가한다',async({page,vault})=>{const a=`${vault.today}--00000000-0000-4000-8000-000000000011`,b=`${vault.today}--00000000-0000-4000-8000-000000000012`;vault.write(`Write/${a}.md`,'# A\n\nA body');vault.write(`Write/${b}.md`,'# B\n\nB body');const pages=new PagesPage(page,vault),delayed=await pages.delayNextWriteCreate();await pages.open();await pages.noteLink(a).click();await pages.noteAdd.click();await delayed.started;await pages.noteAdd.click();await pages.noteLink(b).click();await pages.openWriteEdit();await pages.editor.fill('B local draft');delayed.release();await expect.poll(()=>pages.noteIds()).toHaveLength(4);expect(delayed.calls).toHaveLength(1);expect(await pages.currentNoteId()).toBe(b);await expect(pages.editor).toBeVisible();await expect(pages.editor).toHaveText('B local draft');const ids=await pages.noteIds();expect(ids.filter(id=>id.includes('--')&&!new Set([a,b]).has(id))).toHaveLength(1);});
  test('パターン: 과거 note에서 Add해도 오늘 note를 만들고 대기 중 같은 note 편집을 덮지 않는다',async({page,vault})=>{const past=vault.day(-2);vault.write(`Write/${past}.md`,'# Past\n\nPast body');const pages=new PagesPage(page,vault),delayed=await pages.delayNextWriteCreate();await pages.open();await pages.noteLink(past).click();await pages.noteAdd.click();await delayed.started;await pages.openWriteEdit();await pages.editor.fill('Past local draft');delayed.release();await expect.poll(()=>pages.noteIds()).toContainEqual(expect.stringMatching(new RegExp(`^${vault.today}--`)));expect(delayed.calls).toHaveLength(1);expect(delayed.calls[0].date).toBe(vault.today);expect(await pages.currentNoteId()).toBe(past);await expect(pages.editor).toBeVisible();await expect(pages.editor).toHaveText('Past local draft');});
  test('パターン: 검색은 120개 밖의 title/body/date를 찾고 현재 draft와 검색 focus를 유지한다',async({page,vault})=>{for(let i=0;i<240;i++){const id=`${vault.day(-2)}--00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;vault.write(`Write/${id}.md`,i===0?'# 오래된 제목\nneedle-old 본문':'# ordinary\nbody');}const pages=new PagesPage(page,vault);await pages.open();await pages.openWriteEdit();const delayed=await pages.delayNextWriteSave();await pages.editor.fill('현재 unsaved draft');await pages.noteSearch.fill('needle-old');await expect(pages.noteLinks.filter({hasText:'오래된 제목'})).toBeVisible();await expect(pages.noteSearch).toBeFocused();await expect(pages.editor).toHaveText('현재 unsaved draft');delayed.release();});
  test('パターン: 같은날 A save 대기 중 B 선택과 B SSE는 noteId별로 격리된다',async({page,vault,allowedConsoleErrors})=>{allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 409/);const a=`${vault.today}--00000000-0000-4000-8000-000000000001`,b=`${vault.today}--00000000-0000-4000-8000-000000000002`;vault.write(`Write/${a}.md`,'# A\n\nA body');vault.write(`Write/${b}.md`,'# B\n\nB body');const pages=new PagesPage(page,vault);await pages.open();await pages.noteLink(a).click();await pages.openWriteEdit();const delayed=await pages.delayNextWriteSave();await pages.editor.fill('A local');await pages.noteLink(b).click();await delayed.started;expect(await pages.currentNoteId()).toBe(a);await expect(pages.editor).toHaveText('A local');delayed.release();await expect.poll(()=>pages.currentNoteId()).toBe(b);await expect(pages.preview).toContainText('B body');expect(vault.read(`Write/${a}.md`)).toContain('A local');expect(vault.read(`Write/${b}.md`)).toContain('B body');await pages.noteLink(a).click();await pages.openWriteEdit();await pages.editor.fill('A draft');vault.write(`Write/${b}.md`,'# B external\n\nB changed');await vault.settle();await expect(pages.conflict).toBeHidden();await expect(pages.editor).toHaveText('A draft');vault.write(`Write/${a}.md`,'# A external\n\nA changed');await vault.settle();await expect(pages.conflict).toBeVisible();});

  test('パターン: 여러 줄 입력 직후 Set으로 이동해 editor가 숨겨져도 draft string 그대로 저장된다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    await pages.open();
    await pages.openWriteEdit();
    await pages.editor.fill('A\n\n\n\nB\nC\n');
    await page.getByTestId('nav-set').click();
    await expect.poll(() => pages.noteFile(vault.today)).toBe('A\n\n\n\nB\nC\n');
  });
  test('パターン: Write editor는 고정 responsive 높이에서 내부 scroll하고 resize되지 않는다', async ({ page, vault }) => {
    const pages=new PagesPage(page,vault);await pages.open();await pages.openWriteEdit();const before=await pages.editorBox();await pages.editor.fill(Array.from({length:100},(_,i)=>`line ${i}`).join('\n'));const after=await pages.editorBox();expect(Math.abs(after.height-before.height)).toBeLessThan(1);expect(after.scrollHeight).toBeGreaterThan(after.clientHeight);expect(after.overflow).toBe('auto');expect(after.resize).toBe('none');
  });

  test('パターン: final newline 없는 H1에 본문을 추가하면 제목과 본문 사이에 실제 newline을 넣는다', async ({ page, vault }) => {
    vault.write(`Write/${vault.today}.md`, '# Title');
    const pages = new PagesPage(page, vault);
    await pages.open();
    await expect(pages.readTitle).toHaveText('Title');
    await pages.openWriteEdit();
    await pages.editor.fill('New body');
    await pages.openWriteRead();
    await expect.poll(() => pages.noteFile(vault.today)).toBe('# Title\nNew body');
    await page.reload();
    await expect(pages.readTitle).toHaveText('Title');
    await expect(pages.preview).toContainText('New body');
  });

  test('パターン: 저장된 note만 확인 후 삭제하고 정확한 내용을 Undo로 복원한다', async ({ page, vault }) => {
    const pages=new PagesPage(page,vault);await pages.open();await expect(pages.deleteNote).toBeHidden();await pages.openWriteEdit();await pages.titleInput.fill('Delete title');await pages.editor.fill('Delete me\n\nsecond line');await pages.openWriteRead();await expect(pages.deleteNote).toBeVisible();expect(await pages.writeActionOrder()).toEqual(['write-edit','write-delete','write-organize']);await pages.deleteNote.click();await expect(page.getByTestId('confirm-title')).toContainText(/削除|삭제|Delete|删除/);await expect(page.getByTestId('confirm-dialog')).toContainText(`Delete title`);await expect(page.getByTestId('confirm-dialog')).toContainText(vault.today);await page.getByTestId('confirm-no').click();await expect.poll(()=>pages.noteFile(vault.today)).toBe('# Delete title\n\nDelete me\n\nsecond line');await pages.deleteNote.click();await page.getByTestId('confirm-yes').click();await expect(pages.deleteUndo).toBeVisible();await expect(pages.deleteUndo.getByTestId('toast-undo')).toBeEnabled();await expect(page.getByTestId('write-delete-undo')).toHaveCount(0);await expect.poll(async()=>(await pages.toastPlacement()).bottom).toBeCloseTo(24,0);const placement=await pages.toastPlacement();expect(placement.bottom).toBeGreaterThan(22);expect(placement.bottom).toBeLessThanOrEqual(24);expect(placement.inWrite).toBe(false);expect(placement.container).toBe('toasts');expect(vault.exists(`Write/${vault.today}.md`)).toBe(false);await expect(pages.deleteNote).toBeHidden();await pages.deleteUndo.getByTestId('toast-undo').click();await expect.poll(()=>pages.noteFile(vault.today)).toBe('# Delete title\n\nDelete me\n\nsecond line');await expect(pages.deleteUndo).toBeHidden();await expect(pages.preview).toContainText('Delete me');await expect(pages.deleteNote).toBeVisible();
  });

  test('パターン: confirm 중 외부 변경이 생기면 delete가 충돌하고 원격 note를 덮어쓰지 않는다', async ({ page, vault, allowedConsoleErrors }) => {
    allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 409 \(Conflict\)/);vault.write(`Write/${vault.today}.md`,'Original note');const pages=new PagesPage(page,vault);await pages.open();await pages.deleteNote.click();vault.write(`Write/${vault.today}.md`,'Remote note wins');await vault.settle();await page.getByTestId('confirm-yes').click();await expect(pages.conflict).toBeVisible();expect(pages.noteFile(vault.today)).toBe('Remote note wins');await expect(pages.deleteUndo).toBeHidden();await page.getByTestId('write-reload').click();await expect(pages.conflict).toBeHidden();await expect(pages.preview).toContainText('Remote note wins');
  });
  test('パターン: dirty save가 지연돼도 double Delete는 하나의 confirm과 삭제만 실행한다', async ({ page, vault }) => {
    vault.write(`Write/${vault.today}.md`,'Before edit');const pages=new PagesPage(page,vault);await pages.open();const delayed=await pages.delayNextWriteSave(),deletes=await pages.countWriteDeletes();await pages.openWriteEdit();await pages.editor.fill('Saved before one delete');const saving=pages.openWriteRead();await delayed.started;await expect(pages.editor).toBeVisible();await expect(pages.saveMode).toBeDisabled();await expect(pages.deleteNote).toBeHidden();delayed.release();await saving;await pages.deleteNote.evaluate(button=>{button.click();button.click();});await expect(page.getByTestId('confirm-dialog')).toBeVisible();await page.getByTestId('confirm-yes').click();await expect.poll(()=>deletes.length).toBe(1);expect(deletes[0].date).toBe(vault.today);await expect(pages.deleteUndo).toBeVisible();expect(vault.exists(`Write/${vault.today}.md`)).toBe(false);await expect(page.getByTestId('write-edit')).toBeEnabled();
  });
  test('パターン: A/B 연속 삭제 toast는 각자 캡처한 token으로 정확한 note를 Undo한다',async({page,vault})=>{const a=vault.today,b=vault.day(-1);vault.write(`Write/${a}.md`,'Note A');vault.write(`Write/${b}.md`,'Note B');const pages=new PagesPage(page,vault),restores=await pages.countWriteRestores();await pages.open();await pages.deleteNote.click();await page.getByTestId('confirm-yes').click();await expect(pages.deleteUndo).toHaveCount(1);await expect(pages.deleteUndo.getByTestId('toast-undo')).toBeEnabled();await pages.noteRail.getByTestId('note-link').filter({hasText:b}).click();await expect.poll(()=>pages.currentNoteId()).toBe(b);await expect(pages.preview).toContainText('Note B');await pages.deleteNote.click();await page.getByTestId('confirm-yes').click();await expect(pages.deleteUndo).toHaveCount(2);await expect(pages.deleteUndo.nth(1).getByTestId('toast-undo')).toBeEnabled();await pages.deleteUndo.nth(0).getByTestId('toast-undo').click();await expect.poll(()=>vault.exists(`Write/${a}.md`)).toBe(true);expect(vault.exists(`Write/${b}.md`)).toBe(false);await pages.deleteUndo.getByTestId('toast-undo').click();await expect.poll(()=>vault.exists(`Write/${b}.md`)).toBe(true);expect(restores.map(call=>call.date)).toEqual([a,b]);expect(restores[0].id).not.toBe(restores[1].id);});
  test('パターン: A restore 임시실패는 toast를 유지하고 B restore queue를 막지 않는다',async({page,vault,allowedConsoleErrors})=>{allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 503/);const a=vault.today,b=vault.day(-1);vault.write(`Write/${a}.md`,'Note A');vault.write(`Write/${b}.md`,'Note B');const pages=new PagesPage(page,vault),restores=await pages.failFirstWriteRestore();await pages.open();await pages.deleteNote.click();await page.getByTestId('confirm-yes').click();await expect(pages.deleteUndo.getByTestId('toast-undo')).toBeEnabled();await pages.noteRail.getByTestId('note-link').filter({hasText:b}).click();await expect.poll(()=>pages.currentNoteId()).toBe(b);await expect(pages.preview).toContainText('Note B');await pages.deleteNote.click();await page.getByTestId('confirm-yes').click();await expect(pages.deleteUndo).toHaveCount(2);await expect(pages.deleteUndo.nth(1).getByTestId('toast-undo')).toBeEnabled();await pages.deleteUndo.nth(0).getByTestId('toast-undo').click();await expect(pages.deleteUndo).toHaveCount(2);await expect(pages.deleteUndo.nth(0).getByTestId('toast-undo')).toBeEnabled();await pages.deleteUndo.nth(1).getByTestId('toast-undo').click();await expect(pages.deleteUndo).toHaveCount(1);await expect.poll(()=>vault.exists(`Write/${b}.md`)).toBe(true);await expect.poll(()=>pages.currentNoteId()).toBe(b);await expect(pages.preview).toContainText('Note B');expect(vault.exists(`Write/${a}.md`)).toBe(false);await pages.deleteUndo.getByTestId('toast-undo').click();await expect.poll(()=>vault.exists(`Write/${a}.md`)).toBe(true);expect(restores.map(call=>call.date)).toEqual([a,b,a]);});
});

test.describe('観점: AI 제안은 동의와 명시 적용 전에는 저장하지 않는다', () => {
  test('パターン: subscription consent는 저장된 custom URL 대신 실제 auth mode/account/공식 destination을 표시한다',async({page,vault})=>{const pages=new PagesPage(page,vault);await page.goto('/');const payload=await pages.getSettings();payload.settings.ai.provider='openai';payload.settings.ai.authModes.openai='chatgpt';payload.settings.ai.models.openai='gpt-6.1-sol';payload.settings.ai.baseUrls.openai='https://example.com/not-used';payload.settings.ai.consent=false;Object.assign(payload,{aiReady:true,assistantReady:true,subscriptions:{openai:{available:true,connected:true,label:'user@example.com',accounts:[{id:'a'.repeat(64),label:'user@example.com · aaaaaaaa',active:true,connected:true}]},anthropic:{available:true,connected:false,accounts:[]}}});await page.route('**/api/settings',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)}));await page.goto('/#/write');await expect(page.getByTestId('write-organize')).toBeEnabled();await page.getByTestId('write-organize').click();await page.getByTestId('organize-submit').click();await expect(pages.consent).toBeVisible();await expect(pages.consentDestination).toContainText(/ChatGPT/);await expect(pages.consentDestination).toContainText('user@example.com');await expect(pages.consentDestination).toContainText('https://api.openai.com/v1');await expect(pages.consentDestination).not.toContainText('not-used');await page.getByTestId('ai-consent-cancel').click();});
  test('パターン: 취소는 외부 요청 없이 끝나며, 동의 후 제안도 Apply 전에는 노트를 바꾸지 않는다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    const mock = await startMockAi();
    try {
      await pages.open();
      await expect(page.getByTestId('write-organize')).toBeDisabled();
      await expect(page.getByTestId('write-ai-hint')).toBeVisible();
      await pages.setMockProvider(mock.baseUrl);
      await expect(page.getByTestId('write-organize')).toBeEnabled();
      await pages.openWriteEdit();
      await pages.editor.fill('Original note for mock proposal');
      await expect.poll(() => pages.noteFile(vault.today)).toContain('Original note for mock proposal');
      await pages.openWriteRead();
      const organizeBodies=await pages.captureOrganizeBodies();await page.getByTestId('write-organize').click();await expect(page.getByTestId('organize-extra')).toBeVisible();expect(organizeBodies).toHaveLength(0);await page.getByTestId('organize-extra').fill('표 형식으로 정리해 줘');await page.keyboard.press('Escape');await expect(page.getByTestId('organize-extra')).toHaveCount(0);expect(organizeBodies).toHaveLength(0);await page.getByTestId('write-organize').click();await pages.clickPageCorner();await expect(page.getByTestId('organize-extra')).toHaveCount(0);expect(organizeBodies).toHaveLength(0);await page.getByTestId('write-organize').click();await page.getByTestId('organize-extra').fill('표 형식으로 정리해 줘');await page.getByTestId('organize-submit').click();await expect.poll(()=>organizeBodies.length).toBe(1);expect(organizeBodies[0].additionalInstructions).toBe('표 형식으로 정리해 줘');
      await expect(pages.proposal).toBeVisible();
      await expect(pages.proposalActions).toHaveCSS('gap','8px');
      await expect(pages.proposalActions).toHaveCSS('padding-top','16px');
      await expect.poll(() => pages.noteFile(vault.today)).toContain('Original note for mock proposal');
      expect(mock.calls.length).toBeGreaterThanOrEqual(2);
      await page.getByTestId('proposal-apply').click();
      await expect.poll(() => pages.noteFile(vault.today)).toContain('Mock proposal');
    } finally { await mock.close(); }
  });
});

test.describe('観점: Set 테마와 자동 전환 설정', () => {
  test('パターン: provider catalog는 자동 fallback을 정직하게 표시하고 picker click에서 live 목록을 선택한다', async ({ page, vault }) => {
    const pages=new PagesPage(page,vault);await page.goto('/');const calls=await pages.mockModelCatalog(['fallback-a'],['live-a','live-b']);await page.getByTestId('nav-set').click();await expect(page.getByTestId('model-catalog-status')).toContainText(/기본|built-in|内蔵|内置/);expect(calls[0]).toEqual({body:{manual:false},root:vault.rootId});await page.getByTestId('ai-model-picker').click();await expect(page.getByTestId('popover').getByRole('option',{name:'live-b'})).toBeVisible();await page.getByTestId('popover').getByRole('option',{name:'live-b'}).click();await expect(page.getByTestId('ai-model')).toHaveValue('live-b');expect(calls.some(call=>call.body.manual===true)).toBe(true);
  });
  test('パターン: 빈 저장 model의 provider를 선택하면 첫 후보를 함께 저장한다', async ({ page, vault }) => {
    const pages=new PagesPage(page,vault);await page.goto('/');await pages.setSettings({ai:{provider:'anthropic',models:{gemini:''}}});await page.reload();await page.getByTestId('nav-set').click();await page.getByTestId('provider-field').getByRole('button').click();await page.getByTestId('popover').getByRole('option',{name:'Google Gemini'}).click();await expect(page.getByTestId('ai-model')).toHaveValue('gemini-3.8-flash');await expect.poll(async()=>(await(await page.request.get('/api/settings',{headers:pages.apiHeaders})).json()).settings.ai.models.gemini).toBe('gemini-3.8-flash');
  });
  test('パターン: 늦은 catalog 응답은 사용자가 입력 중인 model 값을 덮어쓰지 않는다', async ({ page, vault }) => {const pages=new PagesPage(page,vault);await page.goto('/');const delayed=await pages.delayModelCatalog(['late-model']);await page.getByTestId('nav-set').click();await delayed.started;await page.getByTestId('ai-model').fill('manual-draft');delayed.release();await expect(page.getByTestId('model-catalog-status')).toContainText(/연결|loaded|取得|加载/);await expect(page.getByTestId('ai-model')).toHaveValue('manual-draft');});
  test('パターン: catalog 후보가 없으면 빈 popover 대신 직접 입력 안내와 model focus를 남긴다', async ({ page, vault }) => {const pages=new PagesPage(page,vault);await page.goto('/');await pages.mockModelCatalog([],[]);await page.getByTestId('nav-set').click();await page.getByTestId('ai-model-picker').click();await expect(page.getByTestId('popover')).toHaveCount(0);await expect(page.getByTestId('model-catalog-status')).toContainText(/직접 입력|directly|直接/);await expect(page.getByTestId('ai-model')).toBeFocused();});
  test('パターン: 응답 provider가 현재 설정과 다르면 catalog를 picker에 표시하지 않는다', async ({ page, vault }) => {const pages=new PagesPage(page,vault);await page.goto('/');await pages.mockModelCatalog(['wrong-provider-model'],['wrong-provider-model'],'openai');await page.getByTestId('nav-set').click();await page.getByTestId('ai-model-picker').click();await expect(page.getByTestId('popover')).toHaveCount(0);await expect(page.getByTestId('ai-model')).not.toHaveValue('wrong-provider-model');});
  test('パターン: provider 저장 완료 전에는 이전 provider catalog를 요청하지 않는다', async ({ page, vault }) => {
    const pages=new PagesPage(page,vault),race=await pages.watchProviderCatalogSave();await page.goto('/');await page.getByTestId('nav-set').click();await expect.poll(()=>race.calls.length).toBeGreaterThan(0);const before=race.calls.length;await page.getByTestId('provider-field').getByRole('button').click();await page.getByTestId('popover').getByRole('option',{name:'Google Gemini'}).click();await race.started;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(race.calls.slice(before).some(call=>call.saving)).toBe(false);race.release();await expect.poll(()=>race.calls.length).toBeGreaterThan(before);expect(race.calls.at(-1).provider).toBe('gemini');await expect(page.getByTestId('ai-model')).toHaveValue('gemini-3.8-flash');
  });
  test('パターン: manual catalog 대기 중 provider가 바뀌면 이전 picker를 열지 않는다', async ({ page, vault }) => {
    const pages=new PagesPage(page,vault),delayed=await pages.delayManualModelCatalog(['old-anthropic-model']);await page.goto('/');await page.getByTestId('nav-set').click();await page.getByTestId('ai-model-picker').click();await delayed.started;await page.getByTestId('provider-field').getByRole('button').click();await page.getByTestId('popover').getByRole('option',{name:'Google Gemini'}).click();delayed.release();await expect(page.getByTestId('popover')).toHaveCount(0);await expect(page.getByTestId('ai-model')).toHaveValue('gemini-3.8-flash');
  });
  test('パターン: Set의 model/key draft는 language reload를 막고 저장 뒤에는 새 언어로 reload한다',async({page,vault})=>{const pages=new PagesPage(page,vault);await page.goto('/');await pages.mockModelCatalog(['fallback-model'],['live-model']);await page.getByTestId('nav-set').click();const model=page.getByTestId('ai-model'),key=page.getByTestId('ai-key');await model.fill('unsaved-model');await key.fill('unsaved-key');await page.getByTestId('lang-button').click();await page.getByTestId('popover').getByRole('option',{name:'English'}).click();await expect(model).toHaveValue('unsaved-model');await expect(key).toHaveValue('unsaved-key');expect(await page.evaluate(()=>localStorage.getItem('lang'))).not.toBe('en');await model.blur();await key.fill('saved-test-key');await page.getByTestId('ai-key-save').click();await expect(key).toHaveValue('');await page.getByTestId('lang-button').click();await page.getByTestId('popover').getByRole('option',{name:'English'}).click();await expect(pages.root).toHaveAttribute('lang','en');await expect(model).toHaveValue('unsaved-model');await expect(page.getByTestId('model-catalog-status')).toHaveText(/Showing built-in|Models loaded|No suggestions/);});
  test('パターン: AI Test 실행 중에는 language reload를 막고 busy 상태를 유지한다',async({page,vault})=>{const pages=new PagesPage(page,vault);await page.goto('/');await pages.mockModelCatalog([],[],'anthropic');await pages.saveAiKey('anthropic','status-i18n-test-key');await pages.setSettings({ai:{consent:true}});let release,startTest;const gate=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{startTest=resolve});await page.route('**/api/ai/test',async route=>{startTest();await gate;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({aiReady:true,rootId:vault.rootId})});});await page.reload();await page.getByTestId('nav-set').click();await page.getByTestId('ai-test').click();await started;await expect(page.getByTestId('ai-test-status')).not.toBeEmpty();await page.getByTestId('lang-button').click();await page.getByTestId('popover').getByRole('option',{name:'English'}).click();expect(await page.evaluate(()=>localStorage.getItem('lang'))).not.toBe('en');await expect(page.getByTestId('ai-test-status')).not.toBeEmpty();release();await expect(page.getByTestId('ai-test')).toBeEnabled();});
  test('パターン: consent를 끄면 느린 저장 응답 전에도 Write AI를 즉시 비활성화한다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    const mock = await startMockAi();
    try {
      await pages.open();
      await pages.setMockProvider(mock.baseUrl);
      await expect(page.getByTestId('write-organize')).toBeEnabled();
      await page.getByTestId('nav-set').click();
      const release = await pages.delayNextSettingsPost();
      await page.getByTestId('ai-consent').uncheck();
      await page.getByTestId('nav-write').click();
      await expect(page.getByTestId('write-organize')).toBeDisabled();
      release();
      await expect.poll(async () => (await (await page.request.get('/api/settings', { headers: pages.apiHeaders })).json()).settings.ai.consent).toBe(false);
      await expect(page.getByTestId('write-organize')).toBeDisabled();
    } finally { await mock.close(); }
  });

  test('パターン: unsaved key draft는 unrelated save와 ai-status 후에도 AI를 막고 key save+retest 후에만 푼다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    const mock = await startMockAi();
    try {
      await pages.open();
      await pages.setMockProvider(mock.baseUrl);
      await page.getByTestId('nav-set').click();
      await page.getByTestId('ai-key').fill('new-test-key');
      await page.getByTestId('light-background-ivory').click();
      await page.getByTestId('nav-write').click();
      await expect(page.getByTestId('write-organize')).toBeDisabled();
      await page.getByTestId('nav-set').click();
      await expect(page.getByTestId('ai-key')).toHaveValue('new-test-key');
      await page.getByTestId('ai-key-save').click();
      await expect(page.getByTestId('ai-key')).toHaveValue('');
      await expect(page.getByTestId('ai-consent')).not.toBeChecked();
      await page.getByTestId('ai-consent').check();
      await expect.poll(async()=>(await pages.getSettings()).settings.ai.consent).toBe(true);
      await page.getByTestId('ai-test').click();
      await expect(page.getByTestId('ai-test-status')).toContainText(/연결|Connected|接続|连接/);
      await page.getByTestId('nav-write').click();
      await expect(page.getByTestId('write-organize')).toBeEnabled();
    } finally { await mock.close(); }
  });

  test('パターン: AI save 뒤 queued unrelated save가 있어도 두 응답 사이에 readiness가 되살아나지 않는다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    const mock = await startMockAi();
    try {
      await pages.open(); await pages.setMockProvider(mock.baseUrl); await page.getByTestId('nav-set').click();
      const gates = await pages.gateNextSettingsPosts(2);
      await page.getByTestId('ai-consent').uncheck();
      await page.getByTestId('light-background-ivory').click();
      await page.getByTestId('nav-write').click();
      await expect(page.getByTestId('write-organize')).toBeDisabled();
      gates.release(0); await gates.started(1);
      await expect(page.getByTestId('write-organize')).toBeDisabled();
      gates.release(1);
      await expect(page.getByTestId('write-organize')).toBeDisabled();
    } finally { await mock.close(); }
  });

  test('パターン: inflight key save 응답은 그 사이 새로 입력한 key draft를 지우거나 활성화하지 않는다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    const mock = await startMockAi();
    try {
      await pages.open(); await pages.setMockProvider(mock.baseUrl); await page.getByTestId('nav-set').click();
      const delayed = await pages.delayNextKeySave();
      await page.getByTestId('ai-key').fill('old-test-key');
      await page.getByTestId('ai-key-save').click();
      await delayed.started;
      await page.getByTestId('ai-key').fill('new-unsaved-key');
      delayed.release();
      await expect(page.getByTestId('ai-key')).toHaveValue('new-unsaved-key');
      await page.getByTestId('nav-write').click();
      await expect(page.getByTestId('write-organize')).toBeDisabled();
    } finally { await mock.close(); }
  });

  test('パターン: AI provider/model/effort/URL은 desktop 첫 행의 같은 baseline과 4열을 사용한다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    await pages.open('set');
    await expect(page.getByTestId('ai-provider-label')).toBeVisible();
    await expect(page.getByTestId('ai-provider-label')).toHaveText(/프로바이더|Provider|プロバイダ|提供商/);
    const boxes = await pages.aiFirstRowBoxes();
    expect(boxes).toHaveLength(4);
    expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
    for(let i=1;i<boxes.length;i++)expect(boxes[i].x).toBeGreaterThan(boxes[i-1].x+boxes[i-1].w-2);
    await expect(pages.previewMeeting()).toHaveText(/회의|Meeting|会議|会议/);
    await expect(pages.previewMeeting()).toHaveClass(/dl-item/);
    await expect(pages.previewMeeting()).toHaveCSS('height','28px');
    const previewAxis=await pages.previewAxisGeometry();
    expect(previewAxis.pillBottom).toBeLessThan(previewAxis.railY);
    expect(previewAxis.railY).toBeLessThan(previewAxis.labelTop);
  });

  test('パターン: provider 목록은 검증된 4개만 보이고 DeepSeek effort 기본값은 High다', async ({ page, vault }) => {
    const pages=new PagesPage(page,vault);await pages.open('set');await page.getByTestId('provider-field').getByRole('button').click();const options=page.getByTestId('popover').getByRole('option');await expect(options).toHaveCount(4);await expect(page.getByTestId('popover')).not.toContainText(/OpenAI compatible|Ollama|LM Studio/);await options.filter({hasText:'DeepSeek'}).click();await expect(page.getByTestId('ai-model')).toHaveValue('deepseek-flash');await expect(page.getByTestId('effort-field').getByRole('button')).toContainText(/High|높음|高/);await expect.poll(async()=>(await(await page.request.get('/api/settings',{headers:pages.apiHeaders})).json()).settings.ai.efforts.deepseek).toBe('high');
  });

  test('パターン: legacy custom은 현재값 label만 보이고 model/base/key metadata를 유지한다', async ({ page, vault }) => {
    const pages=new PagesPage(page,vault);await page.goto('/');await pages.setSettings({ai:{provider:'custom',models:{custom:'legacy-model'},baseUrls:{custom:'https://example.com/v1'},consent:true}});await pages.saveAiKey('custom','test-only-legacy-key');await page.reload();await page.getByTestId('nav-set').click();const provider=page.getByTestId('provider-field').getByRole('button');await expect(provider).toContainText('カスタム接続（従来）');await expect(page.getByTestId('ai-model')).toHaveValue('legacy-model');await expect(page.getByTestId('ai-base')).toHaveValue('https://example.com/v1');await provider.click();const options=page.getByTestId('popover').getByRole('option');await expect(options).toHaveCount(4);await expect(page.getByTestId('popover')).not.toContainText(/custom|カスタム|사용자 지정|自定义/i);await page.keyboard.press('Escape');await page.getByTestId('lang-button').click();await page.getByTestId('popover').getByRole('option',{name:'English'}).click();await expect(provider).toContainText('Custom connection (legacy)');await page.getByTestId('nav-write').click();await page.getByTestId('nav-set').click();await expect(provider).toContainText('Custom connection (legacy)');await expect(page.getByTestId('ai-model')).toHaveValue('legacy-model');await expect(page.getByTestId('ai-base')).toHaveValue('https://example.com/v1');const payload=await pages.getSettings();expect(payload.settings.ai.provider).toBe('custom');expect(payload.settings.ai.models.custom).toBe('legacy-model');expect(payload.settings.ai.baseUrls.custom).toBe('https://example.com/v1');expect(payload.keys.custom.hasKey).toBe(true);
  });

  test('パターン: 지원을 확인하지 않은 수동 model은 effort를 숨기고 key draft를 보존한다', async ({ page, vault }) => {
    const pages=new PagesPage(page,vault);await pages.open('set');await page.getByTestId('ai-key').fill('unsaved-key');await page.getByTestId('ai-model').fill('manual-unknown-model');await page.getByTestId('ai-model').blur();await expect(page.getByTestId('effort-field')).toHaveCount(0);await expect(page.getByTestId('ai-key')).toHaveValue('unsaved-key');
  });

  test('パターン: model 변경은 consent를 유지하고 현재 연결 Test status만 지운다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    await pages.open('set');
    await pages.mockModelCatalog([], [], 'anthropic');
    await pages.saveAiKey('anthropic','anthropic-test-key');
    await pages.setSettings({ ai: { consent: true } });
    await page.reload();
    await expect(page.getByTestId('ai-consent')).toBeChecked();
    await page.route('**/api/ai/test',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({aiReady:true,rootId:vault.rootId})}));
    await page.getByTestId('ai-test').click();
    await expect(page.getByTestId('ai-test-status')).not.toBeEmpty();
    await page.getByTestId('ai-model').fill('changed-model');
    await page.getByTestId('ai-model').blur();
    await expect(page.getByTestId('ai-consent')).toBeChecked();
    await expect(page.getByTestId('ai-test-status')).toBeEmpty();
    await expect.poll(async () => (await (await page.request.get('/api/settings', { headers: pages.apiHeaders })).json()).settings.ai.consent).toBe(true);
  });

  test('パターン: saved-key provider로 돌아오면 기억한 consent가 복원되고 Test status는 복원되지 않는다',async({page,vault})=>{const pages=new PagesPage(page,vault);await pages.open('set');const catalog=await pages.mockModelCatalog([],[],'anthropic');await pages.saveAiKey('anthropic','anthropic-test-key');await pages.saveAiKey('openai','openai-test-key');await pages.setSettings({ai:{provider:'anthropic',consent:true}});await page.reload();await page.getByTestId('nav-set').click();await page.route('**/api/ai/test',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({aiReady:true,rootId:vault.rootId})}));await page.getByTestId('ai-test').click();await expect(page.getByTestId('ai-test-status')).not.toBeEmpty();catalog.setProvider('openai');await page.getByTestId('provider-field').getByRole('button').click();await page.getByTestId('popover').getByRole('option',{name:'OpenAI'}).click();await expect(page.getByTestId('ai-consent')).not.toBeChecked();await expect(page.getByTestId('ai-test-status')).toBeEmpty();await page.getByTestId('ai-consent').check();await expect.poll(async()=>(await pages.getSettings()).settings.ai.consent).toBe(true);catalog.setProvider('anthropic');await page.getByTestId('provider-field').getByRole('button').click();await page.getByTestId('popover').getByRole('option',{name:/Anthropic/}).click();await expect(page.getByTestId('ai-consent')).toBeChecked();await expect(page.getByTestId('ai-test-status')).toBeEmpty();});
  test('パターン: consent POST는 표시 때 받은 token을 쓰고 늦은 이전 provider GET은 현재 checkbox를 덮지 않는다',async({page,vault})=>{const pages=new PagesPage(page,vault);await pages.open('set');await pages.mockModelCatalog([],[],'anthropic');await pages.saveAiKey('openai','stale-get-openai-key');await pages.saveAiKey('anthropic','stale-get-anthropic-key');await pages.setSettings({ai:{provider:'openai'}});await pages.setSettings({ai:{consent:false}});await pages.setSettings({ai:{provider:'anthropic'}});await page.reload();await page.getByTestId('nav-set').click();const consent=page.getByTestId('ai-consent');if(!(await consent.isChecked())){await consent.check();await expect.poll(async()=>(await pages.getSettings()).settings.ai.consent).toBe(true);}const posts=await pages.captureConsentSettingsPosts();await consent.uncheck();await expect.poll(()=>posts.length).toBe(1);expect(typeof posts[0].consentToken).toBe('string');expect(posts[0].consentToken.length).toBeGreaterThan(0);await expect.poll(async()=>(await pages.getSettings()).settings.ai.consent).toBe(false);await consent.check();await expect.poll(()=>posts.length).toBe(2);await expect.poll(async()=>(await pages.getSettings()).settings.ai.consent).toBe(true);const oldPayload=await pages.getSettings(),delayed=await pages.delaySettingsGet(oldPayload);await pages.publishAiReadiness(false);await delayed.started;await page.getByTestId('provider-field').getByRole('button').click();await page.getByTestId('popover').getByRole('option',{name:'OpenAI'}).click();await expect.poll(async()=>(await pages.getSettings()).settings.ai.provider).toBe('openai');await expect(consent).not.toBeChecked();delayed.release();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect(consent).not.toBeChecked();});
  test('パターン: 느린 consent ON 중 credential이 바뀌면 stale grant를 재시도하지 않고 현재 OFF 상태를 다시 읽는다',async({page,vault,allowedConsoleErrors})=>{allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 409/);const pages=new PagesPage(page,vault);await pages.open('set');await pages.mockModelCatalog([],[],'anthropic');const delayed=await pages.delayConsentSettingsPost();await page.getByTestId('ai-consent').check();await delayed.started;await page.getByTestId('ai-key').fill('new-test-key');await page.getByTestId('ai-key-save').click();await expect(page.getByTestId('ai-key')).toHaveValue('');delayed.release();await expect.poll(async()=>(await pages.getSettings()).settings.ai.consent).toBe(false);await expect(page.getByTestId('ai-consent')).not.toBeChecked();expect(delayed.calls).toHaveLength(1);});

  test('パターン: page clock 기준 sunset 직전은 light, 18:00 경계 tick은 dark로 전환한다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    await pages.installClockAtLocalTime(17, 59);
    await pages.open('set');
    await pages.setSettings({ auto: { enabled: true, country: 'JP', sunrise: '06:00', sunset: '18:00' } });
    await pages.setTheme('light');
    await expect(pages.root).toHaveAttribute('data-theme', 'light');
    await pages.setClockAtLocalTime(18, 0);
    await pages.autoThemeTick();
    await expect(pages.root).toHaveAttribute('data-theme', 'dark');
  });

  test('パターン: manual light override는 다음 sunrise 전까지 유지되고 06:00에 해제되어 자동 light가 된다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    await pages.installClockAtLocalTime(20, 0);
    await pages.open('set');
    await pages.setSettings({ auto: { enabled: true, country: 'JP', sunrise: '06:00', sunset: '18:00' } });
    await pages.setTheme('dark');
    await expect(pages.root).toHaveAttribute('data-theme', 'dark');
    await pages.toggleTheme();
    await expect(pages.root).toHaveAttribute('data-theme', 'light');
    expect(await pages.themeOverride()).toMatchObject({ mode: 'light' });
    await pages.setClockAtLocalTime(5, 59, 1);
    await pages.autoThemeTick();
    await expect(pages.root).toHaveAttribute('data-theme', 'light');
    expect(await pages.themeOverride()).toMatchObject({ mode: 'light' });
    await pages.setClockAtLocalTime(6, 0, 1);
    await pages.autoThemeTick();
    await expect(pages.root).toHaveAttribute('data-theme', 'light');
    expect(await pages.themeOverride()).toBeNull();
  });

  test('パターン: 팔레트 선택은 preview와 설정 파일에 반영된다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    await pages.open('set');
    await page.getByTestId('light-background-ivory').click();
    await expect(page.getByTestId('preview-light')).toHaveAttribute('data-bg', 'ivory');
    const response = await page.request.get('/api/settings', { headers: pages.apiHeaders });
    const settings = await response.json();
    expect(settings.settings.appearance.light.background).toBe('ivory');
  });

  test('パターン: country와 sunrise/sunset 변경, reduced-motion 모드에서도 자동 전환을 설정할 수 있다', async ({ page, vault }) => {
    const pages = new PagesPage(page, vault);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await pages.open('set');
    await pages.autoEnabled.check();
    await expect.poll(async () => (await (await page.request.get('/api/settings', { headers: pages.apiHeaders })).json()).settings.auto.enabled).toBe(true);
    await expect(page.getByTestId('country-field').getByRole('button').first()).toBeVisible();
    await expect(page.getByTestId('sunrise-field')).toBeVisible();
    await expect(page.getByTestId('sunset-field')).toBeVisible();
  });
});
