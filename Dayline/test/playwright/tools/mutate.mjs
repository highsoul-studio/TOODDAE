// 変異テスト: 過去に実際にあった不具合 (と守りの要) を「複製したプロジェクト」へ 1 つずつ戻し、対応するテストが赤くなる (= 検出できる) ことを確かめる。
// 本物のファイルは触らない。複製は一時フォルダで、終わったら消す。赤くならない変異が 1 つでもあれば、そのテストは守りになっていない。
// 使い方: npm run e2e:mutate [名前の一部]      (Chromium だけで走らせる。全部で数分)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const only = process.argv[2];

// edits: [ファイル, 探す文字列, 置き換える文字列, 出現回数 (既定 1)]。回数が合わなければ「変異が当たっていない」として失敗にする (古い変異が黙って素通りしないように)
const MUTANTS = [
  { name: 'write-sheet-follows-the-list-height', why: 'A long note list must not make the note sheet tall (the grid stretched it to the list column)', unit: ['test/write-do.test.js'], grep: 'note sheet never stretches', edits: [
    ['public/pages.css', ".write-sheet {padding:var(--s-5);min-width:0;align-self:start;}", ".write-sheet {padding:var(--s-5);min-width:0;}"],
  ] },
  { name: 'notes-list-shows-its-scrollbar', why: 'The note list scrolls without a visible scrollbar', unit: ['test/write-do.test.js'], grep: 'note sheet never stretches', edits: [
    ['public/pages.css', "margin:0 -2px -26px;scrollbar-width:none;}", "margin:0 -2px -26px;}"],
  ] },
  { name: 'new-note-lists-in-random-place', why: 'A new note must list first; a random UUID put it at a random position among the same day\'s notes', unit: ['test/write-do.test.js'], grep: 'a new note lists first', edits: [
    ['lib/notes.js', "const noteId = `${date}--${newUuid()}`;", "const noteId = `${date}--${randomUUID()}`;"],
  ] },
  { name: 'assistant-time-stays-at-the-end', why: 'A time the AI writes after the title must be moved to the front, or the edit dialog leaves its time fields empty', unit: ['test/assistant.test.js'], grep: 'times the model writes after the title', edits: [
    ['lib/assistant.js', "args.text=V.leadTime(args.text);", "void 0;"],
  ] },
  { name: 'dialog-reads-only-a-leading-time', why: 'The edit dialog must find the first time anywhere in the text, like the list does', tests: ['end-time'], grep: '本文の途中・末尾', edits: [
    ['public/dialogs.js', "const m = text.match(ANY_TIME);", "const m = text.match(ANY_TIME); if (m && m.index > 0) return { ts: '', te: '', rest: text };"],
  ] },
  { name: 'routine-needs-a-start-again', why: 'A routine may have an end only (〜HH:MM) or no time', unit: ['test/vault.test.js'], grep: 'routines accept a start', edits: [
    ['lib/vault.js', "  if (time?.start && time.end && time.end <= time.start) throw new BadInput('end before start');", "  if (time && !time.start) throw new BadInput('routine needs start');\n  if (time?.start && time.end && time.end <= time.start) throw new BadInput('end before start');"],
  ] },
  { name: 'sse-per-tab', why: 'Every tab holding its own SSE exhausts the ~6 HTTP/1.1 connections, so later fetches never answer', tests: ['live-sync'], grep: '8 つ', edits: [
    ['public/api.js', "typeof BroadcastChannel === 'function' && navigator.locks ? new BroadcastChannel('tooddae-events') : null", 'null'],
  ] },
  { name: 'hero-progress-waits-for-sse', why: 'The hero N/M must refresh after a toggle even when no SSE change notice arrives', tests: ['progress'], grep: 'SSE の通知が届かなくても', edits: [
    ['public/app.js', '      idle.add(load); // SSE の echo に頼らず取り直す (接続が詰まっていても、上の進捗 N/M が更新される)\n', ''],
  ] },
  { name: 's2-daily-collapses-to-keep', why: 'Runtime explicit daily must not collapse into the Markdown empty token', unit: ['test/assistant.test.js'], grep: 'S2 recurrence: explicit daily', edits: [
    ['lib/assistant.js', "V.formatRule(rule) || 'every day'", 'V.formatRule(rule)'],
  ] },
  { name: 's2-monthly-skips-preflight', why: 'Invalid monthly ranges must reject before the first batch write', unit: ['test/assistant.test.js'], grep: 'S2 recurrence: monthly range', edits: [
    ['lib/assistant.js', 'return V.normRepeat(parsed);', 'return parsed;'],
  ] },
  { name: 's2-note-guard-misses-lock', why: 'An AI proposal queued behind the note lock must recheck generation before writing', unit: ['test/notes.test.js'], grep: 'S2 AI note guard', edits: [
    ['lib/notes.js', "    guard();\n    for (let n = 0; n < 3; n++)", '    for (let n = 0; n < 3; n++)'],
  ] },
  { name: 's2-ready-revives-output', why: 'A false readiness event cannot be undone by a later ready event', tests: ['ai-context'], grep: 'false readiness without a new generation', edits: [
    ['public/write.js', '  if(aiReady&&!payload?.aiReady)invalidateAiContext();\n', ''],
  ] },
  { name: 's2-model-focus-invisible', why: 'The actual model composite needs a forced-colors keyboard indicator', tests: ['repair-accessibility'], grep: 'actual model input', edits: [
    ['public/pages.css', 'outline:2px solid Highlight!important;outline-offset:2px;box-shadow:none!important;', 'outline:0!important;box-shadow:none!important;'],
  ] },
  { name: 's2-plaintext-cursor-missing', why: 'Plaintext-only and inherited editable targets need the custom caret', tests: ['repair-accessibility'], grep: 'actual plaintext-only', edits: [
    ['public/ui.js', "text=event.target.closest?.('input,textarea')||event.target.isContentEditable", "text=event.target.closest?.('input,textarea,[contenteditable=\"true\"]')"],
  ] },
  { name: 'custom-tooltips-disabled', why: 'Native title bubbles must be replaced by the accessible viewport-clamped tooltip layer', tests: ['ui-polish'], edits: [
    ['public/app.js', 'ui.initGlobalUi();', ''],
  ] },
  { name: 'language-switches-in-place', why: 'Language changes must pass save/draft guards and reload without an intermediate translated frame', tests: ['ui-polish'], edits: [
    ['public/app.js', 'setLang(code,{applyDocument:false});', 'setLang(code);'],
  ] },
  { name: 'day-pill-completion-jumps', why: 'Timed completion and undo must animate from the currently rendered fraction', tests: ['ui-polish'], edits: [
    ['public/app.js', "const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:560;", 'const duration=0;'],
  ] },
  { name: 'stale-theme-override-survives-schedule', why: 'A manual override from another sunrise/sunset schedule must not suppress the current boundary', tests: ['ui-polish'], edits: [
    ['public/theme.js', 'if(override&&(!override.schedule||override.schedule!==scheduleKey(settings))){', 'if(false){'],
  ] },
  { name: 'item-command-enter-disabled', why: 'The full item form must save once from Cmd/Ctrl+Enter outside IME and repeat', tests: ['ui-polish'], edits: [
    ['public/dialogs.js', "if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing && !e.repeat && !saving)", 'if (false)'],
  ] },
  { name: 'truncated-proposal-can-apply', why: 'A truncated AI proposal must stay visible but cannot be applied', tests: ['pages'], edits: [
    ['public/write.js', "warnings.includes('truncated');", 'false;'],
  ] },
  { name: 'late-organize-conflicts-new-note', why: 'A late proposal for note A must not mark newly selected note B as conflicted', tests: ['pages'], edits: [
    ['public/write.js', "if (current !== note) return;\n    if (dirty || note.hash !== base", "if (current !== note) return conflict();\n    if (dirty || note.hash !== base"],
  ] },
  { name: 'organize-ignores-pending-note-intent', why: 'A selection intent must invalidate every late settings, consent and proposal continuation before the new note GET resolves', tests: ['organize-intent'], edits: [
    ['public/write.js', "intent.ticket===epoch&&current===intent.note&&!pendingSelection&&", 'current===intent.note&&'],
  ] },
  { name: 'sse-cancels-pending-note-selection', why: 'An SSE refresh of A must yield to an already-started user selection of B', tests: ['pages'], edits: [
    ['public/write.js', "      if(pendingSelection&&pendingSelection.noteId!==note.noteId)return;\n", ''],
    ['public/write.js', " || pendingSelection&&pendingSelection.noteId!==note.noteId", ''],
  ] },
  { name: 'focus-restores-accent-border', why: 'Editable focus must use the soft halo without changing the normal border line', tests: ['ui-polish'], edits: [
    ['public/pages.css', '.model-entry:focus-within {box-shadow:0 0 0 2px', '.model-entry:focus-within {border-color:var(--focus);box-shadow:0 0 0 2px'],
  ] },
  { name: 'empty-native-title-survives', why: 'Even an empty dynamic title attribute must be removed and stale tooltip text cleared', tests: ['ui-polish'], edits: [
    ['public/ui.js', "if(!el.hasAttribute?.('title'))return;", "if(!el.getAttribute?.('title'))return;"],
  ] },
  { name: 'accent-cursor-action-only', why: 'The optional cursor needs dot, action-ring and text-caret states across the whole fine-pointer surface', tests: ['ui-polish'], edits: [
    ['public/ui.js', "cursor.classList.toggle('is-action',!!action);", "cursor.classList.toggle('is-action',true);"],
  ] },
  { name: 'accent-cursor-color-swaps-visible', why: 'Cursor color must stay frozen until fade-out reaches hidden', tests: ['ui-polish'], edits: [
    ['public/ui.js', "cursor.style.borderColor=style.borderColor;cursor.style.backgroundColor=style.backgroundColor;cursor.style.boxShadow=style.boxShadow;", ''],
  ] },
  { name: 'accent-cursor-stays-in-closed-dialog', why: 'Closing a modal must restore the native cursor until a new coordinate is known', tests: ['cursor-close'], edits: [
    ['public/ui.js', "  document.addEventListener('close',deactivate,true);", ''],
    ['public/ui.js', "new MutationObserver(()=>{if(!cursor.isConnected){document.body.append(cursor);deactivate();}}).observe(document.body,{childList:true,subtree:true});", ''],
  ] },
  { name: 'model-picker-removed', why: 'Model suggestions must be clickable without replacing manual input', tests: ['pages'], edits: [
    ['public/settings.js', 'data-testid="ai-model-picker"', 'data-testid="ai-model-picker-removed"'],
  ] },
  { name: 'editor-autogrows-again', why: 'Write editor must keep a viewport-responsive fixed height and internal scroll', tests: ['pages'], edits: [
    ['public/pages.css', 'height:clamp(320px,58dvh,720px);min-height:0;overflow:auto;', 'height:auto;min-height:55vh;overflow:visible;'],
  ] },
  { name: 'page-input-focus-outline-returns', why: 'Set and Write text surfaces must use one soft focus shadow instead of line outlines', tests: ['focus-shadow'], edits: [
    ['public/pages.css', '.ai-identity .field input:focus-visible,.notes-tools input:focus-visible,.write-title-input:focus-visible,.note-editor:focus-visible {outline:0;box-shadow:0 0 0 3px var(--accent-wash);}', '.ai-identity .field input:focus-visible,.notes-tools input:focus-visible,.write-title-input:focus-visible,.note-editor:focus-visible {outline:2px solid var(--focus);box-shadow:none;}'],
  ] },
  { name: 'dayline-now-dot-misaligned', why: 'The current-time dot center must share the Day line rail center', tests: ['gold-line-sun'], edits: [
    ['public/styles.css', '  bottom: 28px;\n  width: 1px;\n  background: linear-gradient(180deg, var(--accent-icon), transparent);', '  bottom: 24px;\n  width: 1px;\n  background: linear-gradient(180deg, var(--accent-icon), transparent);'],
  ] },
  { name: 'added-toast-uses-storage-file', why: 'Add notices must describe visible Today, Upcoming, or Inbox placement instead of the backing file', tests: ['ui-notices-key'], edits: [
    ['public/dialogs.js', 'addedToastKey(r.raw, today)', "r.file === 'Inbox.md' ? 'toast.addedInbox' : 'toast.addedToday'"],
  ] },
  { name: 'saved-key-placeholder-ignored', why: 'A write-only key field must still show provider-specific saved presence without revealing the key', tests: ['ui-notices-key'], edits: [
    ['public/settings.js', "field.placeholder=t(keyPresence[settings.ai.provider]?'set.keyPresent':'set.keyMissing')", "field.placeholder=t('set.keyMissing')"],
  ] },
  { name: 'brand-not-current-color', why: 'The supplied vector must follow the theme accent through currentColor', tests: ['runtime'], edits: [
    ['public/index.html', 'viewBox="0 0 512 512" fill="currentColor"', 'viewBox="0 0 512 512" fill="#000"'],
  ] },
  { name: 'brand-color-swaps-while-visible', why: 'The old brand color must fade out before the new accent is applied', tests: ['pages'], edits: [
    ['public/theme.js', "brand.style.opacity = '0'; brandAnimation?.cancel();", "brand.style.opacity = '1'; brandAnimation?.cancel();"],
  ] },
  { name: 'progress-fills-from-right', why: 'Hero progress must fill left to right and unfill right to left', tests: ['progress'], edits: [
    ['public/styles.css', 'inset: 0 auto 0 0;', 'inset: 0 0 0 auto;'],
  ] },
  { name: 'progress-gaps-never-close', why: 'At 100 percent the segmented progress gaps must merge into one continuous bar', tests: ['progress'], edits: [
    ['public/styles.css', '.ticks.is-complete .ticks__gaps i {transform:scaleX(0);', '.ticks.is-complete .ticks__gaps i {transform:scaleX(1);'],
  ] },
  { name: 'assistant-ignores-capability', why: 'Old servers must not expose unsupported Assistant controls', tests: ['pages'], edits: [
    ['public/app.js', "const assistantCapable=runtime.capabilities?.assistant===true;", 'const assistantCapable=true;'],
  ] },
  { name: 'assistant-retry-new-id', why: 'A network retry must reuse the same idempotency request ID', tests: ['pages'], edits: [
    ['public/app.js', "const request=assistantAttempt?.message===message?assistantAttempt:{message,id:crypto.randomUUID()};", 'const request={message,id:crypto.randomUUID()};'],
  ] },
  { name: 'swatches-wrap', why: 'Each swatch group must remain one horizontally scrollable row', tests: ['pages-mobile'], edits: [
    ['public/pages.css', 'flex-wrap:nowrap;', 'flex-wrap:wrap;'],
  ] },
  { name: 'dialog-autofocus-title', why: 'Opening an item dialog must focus the heading instead of selecting the title', tests: ['quick-add'], edits: [
    ['public/dialogs.js', "form.querySelector('h2').focus({ preventScroll: true });", "el('text').focus();el('text').select();"],
  ] },
  { name: 'item-dialog-one-column-desktop', why: 'Desktop item dialog needs form and memo columns', tests: ['dialogs'], edits: [
    ['public/styles.css', '.item-grid {display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);', '.item-grid {display:grid;grid-template-columns:1fr;'],
  ] },
  { name: 'ai-form-two-columns', why: 'Provider, model, effort and URL must share the first row', tests: ['pages'], edits: [
    ['public/pages.css', 'grid-template-columns:minmax(160px,.9fr) minmax(190px,1.15fr) minmax(120px,.65fr) minmax(210px,1.3fr);', 'grid-template-columns:repeat(2,minmax(0,1fr));'],
  ] },
  { name: 'catalog-provider-identity-ignored', why: 'A model catalog response from another provider must never populate the current picker', tests: ['pages'], edits: [
    ['public/settings.js', 'if(d.provider!==p){', 'if(false){'],
  ] },
  { name: 'markdown-table-disabled', why: 'AI and note Markdown tables must render as real safe tables', tests: ['pages'], edits: [
    ['public/markdown.js', 'if(header&&separator&&header.length===separator.length&&align.every(Boolean)){', 'if(false){'],
  ] },
  { name: 'write-delete-without-base', why: 'Deleting a note must carry its exact current base hash and conflict instead of overwriting newer content', tests: ['pages'], edits: [
    ['public/write.js', "api('/api/write/delete',{date:note.date,base})", "api('/api/write/delete',{date:note.date,base:''})"],
  ] },
  { name: 'uncheck-without-animation', why: 'Unchecking must animate the strike from 100% to 0%', tests: ['strike'], edits: [
    ['public/app.js', "${animate?.id === x.id && !animate.done ? ' is-unchecking' : ''}", ''],
  ] },
  { name: 'write-retry-listener-duplicates', why: 'Repeated initial failures must not attach another document listener', tests: ['pages'], edits: [
    ['public/write.js', 'pointerWired = true;\n    for (const type', 'for (const type'],
  ] },
  { name: 'ai-readiness-published-after-unblock', why: 'A superseded AI save must record false readiness before removing its blocker', tests: ['pages'], edits: [
    ['public/settings.js', 'lastSaveOk=true;readiness(d);if(clear&&aiDrafts.get(clear)===generation)draft(clear,false);', 'lastSaveOk=true;if(clear&&aiDrafts.get(clear)===generation)draft(clear,false);readiness(d);'],
  ] },
  { name: 'key-save-clears-new-draft', why: 'An old key-save response must not erase a newer key draft', tests: ['pages'], edits: [
    ['public/settings.js', "if(aiDrafts.get('key')===generation&&key.value===value){key.value='';draft('key',false);}", "key.value='';draft('key',false);"],
  ] },
  { name: 'auth-account-keeps-old-proof', why: 'Selecting a different subscription account must block the prior Test proof immediately', tests: ['pages'], edits: [
    ['public/settings.js', "connectionChanged();draft('authAccount');authBusy=true;", "connectionChanged();authBusy=true;", 2],
  ] },
  { name: 'folder-choose-without-root', why: 'Every folder-changing POST must carry the boot root identity', tests: ['runtime'], edits: [
    ['public/api.js', "const rootless = new Set(['/api/status']);", "const rootless = new Set(['/api/status', '/api/folder/choose']);"],
  ] },
  { name: 'write-first-failure-stays-mounted', why: 'A transient first Write load failure must be retryable', tests: ['pages'], edits: [
    ['public/write.js', "catch (error) { mounted = false; el.innerHTML = ''; throw error; }", "catch { status('write.error'); }"],
  ] },
  { name: 'consent-off-readiness-late', why: 'Turning consent off must disable Organize before the save response', tests: ['pages'], edits: [
    ['public/settings.js', "draft('consent');settings.ai.consent=e.target.checked;", 'settings.ai.consent=e.target.checked;'],
  ] },
  { name: 'consent-token-omitted', why: 'An explicit consent change must be bound to the connection that was displayed', tests: ['pages'], edits: [
    ['public/settings.js', "save({ai:{consent:e.target.checked},consentToken:token}", "save({ai:{consent:e.target.checked}}"],
  ] },
  { name: 'stale-consent-refresh-adopted', why: 'A delayed settings read from the prior provider must not replace the current consent or token', tests: ['pages'], edits: [
    ['public/settings.js', 'provider!==settings.ai.provider||rev!==revision||local!==localRevision||', 'rev!==revision||'],
  ] },
  { name: 'ai-draft-mask-bypassed', why: 'Backend readiness events must not enable AI while a key/model/base draft exists', tests: ['pages'], edits: [
    ['public/api.js', '!!lastAiPayload.aiReady && aiBlocks.size === 0', '!!lastAiPayload.aiReady'],
  ] },
  {"name":"new-markdown-raw-html","why":"Write preview must not interpret raw note HTML","tests":["pages"],"edits":[["public/markdown.js","const esc = (value) => String(value).replace(/[&<>\"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', \"'\":'&#39;' })[char]);","const esc = value => String(value);"]]},
  {"name":"new-ai-autosaves-proposal","why":"AI output is a proposal until explicit Apply","tests":["pages"],"edits":[["public/write.js","proposal = { text: data.text, original: text, hash: base };","await api('/api/write/save', { date: note.date, text: data.text, base }); proposal = { text: data.text, original: text, hash: base };"]]},
  { name: 'write-defaults-to-edit', why: 'Write must open in Read mode and expose only Edit plus AI', tests: ['pages'], edits: [
    ['public/write.js', "setMode(preserveMode ? previousMode : 'read');", "setMode(preserveMode ? previousMode : 'edit');"],
  ] },
  { name: 'write-save-hides-before-persist', why: 'Save must keep the plaintext editor visible until the title/body queue succeeds', tests: ['pages'], edits: [
    ['public/write.js', "el.querySelector('[data-testid=\"write-read\"]').onclick = () => saveAndRead();", "el.querySelector('[data-testid=\"write-read\"]').onclick = () => setMode('read');"],
  ] },
  { name: 'write-link-shortcut-routes-to-do', why: 'Focused Write Cmd/Ctrl+K must insert Markdown instead of triggering the global Do shortcut', tests: ['pages'], edits: [
    ['public/pages.js', "  if(event.target.closest?.('[data-testid=\"write-editor\"]'))return;\n", ''],
    ['public/app.js', "  if(e.defaultPrevented||e.target.closest?.('[data-testid=\"write-editor\"]'))return;\n", ''],
  ] },
  { name: 'markdown-uses-double-hyphen-strike', why: 'Strikethrough uses standard double tildes and keeps double hyphens literal', tests: ['pages'], edits: [
    ['public/markdown.js', ".replace(/(?<!~)~~(?!~)(\\S(?:[\\s\\S]*?\\S)?)(?<!~)~~(?!~)/g,'<del>$1</del>')", ".replace(/--(\\S(?:[\\s\\S]*?\\S)?)--/g,'<del>$1</del>')"],
  ] },
  { name: 'write-save-omits-note-id', why: 'Same-date notes must save against the selected noteId rather than the legacy date file', tests: ['pages'], edits: [
    ['public/write.js', "{ ...identityOf(note), text, base: note.hash, snapshot }", "{ date: note.date, text, base: note.hash, snapshot }"],
  ] },
  { name: 'write-search-stops-on-empty-page', why: 'Search must follow a cursor even when a bounded scan page has no matches', tests: ['pages'], edits: [
    ['public/write.js', '}while(!notes.length&&cursor);', '}while(false);'],
  ] },
  { name: 'write-create-late-response-overrides-newer-note', why: 'A delayed Create response must not replace the note, draft, search or route chosen meanwhile', tests: ['pages'], edits: [
    ['public/write.js', 'if(!sameIntent()){await rail();return;}', 'if(false){await rail();return;}'],
    ['public/write.js', "if(ticket!==epoch||current!==note||railQuery||location.hash!==route)return;", 'if(false)return;'],
  ] },
  { name: 'write-create-duplicates-inflight', why: 'Repeated Add clicks while Create is pending must produce one note', tests: ['pages'], edits: [
    ['public/write.js', 'if(deletePending||creating)return;creating=true;', 'if(deletePending)return;'],
  ] },
  { name: 'write-create-copies-selected-archive-date', why: 'The add card always creates a note for server today, even while an archived note is selected', tests: ['pages'], edits: [
    ['public/write.js', "{date:root().dataset.today,language:getLang()}", "{date:note?.date??root().dataset.today,language:getLang()}"],
  ] },
  { name: 'write-format-shortcut-nests-adjacent-markers', why: 'A second bold, italic or strike shortcut must remove the adjacent marker pair', tests: ['pages'], edits: [
    ['public/write.js', "inside=kind!=='link'&&extendWrapped(range,prefix,suffix)", 'inside=false'],
  ] },
  { name: 'section-reorder-advances-stale-base', why: 'An external section edit must conflict instead of silently adopting a new base under the local draft', tests: ['reorder'], edits: [
    ['public/app.js', 'if(state.base.daily!==sectionMode.base.daily||state.base.template!==sectionMode.base.template)sectionMode.stale=true;', 'sectionMode.base=state.base;'],
  ] },
  { name: 'section-reorder-allows-cancel-while-saving', why: 'Pending section order controls must not cancel or mutate the captured request', tests: ['reorder'], edits: [
    ['public/app.js', 'if(!panel||sectionMode.busy)return;', 'if(!panel)return;'],
  ] },
  { name: 'hero-uses-visible-row-count', why: 'Hero completion excludes future deadlines and uses the dedicated progress contract', tests: ['progress'], edits: [
    ['public/app.js', 'const [done,total] = S.progress?.total ?? [c.t[0] + c.r[0],c.t[1] + c.r[1]];', 'const [done,total]=[c.t[0]+c.r[0],c.t[1]+c.r[1]];'],
  ] },
  { name: 'write-save-reads-hidden-dom', why: 'Autosave after navigating away must use the multiline draft string, not hidden DOM text', tests: ['pages'], edits: [
    ['public/write.js', 'const text = documentText(note);', 'bodyDraft = editor().textContent; const text = documentText(note);'],
  ] },
  { name: 'write-heading-body-no-separator', why: 'A body added to an H1 without a final newline must not join the title', tests: ['pages'], edits: [
    ['public/write.js', '(note.doc.lineEnd || eol)', 'note.doc.lineEnd'],
  ] },
  { name: 'write-contenteditable-innertext', why: 'Block DOM from bulk input must preserve exact blank lines', tests: ['pages'], edits: [
    ['public/write.js', "return out.replace(/\\r\\n/g, '\\n');", "return editor().innerText.replace(/\\r\\n/g, '\\n');"],
  ] },
  { name: 'mobile-swatch-scrollbar-visible', why: 'Palette strips stay scrollable without exposing a persistent browser scrollbar', tests: ['pages-mobile'], edits: [
    ['public/pages.css', 'scrollbar-width:none;', 'scrollbar-width:auto;'],
  ] },
  { name: 'today-action-removed', why: 'Inbox and Upcoming rows need a reversible Today action', tests: ['flows'], edits: [
    ['public/app.js', "${!routine && !x.done && today ? btn('today', t('act.today'), 'calendar') : ''}", ''],
  ] },
  { name: 'multiday-segment-ignored', why: 'Day line must draw the intersection with today instead of the original reverse range', tests: ['end-time'], edits: [
    ['public/app.js', 'const time = x.segment ?? x.time;', 'const time = x.time;'],
  ] },
  { name: 'pop-class-collision', why: '押した直後にチェックボックスが行の中央へ飛び丸くなった (アニメ用クラスがポップアップの .pop と衝突)', tests: ['click-frames'], edits: [
    ['public/app.js', ".classList.add('is-pop')", ".classList.add('pop')"],
    ['public/styles.css', '.chk.is-pop::after', '.chk.pop::after'],
  ] },
  { name: 'strike-hits-day-line-pill', why: '時刻付きの行だけ取り消し線が描かれなかった (Day line のピルが同じ data-id)', tests: ['strike'], edits: [
    ['public/app.js', "$(`li[data-id=\"${CSS.escape(id)}\"]`)", "$(`[data-id=\"${CSS.escape(id)}\"]`)"],
  ] },
  { name: 'toggle-not-serialized', why: '同じチェックの素早い連打で 409 になり、保存が押した回数とずれた (送信が直列でなく、同じ古い行を並行して送る)', tests: ['concurrency'], edits: [
    ['public/app.js', '(inflight.get(x.id) ?? Promise.resolve(null)).then(', 'Promise.resolve(null).then('],
  ] },
  // 古い取得結果を捨てる守りは 4 重 (seq / 保存の開始を数える epoch / 送信中は取り直しを保留 ×2) で重なっているため、1 つだけ外しても見た目には出ない。全部外したときに検出できるかを見る
  { name: 'stale-snapshot-unguarded', why: '押した直後に、遅れて届いた古い状態で画面が巻き戻る', tests: ['concurrency'], edits: [
    ['public/app.js', 'if (n !== seq) return;', ''],
    ['public/app.js', 'if (w !== writes) return void load();', ''],
    ['public/app.js', 'if (inflight.size) return void idle.add(load);', '', 2],
  ] },
  { name: 'render-while-pressed', why: 'マウスを押している最中に外部の更新で一覧が作り直され、離したときにクリックが無効になる (押したのに反応しない)', tests: ['live-sync'], edits: [
    ['public/app.js', 'if (pressed()) return void (repaint = true);', ''],
  ] },
  { name: 'task-end-only-blocked', why: 'タスクでも終了時刻だけでは保存できなくなる (締切の時刻だけを付けられない)', tests: ['end-time'], edits: [
    ['public/dialogs.js', 'if (te && !ts && routine) return', 'if (te && !ts) return'],
  ] },
  { name: 'end-only-not-parsed-by-server', why: '〜12:00 が時刻として読まれず、Day line に出ない', tests: ['end-time'], edits: [
    ['lib/vault.js', "  if (m[5]) return { start: null, end: hm(m[5], m[6]) };\n", ''],
  ] },
  { name: 'end-only-pill-not-right-anchored', why: '終了だけのピルの右端が終了の目盛りからずれる', tests: ['end-time'], edits: [
    ['public/app.js', 'const place = i.endOnly ? `left:max(0px, calc(${pct(i.b)} - ${i.w}px))` : `left:${pct(i.a)}`;', 'const place = `left:${pct(i.a)}`;'],
  ] },
  { name: 'double-k-ignores-time-window', why: '間が空いても (何秒後でも) ⌘K の 2 回目で詳細ダイアログが開く', tests: ['quick-add'], edits: [
    ['public/app.js', 'const DOUBLE_K_MS = 500;', 'const DOUBLE_K_MS = 1e9;'],
  ] },
  { name: 'double-k-counts-key-repeat', why: '⌘K を押しっぱなしにすると詳細ダイアログが開く', tests: ['quick-add'], edits: [
    ['public/app.js', '  if (e.repeat) return; // 押しっぱなしの自動リピートは 2 回と数えない\n', ''],
  ] },
  { name: 'double-k-resets-open-dialog', why: 'ダイアログを開いている間の ⌘K 2 回で、入力中の内容が作り直される', tests: ['quick-add'], edits: [
    ['public/app.js', ' && !document.querySelector(\'dialog[open]\')', ''],
  ] },
  { name: 'double-k-on-first-press-after-load', why: 'ページを開いた直後の ⌘K 1 回が「2 回」と数えられる', tests: ['quick-add'], edits: [
    ['public/app.js', 'let lastK = -Infinity;', 'let lastK = 0;'],
  ] },
  { name: 'strike-without-transition', why: '取り消し線が一瞬で出る (アニメーションが効いていない)', tests: ['strike'], edits: [
    ['public/styles.css', 'transition: background-size var(--t-strike) var(--ease-draw);', 'transition: none;'],
  ] },
  { name: 'checkbox-not-centred', why: 'チェックボックスがタイトルの上下中央から外れる', tests: ['rows', 'click-frames'], edits: [
    ['public/styles.css', 'align-items: center; /* 1行目', 'align-items: start; /* 1行目'],
  ] },
  { name: 'memo-clamp-5', why: 'メモが 3 行を超えて出る', tests: ['rows'], edits: [
    ['public/styles.css', '-webkit-line-clamp: 3;', '-webkit-line-clamp: 5;'],
  ] },
  { name: 'light-accent-purple', why: 'ライトテーマのハイライトが橙〜黄ではなく紫になる', tests: ['theme'], edits: [
    ['public/tokens.css', '--accent: var(--p-500);', '--accent: #6d28d9;'],
  ] },
  { name: 'upcoming-weekday', why: '「今後の予定」の日付に曜日が付く', tests: ['upcoming'], edits: [
    ['public/app.js', '`<b>${esc(rel)}</b>${esc(md(k))}`', '`<b>${esc(rel)}</b>${esc(md(k))} (火)`'],
  ] },
  { name: 'html-not-escaped', why: '題名・メモの HTML がそのまま解釈される (XSS)', tests: ['resilience'], edits: [
    ['public/i18n.js', "export const escapeHtml = (s) => s.replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' })[c]);", 'export const escapeHtml = (s) => s;'],
  ] },
  { name: 'dialog-without-name', why: '詳細ダイアログが読み上げ用の名前を持たない', tests: ['a11y'], edits: [
    ['public/index.html', '<dialog id="dlg" data-testid="item-dialog" aria-labelledby="dlg-h">', '<dialog id="dlg" data-testid="item-dialog">'],
  ] },
  { name: 'routine-delete-keeps-template', why: 'ルーティンを消してもテンプレートの定義が残り、明日また出る', tests: ['routine'], edits: [
    ['lib/vault.js', 'await removeTemplateRoutine(root, text, true); // 先にテンプレート', '// await removeTemplateRoutine(root, text, true); // 先にテンプレート'],
  ] },
  { name: 'routine-until-off-by-one', why: '終了日の当日にルーティンが出なくなる (終了日は含む)', tests: ['routine'], edits: [
    ['lib/vault.js', 'if (r.until && date > r.until) return false;', 'if (r.until && date >= r.until) return false;'],
  ] },
  { name: 'server-listens-on-all-interfaces', why: '同じネットワークの他の PC から見える', tests: ['security'], edits: [
    ['server.js', "server.listen(PORT, '127.0.0.1')", "server.listen(PORT, '0.0.0.0')", 2],
  ] },
  { name: 'no-host-check', why: 'DNS rebinding を許す', tests: ['security'], edits: [
    ['server.js', "if (!HOSTS.has(req.headers.host)) return send(res, 403, { error: 'bad host' });", ''],
  ] },
  { name: 'no-origin-check', why: '他サイトのページから書き込める (CSRF)', tests: ['security'], edits: [
    ['server.js', "if (origin !== `http://${req.headers.host}` || !/^application\\/json(?:\\s*;|$)/i.test(String(req.headers['content-type']))) {", 'if (false) {'],
  ] },
  { name: 'vault-path-escape', why: 'API 経由で vault の外のファイルを読み書きできる', tests: ['security'], edits: [
    ['lib/vault.js', 'if (!p.startsWith(base + path.sep) || !p.endsWith', 'if (!p.endsWith'],
  ] },
  { name: 'static-path-escape', why: 'ソース (server.js など) が配信される', tests: ['security'], edits: [
    ['server.js', 'if (!file.startsWith(PUB + path.sep) || !type)', 'if (!type)'],
  ] },
  { name: 'csp-open', why: 'CSP が緩む (外部スクリプトを許す)', tests: ['security'], edits: [
    ['server.js', "default-src 'self'; style-src", "default-src *; style-src"],
  ] },
];

