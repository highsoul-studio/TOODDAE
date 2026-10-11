import { t, getLang, escapeHtml as esc } from '/i18n.js';
import { renderMarkdown } from '/markdown.js';
import { PROVIDER_INFO } from '/providers.js';
import * as ui from '/ui.js';
import { get, post, openEvents, registerRootGuard, runtime, isStale } from '/api.js';
import { confirmDialog } from '/dialogs.js';

let mounted = false, pointerWired = false, unloadWired = false, current = null, dirty = false, queue = Promise.resolve(), timer, epoch = 0, proposal = null,deletePending=false,creating=false;
let railEpoch = 0, statusKey = '', organizing = false, railPressed = false, railPending = false, aiReady = false;
let mode = 'read', titleDraft = '', bodyDraft = '', titleEdited = false, bodyEdited = false, rawDraft = null;
let railQuery='',railCursor=null,railNotes=[],railTimer=0;
const RAIL_SIZES=[10,20,30];
const readRailSize=()=>{try{const n=Number(localStorage.getItem('dayline.write.railSize'));return RAIL_SIZES.includes(n)?n:RAIL_SIZES[0];}catch{return RAIL_SIZES[0];}};
let railSize=readRailSize();
let pendingSelection=null;
let aiGeneration=null,aiContextEpoch=0;
const root = () => document.querySelector('#page-write');
const editor = () => root().querySelector('[data-testid="write-editor"]');
const titleInput = () => root().querySelector('[data-testid="write-title-input"]');
const api = (url, body) => body === undefined ? get(url) : post(url, body);
const deleteCapable=runtime.capabilities?.notesDelete===true;
const identityOf=note=>({noteId:note.noteId??note.date,date:note.date});
const noteQuery=note=>new URLSearchParams(identityOf(note)).toString();
const button = (key, id, extra = '', icon = '') => `<button type="button" class="btn ${extra}" data-testid="${id}">${icon === 'mascot' ? ui.mascot() : icon ? ui.icon(icon) : ''}<span data-l10n="${key}">${esc(t(key))}</span></button>`;
const iconButton = (key, id, icon, extra = '') => `<button type="button" class="icon-btn ${extra}" data-testid="${id}" data-icon-l10n="${key}" aria-label="${esc(t(key))}" title="${esc(t(key))}">${ui.icon(icon)}</button>`;

function splitDocument(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const m = text.match(/^# ([^\r\n]*)(\r\n|\n|$)/);
  if (!m) return { title: '', body: text, eol, lineEnd: eol, gap: eol, hadTitle: false };
  let body = text.slice(m[0].length), gap = '';
  if (body.startsWith(m[2])) { gap = m[2]; body = body.slice(m[2].length); }
  return { title: m[1], body, eol, lineEnd: m[2], gap, hadTitle: true };
}
function documentText(note = current) {
  if (rawDraft !== null) return rawDraft;
  if (!titleEdited && !bodyEdited) return note?.text ?? '';
  const title = titleDraft.trim();
  const eol = note?.doc.eol ?? '\n';
  if (!bodyEdited) {
    if (!title) return note.doc.hadTitle ? note.doc.body : note.text;
    if (note.doc.hadTitle) return `# ${title}${note.doc.lineEnd}${note.doc.gap}${note.doc.body}`;
    return `# ${title}${eol}${note.text ? `${eol}${note.text}` : ''}`;
  }
  const body = bodyDraft.replaceAll('\n', eol);
  if (!title) return body;
  const lineEnd = note?.doc.hadTitle ? (note.doc.lineEnd || eol) : eol;
  const gap = note?.doc.hadTitle ? note.doc.gap : eol;
  return `# ${title}${lineEnd}${body ? `${gap}${body}` : ''}`;
}
function readPlain(rootNode) {
  if (rootNode.childNodes.length === 1 && rootNode.firstChild.nodeName === 'BR') return '';
  const valueOf = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.data;
    if (node.nodeName === 'BR') return '\n';
    if (node.childNodes.length === 1 && node.firstChild.nodeName === 'BR') return '';
    return [...node.childNodes].map(valueOf).join('');
  };
  let out = '';
  for (const [index, node] of [...rootNode.childNodes].entries()) {
    if (index && node.nodeType === Node.ELEMENT_NODE && ['DIV', 'P'].includes(node.nodeName)) out += '\n';
    out += valueOf(node);
  }
  return out.replace(/\r\n/g, '\n');
}
function readEditor(){return readPlain(editor());}
function status(key = '') { statusKey = key; root().querySelector('[data-testid="write-status"]').textContent = key ? t(key) : ''; }
function updateOrganize() {
  const button = root()?.querySelector('[data-testid="write-organize"]');
  if (!button) return;
  button.disabled = organizing || deletePending || !aiReady;
  ui.restMascot(button, organizing);
  root().querySelector('[data-testid="write-ai-hint"]').hidden = aiReady;
}
function updateDelete(){const control=root()?.querySelector('[data-testid="write-delete"]');if(!control)return;control.hidden=!deleteCapable||mode==='edit'||!current?.exists;control.disabled=deletePending;}
function setDeletePending(value){deletePending=value;for(const id of ['write-read','write-edit']){const control=root()?.querySelector(`[data-testid="${id}"]`);if(control)control.disabled=value;}updateDelete();updateOrganize();}
function invalidateAiContext(){aiContextEpoch++;invalidateProposal();}
function updateProposalControls(){const valid=proposal&&proposal.aiContextEpoch===aiContextEpoch&&proposal.aiGeneration===aiGeneration&&aiReady;const apply=root()?.querySelector('[data-testid="proposal-apply"]'),undo=root()?.querySelector('[data-testid="proposal-undo"]');if(apply)apply.disabled=!valid||proposal.warnings?.includes('truncated')||!!proposal.appliedHash;if(undo)undo.disabled=!valid||!proposal.appliedHash;}
function setAiReadiness(payload) {
  const generation=payload?.aiGeneration;
  if(Number.isSafeInteger(generation)){
    if(aiGeneration!==null&&generation<aiGeneration)return;
    if(aiGeneration!==null&&generation!==aiGeneration)invalidateAiContext();
    aiGeneration=generation;
  }
  if(aiReady&&!payload?.aiReady)invalidateAiContext();
  aiReady=!!payload?.aiReady;updateOrganize();updateProposalControls();
}
function conflict() { root().querySelector('[data-testid="write-conflict"]').hidden = false; status('write.conflict'); }
function invalidateProposal() { proposal = null; const box = root()?.querySelector('[data-testid="write-proposal"]'); if (box) box.hidden = true; for(const id of ['proposal-apply','proposal-undo']){const button=root()?.querySelector(`[data-testid="${id}"]`);if(button)button.disabled=true;} }
function preview() {
  root().querySelector('[data-testid="write-title-read"]').textContent = titleDraft.trim() || current?.date || '';
  root().querySelector('[data-testid="write-preview"]').innerHTML = renderMarkdown(bodyDraft);
}
function setMode(next) {
  if (mode === 'edit') {
    const value = readEditor();
    if (value !== bodyDraft) { bodyDraft = value; bodyEdited = true; rawDraft = null; }
  }
  mode = next;
  const editing = mode === 'edit';
  titleInput().hidden = !editing;
  editor().hidden = !editing;
  root().querySelector('[data-testid="write-title-read"]').hidden = editing;
  root().querySelector('[data-testid="write-preview"]').hidden = editing;
  root().querySelector('[data-testid="write-read"]').hidden = !editing;
  root().querySelector('[data-testid="write-edit"]').hidden = editing;
  root().querySelector('[data-testid="write-organize"]').hidden = editing;
  root().querySelector('[data-testid="write-format-hint"]').hidden = !editing;
  for (const [id, active] of [['write-read', editing]]) {
    const control = root().querySelector(`[data-testid="${id}"]`);
    control.classList.toggle('is-active', active);
  }
  root().dataset.mode = mode;
  updateDelete();
  preview();
}
function markDirty() {
  if (!current) return;
  dirty = documentText() !== current.text;
  clearTimeout(timer);
  if (dirty) timer = setTimeout(() => save(), 600);
}

