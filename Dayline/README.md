# TOODDAE

TOODDAE is a local Markdown-folder dashboard for today's tasks, daily routines, upcoming work, inbox, notes, and a time-axis Day line. It binds to `127.0.0.1` only, keeps data in the folder you choose, and supports English / 한국어 / 日本語 / 中文 (English by default).

```bash
npm start            # http://localhost:4317
npm test             # parser / write / rules / i18n checks (unit, < 1 s)
npm run e2e:install  # once: Playwright + browsers for the browser suite (kept in test/playwright/, the app itself stays dependency-free)
npm run e2e          # Playwright suite — Chromium, Firefox, WebKit (Safari engine) + 2 mobile profiles, on a temp vault + temp port (~2 min)
node scripts/dl.mjs state    # compact overview via the API; also: find / get / post / backup (see the header of the file)
```

| env | default | meaning |
|---|---|---|
| `VAULT` | `~/TASK-Manager` | vault folder |
| `PORT` | `4317` | |
| `READONLY=1` | off | view only (all writes return 403) |
| `INPLACE=1` | off | write files in place instead of temp+rename (fallback if Obsidian ever fails to refresh an open note) |


## Do / Write / Set

- **Do** retains the existing daily tasks, routines, inbox, history and Day line.
- **Write** keeps legacy notes in `Write/YYYY-MM-DD.md` and new notes in `Write/YYYY-MM-DD--<UUID>.md`: Read mode by default, an editable title stored as the first Markdown H1, a fixed responsive-height plain-text editor with internal scrolling, hash-based atomic title/body autosave, and a safe styled Markdown view with headings, horizontal rules, ordered/unordered/task lists, links, emphasis, strikethrough, code, quotes and horizontally scrollable tables. The edit action becomes Save while editing and returns to Read only after the title/body save queue succeeds. The editor keeps Markdown source visible; `⌘/Ctrl+B`, `I`, `K`, `E` and `Shift+X` insert bold, italic, link, inline-code and strikethrough markers as plain text. On a bullet or numbered list line, `Enter` starts the next item (the next number; `Enter` on an empty item removes the marker) and `Tab` / `Shift+Tab` indent / outdent the line by two spaces; outside lists both keys keep their default behavior and the editor shows no native tooltip. Saved notes can be deleted after confirmation and immediately restored from the delete snapshot. AI proposals are never saved until Apply.
- **Set** stores preferences in `Set/Settings.md`: light/dark background and accent previews, custom country/time controls, automatic light between sunrise and sunset, and a manual override until the next boundary. Color-only transitions leave live controls clickable and respect reduced motion.
- Settings sync through the vault; API keys stay outside it in `DAYLINE_HOME/secrets.json` (default `~/.dayline`, mode 0600). The browser receives only key presence/source/hints, not the value. Model IDs remain user-editable and have not been verified against real provider catalogs.
- Both AI connection testing and note organization require destination consent. Consent is remembered for each effective root/provider/auth destination and returns when that same connection is selected again; changing a model or effort still invalidates the Test proof. The UI offers Anthropic, OpenAI, Gemini and DeepSeek; legacy custom destinations remain readable for compatibility but are not offered for new setup. Provider model catalogs load automatically only after saved settings are current, while the picker can explicitly refresh and the model field stays editable. Verified model families expose provider-specific reasoning effort beside the model; unknown/manual models omit that control rather than guessing support. Note content is sent only after submitting Test or the Write Organize popover; optional Organize instructions are a separate explicit user field and do not become note source text.
- OpenAI can use either a saved API key or the official Sign in with ChatGPT local-app flow. OAuth credentials and account registrations stay in the private runtime home outside the notes folder; no token paste field is exposed. Claude subscription mode runs only when the private Claude CLI profile explicitly reports first-party `claude.ai` authentication and a personal `pro` or `max` subscription. Missing or organization-plan metadata fails closed as `personal-plan-unverified`; Anthropic API-key mode remains available. The adapter also rejects detected managed-policy sources instead of bypassing them. Changing authentication mode or account invalidates the prior connection proof without deleting saved API keys.
- `READONLY=1` blocks note/settings/key writes, network AI routes and restart. POSTs require exact same-origin Origin and JSON objects. Existing symlink escapes, stale hashes, invalid dates/paths and oversized requests/notes are rejected. A trusted local OS/process environment is still required; this is not a sandbox against malicious same-user processes.
- Folder status distinguishes only evidence-backed local, drive, or unknown roots. “Drive” means the path appears to be on a mounted/sync root; it does not claim successful cloud synchronization. Rename folders in the OS file manager, then reconnect them from TOODDAE.
- Use the parent isolated workspace demo/test scripts for validation. Never run the real-vault verifier or install/restart a service merely because local tests passed.