const selected = MUTANTS.filter((m) => !only || m.name.includes(only));
if (!selected.length) throw new Error(`該当する変異がありません: ${only}`);

const copyProject = () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-mut-'));
  fs.cpSync(APP, tmp, { recursive: true, filter: (src) => !/[/\\](node_modules|test-results|playwright-report|\.git)$/.test(src) });
  fs.symlinkSync(path.join(APP, 'test/playwright/node_modules'), path.join(tmp, 'test/playwright/node_modules'));
  return tmp;
};
const playwright = (tmp, tests, grep) => {
  const r = spawnSync(process.execPath, [path.join(tmp, 'test/playwright/node_modules/playwright/cli.js'), 'test', '--project=chromium', '--workers=2', '--reporter=line', ...(grep ? ['--grep', grep] : []), ...tests.map((t) => `tests/${t}.spec.js`)], { cwd: path.join(tmp, 'test/playwright'), encoding: 'utf8', env: { ...process.env, CI: '' } });
  const out = `${r.stdout}${r.stderr}`;
  return { failed: Number((out.match(/(\d+) failed/) ?? [])[1] ?? 0), passed: Number((out.match(/(\d+) passed/) ?? [])[1] ?? 0), out };
};

const runMutantTests = (tmp, mutant) => {
  if (!mutant.unit) return playwright(tmp, mutant.tests, mutant.grep);
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-name-pattern='+mutant.grep, ...mutant.unit], { cwd: tmp, encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`;
  return { failed: Number((out.match(/(?:fail |# fail )(\d+)/) ?? [])[1] ?? 0), passed: Number((out.match(/(?:pass |# pass )(\d+)/) ?? [])[1] ?? 0), out };
};

// 対照実験: 変異なしのコピーで、使うテストが全部緑であること (土台が赤いと、全部「検出できた」ように見えてしまう)
{
  const tmp = copyProject();
  try {
    const broad = selected.filter(m => !m.unit && !m.grep);
    const checks = selected.filter(m => m.unit || m.grep).map(m => runMutantTests(tmp, m));
    if (broad.length) checks.push(playwright(tmp, [...new Set(broad.flatMap(m => m.tests))]));
    const base = checks.reduce((sum, r) => ({ failed: sum.failed+r.failed, passed: sum.passed+r.passed, out: sum.out+r.out }), {failed:0,passed:0,out:''});
    if (base.failed || !base.passed) throw new Error(`変異なしでテストが赤い (${base.failed} failed / ${base.passed} passed)\n${base.out.slice(-600)}`);
    console.log(`土台: 変異なしで ${base.passed} 件すべて緑\n`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function evaluate(m) {
  const tmp = copyProject();
  try {
    for (const [file, find, replace, count = 1] of m.edits) {
      const p = path.join(tmp, file);
      const src = fs.readFileSync(p, 'utf8');
      const found = src.split(find).length - 1;
      if (found !== count) return { m, verdict: 'INVALID', note: `${file}: 「${find.slice(0, 50)}」が ${found} 件 (期待 ${count})` };
      fs.writeFileSync(p, src.split(find).join(replace));
    }
    const r = runMutantTests(tmp, m);
    return { m, verdict: r.failed > 0 ? 'KILLED' : r.passed > 0 ? 'SURVIVED' : 'ERROR', note: `${r.failed} failed / ${r.passed} passed`, out: r.failed || r.passed ? '' : r.out.slice(-400) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const results = [];
for (const m of selected) {
  const r = evaluate(m);
  results.push(r);
  console.log(`${r.verdict.padEnd(8)} ${m.name}  (${r.note})`);
}

const bad = results.filter((r) => r.verdict !== 'KILLED');
console.log(`\n検出できた変異: ${results.length - bad.length} / ${results.length}`);
for (const r of bad) console.error(`  ${r.verdict}: ${r.m.name} — ${r.m.why}\n    ${r.note}${r.out ? `\n${r.out}` : ''}`);
process.exit(bad.length ? 1 : 0);