async function save(snapshot = '', proposalContext = null) {
  clearTimeout(timer);
  const note = current;
  if (!note) { if (dirty) status('write.error'); return !dirty; }
  if (!dirty) return true;
  const text = documentText(note);
  const discardStaleProposalDraft=()=>{if(proposalContext&&current===note&&documentText(note)===text)applyText(proposalContext.beforeText??note.text);};
  queue = queue.catch(() => {}).then(async () => {
    if (current !== note || (proposalContext && (proposalContext.aiContextEpoch!==aiContextEpoch||proposalContext.aiGeneration!==aiGeneration||!aiReady))) {discardStaleProposalDraft();return false;}
    try {
      status('write.saving');
      const data = await api('/api/write/save', { ...identityOf(note), text, base: note.hash, snapshot, ...(proposalContext?{aiGeneration:proposalContext.aiGeneration}:{}) });
      note.hash = data.hash; note.text = text; note.doc = splitDocument(text);note.exists=true;
      if (documentText(note) === text) { titleEdited = false; bodyEdited = false; rawDraft = null; }
      dirty = documentText(note) !== text;
      status();
      updateDelete();
      rail().catch(() => {});
      if (dirty) timer = setTimeout(() => save(), 500);
      return true;
    } catch (error) {
      if(proposalContext&&(error.error==='ai-context-changed'||error.code==='ai-context-changed')){invalidateAiContext();discardStaleProposalDraft();status('ai.error');return false;}
      if (error.status === 409) { note.remote = error.current; conflict(); }
      else status('write.error');
      return false;
    }
  });
  return queue;
}