## Write identity, search and section order

New notes use a server-generated lowercase UUID after their date, allowing multiple notes on one day. Its leading digits encode the creation time, so the note list (descending by ID) shows the newest note first; older random-ID notes of the same day sort below it. Existing date-only files and their history are not migrated. `POST /api/write/create` accepts `{date, language}` (`ko`, `en`, `ja`, `zh`) and returns `{noteId, date, text, hash, exists, mtime}` with a localized first H1. Renaming the title never renames the file.

Write read/save/delete/history/restore/Organize requests accept `noteId`; date-only requests continue to address only the legacy file. If both are supplied, their dates must agree. Restore `id` still identifies a history version; deletion Undo includes the note identity and current base hash. History lives under `.dayline/history/<noteId>/`, retaining up to 30 versions per note. New-note hashes also bind the note identity, so equal text in two notes does not share a save/Undo base. Organize remains a proposal and never auto-applies to disk.

`GET /api/write/notes?q=&limit=&cursor=` returns `{today, notes, nextCursor}`. Each note includes its identity, date, title, excerpt, character count and modification time. Search matches full source text and date using Unicode normalization and case-insensitive substring matching. Queries are limited to 200 Unicode code points and results to 120 per page. Content scanning is bounded to 200 files or 20 MiB per request; an empty result page may still have a next cursor. Clients must follow it to search older notes beyond the first 120. The cursor is tied to the root and query. Directory names are enumerated per request; this is not a persistent index or a fixed snapshot across external edits. Start a fresh search after changes when a complete current view is needed.

State includes `sectionOrder.tasks` and `sectionOrder.routine`, each with `{order, base:{daily,template}}`. `POST /api/section/reorder` accepts `{panel, order, base}`; `order` must be a complete unique permutation of the section names present across today's daily file and the template. Each file moves only its existing sections. Raw H3 blocks move intact, preserving task order, nested content, code fences, whitespace, BOM and line endings; ungrouped content and other panels remain fixed. Ambiguous duplicate or unfinished Markdown boundaries disable reordering. Both file hashes are checked under file locks. External-editor conflict returns 409; if one file was already updated, `changedFiles` reports it and the client must reload. Two independent files are not claimed to be an atomic filesystem transaction.

## Completion totals

`counts` continues to count visible panel rows. `progress` separately provides `{tasks:[done,total], routine:[done,total], total:[done,total], earlyCompleted}`. The same eligibility function feeds the 84-day history and streak calculation.

Main task totals include today's deadlines, active overdue tasks, and active tasks scheduled for today or earlier without a deadline. Future deadlines are excluded even when their items remain visible in Today. A future-deadline task explicitly completed on the evaluated date is counted separately in `earlyCompleted`; it cannot produce a free 100% day or streak, and is not counted again on its later deadline. Already-completed tasks are excluded on later days. Untargeted, undated Inbox items are excluded until completed; their explicit completion date counts as work on that day. Legacy completed rows without a completion token retain their scheduled/start/daily-date fallback. Routines count only on their occurrence date; cancelled items are excluded. An empty eligible day does not earn a streak day.

## Local folder connection

The folder name button reveals the current folder in Finder; the separate Edit action chooses another folder. TOODDAE asks for confirmation before connecting, flushes pending Write/Set saves, and refuses to switch while quick-add, dialogs, API-key input, conflicts, or failed saves remain unfinished. Other tabs keep their old draft DOM and stop all reads, autosaves, and actions until reloaded.

## How the two-way sync works

A TOODDAE folder is an ordinary folder of Markdown files; no editor plugin or cloud account is required.

