---
name: dayline-dev
description: "Change, fix or extend the Dayline dashboard app: UI/behavior feedback, new features, i18n (en/ko/ja/zh), light/dark themes, server/API changes, service restart. Use when the user gives feedback or reports a bug about the task dashboard (체크박스, 루틴, 모달, 라이트모드, 언어, 다가오는 일정, 메모, 취소선 …), asks for a feature, or asks to restart/inspect the service. Encodes the project's conventions, the change checklist and the regression pitfalls found so far."
---

# Dayline development

Run commands from the project root `<root>` (the folder with `server.js`; `~/Dayline` on the owner's machine).

Zero-dependency Node 20+ app, local only. Layout:
`server.js` (http + SSE + file watcher) · `lib/vault.js` (markdown parsing/writing, rules, state) · `public/` (vanilla ES modules: `app.js` render + actions, `dialogs.js`, `ui.js` custom controls, `i18n.js`, `styles.css`, `tokens.css`, `theme.js`, `design.html` = live style guide at `/design`) · `scripts/` (`service.mjs` launchd, `dl.mjs` API helper) · `test/*.test.js` (unit) · `test/playwright/` (browser suite, own `package.json`) · `design/DESIGN.md` · `README.md` (data format and rules) · `.claude/skills/` (these skills).

## Workflow

1. **Reproduce first.** Read the user's screenshot closely, then see it in a real browser (`dayline-verify`). Reports like "잠깐 …" usually mean a transient state, not the steady state — sample frames.
2. **Find the cause before patching**, then grep for siblings that share it.
3. **Patch** with the Edit tool or a scripted replacement that asserts exactly one match; re-read files before editing them again.
4. `node --check <changed files>` and `npm test` (unit, < 1 s). Server logic gets a test in `test/vault.test.js`.
5. `npm run e2e` for anything visible (all engines; add `-- --project=chromium -g "<title>"` while iterating). Add or extend a test for the new behavior / fixed bug, and prove it can fail: reintroduce the bug in a disposable copy of the repo (never in the live files — `public/` is served live) and see the test go red (`dayline-verify` → mutation proof).
6. **Docs in the same change**: `README.md` (format/rules), `design/DESIGN.md` (components/rules), `public/design.html` (style guide, Korean).
7. **Deploy**: `public/*` is read from disk per request (user reloads with ⌘R). Server code (`server.js`, `lib/`): `node --check` + `npm test` first (a syntax error under launchd = crash loop), then `launchctl kickstart -k gui/$(id -u)/com.dayline.server`; confirm with `curl -s 127.0.0.1:4317/api/status` (new pid, `supervised:true`).
8. **Report in the user's language**: what was wrong, what changed, how it was verified (numbers/files), what is still unverified.

## Conventions

- Code comments Japanese, docs English (`design.html` is Korean), talk to the user in Korean (the owner's choice). No dependencies, no inline scripts (CSP `script-src 'self'`), no external requests.
- UI text only in `public/i18n.js`: add every key to **all four** dictionaries (en default, ko, ja, zh) with identical `{placeholders}`; `npm test` checks parity and that every key used in code exists. `t()` plain text, `h()` trusted HTML with escaped vars. Never name a variable `t` for a task (shadows the translator) — use `x` / `task`.
- Colors, spacing, motion only via `tokens.css` variables; the light theme overrides the same names under `:root[data-theme='light']`. The highlight (purple dark / amber light) only means: now · done · primary action · focus. No literal colors in components.
- No native `<select>` / date / time popups: use `ui.js` (`select`, `datePicker`, `timePicker`, `weekdayChips`).
- Destructive actions: confirm dialog (question title, one sentence on what happens, "go back" + red button). Task cancel = `[-]` with an undo toast. Routine ✕ = real delete (today's line + template definition; past notes stay); its text must never promise that it "comes back".
- State classes use the `is-` prefix (`is-done`, `is-pop`, `is-reset`). `.pop` is the popover — never reuse a component class name for a state.
- Icons: sprite `public/icons.svg`, inlined into `index.html` by the server; use `<use href="#i-name">`.
- Task row = grid: row 1 checkbox · title · actions (centred on the title block), row 2 memo + chips. Nothing may move the checkbox out of row 1.
- **Every control or element a test needs gets a `data-testid`** (kebab-case, `<thing>` or `<thing>-<part>`; list: `grep -rn data-testid public/`) in the same change, and every `<dialog>` gets `aria-labelledby` pointing at its heading (tests find dialogs by role + name).

## Pitfalls already paid for

| symptom | cause | rule |
|---|---|---|
| checkbox jumped to the middle of the row for ~0.6 s and turned round | animation class `pop` collided with the popover's `.pop` (`position: fixed`) | unique state class names; test the frames right after a click |
| strike animation did nothing on timed tasks | Day-line pills share `data-id` with list rows; `querySelector('[data-id]')` hit the pill | select `li[data-id=…]` |
| animation cut short | `render()` rebuilds the DOM and the SSE echo of our own write re-renders | replay via `.is-reset` + forced reflow; hold the next render for the animation time |
| icons blank right after a render | external `<use href="/icons.svg#…">` refetched under `no-store` | inline sprite |
| lost updates on fast clicks | parallel read-modify-write on one file | per-file queue (`exclusive`) in `lib/vault.js` |
| quick add overrode dates typed in the text | defaults always sent | send defaults only when the text has no date token |
| backdrop click closed the dialog with the calendar | pointerdown closes the popover before click | `popOpen()` stays true briefly after an outside close |
| `npm test` started the e2e files | `node --test` runs everything under `test/` | `npm test` = `node --test test/*.test.js` |
| 5 quick clicks on one checkbox → 409 conflicts and the file ended in the wrong state | each click sent the `raw` it had when clicked; the SSE echo of the previous write replaced the row objects, so the next click still carried an old `raw` | toggles on one row are chained (`inflight`: each response's `raw` feeds the next request); state loads are deferred while a write is in flight and dropped if a write started during the fetch (`writes` epoch) |
| dialogs unnamed for screen readers (found by role-based tests) | `<dialog>` without a label | `aria-labelledby` on every dialog, ids on the headings |
| a click did nothing (also surfaced as a rare flake: the edit dialog never opened) | `render()` replaced the pressed element between mousedown and mouseup (an Obsidian save or the echo of the previous click lands during the ~100 ms press) → no `click` is generated | `paint()` defers rendering while a pointer is held (`pressed()`, max 3 s) and paints right after `pointerup`; every echo/timer-driven render must go through `paint()`, user-action renders may call `render()` directly. Tests: `live-sync.spec.js` “押している最中に外部の更新が届いても…” (hold the mouse, write the vault, release) |
| a time format change worked on the server but not in the dialog / Day line (or the other way round) | the time regex lives in three places: `TIME_RE` (lib/vault.js), `TIME_SRC` (public/app.js), `ANY_TIME` (public/dialogs.js) | change all three together; `parseTime` has a unit test, the dialog round-trip is in `end-time.spec.js` |
| a keyboard shortcut “double press” fired on the first press right after page load | `lastK` started at 0 and `performance.now()` is small just after load | initialise “last time” to `-Infinity`, not 0 |
| flaky geometry test (0 instead of 11 on Firefox ~40 %) | measured an element that the SSE-echo re-render had just detached (all-zero rects) | find + measure in one `page.evaluate`; wait for a visible condition after any UI write |
| spurious re-render in the middle of a test | the fixture's file writes trigger a delayed watcher event | the `vault` fixture waits for that echo before opening the page |
| a late `/api/state` answer could roll the checkbox back | the snapshot was fetched before our write but applied after it | `load()` drops a snapshot if a newer load started (`seq`) or a write started meanwhile (`writes`), and defers while a toggle is in flight (`inflight`) — keep all four; the concurrency spec injects a stale snapshot to prove it |

## Service (macOS launchd)

`launchctl print gui/$(id -u)/com.dayline.server` · logs `~/Library/Logs/Dayline/server.log` · `npm run service:install | service:uninstall | service:status`. The plist holds the absolute `node` path; rerun `service:install` if Node changes. Env: `PORT`, `VAULT`, `READONLY=1`, `INPLACE=1`. Never start a second server on 4317 — experiments use another `PORT` and a temp `VAULT`.

## Data operations are a different skill

Moving/converting/deleting the user's tasks and routines → `dayline-vault`. Proving that a change works → `dayline-verify`.

## Additional frontend pitfalls (Do / Write / Set)

| symptom | cause | rule |
|---|---|---|
| palette swatches stay enlarged after tapping, or animate under reduced motion | unqualified `:hover` transform applies to touch-generated hover and lacks an explicit motion override | gate decorative hover transforms with `(hover: hover) and (pointer: fine)`; under reduced motion explicitly remove both transform and transition |
| editor displayed a draft and “Saved” but no note was persisted | input became editable before the initial note/hash response; autosave had no current note | disable editor and note actions until current note is accepted; no-current dirty saves must fail, never claim success |
| an ordinary settings save discards another field's draft | rebuilding the mounted form replaces editable DOM | update controls through setters and preserve drafts, focus, selection and queues; language changes are the separate guarded full-reload flow below |
| unchecking removes the strike instantly | rebuilding the row starts the new unchecked span at 0%, so a transition has no 100% origin | render the transient row with `.is-unchecking` and run CSS keyframes from 100% to 0% for the same strike duration |
| an old AI-save response clears a newer draft | a boolean dirty flag cannot distinguish generations of the same field | keep per-field draft generations; publish authoritative readiness while blocked, then clear only the matching generation |
| navigating away/read mode collapses multiline autosave text | save reread a hidden contenteditable DOM instead of the input event's draft | title/body draft strings are the save source; hidden DOM is never reread by autosave |
| `23:00-01:00` drew backwards or was accepted without dates | time order and date order were validated separately | validate the combined date/time span on every API path; only an explicit later due date permits reverse clock times |
| bulk text in contenteditable gains blank lines | Chromium represents blank lines as empty block elements and `innerText` adds an extra separator | serialize text nodes plus block boundaries; treat a block's sole `<br>` as its placeholder, not another newline |
| Save switches to Read before note persistence finishes | the mode action hid the editor while autosave was still pending | sync the plaintext draft, await the title/body save queue, and switch only on success with no conflict |
| editor ⌘K navigates to Do instead of inserting a link | global capture and bubble handlers run around the editor shortcut | global shortcuts must ignore the focused Write body; the local handler prevents the default and inserts plaintext markers |
| Markdown markers execute inside code or escaped source | inline regexes ran across the entire line | protect escapes, links and code spans before formatting, and escape fenced code without passing it through inline rendering |
| same-day notes overwrite or refresh one another | Write requests and SSE matching used only the calendar date | carry `noteId` plus its date through every read/save/delete/restore/AI request, async snapshot and watcher filename |
| a slow create response opens its new note over a newer draft | Create cleared search and selected its response without checking the selection epoch | serialize Create, refresh the rail, then select only if note, route, query and epoch still match the initiating intent |
| Add on an archived note creates another archived-date note | Create copied the selected note date instead of the current server date | the add card always posts the current `today` metadata; selection only decides whether the response may open |
| search loses the current draft or focus | rail results were treated as navigation and rebuilt without a ticket | search only the rail, guard responses by query/ticket, keep the selected editor intact, and restore search selection after repaint |
| page input focus shows nested or accent card halos | generic `:focus-visible` also styled composite children and note cards | put the shadow on the composite surface once, keep plain-field borders neutral, and retain CanvasText outlines in forced colors |
| now dot sits below the rail and sync text moves between routes | marker and rail bottom offsets differed, and the quick control changed header row height | align marker and rail to the same 28px baseline; keep the right toolbar at least 38px and verify route and scroll geometry |
| Write briefly shows a blank sheet and disabled actions on opening | init replaced route.loading before settings, rail and selected note resolved | keep loading visible until all initial data is accepted, then reveal the original flat Write tree; failures use the existing error and Retry |
| section reorder silently overwrites an external edit | live state advanced the captured base hash while preserving a local draft order | keep the begin-mode daily/template hashes until Save; on 409 refetch and adopt the actual order before further edits |
| language changes translate half the page or discard a draft | dictionaries were applied in place before pending modules finished | run every shared guard, persist only on success, then reload without mutating the current document language |
| native and custom tooltips both appear | dynamic renderers keep writing `title` after tooltip setup | observe added/title-mutated elements, move title text into the shared text-only tooltip, and remove the native attribute |
| a timed completion strike jumps at its endpoint | the Day-line element is rebuilt and a new CSS target is committed before the first paint | sample the current filter/transform, then animate the new pill from that fraction; reduced motion writes the target directly |
| custom sunset is ignored after a schedule edit | a manual override created for an older sunrise/sunset pair still short-circuits automatic evaluation | bind overrides to the schedule, invalidate them when it changes, tick immediately, and align the next check to the minute |
| AI Test throws after its response | `event.currentTarget` becomes null after an await | capture the button before awaiting and only re-enable the captured connected node |
| Assistant receipt shows `[object Object]` or counts a no-op as creation | destination is structured metadata and model continuation may report deduplication | format destination fields explicitly; count only `results` entries with `changed:true`, and render completed `noops` as unchanged |
| a truncated Organize response can overwrite the note | proposal identity/warnings were treated as display-only | send the saved note base, require matching noteId/date/base in the response, and keep Apply disabled for `truncated`; show `shorter` as a review warning |
| a late Organize response marks the newly selected note conflicted | navigation and stale-current-note checks shared one `conflict()` branch | silently discard a response when its initiating note lost; show conflict only for the same current note/base or a real note 409 |
| an SSE refresh of A cancels an in-flight user selection of B | the refresh called `select(A)` and incremented the shared epoch before B's GET returned | keep a pending selection controller and make current-note SSE refresh yield to a different user intent after every await |
| focus still draws a thin accent line under the new halo | legacy `border-color` declarations remain in component focus selectors | remove focus border-color declarations; preserve the normal line and use only shadow, with forced-colors outline fallback |
| Set still contains an empty native title | title migration only removes truthy values | remove every present title attribute, copy only non-empty text, and clear stale tooltip data when a dynamic title becomes empty |
| a shortcut hint makes mobile dialog actions overflow | the no-wrap hint shares the action flex row | put the localized action-specific hint on its own row below actions and verify all visible buttons at 320/375/480 px |
| a late section Save clears a newer order mode | the async continuation mutated the global mode without checking its captured controller | disable every move/cancel/other-panel action while pending and update only when the current mode is the captured object |
| pressing a Markdown format shortcut twice nests markers | the first command kept the inner text selected but toggle detection inspected only the selection contents | detect and extend across adjacent delimiters, replace them in one native text edit, then restore the inner selection |
| Today/Postpone Undo changes spaces or metadata order | Undo called semantic edit, which reparsed and serialized the line | issue a bounded one-time server token after the action and restore the captured raw line only when the post-action raw still matches |
| Postpone changes start-token whitespace or metadata order before Undo | rebuilding the task to change due canonicalizes the whole line | replace only the existing due-date value, or insert one due token before the block ID; preserve every other byte |
| changing the selected AI model keeps old consent | destination identity included provider/base but omitted model | selected provider + model + base are one consent destination; unrelated providers' model settings do not reset it |
| provider switch shows the previous provider's models | catalog request ran before the queued provider save or accepted a mismatched response | await the settings queue, verify response provider/root/epoch, and recheck connected controls before opening or applying a picker choice |
| catalog or AI test status stays in the old language | only translated text was stored | retain the status translation key and render it again on the language event without rebuilding draft inputs |
| deleting a note races autosave or external edits | deletion was treated as an unversioned unlink | flush the write queue, confirm, send the current opaque base hash, snapshot before delete, and restore only against the server-issued delete-generation base |
| subscription login commits after a folder/account change | OAuth state alone did not bind the active local context | bind pending login to root and auth revision, validate identity and scopes, then invoke the backend guard inside the atomic credential update |
| Claude subscription mode runs ambient customization | safe mode still honors managed policy | use private config/cwd and fixed restricted argv; reject detected or unverifiable managed policy and non-claude.ai authentication |
| opening Organize sends the note before the user adds instructions | the primary action was bound directly to the network request | open a local anchored popover first; send note plus the bounded explicit instruction only on submit |
| returning to a prior provider loses consent or shows a stale Test success | consent and Test proof were treated as one global flag | remember consent per effective connection, but clear the visible Test status and require a new proof whenever connection/model/effort changes |
| an old tab writes into a newly selected folder | requests did not carry the boot-time folder identity | all vault requests use `public/api.js` with `X-TOODDAE-Root`; a mismatch blocks reads, writes and autosave until reload |
| folder switching loses a quick-add, dialog, note or key draft | the connection changed before page queues and drafts were checked | folder connect runs registered Do/Write/Set guards first; failed saves, conflicts and unfinished inputs block the switch |
| a mounted language change removes button icons | locale code replaces the whole control's `textContent` | translate a child text span; update icon-only `aria-label` and `title` without replacing the control |
| a saved API key looks missing after reload or provider switch | the password field is intentionally empty and saved-key metadata was ignored | retain only each provider's `hasKey` boolean and express it through the localized placeholder; never backfill the value |
| add success says only “Added” or names a storage file | the client discarded canonical returned dates or inferred placement from `Inbox.md` | classify the returned raw `⏳` / `🛫` / `📅` dates with the captured today using the same visible-state rules |

## Backend regressions added in isolated workspace (2026-10-06)

| Symptom | Cause | Rule |
|---|---|---|
| Custom AI consent disappears when reloaded | Read applied consent before destination patch | Normalize destinations before consent; changing destination requires renewed consent |
| Read-only mode could trigger restart or network probes | Guards excluded admin/network routes | Apply READONLY across writes, network, key and restart; same-origin JSON object gate |
| Rapid history snapshots overwrite a version | Same-millisecond filename collision | Exclusive create and advance timestamp on collision |
| Oversized AI reply buffered before validation | Size checked only after buffering | Stream with a byte cap; sanitize active key from errors/output |
| Lexical paths can escape via an existing symlink | Only prefix validation | Validate existing path components and reject symlinks; document remaining hostile-local-process race |

Concrete regressions are in backend-http/settings/notes/ai tests; matching destructive proofs run only in disposable copies via parent scripts/unit-mutations.mjs.


## S independent-review repair boundaries (2026-10-07)

| Symptom | Cause | Guard |
| --- | --- | --- |
| Explicit daily edit reports no-op; blank routine creates persistence | Markdown daily serializer uses empty token, runtime empty means keep | Validate explicit add rule and preserve semantic daily through assistant dispatch |
| Valid first tool writes before monthly 0/32 fails | Parser was treated as semantic validation | Reuse vault.normRepeat in whole-batch preflight |
| Old Write proposal revives after connection/Test changes | Readiness bool is not a proposal generation | Bind pending/proposal/Apply/Undo to AI generation and local invalidation epoch; recheck after note lock and before atomic write; ordinary save/restore remain independent |
| Forced-colors model focus disappears | Child outline suppression beats generic fallback | Visible forced-colors focus-within outline on actual composite |
| Actual Write body has dot instead of caret | Selector recognizes true but not plaintext-only/inherited editability | Use isContentEditable, respecting non-editable islands and native media fallback |
| Requests (settings, toggle, state) stay `(pending)` until reload | Every tab held its own SSE (2 once Write was opened); HTTP/1.1 allows ~6 connections per origin, so with a handful of tabs new fetches queue forever | `openEvents` shares ONE EventSource per browser: a Web Lock picks the tab that owns it and relays events over BroadcastChannel; the next tab takes over when it closes (falls back to per-tab SSE without Locks/BroadcastChannel) |
| Linux only: external edits are missed after the server wrote the file | Node's recursive `fs.watch` on Linux loses a file replaced by atomic rename (macOS FSEvents does not) | e2e that edit a file externally after toggles can fail on Linux; check on macOS before blaming the app |
| Assistant cannot complete / reopen an item | Toolset had add/edit/move only; lookups skipped done rows | `set_done` (open ⇄ done through `V.toggle`) and `find_items` `status: done`; never cancel/delete |
| New static asset 404s | `TYPES` in `server.js` had no `.png` | Add the extension to `TYPES` (server restart needed) |
| Hero N/M stays stale after ticking a task | The hero reads the server's progress, refreshed only by the SSE echo; a stalled SSE left it at the old value while the panel count (client side) moved | After the last in-flight toggle finishes, always `load()` instead of relying on the echo |
| AI-made item showed a time in the list but the edit dialog's time fields were empty and the title kept `13시까지` | the list/server read the first time token anywhere (`TIME_RE`) but the dialog split only a *leading* time (`LEAD_TIME`), and the assistant prompt only said “keep times in text” | the dialog uses the same first-token rule (`ANY_TIME`) and saves the time to the front (unchanged items are sent as is); the assistant prompt names the three forms and the server moves a trailing time to the front (`V.leadTime`). Routines accept start / end-only / both / none now |
| A new Write note appeared at a random place in the list | note IDs are `date--<random UUID>` and the list sorts IDs descending, so same-day notes were ordered by chance | `newUuid()` in `lib/notes.js` puts a max leading group and the creation time in the UUID digits; never sort or paginate notes by anything but the ID without changing the cursor |
| A long note list made the note sheet tall | `.write-layout` is a grid and `.write-sheet` stretched (default `align-self`) to the list column, whose height follows the list up to the viewport | `align-self:start` on `.write-sheet`; its height comes only from its own content (editor is `clamp(320px,58dvh,720px)`) |
| Connecting an existing folder (no `Templates/Daily.md`) filled today's note, and then the new template, with the author's own sample routines | `DEFAULT_TEMPLATE` in `lib/vault.js` (used by `ensureDaily` and `ensureTemplate` when the template file is missing) carried real routines | `DEFAULT_TEMPLATE` must stay structure only (same as the first-run seed template in `lib/runtime.js`); never ship personal sample data as a default. Guard: `test/vault.test.js` "template なしの既存フォルダ…". Not yet in `e2e:mutate` (needs a browser run) |