async function select(target, { preserveMode = false } = {}) {
  const identity=typeof target==='string'?{noteId:target,date:target.slice(0,10)}:target;
  const intent={...identity},ticket=++epoch;pendingSelection=intent;
  invalidateProposal();
  try {
    while (current && dirty) if (!(await save()) || ticket !== epoch) return;
    await queue;
    if (ticket !== epoch) return;
    const previous = current, previousMode = mode;
    const note = await api(`/api/write/note?${new URLSearchParams(identity)}`);
    if (ticket !== epoch || current !== previous) return;
    if (dirty) return status('write.conflict');
    note.doc = splitDocument(note.text);
    current = note; titleDraft = note.doc.title; bodyDraft = note.doc.body; titleEdited = false; bodyEdited = false; rawDraft = null; dirty = false; proposal = null;
    root().dataset.ready = 'true';
    editor().contentEditable = 'plaintext-only';
    for (const id of ['write-read', 'write-edit', 'write-organize']) root().querySelector(`[data-testid="${id}"]`).disabled = false;
    updateOrganize();
    root().dataset.date = note.date;root().dataset.noteId=note.noteId;
    titleInput().value = titleDraft;
    editor().textContent = bodyDraft;
    root().querySelector('[data-testid="write-conflict"]').hidden = true;
    root().querySelector('[data-testid="write-proposal"]').hidden = true;
    root().querySelector('[data-testid="proposal-apply"]').disabled = false;
    status();
    setMode(preserveMode ? previousMode : 'read');
    for (const control of root().querySelectorAll('[data-note-id]')) control.setAttribute('aria-current', control.dataset.noteId === note.noteId ? 'date' : 'false');
  } finally { if(pendingSelection===intent)pendingSelection=null; }
}

async function deleteNote(){if(deletePending||!current?.exists)return;const note=current;let undoButton;setDeletePending(true);try{clearTimeout(timer);if(dirty&&!(await save()))return;await queue;if(current!==note||!note.exists||dirty)return;const title=note.doc?.title?.trim()||note.date;if(!(await confirmDialog({title:t('write.deleteTitle'),body:t('write.deleteBody',{title,date:note.date}),yes:t('write.delete')})))return;if(current!==note||dirty)return conflict();proposal=null;root().querySelector('[data-testid="write-proposal"]').hidden=true;const base=note.hash,ticket=++epoch;queue=queue.catch(()=>{}).then(()=>api('/api/write/delete',{...identityOf(note),base}));const data=await queue,undo=Object.freeze({...data.undo}),undoToast=ui.toast(t('write.deleted'),()=>undoDelete(undo));undoButton=undoToast.querySelector('[data-testid="toast-undo"]');undoButton.disabled=true;if(ticket!==epoch||current!==note)return;note.exists=false;note.hash=data.hash;dirty=false;titleEdited=false;bodyEdited=false;rawDraft=null;const target=await rail();if(ticket!==epoch||current!==note)return;await select(target);status();}catch(error){queue=queue.catch(()=>{});if(error.status===409){note.remote=error.current;conflict();}else status('write.error');}finally{setDeletePending(false);if(undoButton)undoButton.disabled=false;}}

async function undoDelete(undo){if(deletePending||!undo)return false;let restored=false;setDeletePending(true);try{if(dirty&&!(await save()))return false;await queue.catch(()=>{});queue=queue.catch(()=>{}).then(()=>api('/api/write/restore',{noteId:undo.noteId,date:undo.date,id:undo.id,base:undo.base}));await queue;restored=true;await rail();await select(identityOf(undo));status();return true;}catch(error){status(error.status===409?'write.conflict':'write.error');if(!restored)queue=queue.catch(()=>{});return restored;}finally{setDeletePending(false);}}

function paintRail(today){if(railPressed){railPending=true;return;}root().dataset.today=today;const railEl=root().querySelector('[data-testid="notes-rail"]'),active=document.activeElement,focusId=active?.dataset.noteId,searchFocused=active?.dataset.testid==='note-search',searchStart=active?.selectionStart??0,searchEnd=active?.selectionEnd??0,shown=[...railNotes];if(!railQuery&&!shown.some(note=>note.noteId===today))shown.unshift({noteId:today,date:today,title:today,excerpt:t('write.today')});railEl.innerHTML=`<div class="notes-tools"><input type="search" data-testid="note-search" value="${esc(railQuery)}" placeholder="${esc(t('write.search'))}" aria-label="${esc(t('write.search'))}"><button type="button" class="note-link note-add" data-testid="note-add">${ui.icon('plus')}<span>${esc(t('write.addNote'))}</span></button><div class="notes-size" role="group" data-testid="note-size" aria-label="${esc(t('write.pageSize'))}"><span>${esc(t('write.pageSize'))}</span>${RAIL_SIZES.map(n=>`<button type="button" class="btn btn--sm" data-testid="note-size-${n}" data-size="${n}" aria-pressed="${n===railSize}">${n}</button>`).join('')}</div></div><div class="notes-list">${shown.map(note=>`<button type="button" class="note-link" data-testid="note-link" data-note-id="${esc(note.noteId)}" data-note-date="${note.date}"><strong>${esc(note.title||note.date)}</strong><span>${esc(note.excerpt||note.date)}</span></button>`).join('')}${railCursor?`<button type="button" class="btn btn--ghost btn--sm" data-testid="note-more">${esc(t('write.moreNotes'))}</button>`:''}</div>`;for(const control of railEl.querySelectorAll('[data-note-id]')){control.setAttribute('aria-current',control.dataset.noteId===current?.noteId?'date':'false');control.onclick=()=>{if(!deletePending)select({noteId:control.dataset.noteId,date:control.dataset.noteDate}).catch(()=>status('write.error'));};}const search=railEl.querySelector('[data-testid="note-search"]');search.oninput=()=>{railQuery=search.value;clearTimeout(railTimer);railTimer=setTimeout(()=>rail().catch(()=>status('write.error')),220);};railEl.querySelector('[data-testid="note-more"]')?.addEventListener('click',()=>rail({append:true}).catch(()=>status('write.error')));railEl.querySelector('[data-testid="note-add"]').onclick=()=>createNewNote();for(const control of railEl.querySelectorAll('[data-size]'))control.onclick=()=>{const size=Number(control.dataset.size);if(size===railSize)return;railSize=size;try{localStorage.setItem('dayline.write.railSize',String(size));}catch{}rail().catch(()=>status('write.error'));};if(searchFocused){search.focus();search.setSelectionRange(searchStart,searchEnd);}else if(focusId)railEl.querySelector(`[data-note-id="${CSS.escape(focusId)}"]`)?.focus();}
async function rail({append=false}={}){const ticket=++railEpoch,query=railQuery;let cursor=append?railCursor:'',notes=[],today=root().dataset.today;do{const params=new URLSearchParams({q:query,limit:String(railSize),...(cursor?{cursor}:{})}),data=await api(`/api/write/notes?${params}`);today=data.today;if(ticket!==railEpoch||query!==railQuery)return current?identityOf(current):{noteId:today,date:today};notes.push(...data.notes);cursor=data.nextCursor;}while(!notes.length&&cursor);if(ticket!==railEpoch)return current?identityOf(current):null;railNotes=append?[...new Map([...railNotes,...notes].map(note=>[note.noteId,note])).values()]:notes;railCursor=cursor;paintRail(today);if(current?.exists)return identityOf(current);if(!query)return{noteId:today,date:today};const target=railNotes[0];return target?identityOf(target):{noteId:today,date:today};}
async function createNewNote(){if(deletePending||creating)return;creating=true;const note=current;try{if(dirty&&!(await save()))return;await queue;if(note!==current)return;const ticket=epoch,query=railQuery,route=location.hash,title=titleDraft,body=bodyDraft,startMode=mode,hash=note?.hash,created=await api('/api/write/create',{date:root().dataset.today,language:getLang()}),sameIntent=()=>ticket===epoch&&current===note&&railQuery===query&&location.hash===route&&titleDraft===title&&bodyDraft===body&&mode===startMode&&note?.hash===hash;if(!sameIntent()){await rail();return;}railQuery='';await rail();if(ticket!==epoch||current!==note||railQuery||location.hash!==route||titleDraft!==title||bodyDraft!==body||mode!==startMode||note?.hash!==hash)return;await select(identityOf(created));}catch{status('write.error');}finally{creating=false;}}

