import { expect } from '@playwright/test';

export class PagesPage {
  constructor(page, vault) { this.page = page; this.vault = vault; }
  get root() { return this.page.locator('html'); }
  get editor() { return this.page.getByTestId('write-editor'); }
  get titleInput() { return this.page.getByTestId('write-title-input'); }
  get readTitle() { return this.page.getByTestId('write-title-read'); }
  get preview() { return this.page.getByTestId('write-preview'); }
  get noteRail() { return this.page.getByTestId('notes-rail'); }
  get modelEntry() { return this.page.locator('.model-entry'); }
  get writeSheet() { return this.page.locator('.write-sheet'); }
  get settingCheckIndicator() { return this.page.locator('[data-testid="auto-enabled"] + .setting-check__box'); }
  nonCurrentNote() { return this.noteLinks.and(this.page.locator('[aria-current="false"]')).first(); }
  timeSurface(testId) { return this.page.getByTestId(testId).locator('.tp'); }
  async focusAppearance(focus, surface = focus) { await focus.focus(); return surface.evaluate((el) => { const style=getComputedStyle(el); return { outlineStyle:style.outlineStyle, outlineColor:style.outlineColor, boxShadow:style.boxShadow, borderColor:style.borderColor }; }); }
  computedStyle(target, property) { return target.evaluate((el, key) => getComputedStyle(el)[key], property); }
  previewMeeting(mode='light') { return this.page.getByTestId(`preview-${mode}`).locator('.preview-axis b'); }
  previewAxisGeometry(mode='light') { return this.page.getByTestId(`preview-${mode}`).locator('.preview-axis').evaluate((axis)=>{const box=axis.getBoundingClientRect(),pill=axis.querySelector('.preview-day-pill').getBoundingClientRect(),labels=[...axis.querySelectorAll(':scope > .preview-axis__label')].map(el=>el.getBoundingClientRect());return{pillBottom:pill.bottom,railY:box.bottom-20,labelTop:Math.min(...labels.map(label=>label.top))};}); }
  async previewHasUnsafeMarkup() { return this.preview.locator('img,script,svg,iframe').count(); }
  markdownStructure() { return this.preview.evaluate((el)=>({ol:el.querySelector('ol')?.getAttribute('start'),ordered:[...el.querySelectorAll('ol li')].map(li=>li.textContent),ul:[...el.querySelectorAll('ul li')].map(li=>li.textContent),heading:el.querySelector('h2')?.textContent,link:el.querySelector('a')?.getAttribute('href'),code:el.querySelector('code')?.textContent,blockquote:el.querySelector('blockquote')?.textContent})); }
  markdownTable() { return this.preview.evaluate((el)=>{const wrap=el.querySelector('.markdown-table-wrap'),table=wrap?.querySelector('table');return{headers:[...table?.querySelectorAll('th')??[]].map(cell=>cell.textContent),rows:[...table?.querySelectorAll('tbody tr')??[]].map(row=>[...row.cells].map(cell=>cell.textContent)),align:[...table?.querySelectorAll('th')??[]].map(cell=>getComputedStyle(cell).textAlign),overflow:wrap&&getComputedStyle(wrap).overflowX};}); }
  markdownExtended() { return this.preview.evaluate(el=>({strong:[...el.querySelectorAll('strong')].map(node=>node.textContent),em:[...el.querySelectorAll('em')].map(node=>node.textContent),del:[...el.querySelectorAll('del')].map(node=>node.textContent),tasks:[...el.querySelectorAll('.task-list li')].map(item=>({text:item.textContent,checked:item.querySelector('input').checked,disabled:item.querySelector('input').disabled})),hr:el.querySelectorAll('hr').length})); }
  async hasHorizontalScroll() { return this.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth); }
  swatchLayouts() { return this.page.locator('.swatch-group').evaluateAll((groups) => groups.map((group) => ({ rows: new Set([...group.children].map((child) => Math.round(child.getBoundingClientRect().top))).size, overflow: group.scrollWidth > group.clientWidth, scrollbar:getComputedStyle(group).scrollbarWidth }))); }
  swatchLabels(){return this.page.locator('.palette-label').allTextContents();}
  nativeTitleCount(){return this.page.locator('[title]').count();}
  tooltipInfo(){return this.page.getByTestId('app-tooltip').evaluate(el=>{const r=el.getBoundingClientRect();return{text:el.textContent,pointer:getComputedStyle(el).pointerEvents,parentDialog:!!el.closest('dialog[open]'),inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight};});}
  tooltipMarkupCount(selector){return this.page.getByTestId('app-tooltip').locator(selector).count();}
  timePickerIcon(key){return this.page.getByTestId(`${key}-field`).getByTestId('time-button').locator('use').getAttribute('href');}
  modelFocusState(){return this.page.evaluate(()=>{const wrapper=document.querySelector('.model-entry'),input=wrapper.querySelector('input'),ws=getComputedStyle(wrapper),is=getComputedStyle(input);return{wrapperShadow:ws.boxShadow,inputShadow:is.boxShadow,inputOutline:is.outlineStyle};});}
  modelBorder(){return this.page.locator('.model-entry').evaluate(el=>getComputedStyle(el).borderColor);}
  borderColor(testId){return this.page.getByTestId(testId).evaluate(el=>getComputedStyle(el).borderColor);}
  focusState(testId){return this.page.getByTestId(testId).evaluate(el=>{const s=getComputedStyle(el);return{shadow:s.boxShadow,outline:s.outlineStyle};});}
  cursorState(){return this.page.getByTestId('cursor-orb').evaluate(el=>({hidden:el.hidden,mode:el.classList.contains('is-action')?'action':el.classList.contains('is-text')?'text':'dot',opacity:Number(getComputedStyle(el).opacity),parentDialog:!!el.closest('dialog[open]'),active:document.documentElement.classList.contains('is-accent-cursor-active')}));}
  cursorStyle(testId){return this.page.getByTestId(testId).evaluate(el=>getComputedStyle(el).cursor);}
  hoverCursorSurface(){return this.page.locator('.page-heading h1').last().hover();}
  startCursorThemeSampling(duration=800){return this.page.evaluate(ms=>{const samples=[],started=performance.now();window.__cursorSamples=new Promise(resolve=>{const frame=()=>{const cursor=document.querySelector('[data-testid="cursor-orb"]');if(cursor){const style=getComputedStyle(cursor);samples.push({opacity:Number(style.opacity),border:style.borderColor,background:style.backgroundColor,shadow:style.boxShadow});}if(performance.now()-started<ms)setTimeout(frame,8);else resolve(samples);};frame();});},duration);}
  cursorThemeSamples(){return this.page.evaluate(()=>window.__cursorSamples);}
  dispatchAssistantShortcut({repeat=false,isComposing=false}={}){return this.page.getByTestId('assistant-message').evaluate((input,init)=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',metaKey:true,bubbles:true,cancelable:true,...init})),{repeat,isComposing});}
  dispatchWriteShortcut({repeat=false,isComposing=false}={}){return this.editor.evaluate((input,init)=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',metaKey:true,bubbles:true,cancelable:true,...init})),{repeat,isComposing});}
  async countStateRequests(){const calls=[];await this.page.route('**/api/state',async route=>{calls.push(route.request().url());await route.continue();});return calls;}
  aiFirstRowBoxes() { return this.page.evaluate(() => [document.querySelector('[data-testid="provider-field"] button'),document.querySelector('.model-entry'),document.querySelector('[data-testid="effort-field"] button'),document.querySelector('[data-testid="ai-base"]')].filter(Boolean).map((el) => { const r=el.getBoundingClientRect(); return { x:r.x,y:r.y,w:r.width,h:r.height }; })); }
  async isClickableAtCenter(testId) {
    return this.page.getByTestId(testId).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === el || el.contains(hit));
    });
  }
  async failNextSettingsRequest() {
    let failed = false;
    await this.page.route('**/api/settings', async (route) => {
      if (!failed) { failed = true; return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"internal"}' }); }
      await route.continue();
    });
  }
  async failNextWriteNoteRequest() {
    let failed = false;
    await this.page.route('**/api/write/note?*', async (route) => {
      if (!failed) { failed = true; return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"internal"}' }); }
      await route.continue();
    });
  }
  async failWriteNoteRequests(count) {
    let remaining = count;
    await this.page.route('**/api/write/note?*', async (route) => {
      if (remaining-- > 0) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"internal"}' });
      await route.continue();
    });
  }
  async delayNextWriteSave() {let release,start,delayed=false;const gate=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{start=resolve});await this.page.route('**/api/write/save',async route=>{if(!delayed){delayed=true;start();await gate;}await route.continue();});return{release,started};}
  async delayNextWriteCreate(){let release,start,delayed=false;const gate=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{start=resolve}),calls=[];await this.page.route('**/api/write/create',async route=>{calls.push(route.request().postDataJSON());if(!delayed){delayed=true;start();await gate;}await route.continue();});return{calls,release,started};}
  async delayWriteNote(noteId){let release,start,delayed=false;const gate=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{start=resolve});await this.page.route('**/api/write/note?*',async route=>{const id=new URL(route.request().url()).searchParams.get('noteId');if(!delayed&&id===noteId){delayed=true;start();await gate;}await route.continue();});return{release,started};}
  async delayOrganizeResponse({status=200,warnings=[],error=null}={}){let release,start;const gate=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{start=resolve}),calls=[];await this.page.route('**/api/write/organize',async route=>{const body=route.request().postDataJSON(),aiGeneration=(await this.getSettings()).aiGeneration;calls.push(body);start();await gate;if(status===409)return route.fulfill({status,contentType:'application/json',body:JSON.stringify(error??{error:'conflict',current:{noteId:body.noteId,date:body.date,text:body.text,hash:'remote'}})});await route.fulfill({status,contentType:'application/json',body:JSON.stringify({text:'# Delayed proposal',noteId:body.noteId,date:body.date,base:body.base,aiGeneration,warnings,rootId:this.vault.rootId})});});return{calls,release,started};}
  async countWriteDeletes(){const calls=[];await this.page.route('**/api/write/delete',async route=>{calls.push(route.request().postDataJSON());await route.continue();});return calls;}
  async countWriteRestores(){const calls=[];await this.page.route('**/api/write/restore',async route=>{calls.push(route.request().postDataJSON());await route.continue();});return calls;}
  async failFirstWriteRestore(){const calls=[];let failed=false;await this.page.route('**/api/write/restore',async route=>{calls.push(route.request().postDataJSON());if(!failed){failed=true;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"internal"}'});}await route.continue();});return calls;}
  async mockAssistant({ready=true,response}={}) {let release,start;const gate=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{start=resolve}),calls=[];await this.page.route('**/api/settings',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({assistantReady:ready,aiReady:ready,rootId:this.vault.rootId})}));await this.page.route('**/api/assistant/run',async route=>{calls.push({body:route.request().postDataJSON(),root:route.request().headers()['x-tooddae-root']});start();await gate;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response??{status:'completed',results:[],message:'',requestId:calls[0].body.requestId,rootId:this.vault.rootId})});});return{calls,release,started};}
  async mockAssistantRetry(){const calls=[];await this.page.route('**/api/settings',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({assistantReady:true,aiReady:true,rootId:this.vault.rootId})}));await this.page.route('**/api/assistant/run',async route=>{const body=route.request().postDataJSON();calls.push(body);if(calls.length===1)return route.abort('failed');await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'completed',results:[{tool:'add_section',created:{panel:'tasks',name:'Plan'}}],message:'',requestId:body.requestId,rootId:this.vault.rootId})});});return calls;}
  async captureOrganizeBodies(){const bodies=[];await this.page.route('**/api/write/organize',async route=>{bodies.push(route.request().postDataJSON());await route.continue();});return bodies;}
  clickPageCorner(){return this.page.locator('body').click({position:{x:2,y:2}});}
  writeActionOrder(){return this.page.evaluate(()=>[...document.querySelector('.write-actions').children].filter(button=>!button.hidden).map(button=>button.dataset.testid));}
  assistantLayout(){return this.page.evaluate(()=>{const button=document.querySelector('[data-testid="assistant-launch"]')?.getBoundingClientRect(),progress=document.querySelector('[data-testid="progress"]')?.getBoundingClientRect();return button&&progress?{buttonRight:button.right,progressLeft:progress.left}:null;});}
  aiAction(testId){return this.page.getByTestId(testId);}
  aiActionStyle(testId){return this.aiAction(testId).evaluate(el=>{const style=getComputedStyle(el);return{backgroundColor:style.backgroundColor,backgroundImage:style.backgroundImage,borderColor:style.borderColor,color:style.color,opacity:style.opacity,outlineColor:style.outlineColor};});}
  actionMascot(testId){return this.page.getByTestId(testId).evaluate(el=>el.querySelector('[data-hs-state="default"]')!==null&&el.querySelector('use')===null);}
  actionIcon(testId){return this.page.getByTestId(testId).evaluate(el=>el.querySelector('use')?.getAttribute('href')??null);}
  actionLabel(testId){return this.page.getByTestId(testId).evaluate(el=>({aria:el.getAttribute('aria-label'),title:el.title,text:el.textContent.trim()}));}
  paletteLabels(mode){return this.page.getByTestId(`preview-${mode}`).locator('..').locator('.palette-label').allTextContents();}
  get keyField(){return this.page.getByTestId('ai-key');}
  get keySave(){return this.page.getByTestId('ai-key-save');}
  get settingsStatus(){return this.page.getByTestId('settings-status');}
  runKeySave(){return this.keySave.evaluate(control=>control.onclick());}
  async selectProvider(label){await this.page.getByTestId('provider-field').getByTestId('select-button').click();await this.page.getByTestId('popover').getByRole('option',{name:label,exact:true}).click();}
  async selectLanguage(label){await this.page.getByTestId('lang-button').click();await this.page.getByTestId('popover').getByRole('option',{name:label,exact:true}).click();}
  taskIn(bucket,title){return this.page.getByTestId(bucket).getByTestId('task').filter({hasText:title});}
  latestToast(){return this.page.getByTestId('toast').last();}
  async mockKeyMetadata(initial={}) {
    let keys=Object.fromEntries(Object.entries(initial).map(([provider,hasKey])=>[provider,{hasKey:!!hasKey,source:'redacted',hint:'redacted'}])),payload=null;const pending=[];
    await this.page.route('**/api/settings',async route=>{const response=await route.fetch(),body=await response.json();payload={...body,keys};await route.fulfill({response,body:JSON.stringify(payload)});});
    await this.page.route('**/api/ai/key',async route=>{const request=route.request().postDataJSON(),next={...keys,[request.provider]:{hasKey:!!request.key,source:'redacted',hint:'redacted'}},snapshot={...(payload??{}),keys:next,rootId:this.vault.rootId},held=pending.shift();keys=next;if(held){held.started();await held.gate;if(held.fail)return route.fulfill({status:500,contentType:'application/json',body:'{"error":"synthetic"}'});}payload=snapshot;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(snapshot)});});
    return { hasKey(provider){return keys[provider]?.hasKey===true;},delayNext({fail=false}={}) { let release,started;const gate=new Promise(resolve=>{release=resolve}),began=new Promise(resolve=>{started=resolve});pending.push({gate,started,fail});return{release,started:began}; } };
  }
  setVisualPalette(theme,accent){return this.page.evaluate(([nextTheme,nextAccent])=>{document.documentElement.dataset.theme=nextTheme;document.documentElement.dataset.accent=nextAccent;},[theme,accent]);}
  timePickerIcon(testId){return this.page.getByTestId(testId).getByTestId('time-button').locator('use').getAttribute('href');}
  iconSymbolPath(name){return this.page.locator(`#${name}`).locator('path').getAttribute('d');}
  mockOrganize(text='# Organized\n') { return this.page.route('**/api/write/organize',async route=>{const body=route.request().postDataJSON();const aiGeneration=await this.page.evaluate(async()=>{const boot=JSON.parse(document.querySelector('#boot')?.textContent||'{}');const response=await fetch('/api/settings',{headers:{'X-TOODDAE-Root':boot.runtime?.rootId||''},cache:'no-store'});return (await response.json()).aiGeneration;});await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text,noteId:body.noteId,date:body.date,base:body.base,aiGeneration,rootId:this.vault.rootId})});}); }
  mockAssistantReady(){return this.page.route('**/api/settings',async route=>{if(route.request().method()!=='GET')return route.continue();const response=await route.fetch(),payload=await response.json();payload.aiReady=true;payload.assistantReady=true;await route.fulfill({response,body:JSON.stringify(payload)});});}
  daylineMarkerGeometry(scroll='start'){return this.page.evaluate(direction=>{const wrap=document.querySelector('#dl-wrap'),rail=document.querySelector('.dayline__rail'),now=document.querySelector('.dayline__now');if(!wrap||!rail||!now)throw new Error('dayline marker missing');wrap.scrollLeft=direction==='end'?wrap.scrollWidth:0;const railBox=rail.getBoundingClientRect(),nowBox=now.getBoundingClientRect(),after=getComputedStyle(now,'::after'),size=Number.parseFloat(after.width),bottom=Number.parseFloat(after.bottom),dotCenter=nowBox.bottom-bottom-size/2;return{devicePixelRatio,scrollLeft:wrap.scrollLeft,railCenter:railBox.top+railBox.height/2,dotCenter,delta:dotCenter-(railBox.top+railBox.height/2)};},scroll);}
  headerGeometry(){return this.page.evaluate(()=>{const rect=el=>{const box=el?.getBoundingClientRect();return box&&{top:box.top,height:box.height,center:box.top+box.height/2};};const sync=document.querySelector('[data-testid="sync-pill"]'),text=document.querySelector('#sync-text'),brand=document.querySelector('[data-testid="brand"]'),right=document.querySelector('.top__right');return{brand:rect(brand),sync:rect(sync),syncText:rect(text),right:rect(right)};});}
  screenshot(options){return this.page.screenshot(options);}
  publishAiReadiness(aiReady){return this.page.evaluate(value=>dispatchEvent(new CustomEvent('tooddae-ai-readiness',{detail:{aiReady:value}})),aiReady);}
  async setRuntimeCapabilities(values){await this.page.route('**/',async route=>{if(route.request().isNavigationRequest()&&new URL(route.request().url()).pathname==='/'){const response=await route.fetch(),body=(await response.text()).replace(/"(assistant|notesDelete|subscriptionAuth)":true/g,(all,name)=>`"${name}":${values[name]===false?'false':'true'}`);return route.fulfill({response,body});}await route.continue();});}
  async captureWindowOpen(){await this.page.addInitScript(()=>{window.__openedUrls=[];window.open=url=>{window.__openedUrls.push(String(url));return null;};});return()=>this.page.evaluate(()=>window.__openedUrls);}
  async mockAuthStart(){const calls=[];await this.page.route('**/api/auth/start',async route=>{calls.push(route.request().postDataJSON());await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({url:'https://auth.openai.com/api/accounts/authorize?state=test',attemptId:'attempt'})});});return calls;}
  dialogGeometry(testId){return this.page.getByTestId(testId).evaluate(dialog=>{dialog.scrollTop=dialog.scrollHeight;const rect=value=>{const box=value?.getBoundingClientRect();return box&&{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height};},form=dialog.querySelector('.form'),result=dialog.querySelector('[data-testid="assistant-result"]'),footer=dialog.querySelector('.form__foot');return{viewport:{width:innerWidth,height:innerHeight},dialog:rect(dialog),form:rect(form),footer:rect(footer),dialogScroll:{width:dialog.scrollWidth,clientWidth:dialog.clientWidth,height:dialog.scrollHeight,clientHeight:dialog.clientHeight},result:result&&{...rect(result),scrollWidth:result.scrollWidth,clientWidth:result.clientWidth}};});}
  async captureConsentSettingsPosts(){const calls=[];await this.page.route('**/api/settings',async route=>{const body=route.request().method()==='POST'?route.request().postDataJSON():null;if(typeof body?.ai?.consent==='boolean')calls.push(body);await route.continue();});return calls;}
  async delayConsentSettingsPost(){const calls=[];let release,start,delayed=false;const gate=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{start=resolve});await this.page.route('**/api/settings',async route=>{const body=route.request().method()==='POST'?route.request().postDataJSON():null;if(!delayed&&typeof body?.ai?.consent==='boolean'){delayed=true;calls.push(body);start();await gate;}await route.continue();});return{calls,release,started};}
  async delaySettingsGet(payload){let release,start,delayed=false;const gate=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{start=resolve});await this.page.route('**/api/settings',async route=>{if(!delayed&&route.request().method()==='GET'){delayed=true;start();await gate;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});}await route.continue();});return{release,started};}
  async delayNextSettingsPost() {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let delayed = false;
    await this.page.route('**/api/settings', async (route) => {
      if (!delayed && route.request().method() === 'POST') { delayed = true; await gate; }
      await route.continue();
    });
    return release;
  }
  async gateNextSettingsPosts(count) {
    const releases = [], started = [], gates = [];
    for (let i = 0; i < count; i++) {
      let release, start;
      gates.push(new Promise((resolve) => { release = resolve; }));
      started.push(new Promise((resolve) => { start = resolve; }));
      releases.push({ release, start });
    }
    let index = 0;
    await this.page.route('**/api/settings', async (route) => {
      if (route.request().method() === 'POST' && index < count) { const current = index++; releases[current].start(); await gates[current]; }
      await route.continue();
    });
    return { release: (i) => releases[i].release(), started: (i) => started[i] };
  }
  async delayNextKeySave() {
    let release, started;
    const gate = new Promise((resolve) => { release = resolve; });
    const began = new Promise((resolve) => { started = resolve; });
    let delayed = false;
    await this.page.route('**/api/ai/key', async (route) => {
      if (!delayed) { delayed = true; started(); await gate; }
      await route.continue();
    });
    return { release, started: began };
  }
  async mockModelCatalog(initialAutoModels,initialManualModels,initialProvider='anthropic') {
    const calls=[];let autoModels=initialAutoModels,manualModels=initialManualModels,provider=initialProvider;
    calls.setModels=(auto,manual)=>{autoModels=auto;manualModels=manual;};calls.setProvider=value=>{provider=value;};
    await this.page.route('**/api/ai/models', async route=>{const body=route.request().postDataJSON();calls.push({body,root:route.request().headers()['x-tooddae-root']});const manual=body.manual;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({provider,models:manual?manualModels:autoModels,source:manual?'live':'defaults',reason:manual?null:'no-key',truncated:false,rootId:this.vault.rootId})});});
    return calls;
  }
  async delayModelCatalog(models,provider='anthropic') {let release,start;const gate=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{start=resolve});await this.page.route('**/api/ai/models',async route=>{start();await gate;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({provider,models,source:'live',reason:null,truncated:false,rootId:this.vault.rootId})});});return{release,started};}
  async watchProviderCatalogSave(nextProvider='gemini') {let release,start,savedProvider='anthropic',saving=false;const calls=[],gate=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{start=resolve});await this.page.route('**/api/settings',async route=>{const body=route.request().method()==='POST'?route.request().postDataJSON():{};if(body.ai?.provider===nextProvider){saving=true;start();await gate;savedProvider=nextProvider;await route.continue();saving=false;}else await route.continue();});await this.page.route('**/api/ai/models',async route=>{const body=route.request().postDataJSON();calls.push({provider:savedProvider,saving,manual:body.manual});await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({provider:savedProvider,models:[`${savedProvider}-model`],source:'defaults',reason:'no-key',truncated:false,rootId:this.vault.rootId})});});return{calls,release,started};}
  async delayManualModelCatalog(models,provider='anthropic') {let release,start,delayed=false;const gate=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{start=resolve});await this.page.route('**/api/ai/models',async route=>{const body=route.request().postDataJSON();if(body.manual&&!delayed){delayed=true;start();await gate;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({provider,models,source:'live',reason:null,truncated:false,rootId:this.vault.rootId})});}await route.continue();});return{release,started};}
  sampleNeutralColor(windowMs = 700) {
    return this.page.evaluate((duration) => new Promise((resolve) => {
      const values = [];
      const start = getComputedStyle(document.documentElement).getPropertyValue('--n-1').trim();
      const started = performance.now();
      const frame = () => {
        values.push(getComputedStyle(document.documentElement).getPropertyValue('--n-1').trim());
        if (performance.now() - started < duration) requestAnimationFrame(frame);
        else resolve({ start, values, end: getComputedStyle(document.documentElement).getPropertyValue('--n-1').trim() });
      };
      requestAnimationFrame(frame);
    }), windowMs);
  }
  sampleBrandColor(options = {}) {
    const config=typeof options==='number'?{maxMs:Math.max(options,2500)}:options;
    return this.page.evaluate(({maxMs=3000,expected=''}) => new Promise((resolve) => {
      const values = [], root = document.documentElement, mark = document.querySelector('[data-testid="brand-mark"]'),brand=mark.closest('svg');
      const read = () => ({ a: getComputedStyle(root).getPropertyValue('--accent-icon').trim(), ink: getComputedStyle(mark).fill,opacity:Number(getComputedStyle(brand).opacity) });
      const start = read(), started = performance.now();let sawMotion=false;
      const frame = () => { const value=read(),running=brand.getAnimations().some(animation=>animation.playState==='running');values.push(value);sawMotion ||= running||value.opacity<.99;const expectedReached=!expected||expected==='start'&&value.ink===start.ink&&value.a===start.a,stable=sawMotion&&value.opacity>.99&&!running&&expectedReached,expired=performance.now()-started>=maxMs;if(stable||expired)resolve({start,values,end:value,timedOut:!stable});else requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    }), config);
  }
  brandState(){return this.page.evaluate(()=>{const root=document.documentElement,mark=document.querySelector('[data-testid="brand-mark"]'),brand=mark.closest('svg'),animations=brand.getAnimations();return{accent:getComputedStyle(root).getPropertyValue('--accent-icon').trim(),fill:getComputedStyle(mark).fill,opacity:Number(getComputedStyle(brand).opacity),animations:animations.length,opacityAnimations:animations.filter(animation=>animation.effect?.getKeyframes().some(frame=>'opacity'in frame)).length};});}
  configureThemeFromBoot(){return this.page.evaluate(()=>window.dayTheme.configure(JSON.parse(document.querySelector('#boot').textContent)));}
  get status() { return this.page.getByTestId('write-status'); }
  get conflict() { return this.page.getByTestId('write-conflict'); }
  get proposal() { return this.page.getByTestId('write-proposal'); }
  get proposalActions() { return this.page.getByTestId('write-proposal').locator('.proposal-actions'); }
  get deleteNote() { return this.page.getByTestId('write-delete'); }
  get deleteUndo() { return this.page.getByTestId('toast').filter({has:this.page.getByTestId('toast-undo')}); }
  get saveMode() { return this.page.getByTestId('write-read'); }
  get noteAdd() { return this.page.getByTestId('note-add'); }
  get noteSearch() { return this.page.getByTestId('note-search'); }
  get noteLinks() { return this.noteRail.getByTestId('note-link'); }
  noteLink(noteId){return this.noteLinks.and(this.page.locator(`[data-note-id="${noteId}"]`));}
  noteCardGeometry(){return this.noteRail.evaluate(rail=>{const add=rail.querySelector('[data-testid="note-add"]'),note=rail.querySelector('[data-testid="note-link"]'),a=add.getBoundingClientRect(),n=note.getBoundingClientRect();return{addHeight:a.height,noteHeight:n.height,borderStyle:getComputedStyle(add).borderStyle,clipped:add.scrollHeight>add.clientHeight||note.scrollHeight>note.clientHeight};});}
  get keyRow() { return this.page.locator('.ai-key-row'); }
  get consent() { return this.page.getByTestId('ai-consent-dialog'); }
  get consentModel() { return this.page.getByTestId('ai-consent-model'); }
  get consentDestination() { return this.page.getByTestId('ai-consent-destination'); }
  get writeDate() { return this.page.getByTestId('write-date'); }
  get autoEnabled() { return this.page.getByTestId('auto-enabled'); }
  get themeToggle() { return this.page.getByTestId('theme-toggle'); }
  editorBox() { return this.editor.evaluate((el)=>({height:el.getBoundingClientRect().height,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,overflow:getComputedStyle(el).overflowY,resize:getComputedStyle(el).resize})); }
  textareaBox(testId) { return this.page.getByTestId(testId).evaluate(el=>({height:el.getBoundingClientRect().height,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,overflow:getComputedStyle(el).overflowY,resize:getComputedStyle(el).resize})); }
  selectEditorAll(){return this.editor.evaluate(el=>{const range=document.createRange(),selection=getSelection();range.selectNodeContents(el);selection.removeAllRanges();selection.addRange(range);el.focus();});}
  selectEditorRange(start,end){return this.editor.evaluate((el,[start,end])=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node,offset=0,from=null,to=null;while(node=walker.nextNode()){const next=offset+node.data.length;if(!from&&start>=offset&&start<=next)from=[node,start-offset];if(!to&&end>=offset&&end<=next)to=[node,end-offset];offset=next;}if(!from||!to)throw new Error('selection range');const range=document.createRange(),selection=getSelection();range.setStart(...from);range.setEnd(...to);selection.removeAllRanges();selection.addRange(range);el.focus();},[start,end]);}
  placeEditorCaretAtEnd(){return this.editor.evaluate(el=>{const range=document.createRange(),selection=getSelection();range.selectNodeContents(el);range.collapse(false);selection.removeAllRanges();selection.addRange(range);el.focus();});}
  editorSelection(){return this.editor.evaluate(el=>{const selection=getSelection();return{text:el.innerText.replace(/\r\n/g,'\n'),selected:selection.toString(),offset:selection.anchorOffset,node:selection.anchorNode?.nodeType};});}
  noteIds(){return this.noteLinks.evaluateAll(links=>links.map(link=>link.dataset.noteId));}
  currentNoteId(){return this.page.getByTestId('page-write').getAttribute('data-note-id');}
  toastPlacement(){return this.deleteUndo.first().evaluate(el=>{const box=el.getBoundingClientRect();return{bottom:innerHeight-box.bottom,inWrite:!!el.closest('#page-write'),container:el.parentElement?.id};});}
  get apiHeaders() { return { 'x-tooddae-root': this.vault?.rootId ?? '' }; }
  async installClockAtLocalTime(hour, minute, dayOffset = 0) {
    const epoch = await this.page.evaluate(([h, m, offset]) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      d.setHours(h, m, 0, 0);
      return d.getTime();
    }, [hour, minute, dayOffset]);
    await this.page.clock.install({ time: new Date(epoch) });
  }
  async setClockAtLocalTime(hour, minute, dayOffset = 0) {
    const epoch = await this.page.evaluate(([h, m, offset]) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      d.setHours(h, m, 0, 0);
      return d.getTime();
    }, [hour, minute, dayOffset]);
    await this.page.clock.setFixedTime(new Date(epoch));
  }
  autoThemeTick() { return this.page.evaluate(() => window.dayTheme.tick(0)); }
  toggleTheme() { return this.themeToggle.click(); }
  themeOverride() { return this.page.evaluate(() => JSON.parse(localStorage.getItem('themeOverride') || 'null')); }
  async open(route = 'write') {
    await this.page.goto(`/#/${route}`);
    await expect(this.page.getByTestId(`nav-${route}`)).toHaveAttribute('aria-current', 'page');
    await expect(this.page.getByTestId(`page-${route}`)).toHaveAttribute('data-ready', 'true');
    if (route === 'write') {
      await expect(this.preview).toBeVisible();
      await expect(this.editor).toBeHidden();
      await expect(this.noteLink(this.vault.today)).toHaveAttribute('aria-current', 'date');
    }
    if (route === 'set') await expect(this.page.getByTestId('preview-light')).toBeVisible();
  }
  async setTheme(theme) {
    await this.page.evaluate((value) => localStorage.setItem('theme', value), theme);
    await this.page.reload();
    await expect(this.root).toHaveAttribute('data-theme', theme);
  }
  noteFile(date) {
    try { return this.vault.read(`Write/${date}.md`); }
    catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
  }
  async saveSnapshot(text, reason = 'restore') {
    const origin = new URL(this.page.url()).origin;
    const headers = { origin, 'content-type': 'application/json', ...this.apiHeaders };
    const current = await (await this.page.request.get(`${origin}/api/write/note?date=${this.vault.today}`, { headers: this.apiHeaders })).json();
    const response = await this.page.request.post(`${origin}/api/write/save`, { headers, data: { date: this.vault.today, text, base: current.hash, snapshot: reason } });
    expect(response.ok()).toBeTruthy();
  }
  async setSettings(patch) {
    const url = new URL(this.page.url());
    const headers={origin:url.origin,'content-type':'application/json',...this.apiHeaders},explicit=typeof patch.ai?.consent==='boolean';
    if(explicit){const{consent,...ai}=patch.ai,first={...patch,ai};if(!Object.keys(ai).length)delete first.ai;if(Object.keys(first).length){const prepared=await this.page.request.post(`${url.origin}/api/settings`,{headers,data:first});expect(prepared.ok()).toBeTruthy();}const current=await this.getSettings();patch={ai:{consent},consentToken:current.consentToken};}
    const response = await this.page.request.post(`${url.origin}/api/settings`, { headers, data: patch });
    expect(response.ok()).toBeTruthy();
    return response.json();
  }
  async prepareProposalPhase(phase){const gate=phase==='pending'?await this.delayOrganizeResponse():{release(){}};await this.beginOrganize();if(phase==='pending')await gate.started;else await expect(this.proposal).toBeVisible();if(phase==='undo'){await this.page.getByTestId('proposal-apply').click();await expect(this.page.getByTestId('proposal-undo')).toBeEnabled();}return gate;}
  async holdAiMutation(){let release,start,held=false;const gate=new Promise(r=>release=r),started=new Promise(r=>start=r);await this.page.route('**/api/{settings,ai/test}',async route=>{if(!held&&route.request().method()==='POST'){held=true;start();await gate;}await route.continue();});return{release,started};}
  async changeAiControl(kind){if(kind==='model'){await this.page.getByTestId('ai-model').fill('deepseek-reasoner');await this.page.getByTestId('ai-model').blur();}else if(kind==='provider'){await this.page.getByTestId('provider-field').getByRole('button').click();await this.page.getByTestId('popover').getByRole('option',{name:'OpenAI',exact:true}).click();}else if(kind==='effort'){await this.page.getByTestId('effort-field').getByRole('button').click();await this.page.getByTestId('popover').getByRole('option').first().click();}else if(kind==='consent')await this.page.getByTestId('ai-consent').uncheck();else await this.page.getByTestId('ai-test').click();}
  async beginOrganize(){await this.page.getByTestId('write-organize').click();await this.page.getByTestId('organize-submit').click();}
  async focusModelWithKeyboard(){await this.page.getByTestId('ai-model').focus();await this.page.keyboard.press('Tab');await expect(this.page.getByTestId('ai-model-picker')).toBeFocused();await this.page.keyboard.press('Shift+Tab');await expect(this.page.getByTestId('ai-model')).toBeFocused();}
  async apiPost(route,data={}){const origin=new URL(this.page.url()).origin;return this.page.request.post(origin+route,{headers:{origin,'content-type':'application/json',...this.apiHeaders},data});}
  async testAiConnection(){const response=await this.apiPost('/api/ai/test');expect(response.ok()).toBeTruthy();const data=await response.json();await this.publishAiPayload(data);return data;}
  publishAiPayload(data){return this.page.evaluate(detail=>dispatchEvent(new CustomEvent('tooddae-ai-readiness',{detail})),data);}
  async mockDeepseek(baseUrl){await this.setSettings({ai:{provider:'deepseek',models:{deepseek:'deepseek-flash'},baseUrls:{deepseek:baseUrl},efforts:{deepseek:'high'}}});await this.saveAiKey('deepseek','synthetic-context-key');await this.setSettings({ai:{consent:true}});return this.testAiConnection();}
  async forceProposalAction(action){return this.page.getByTestId('proposal-'+action).evaluate(button=>button.onclick?.());}
  proposalWrites(){const calls=[];this.page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/write/save'&&request.postDataJSON()?.snapshot)calls.push(request.postDataJSON());});return calls;}
  async delaySettingsSnapshot(){let release,start,delayed=false;const gate=new Promise(r=>release=r),started=new Promise(r=>start=r);await this.page.route('**/api/settings',async route=>{if(!delayed&&route.request().method()==='GET'){delayed=true;const response=await route.fetch();start();await gate;return route.fulfill({response});}await route.continue();});return{release,started};}
  modelForcedFocus(){return this.page.evaluate(()=>{const wrapper=document.querySelector('.model-entry'),input=wrapper.querySelector('input'),picker=wrapper.querySelector('button'),style=element=>{const s=getComputedStyle(element);return{outline:s.outlineStyle,width:parseFloat(s.outlineWidth),shadow:s.boxShadow};};return{wrapper:style(wrapper),input:style(input),picker:style(picker)};});}
  async hoverNestedWriteText(){await this.editor.evaluate(el=>{el.replaceChildren(Object.assign(document.createElement('span'),{textContent:'Nested editable text'}));});await this.editor.locator('span').hover();}
  async hoverNonEditableWriteText(){await this.editor.evaluate(el=>{const child=document.createElement('span');child.contentEditable='false';child.textContent='Non-editable island';el.replaceChildren(child);});await this.editor.locator('span').hover();}
  async getSettings() { return (await this.page.request.get('/api/settings',{headers:this.apiHeaders})).json(); }
  async saveAiKey(provider,key) { const url=new URL(this.page.url());const response=await this.page.request.post(`${url.origin}/api/ai/key`,{headers:{origin:url.origin,'content-type':'application/json',...this.apiHeaders},data:{provider,key}});expect(response.ok()).toBeTruthy();return response.json(); }
  async openWriteRead() {
    await this.page.getByTestId('write-read').click();
    await expect(this.preview).toBeVisible();
  }
  async openWriteEdit() {
    await this.page.getByTestId('write-edit').click();
    await expect(this.editor).toBeVisible();
  }
  async setMockProvider(baseUrl) {
    await this.setSettings({ ai: { provider: 'custom', models: { custom: 'test-model' }, baseUrls: { custom: baseUrl }, consent: false } });
    const url = new URL(this.page.url());
    const response = await this.page.request.post(`${url.origin}/api/ai/key`, { headers: { origin: url.origin, 'content-type': 'application/json', ...this.apiHeaders }, data: { provider: 'custom', key: 'test-only-key' } });
    expect(response.ok()).toBeTruthy();
    await this.setSettings({ ai: { consent: true } });
    const tested = await this.page.request.post(`${url.origin}/api/ai/test`, { headers: { origin: url.origin, 'content-type': 'application/json', ...this.apiHeaders }, data: {} });
    expect(tested.ok()).toBeTruthy();
    const result = await tested.json();
    await this.page.evaluate((detail) => dispatchEvent(new CustomEvent('tooddae-ai-readiness', { detail })), result);
  }
}