- Web → Obsidian: the server rewrites only the lines that belong to the changed item (re-read just before writing; temp file + rename; the file's mtime/size is checked again right before the rename, and the write aborts with 409 if Obsidian saved in the meantime). Writes to the same file are queued one at a time, so fast successive clicks cannot overwrite each other. Notes that are not valid UTF-8 are never rewritten. Obsidian refreshes open notes by itself.
- Quick add: type in the top box and press Enter. `⌘/Ctrl+K` focuses the box; pressing it **twice quickly** (within 0.5 s) opens the full add dialog (dates, priority, section, memo, times) with what you typed — same as the button next to the box.
- Global shortcuts: `Shift+1` / `2` / `3` go to Do / Write / Set (ignored while typing or in a dialog), `⌘/Ctrl+Shift+Y` toggles light / dark and `⌘/Ctrl+Shift+U` switches to the next language (the same guarded reload as the language menu); both are shown in the button tooltips. The date picker starts on Sunday and colors Saturday blue and Sunday / public holidays red; holidays follow the Set country (JP and KR are computed in `public/holidays.js`; temporary KR holidays such as election days are listed by hand in `KR_EXTRA`).
- **Sponsor** (Set > Sponsor) opens a modal with three steps; the amounts shown follow the UI language (ko ₩1,000 / 3,000 / 10,000, ja ¥100 / 300 / 1,000, en and zh $0.99 / 2.99 / 9.99, defined in `public/sponsor.js`). Choosing a step opens its Stripe payment link (`SPONSOR_LINKS`) in a new tab. The three links are priced in yen (¥100 / 300 / 1,000) with Adaptive Pricing, so the checkout amount for ko / en / zh users is the yen price converted at the day's rate and can differ slightly from the amount shown in the modal. A step without a link falls back to a mail draft. The character reacts per step through `Highsoul.react` (highsoul v1.2).
- Obsidian → web: `fs.watch` on the vault → Server-Sent Events → the page reloads state. No manual refresh. The page does not redraw while a mouse button / finger is held down (it redraws right after release), so a click is never lost to an update that arrives mid-press.
- Cancelling a **task** never deletes its line: it writes `[-] … ❌ date` (undo in the toast, confirmation first).
- Deleting a **routine** (✕ on the routine row, or the red button in its dialog) is a real delete, after a confirmation: today's line (with its memo and nested items) **and** its definition in `Templates/Daily.md` are removed, so it stops appearing from tomorrow. Notes of past days are never touched. A routine that exists only in today's note (not in the template) is removed from today's note only. (There is no "skip for today only"; to do that, set the line to `[-]` in Obsidian.)

## Vault conventions

```
TASK-Manager/
  Daily/YYYY-MM-DD.md   created from Templates/Daily.md (the app and Obsidian's Daily notes use the same file)
  Templates/Daily.md    placeholders: {{date}} {{title}} {{time}} {{date:YYYY-MM-DD}}; also the definition of routines + sections
  Inbox.md              undated / future tasks
```

- Daily note sections: `## 今日のタスク` (tasks) and `## ルーティン` (routines). Any heading containing ルーティン / routine / checklist counts as routine. `### Name` under either one is a **section** (add / rename / delete from the dashboard; a section that still has items cannot be deleted; past notes are never touched).
- **Task vs routine**: the "ルーティンにする" checkbox in the add/edit dialog. A routine is defined in `Templates/Daily.md` and appears in every new daily note on the days its repeat rule says; turning the checkbox off removes it from the template (confirmation first).
- **Repeat rule** (routines), written like the Tasks plugin: none = every day · `🔁 every weekday` · `🔁 every week on Monday, Friday` · `🔁 every month on the 15th` / `on the last`. Append ` until 2026-10-09` to end on that day (inclusive; after it the routine stops appearing, the template line stays inert): `🔁 every day until 2026-10-09`. The routine dialog has an "End date" field; the list chip shows `〜10/09`. Changes apply from tomorrow's note. A day's note only keeps the routine lines that match that day (the `🔁` is dropped from the copy).
- Task syntax is the Obsidian Tasks plugin format: `- [ ] text ⏫ ⏳ 2026-10-07 📅 2026-10-09 🔁 every week`, done = `[x] … ✅ date`, cancelled = `[-] … ❌ date`. **開始日 = ⏳, 締切日 = 📅.**
- **Where a new task goes** (decided by its dates): start ≤ today (or only a due date ≤ today) → today's note; both dates empty or in the future → `Inbox.md`. The add dialog and the quick-add box default both dates to today. Clearing both dates of a task in a daily note moves it to the Inbox.
- A leading time in the text — `14:00` (start only), `12:00-12:15` (range) or `〜12:00` (**end only = a deadline time**; `~` and `～` work too) — is edited in the dialog's start/end time fields and puts the item on the Day line; a time elsewhere in the text works too (the dialog picks the first one, the same as the list, and writes it to the front when saved; unchanged items keep their text as is). Tasks and routines may have a start only, an end only, both, or no time. The AI assistant is told to write times at the front, and the server moves a trailing time to the front (`leadTime`). Reverse/equal ranges are rejected unless the explicit due date is after the explicit/implicit start date (`23:00` Oct 6 → `01:00` Oct 7 is valid). The Day line draws only the interval intersecting the displayed day and labels intervals continued from/to another day. An end-only item appears on its deadline date, occupies the hour before that deadline, and its notification also follows that date.
- **Memo**: indented lines directly under a task line (what Obsidian's Shift+Enter or a nested bullet gives you). The list shows up to 3 lines under the title; the add/edit dialog edits all of it (⌘/Ctrl+Enter saves).

  ```
  - [ ] 見積り作成 ⏫ ⏳ 2026-10-06 📅 2026-10-09
    一行目
    - 箇条書きもそのまま
  ```

  The block ends at a blank line, a less-indented line, a nested checkbox or a code fence. Blank lines inside a memo are dropped when saved (they would end the block). A memo line that looks like a checkbox or a code fence is written with a backslash (`- \[ ] …`, `` \``` ``) so it is not read as a task; the dashboard shows it unescaped. The memo travels with its task (complete, change section, move to the Inbox, convert task ⇄ routine, next occurrence of a repeating task); nested sub-tasks and other nested lines move with the parent when it changes section, goes to the Inbox, or is left out of a day's routines — when converting, they stay where they are. A routine's memo is stored in `Templates/Daily.md` too, so tomorrow's note gets it.
- Any `- [ ]` in any note of the vault is picked up (folders starting with `.` and `Templates/` are skipped). Undated ones show in the Inbox.
- Task recurrence (`🔁` on a task): `every [N] day|weekday|week|month|year [when done]` is handled like the Tasks plugin (next occurrence inserted above the completed line); other rules complete the task and warn.
- Row actions: Inbox and Upcoming tasks can be moved to Today without losing memo/nested content; an earlier due date is moved to today to keep the date order valid. Postpone changes only the due/end date to one day after the latest of today, the existing due date, and an explicit start date. Both actions have one-time Undo that restores the original task line byte-for-byte if the post-action line is still current.
- Streak: a day counts only when **all** eligible tasks and routines are complete. Cancelled items and tasks postponed past that day are excluded; zero eligible items are not a success. Today's incomplete day preserves yesterday's ongoing streak without incrementing it. The heatmap shows 84 days, while the streak continues beyond that window until the first failed or empty day. Each checked date recomputes visible task eligibility from daily and Inbox tasks, including carried work; a task is completed only on its actual completion date and is excluded afterward.
- Known limits: routines are matched with the template by their text, so two routines with the same text in different sections are treated as one; a file with mixed line endings is rewritten with CRLF if any line has CRLF.

## Layout

```
server.js         http + SSE + watcher, status/restart, CSRF/host checks, CSP
lib/vault.js      parser, line-safe writes, rules, sections, daily-note creation, dashboard state
public/           index.html app.js dialogs.js ui.js i18n.js theme.js styles.css tokens.css icons.svg (inlined into index.html when served)
                  design.html (+ design.js): live style guide at /design
scripts/service.mjs  launchd install/uninstall/status
scripts/dl.mjs       API helper for scripted data changes (state / find / post / backup → ~/.dayline/backups/)
test/*.test.js       node:test unit tests
test/playwright/     browser suite (own package.json): tests/ · page-objects/ · helpers/ · fixtures.js · lint.mjs · tools/ (real-server check, mutation proof)
design/DESIGN.md     design system
.claude/skills/      Claude Code skills for working on this project (dayline-vault / dayline-dev / dayline-verify)
```

## Tests

| command | what it proves |
|---|---|
| `npm test` | parsing, write rules, i18n key parity (unit, < 1 s) |
| `npm run e2e` | the UI in real engines (Chromium, Firefox, WebKit, iPhone/Pixel profiles) against a disposable vault: layout, strike animation, themes, 4 languages, dialogs, routines, memo, live sync, concurrency, accessibility, XSS/long input, server hardening (Host / Origin / path checks, loopback only) |
| `npm run e2e:lint` | the team's Playwright rules (no fixed waits, no selectors in specs, …) |
| `npm run e2e:mutate` | re-introduces past bugs and security regressions into a copy and checks that the matching test goes red |
| `npm run verify:real` | the running server with your real notes, read-only (all POSTs intercepted, md5 of the vault before/after) |

The tests start their own servers on free ports with a temp vault; your vault and port 4317 are never touched. Rules and recipes: `.claude/skills/dayline-verify/`.

## Claude Code skills

`.claude/skills/` holds three skills that travel with the project: `dayline-vault` (operate on the data through the API, with confirmation and backup), `dayline-dev` (conventions and pitfalls for changing the app), `dayline-verify` (Playwright rules and the evidence checklist). Claude Code picks them up automatically when started in this folder. To use them from anywhere, link them into your user skills:

```bash
mkdir -p ~/.claude/skills && ln -sfn "$PWD"/.claude/skills/dayline-* ~/.claude/skills/
```

## Setting up on another machine

1. Install **Node.js 20+** (22 recommended): <https://nodejs.org>, or `brew install node` / `nvm install 22` / `mise use node@22`. Check with `node -v`.
2. Unpack the archive and enter the folder: `unzip TOODDAE-1.0.1.zip && cd TOODDAE` (Windows: right-click → Extract All).
3. Choose a vault — the folder that holds `Daily/`, `Templates/` and `Inbox.md` (**the vault is not part of the package**):
   - an existing vault (Obsidian Sync, iCloud, a cloud drive or USB copy): `VAULT=/path/to/vault npm start` — Windows PowerShell: `$env:VAULT = 'C:\path\to\vault'; npm start`
   - or start fresh: create an empty folder `~/TASK-Manager` (or any folder + `VAULT=`), then `npm start`. The first run creates today's note from the built-in default template (`DEFAULT_TEMPLATE` in `lib/vault.js`, with a few sample routines — edit or delete them in the dashboard; `Templates/Daily.md` is written when you first change a routine).
4. Open <http://localhost:4317>. Language and theme buttons are in the top bar.
5. Develop: `npm test`; `npm run e2e:install` once (downloads Chromium / Firefox / WebKit, ≈ 600 MB) and then `npm run e2e`. Start `claude` in this folder — `CLAUDE.md` and the three project skills in `.claude/skills/` are picked up automatically (link them into `~/.claude/skills/` to use them from other folders, see above). `git init` is recommended: `.gitignore` is ready.
6. macOS only: `npm run service:install` starts it at login and restarts it if it dies. On other systems use `npm start` (or let systemd / Task Scheduler run `node server.js`).

Things that stay on the machine they were made on: your vault, the backups in `~/.dayline/backups/`, the launchd registration, and Claude Code's per-user memory.

## Sharing / packaging

Ship the folder without `node_modules/`, `test/playwright/{node_modules,test-results,playwright-report}/` and `server.log` (see `.gitignore`). Nothing personal is stored in the project: backups go to `~/.dayline/backups/` (`BACKUP_DIR` to change), the vault is wherever `VAULT` points, the launchd plist is generated per machine by `npm run service:install`. The sample strings in the built-in template (`DEFAULT_TEMPLATE` in `lib/vault.js`), `public/design.html` and the test fixtures are examples taken from the author's own routines — replace them before publishing the project.

Re-pack after changes (macOS / Linux):

```bash
cd .. && zip -r -X dayline-$(node -p "require('./dayline/package.json').version").zip dayline \
  -x 'dayline/node_modules/*' 'dayline/test/playwright/node_modules/*' 'dayline/test/playwright/test-results/*' 'dayline/test/playwright/playwright-report/*' '*.DS_Store' 'dayline/server.log'
```