async function consent(settings,subscriptions={}) {
  const provider = settings.ai.provider, dialog = document.createElement('dialog');
  dialog.className = 'consent-dialog'; dialog.dataset.testid = 'ai-consent-dialog'; dialog.setAttribute('aria-labelledby', 'ai-consent-title');
  const mode=settings.ai.authModes?.[provider]??'apikey',subscription=mode!=='apikey',base=subscription?PROVIDER_INFO[provider].baseUrl:settings.ai.baseUrls[provider]||PROVIDER_INFO[provider].baseUrl,account=subscriptions[provider]?.accounts?.find(item=>item.active)?.label||subscriptions[provider]?.label||'';
  dialog.innerHTML = `<div class="form"><h2 id="ai-consent-title">${esc(t('set.consent'))}</h2><p class="cf__body">${esc(t('set.consentinfo'))}</p><dl class="consent-destination" data-testid="ai-consent-destination"><div><dt>${esc(t('set.provider'))}</dt><dd>${esc(PROVIDER_INFO[provider].label)}</dd></div><div><dt>${esc(t('set.authMode'))}</dt><dd>${esc(t(mode==='chatgpt'?'auth.chatgpt':mode==='claudeCode'?'auth.claude':'auth.apiKey'))}${account?` · ${esc(account)}`:''}</dd></div><div><dt>${esc(t('set.model'))}</dt><dd data-testid="ai-consent-model">${esc(settings.ai.models[provider])}</dd></div><div><dt>${esc(t('set.base'))}</dt><dd>${esc(base)}</dd></div></dl><div class="form__foot"><span class="grow"></span>${button('write.cancel', 'ai-consent-cancel', 'btn--ghost')}${button('ai.consent', 'ai-consent-allow', 'btn--ai')}</div></div>`;
  document.body.append(dialog);
  const allowed = await new Promise((resolve) => {
    dialog.querySelector('[data-testid="ai-consent-allow"]').onclick = () => { dialog.close(); resolve(true); };
    dialog.querySelector('[data-testid="ai-consent-cancel"]').onclick = () => { dialog.close(); resolve(false); };
    dialog.oncancel = () => resolve(false);
    dialog.showModal();
  });
  dialog.remove();
  return allowed;
}
function openOrganize(trigger){if(organizing)return;const pop=document.createElement('form');pop.className='organize-pop';pop.setAttribute('role','dialog');pop.setAttribute('aria-label',t('write.organize'));pop.innerHTML=`<label class="field"><span>${esc(t('write.organizeExtra'))}</span><textarea data-testid="organize-extra" placeholder="${esc(t('write.organizeExtra'))}"></textarea></label><div class="organize-pop__actions"><button type="button" class="btn btn--ghost" data-testid="organize-cancel">${esc(t('write.cancel'))}</button><button type="submit" class="btn btn--ai" data-testid="organize-submit">${ui.mascot()}<span>${esc(t('write.organizeRun'))}</span></button></div>`;const input=pop.querySelector('[data-testid="organize-extra"]');input.oninput=()=>{const bounded=[...input.value].slice(0,2000).join('');if(bounded!==input.value)input.value=bounded;};pop.querySelector('[data-testid="organize-cancel"]').onclick=()=>ui.closePop(true);pop.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();ui.closePop(true);}};pop.onsubmit=event=>{event.preventDefault();const additionalInstructions=[...input.value.trim()].slice(0,2000).join('');ui.closePop();organize(additionalInstructions).catch(()=>status('ai.error'));};ui.openPop(trigger,pop);ui.mountMascots(pop);input.focus();}
function sameOrganizeIntent(intent){return !!intent?.note&&intent.ticket===epoch&&current===intent.note&&!pendingSelection&&intent.pageRoot===root()&&intent.pageRoot?.isConnected&&intent.aiContextEpoch===aiContextEpoch&&intent.aiGeneration===aiGeneration&&!isStale();}
async function organize(additionalInstructions='') {
  if (organizing||deletePending||pendingSelection||!current) return;
  const intent={ticket:epoch,note:current,pageRoot:root(),aiContextEpoch,aiGeneration};
  organizing = true;
  updateOrganize();
  try { await organizeRequest(additionalInstructions,intent); }
  catch(error){if(!sameOrganizeIntent(intent))return;if(error.status===409&&(error.current||error.error==='conflict')){intent.note.remote=error.current;conflict();}else{status('ai.error');ui.flashMascot(root()?.querySelector('[data-testid="write-organize"]'),'notice');}}
  finally { organizing = false; updateOrganize(); }
}
async function organizeRequest(additionalInstructions='',intent) {
  if (!aiReady||!sameOrganizeIntent(intent)) return;
  if (dirty && !(await save())) return;
  if(!sameOrganizeIntent(intent))return;
  const note = intent.note, text = documentText(note), base = note.hash;
  const settingsPayload=await api('/api/settings'),settings=settingsPayload.settings,consentToken=settingsPayload.consentToken;
  setAiReadiness(settingsPayload);
  if (!sameOrganizeIntent(intent)||dirty) return;
  if (!settings.ai.consent) {
    if (!consentToken) return status('ai.error');
    if (!(await consent(settings,settingsPayload.subscriptions)) || !sameOrganizeIntent(intent) || dirty) return;
    await api('/api/settings', { ai: { consent: true }, consentToken });
  }
  if (!sameOrganizeIntent(intent)||dirty) return;
  status('ai.busy');
  const data = await api('/api/write/organize', { ...identityOf(note), text, base, additionalInstructions });
  if (!sameOrganizeIntent(intent)) return;
  if (dirty || note.hash !== base || data.noteId !== note.noteId || data.date !== note.date || data.base !== base) return conflict();
  if(data.aiGeneration!==intent.aiGeneration){invalidateAiContext();return;}
  const warnings=Array.isArray(data.warnings)?data.warnings:[];
  proposal = { text: data.text, original: text, hash: base, warnings, epoch:intent.ticket, note, aiContextEpoch:intent.aiContextEpoch, aiGeneration:intent.aiGeneration };
  root().querySelector('[data-testid="proposal-apply"]').disabled = warnings.includes('truncated');
  root().querySelector('[data-testid="proposal-undo"]').disabled = true;
  const box = root().querySelector('[data-testid="write-proposal"]');
  box.hidden = false;
  const warning=box.querySelector('[data-testid="proposal-warning"]'),warningKey=warnings.includes('truncated')?'write.warningTruncated':warnings.includes('shorter')?'write.warningShorter':'';warning.hidden=!warningKey;warning.textContent=warningKey?t(warningKey):'';
  box.querySelector('[data-testid="proposal-original"]').innerHTML = renderMarkdown(text);
  box.querySelector('[data-testid="proposal-preview"]').innerHTML = renderMarkdown(data.text);
  status();
  ui.flashMascot(root().querySelector('[data-testid="write-organize"]'), 'success');
}
async function proposalIsCurrent(active){
  const valid=()=>proposal===active&&active.epoch===epoch&&active.note===current&&!pendingSelection&&active.aiContextEpoch===aiContextEpoch&&active.aiGeneration===aiGeneration&&aiReady&&!isStale();
  if(!active||!valid())return false;
  try{setAiReadiness(await api('/api/settings'));return valid();}catch{if(proposal===active)invalidateAiContext();return false;}
}
function applyText(text) {
  const doc = splitDocument(text);
  titleDraft = doc.title; bodyDraft = doc.body; titleInput().value = titleDraft; editor().textContent = bodyDraft;
  titleEdited = true; bodyEdited = true; rawDraft = text;
  preview(); dirty = documentText() !== current.text;
}
function insertPlainText(text) {
  const selection = getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node); range.setStartAfter(node); range.collapse(true);
  selection.removeAllRanges(); selection.addRange(range);
}

