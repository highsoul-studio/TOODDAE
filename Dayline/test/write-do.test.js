// R: 合成 vault のみ。ノート identity・検索・raw section reorder・締切集計。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as N from '../lib/notes.js';
import * as V from '../lib/vault.js';
const D = '2026-10-07';
async function fixture(t, files = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tooddae-r-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [file, text] of Object.entries(files)) { await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.writeFile(path.join(root, file), text); }
  return root;
}

test('R write layout: the note sheet never stretches to the list height and the list hides its scrollbar', async () => {
  const css = await fs.readFile(new URL('../public/pages.css', import.meta.url), 'utf8');
  assert.match(css, /\.write-sheet \{[^}]*align-self:start/);
  assert.match(css, /\.notes-list \{[^}]*scrollbar-width:none/);
  assert.match(css, /\.notes-list::-webkit-scrollbar \{display:none;\}/);
});

test('R notes: a new note lists first, above older random-ID notes and the date-only note of the same day', async t => {
  const old = `${D}--fffffffe-ffff-4fff-bfff-ffffffffffff`;
  const root = await fixture(t, { [`Write/${D}.md`]: '# legacy\n', [`Write/${old}.md`]: '# old\n' });
  const made = []; for (let i = 0; i < 5; i++) made.push((await N.createNote(root, D, 'ko')).noteId);
  assert.deepEqual((await N.listNotes(root)).map(n => n.noteId), [...made.reverse(), old, D]);
});

test('R notes: same date independent identities, legacy aliases, history/delete/Undo stay on selected note', async t => {
  const root = await fixture(t, { [`Write/${D}.md`]: '# legacy\n' });
  const [a,b] = await Promise.all([N.createNote(root,D,'ko'), N.createNote(root,D,'ko')]);
  assert.notEqual(a.noteId,b.noteId); assert.equal(a.date,D); assert.equal(a.text,'# 새로운 노트\n\n');
  assert.notEqual(a.hash,b.hash,'same content cannot supply another new note base');
  await assert.rejects(N.writeNote(root,b.noteId,'wrong target',a.hash),N.NoteConflict);
  await N.writeNote(root,a,'# changed A',a.hash,{snapshot:'organize'});
  const history = await N.listHistory(root,a); assert.equal(history.length,1); assert.deepEqual(await N.listHistory(root,b),[]);
  await assert.rejects(N.readHistory(root,b,history[0].id),V.BadInput);
  const current = await N.readNote(root,a.noteId); const deleted = await N.deleteNote(root,a,current.hash);
  await N.writeNote(root,b,'# edited B',b.hash);
  await assert.rejects(N.writeNote(root,a,'stale autosave',current.hash),N.NoteConflict);
  await N.restoreHistory(root,deleted.undo,deleted.undo.id,deleted.undo.base);
  assert.equal((await N.readNote(root,a)).text,'# changed A'); assert.equal((await N.readNote(root,b)).text,'# edited B');
  assert.equal((await N.readNote(root,D)).text,'# legacy\n'); assert.equal((await N.readNote(root,{date:D})).noteId,D);
  const listed = await N.listNotes(root); assert.equal(listed.length,3); assert.equal(new Set(listed.map(n=>n.noteId)).size,3);
});

test('R notes: strict identity/date/language and new-note empty restore conflict', async t => {
  const root=await fixture(t);
  for(const language of ['en','ja','zh']) assert.ok((await N.createNote(root,D,language)).text.startsWith('# '));
  await assert.rejects(N.createNote(root,D,'fr'),V.BadInput);
  for(const bad of ['../x',D+'--ABC',D+'--00000000-0000-4000-8000-000000000000/../x','2026-02-30']) await assert.rejects(N.readNote(root,bad),V.BadInput);
  const a=await N.createNote(root,D,'ko');
  await assert.rejects(N.readNote(root,{noteId:a.noteId,date:'2026-10-08'}),V.BadInput);
  const del=await N.deleteNote(root,a,a.hash);
  await fs.writeFile(path.join(root,'Write',a.noteId+'.md'),'');
  await assert.rejects(N.restoreHistory(root,del.undo,del.undo.id,del.undo.base),N.NoteConflict);
  assert.equal((await N.readNote(root,a)).text,'');
});