function selectInserted(contentLength,suffixLength){const selection=getSelection(),node=selection?.anchorNode,end=(selection?.anchorOffset??0)-suffixLength,start=end-contentLength;if(node?.nodeType!==Node.TEXT_NODE||start<0)return;const range=document.createRange();range.setStart(node,start);range.setEnd(node,end);selection.removeAllRanges();selection.addRange(range);}
function extendWrapped(range,prefix,suffix){const start=range.startContainer,end=range.endContainer;if(start.nodeType!==Node.TEXT_NODE||end.nodeType!==Node.TEXT_NODE||range.startOffset<prefix.length)return false;if(start.data.slice(range.startOffset-prefix.length,range.startOffset)!==prefix||end.data.slice(range.endOffset,range.endOffset+suffix.length)!==suffix)return false;range.setStart(start,range.startOffset-prefix.length);range.setEnd(end,range.endOffset+suffix.length);return true;}
function insertSource(replacement){let inserted=false;try{inserted=document.execCommand('insertText',false,replacement);}catch{}if(!inserted){insertPlainText(replacement);editor().dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:replacement}));}}
function markdownCommand(kind){const selection=getSelection(),range=selection?.rangeCount&&selection.getRangeAt(0);if(!range||!editor().contains(range.commonAncestorContainer))return;const selected=readPlain(range.cloneContents()),config={bold:['**','**'],italic:['*','*'],strike:['~~','~~'],code:['`','`'],link:['[','](https://)']}[kind];if(!config)return;const[prefix,suffix]=config,placeholder=kind==='link'&&!selected?'text':'',content=selected||placeholder,inside=kind!=='link'&&extendWrapped(range,prefix,suffix),wrapped=inside||!!selected&&kind!=='link'&&selected.startsWith(prefix)&&selected.endsWith(suffix);let replacement;if(wrapped)replacement=inside?selected:selected.slice(prefix.length,-suffix.length);else if(selected.includes('\n'))replacement=kind==='code'?`\`\`\`\n${selected}\n\`\`\``:selected.split('\n').map(line=>line?`${prefix}${line}${suffix}`:line).join('\n');else replacement=`${prefix}${content}${suffix}`;insertSource(replacement);if(inside)selectInserted(selected.length,0);else if(!wrapped&&!replacement.includes('\n'))selectInserted(content.length,suffix.length);bodyDraft=readEditor();bodyEdited=true;rawDraft=null;markDirty();}
function blockCommand(prefix){const selection=getSelection(),range=selection?.rangeCount&&selection.getRangeAt(0);if(!range||!editor().contains(range.commonAncestorContainer))return;const selected=readPlain(range.cloneContents()),replacement=selected?selected.split('\n').map(line=>line?`${prefix}${line}`:line).join('\n'):prefix;insertSource(replacement);bodyDraft=readEditor();bodyEdited=true;rawDraft=null;markDirty();}
// リスト行の編集補助（Enterで次の項目、Tab / Shift+Tabで字下げ）。マーカー・チェックボックス・本文の順に分解する
const LIST_LINE=/^([ \t]*)(?:(\d+)([.)])|[-*+])([ \t]+)(\[[ xX]\][ \t]+)?(.*)$/;
const graphemeCount=text=>typeof Intl.Segmenter==='function'?[...new Intl.Segmenter().segment(text)].length:[...text].length;
// キャレットが折り返し行ではなく論理行（改行区切り）のどこにあるかを求める。範囲選択中は対象外
function caretLine(){const selection=getSelection();if(!selection?.rangeCount||!selection.isCollapsed)return null;const caret=selection.getRangeAt(0);if(!editor().contains(caret.startContainer))return null;const head=document.createRange(),tail=document.createRange();head.setStart(editor(),0);head.setEnd(caret.startContainer,caret.startOffset);tail.setStart(caret.endContainer,caret.endOffset);tail.setEnd(editor(),editor().childNodes.length);const before=readPlain(head.cloneContents()).split('\n').pop(),after=readPlain(tail.cloneContents()).split('\n')[0];return{before,after,line:before+after};}
function moveCaret(direction,count,mode='move'){const selection=getSelection();for(let index=0;index<count;index++)selection.modify(mode,direction,'character');}
function deleteSelection(){let deleted=false;try{deleted=document.execCommand('delete');}catch{}if(!deleted){const selection=getSelection();if(selection?.rangeCount)selection.getRangeAt(0).deleteContents();editor().dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}));}}
function syncDraft(){bodyDraft=readEditor();bodyEdited=true;rawDraft=null;markDirty();}
function continueList(){const context=caretLine(),match=context?.line.match(LIST_LINE);if(!match)return false;const[line,indent,number,delimiter,space,task='',content]=match,prefixLength=line.length-content.length;if(context.before.length<prefixLength)return false;if(!content.trim()&&!context.after){moveCaret('backward',graphemeCount(context.before),'extend');deleteSelection();syncDraft();return true;}const marker=number===undefined?line.trimStart()[0]:`${Number(number)+1}${delimiter}`;insertSource(`\n${indent}${marker}${space}${task?'[ ] ':''}`);syncDraft();return true;}
function shiftListLine(outdent){const context=caretLine();if(!context||!LIST_LINE.test(context.line))return false;const back=graphemeCount(context.before);if(outdent){const lead=context.line.match(/^( {1,2}|\t)/)?.[0];if(!lead)return false;moveCaret('backward',back);moveCaret('forward',lead.length,'extend');deleteSelection();moveCaret('forward',Math.max(0,back-lead.length));}else{moveCaret('backward',back);insertSource('  ');moveCaret('forward',back);}syncDraft();return true;}
async function saveAndRead(){if(mode!=='edit')return;const control=root().querySelector('[data-testid="write-read"]'),note=current,value=readEditor();if(value!==bodyDraft){bodyDraft=value;bodyEdited=true;rawDraft=null;markDirty();}control.disabled=true;try{if(!(await save())||current!==note||dirty||root().querySelector('[data-testid="write-conflict"]').hidden===false)return;await queue;setMode('read');}finally{control.disabled=false;}}

export async function init() {
  if (mounted) return;
  mounted = true;
  const el = root();
  const loading = el.querySelector('[data-testid="route-state"]');
  el.innerHTML = `<header class="page-heading"><h1>${esc(t('write.title'))}</h1><span role="status" data-testid="write-status"></span></header><div class="write-layout"><aside class="notes-rail" data-testid="notes-rail" aria-label="${esc(t('nav.write'))}"></aside><section class="sheet write-sheet"><div class="write-toolbar"><h2 data-testid="write-title-read"></h2><input class="write-title-input" data-testid="write-title-input" aria-label="${esc(t('write.noteTitle'))}" placeholder="${esc(t('write.noteTitle'))}" maxlength="200" hidden><div class="write-actions">${iconButton('write.edit', 'write-edit', 'pencil', 'write-action--edit')}${iconButton('write.save', 'write-read', 'save')}${iconButton('write.delete','write-delete','trash','write-action--danger')}${button('write.organize', 'write-organize', 'btn--ai', 'mascot')}</div></div><a class="write-ai-hint" data-testid="write-ai-hint" href="#/set">${esc(t('ai.setup'))}</a><div class="conflict-banner" data-testid="write-conflict" role="alert" hidden><p>${esc(t('write.conflict'))}</p>${button('write.reload', 'write-reload')}${button('write.keep', 'write-keep')}</div><p class="write-format-hint" data-testid="write-format-hint" data-l10n="write.formatHint" hidden>${esc(t('write.formatHint'))}</p><div class="note-editor" contenteditable="false" role="textbox" aria-multiline="true" spellcheck="true" data-testid="write-editor" aria-label="${esc(t('nav.write'))}" data-placeholder="${esc(t('write.placeholder'))}" hidden></div><article class="markdown" data-testid="write-preview"></article><section data-testid="write-proposal" hidden><div class="proposal-grid"><article><h3>${esc(t('write.original'))}</h3><div class="markdown" data-testid="proposal-original"></div></article><article><h3>${esc(t('write.proposal'))}</h3><div class="markdown" data-testid="proposal-preview"></div></article></div><p class="proposal-warning" data-testid="proposal-warning" role="alert" hidden></p><div class="proposal-actions">${button('write.apply', 'proposal-apply', 'btn--ai', 'mascot')}${button('write.cancel', 'proposal-cancel')}${button('write.undo', 'proposal-undo')}</div></section></section></div>`;
  const view = document.createElement('div');
  view.hidden = true;
  view.append(...el.children);
  el.replaceChildren(...(loading ? [loading, view] : [view]));
  ui.mountMascots(el);
  for (const id of ['write-read', 'write-edit', 'write-organize']) el.querySelector(`[data-testid="${id}"]`).disabled = true;
  updateDelete();
  el.dataset.ready = 'false';
  editor().oninput = () => { bodyDraft = readEditor(); bodyEdited = true; rawDraft = null; markDirty(); };
  editor().onpaste = (event) => { event.preventDefault(); insertPlainText(event.clipboardData.getData('text/plain')); bodyDraft = readEditor(); bodyEdited = true; rawDraft = null; markDirty(); };
  editor().onkeydown = (event) => {if(event.isComposing)return;if(!event.metaKey&&!event.ctrlKey&&!event.altKey){if(event.key==='Enter'&&!event.shiftKey&&continueList())return void event.preventDefault();if(event.key==='Tab'&&shiftListLine(event.shiftKey))return void event.preventDefault();}if(event.repeat||!(event.metaKey||event.ctrlKey))return;const key=event.key.toLowerCase();if(key==='s'||key==='enter'){event.preventDefault();return void saveAndRead();}const heading=event.altKey&&/^Digit[1-6]$/.test(event.code)?Number(event.code.at(-1)):0,list=event.shiftKey&&event.code==='Digit7'?'1. ':event.shiftKey&&event.code==='Digit8'?'- ':'';if(heading||list){event.preventDefault();return blockCommand(heading?`${'#'.repeat(heading)} `:list);}const kind=key==='b'?'bold':key==='i'?'italic':key==='k'?'link':key==='e'?'code':key==='x'&&event.shiftKey?'strike':'';if(!kind)return;event.preventDefault();markdownCommand(kind);};
  titleInput().oninput = () => { titleDraft = titleInput().value; titleEdited = true; rawDraft = null; markDirty(); };
  titleInput().onkeydown=event=>{if(!event.isComposing&&!event.repeat&&(event.metaKey||event.ctrlKey)&&['s','enter'].includes(event.key.toLowerCase())){event.preventDefault();saveAndRead();}};
  el.querySelector('[data-testid="write-edit"]').onclick = () => { setMode('edit'); titleInput().focus(); };
  el.querySelector('[data-testid="write-read"]').onclick = () => saveAndRead();
  el.querySelector('[data-testid="write-organize"]').onclick = event => openOrganize(event.currentTarget);
  el.querySelector('[data-testid="write-delete"]').onclick=()=>deleteNote().catch(()=>status('write.error'));
  el.querySelector('[data-testid="write-reload"]').onclick = async () => { const note = current; await queue; if (current !== note) return; dirty = false; await select(identityOf(note)); };
  el.querySelector('[data-testid="write-keep"]').onclick = async () => {
    const note = current; await queue; if (current !== note) return;
    const data = await api(`/api/write/note?${noteQuery(note)}`); if (current !== note) return;
    note.hash = data.hash; dirty = true;
    if (await save('restore')) el.querySelector('[data-testid="write-conflict"]').hidden = true;
  };
  el.querySelector('[data-testid="proposal-cancel"]').onclick = () => { proposal = null; el.querySelector('[data-testid="write-proposal"]').hidden = true; };
  el.querySelector('[data-testid="proposal-apply"]').onclick = async () => {
    const active=proposal;
    if (!active || active.warnings?.includes('truncated') || !(await proposalIsCurrent(active))) return;
    if (dirty || current.hash !== active.hash) return conflict();
    const proposalContext={...active,beforeText:documentText()};
    applyText(active.text);
    if (await save('organize',proposalContext) && proposal===active && active.epoch===epoch && active.note===current && !pendingSelection) { active.appliedHash = current.hash; el.querySelector('[data-testid="proposal-undo"]').disabled = false; el.querySelector('[data-testid="proposal-apply"]').disabled = true; }
  };
  el.querySelector('[data-testid="proposal-undo"]').onclick = async () => {
    const active=proposal;
    if (!active || dirty || !active.appliedHash || !(await proposalIsCurrent(active))) return;
    if (current.hash !== active.appliedHash) return conflict();
    const proposalContext={...active,beforeText:documentText()};
    applyText(active.original);
    if (await save('restore',proposalContext)) el.querySelector('[data-testid="write-proposal"]').hidden = true;
  };
  el.querySelector('[data-testid="notes-rail"]').addEventListener('pointerdown', () => { railPressed = true; });
  if (!pointerWired) {
    pointerWired = true;
    for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, () => {
      railPressed = false;
      if (railPending) { railPending = false; setTimeout(() => rail().catch(() => {}), 0); }
    });
  }
  try { setAiReadiness(await get('/api/settings')); await select(await rail()); loading?.remove(); view.replaceWith(...view.childNodes); }
  catch (error) { mounted = false; el.innerHTML = ''; throw error; }
  const onWriteChange = (event) => {
    (async () => {
      const data = JSON.parse(event.data);if(deletePending)return;
      if (data.files?.some((file) => file.startsWith('Write/'))) rail().catch(() => {});
      const note = current;
      if (!note || !data.files?.includes(`Write/${note.noteId}.md`)) return;
      if(pendingSelection&&pendingSelection.noteId!==note.noteId)return;
      await queue;
      if (current !== note || pendingSelection&&pendingSelection.noteId!==note.noteId) return;
      const latest = await api(`/api/write/note?${noteQuery(note)}`);
      if (current === note && (!pendingSelection||pendingSelection.noteId===note.noteId) && latest.hash !== note.hash) {
        if (dirty || proposal || mode === 'edit') conflict();
        else await select(identityOf(note), { preserveMode: true });
      }
    })().catch(() => status('write.error'));
  };
  // 非表示の間は SSE を閉じているので、戻ったときに今のノートと一覧を取り直す
  const events = openEvents({ change: onWriteChange, resume: () => { const files = ['Write/'].concat(current ? [`Write/${current.noteId}.md`] : []); onWriteChange({ data: JSON.stringify({ files }) }); } });
  if (!unloadWired) {
    unloadWired = true;
    window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  }
}