test('R search: beyond 120, scan-bounded empty pages, full body Unicode/date, query and root bound cursor', async t => {
  const root=await fixture(t); await fs.mkdir(path.join(root,'Write'));
  const writes=[];
  for(let i=0;i<260;i++) { const d=new Date('2026-01-01T00:00:00Z');d.setUTCDate(d.getUTCDate()+i); const date=d.toISOString().slice(0,10); writes.push(fs.writeFile(path.join(root,'Write',date+'.md'),`# title ${i}\n${i===0?'deep body CAFÉ 한글':'ordinary'}\n`)); }
  await Promise.all(writes);
  await fs.writeFile(path.join(root,'Write','2026-99-99.md'),'invalid date must not poison cursor');
  assert.equal((await N.listNotes(root)).length,120);
  const first=await N.searchNotes(root,{q:'cafe\u0301'});assert.deepEqual(first.notes,[]);assert.ok(first.nextCursor);
  const second=await N.searchNotes(root,{q:'cafe\u0301',cursor:first.nextCursor}); assert.equal(second.notes.length,1);assert.equal(second.notes[0].date,'2026-01-01');assert.equal(second.nextCursor,null);
  assert.equal((await N.searchNotes(root,{q:'2026-09-17'})).notes[0].date,'2026-09-17');
  await assert.rejects(N.searchNotes(root,{q:'different',cursor:first.nextCursor}),V.BadInput);
  const other=await fixture(t);await assert.rejects(N.searchNotes(other,{q:'cafe\u0301',cursor:first.nextCursor}),V.BadInput);
  for(const opts of [{q:'😀'.repeat(201)},{limit:121},{limit:0},{cursor:'../x'}])await assert.rejects(N.searchNotes(root,opts),V.BadInput);
  let cursor='',ids=[];do{const page=await N.searchNotes(root,{limit:70,cursor});ids.push(...page.notes.map(n=>n.noteId));cursor=page.nextCursor;}while(cursor);
  assert.equal(ids.length,260);assert.equal(new Set(ids).size,260);
});

test('R sections: raw blocks preserve BOM/mixed newlines/fences/nested task order and last no-newline',async t=>{
  const prefix='\uFEFF---\r\ntitle: untouched\n---\r\n## 今日のタスク\r\n- [ ] ungrouped\n';
  const a='### A\r\n- [ ] first  📅 2026-10-09\n  memo\r\n  - [ ] child\n```md\r\n### fake\n## ルーティン\r\n```';
  const b='### B\r\n- [ ] second';
  const daily=prefix+a+'\n'+b;
  const template='## 今日のタスク\n### B\n- [ ] template B\n### A\n- [ ] template A\n## ルーティン\n### R\n- [ ] routine\n';
  const root=await fixture(t,{[`Daily/${D}.md`]:daily,[V.TEMPLATE_FILE]:template});
  const initial=await V.buildState(root,D);assert.deepEqual(initial.sectionOrder.tasks.order,['A','B']);
  assert.equal((await V.reorderSections(root,D,{panel:'tasks',order:['B','A'],base:initial.sectionOrder.tasks.base})).changed,true);
  assert.equal(await fs.readFile(path.join(root,`Daily/${D}.md`),'utf8'),prefix.slice(0,-1)+'\n'+b+'\n'+a);
  assert.equal(await fs.readFile(path.join(root,V.TEMPLATE_FILE),'utf8'),template);
  const fresh=await V.buildState(root,D);assert.equal((await V.reorderSections(root,D,{panel:'tasks',order:['B','A'],base:fresh.sectionOrder.tasks.base})).changed,false);
  await assert.rejects(V.reorderSections(root,D,{panel:'tasks',order:['A','B'],base:initial.sectionOrder.tasks.base}),V.Conflict);
  for(const order of [['B'],['B','B'],['A','Z'],['A','B','C']])await assert.rejects(V.reorderSections(root,D,{panel:'tasks',order,base:fresh.sectionOrder.tasks.base}),V.BadInput);
});

test('R sections: routine union persists template-only sections, concurrent edit and truthful partial failure',async t=>{
  const text='## 今日のタスク\n### T\n- [ ] task\n## ルーティン\n### A\n- [ ] r1\n### B\n- [ ] r2\n';
  const root=await fixture(t,{[`Daily/${D}.md`]:text,[V.TEMPLATE_FILE]:text+'### C\n- [ ] r3\n'});
  const state=await V.buildState(root,D);assert.deepEqual(state.sectionOrder.routine.order,['A','B','C']);
  const originalRename=fs.rename;let injected=false;
  fs.rename=async (...args)=>{const result=await originalRename(...args);if(!injected&&args[1]===path.join(root,`Daily/${D}.md`)){injected=true;await fs.appendFile(path.join(root,V.TEMPLATE_FILE),'external\n');}return result;};
  try {await assert.rejects(V.reorderSections(root,D,{panel:'routine',order:['C','B','A'],base:state.sectionOrder.routine.base}),e=>e instanceof V.Conflict&&assert.deepEqual(e.changedFiles,[`Daily/${D}.md`])===undefined);}
  finally{fs.rename=originalRename;}
  assert.ok((await fs.readFile(path.join(root,V.TEMPLATE_FILE),'utf8')).endsWith('external\n'));
  assert.deepEqual((await V.buildState(root,D)).sections.routine,['B','A']);
  const fresh=await V.buildState(root,D);
  await V.edit(root,fresh.tasks[0],{text:'concurrent edit'});
  await assert.rejects(V.reorderSections(root,D,{panel:'routine',order:['A','B','C'],base:fresh.sectionOrder.routine.base}),V.Conflict);
});