registerRootGuard('write', async () => {
  if(deletePending)return 'write-delete';
  if(organizing)return 'write-ai';
  if (dirty && !(await save())) return 'write-save';
  await queue;
  return root()?.querySelector('[data-testid="write-conflict"]')?.hidden !== false || 'write-conflict';
});
addEventListener('tooddae-ai-context-invalidated',invalidateAiContext);
addEventListener('tooddae-ai-readiness', (event) => setAiReadiness(event.detail));

// ラベルだけを更新し、編集中の DOM・選択範囲・保存キューは保持する。
window.addEventListener('dayline-language', () => {
  if (!mounted) return;
  const el = root();
  for (const control of el.querySelectorAll('[data-l10n]')) control.textContent = t(control.dataset.l10n);
  for (const control of el.querySelectorAll('[data-icon-l10n]')) { const label=t(control.dataset.iconL10n); control.setAttribute('aria-label',label); control.title=label; }
  el.querySelector('h1').textContent = t('write.title');
  el.querySelector('[data-testid="write-ai-hint"]').textContent = t('ai.setup');
  el.querySelector('[data-testid="notes-rail"]').setAttribute('aria-label', t('nav.write'));
  editor().setAttribute('aria-label', t('nav.write')); editor().dataset.placeholder = t('write.placeholder');
  titleInput().setAttribute('aria-label', t('write.noteTitle')); titleInput().placeholder = t('write.noteTitle');
  el.querySelector('[data-testid="write-conflict"] p').textContent = t('write.conflict');
  el.querySelector('[data-testid="proposal-original"]').previousElementSibling.textContent = t('write.original');
  el.querySelector('[data-testid="proposal-preview"]').previousElementSibling.textContent = t('write.proposal');
  status(statusKey); rail().catch(() => {});
});