test('R progress: deadline excludes future work/early completion, keeps display counts and no free streak',async t=>{
  const root=await fixture(t,{[`Daily/${D}.md`]:`## 今日のタスク\n- [ ] future ⏳ ${D} 📅 2026-10-08\n- [x] early ⏳ ${D} 📅 2026-10-08 ✅ ${D}\n- [x] due today 📅 ${D} ✅ ${D}\n- [ ] overdue 📅 2026-10-06\n- [ ] no due active\n- [-] canceled 📅 ${D}\n## ルーティン\n- [x] routine\n`, 'Inbox.md':`# Inbox\n- [ ] pure inbox\n- [x] inbox completed ✅ ${D}\n`});
  const state=await V.buildState(root,D);
  assert.deepEqual(state.progress,{tasks:[2,4],routine:[1,1],total:[3,5],earlyCompleted:1});
  assert.deepEqual(state.history[D],[3,5]);assert.equal(state.counts.tasks[1],6);assert.equal(state.streak,0);
  const next=await V.buildState(root,'2026-10-08');assert.deepEqual(next.progress.tasks,[0,3]);assert.equal(next.progress.earlyCompleted,0);
  const only=await fixture(t,{[`Daily/${D}.md`]:`## 今日のタスク\n- [x] early 📅 2026-10-08 ✅ ${D}\n`});
  const empty=await V.buildState(only,D);assert.deepEqual(empty.progress.total,[0,0]);assert.equal(empty.history[D],undefined);assert.equal(empty.streak,0);assert.equal(empty.progress.earlyCompleted,1);
});

test('R search: byte budget yields cursor before unread content and does not drop the boundary note',async t=>{
  const root=await fixture(t);await fs.mkdir(path.join(root,'Write'));
  for(let i=1;i<=23;i++)await fs.writeFile(path.join(root,'Write',`2026-10-${String(i).padStart(2,'0')}.md`),'x'.repeat(999990)+(i===1?'needle':''));
  const first=await N.searchNotes(root,{q:'needle'});assert.deepEqual(first.notes,[]);assert.ok(first.nextCursor);
  const next=await N.searchNotes(root,{q:'needle',cursor:first.nextCursor});assert.equal(next.notes[0].date,'2026-10-01');assert.equal(next.nextCursor,null);
});

test('R sections: duplicate/unfinished fences reject without writes; concurrent add is never lost',async t=>{
  for(const src of ['## 今日のタスク\n### A\nx\n### A\ny\n','## 今日のタスク\n### A\n```\n### B\n']){
    const root=await fixture(t,{[`Daily/${D}.md`]:src});const state=await V.buildState(root,D);assert.ok(state.sectionOrder.tasks.error);
    await assert.rejects(V.reorderSections(root,D,{panel:'tasks',order:['A'],base:state.sectionOrder.tasks.base}),V.BadInput);
    assert.equal(await fs.readFile(path.join(root,`Daily/${D}.md`),'utf8'),src);
  }
  const src='## 今日のタスク\n### A\n- [ ] old A\n### B\n- [ ] old B\n';
  const root=await fixture(t,{[`Daily/${D}.md`]:src,[V.TEMPLATE_FILE]:src});const state=await V.buildState(root,D);
  const results=await Promise.allSettled([V.reorderSections(root,D,{panel:'tasks',order:['B','A'],base:state.sectionOrder.tasks.base}),V.add(root,D,{text:'new concurrent',scheduled:D,section:'A'})]);
  assert.equal(results[1].status,'fulfilled');if(results[0].status==='rejected')assert.ok(results[0].reason instanceof V.Conflict);
  const text=await fs.readFile(path.join(root,`Daily/${D}.md`),'utf8');for(const item of ['old A','old B','new concurrent'])assert.equal(text.split(item).length,2);
});

test('R progress: missing completion date does not invent early activity; routines belong to occurrence date',async t=>{
  const root=await fixture(t,{[`Daily/${D}.md`]:`## 今日のタスク\n- [x] future without doneDate 📅 2026-10-08\n## ルーティン\n- [x] occurrence ⏳ 2026-10-08 📅 2026-10-09\n`});
  const state=await V.buildState(root,D);assert.deepEqual(state.progress,{tasks:[0,0],routine:[1,1],total:[1,1],earlyCompleted:0});
  const next=await V.buildState(root,'2026-10-08');assert.deepEqual(next.progress.total,[0,0]);
});
