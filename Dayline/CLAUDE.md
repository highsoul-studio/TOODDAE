# Dayline — Claude project entry

## SoT and scope
- SoT (Single Source of Truth) means the authoritative source, not chat memory or this bootstrap. For this project, read ../docs/IMPLEMENTATION-STATUS.md for the current state, README.md for data rules, design/DESIGN.md for design, and the relevant .claude/skills/ workflow.
- Read user-wide instructions from ~/.claude/CLAUDE.md if they are not already loaded. When this is company work, verified current company common SoT governs common operations; project rules govern this project's details within that scope. This does not merge Dayline with HIGHSOUL STUDIO, HIGHSOUL AI STUDIO or DAILY HIGHSOUL.
- Native permissions, explicit current user approval and security boundaries remain in force. Do not treat this setup as deployment, automation activation, external sending, or data-deletion approval.
- Preserve the following project's specific agreements; this rebuild retains their original text.

# Dayline — guide for Claude Code

Local-only dashboard for an Obsidian vault (plain markdown): today's tasks, routines, upcoming, inbox, 12-week history and a time-axis "Day line". Two-way: the web UI edits the markdown, edits made in Obsidian appear live (`fs.watch` → SSE). The app is **zero-dependency Node 20+**; all test tooling lives in `test/playwright/` (its own `package.json`). Data format and rules: `README.md`. Design system: `design/DESIGN.md` (+ live style guide at `/design`).

## Run / test (from this folder)

```bash
npm start                  # http://localhost:4317   (VAULT=<folder> to pick the vault; default ~/TASK-Manager)
npm test                   # unit and local HTTP tests; duration depends on the selected suite
npm run e2e:install        # once per machine: Playwright + browsers
npm run e2e                # Chromium + Firefox + WebKit + 2 mobile profiles, against a temp vault (your vault is never touched)
npm run e2e:lint           # the team's Playwright rules as a self-check
npm run e2e:mutate         # re-introduce past bugs into a copy; every one must turn a test red
npm run verify:real        # the running server with real notes, read-only (all POSTs intercepted)
node scripts/dl.mjs state  # API helper for data operations (also find / post / backup)
npm run service:install    # macOS only: launchd auto-start + auto-restart
```

## Skills (`.claude/skills/`, picked up automatically when `claude` starts in this folder)

- `dayline-dev` — change the app: workflow, conventions, table of pitfalls already paid for
- `dayline-verify` — prove it works: Playwright rules, frame probes, mutation proof, read-only real-server check
- `dayline-vault` — operate on the owner's data through the API, with confirmation and a backup

## Working agreements

- Talk to the owner in **Korean**; docs in **English**; code comments in **Japanese**. UI text only in `public/i18n.js`, always all four languages (en default, ko, ja, zh) with identical placeholders.
- Reproduce first, find the cause, fix it where every caller routes through. Verify with evidence (tests, frame samples, screenshots) and say what was **not** verified.
- Never hand-edit vault markdown and never put test data into a real vault. Before changing the owner's data show the exact before → after and get a yes; back up first (`node scripts/dl.mjs backup <label>` → `~/.dayline/backups/`, outside the project on purpose).
- No dependencies in the app (dev dependencies only under `test/playwright/`), no inline scripts (CSP), no native select/date/time popups (`public/ui.js`), colours/spacing only via `public/tokens.css`.
- Every element a test needs gets a `data-testid`; selectors and DOM measurement live only in `test/playwright/page-objects/`.
- Fixing a bug = the test + its mutant in `test/playwright/tools/mutate.mjs` + a row in the pitfalls table of `dayline-dev`.
- `public/*` is served from disk per request (reload the tab — a stale tab once hid a finished feature); changes to `server.js` / `lib/` need a restart.

## Product decisions already made (do not undo)

- New tasks default to start = due = today (dates written in the text win); both dates empty → Inbox. A routine is a checkbox in the same dialog; its repeat rule lives in the template (`🔁 every day|weekday|week on …|month on the … [until YYYY-MM-DD]`).
- Routine ✕ = a real delete (today's line + the template definition; past notes untouched); there is no "skip today", and no text may promise it "comes back". Task ✕ = cancel (`[-]`, undo toast). Destructive actions use a red filled button + a confirm dialog.
- Times: `14:00` · `12:00-12:15` · `〜12:00` (end only = a deadline; tasks and routines alike; a routine may also have no time). Day line spans 07–22 h; an end-only pill occupies the hour before its deadline with the right edge on the deadline, long titles end in `…`.
- `⌘/Ctrl+K` focuses the quick box; twice within 0.5 s opens the full add dialog.
- Task row: checkbox vertically centred on the title block, memo (≤ 3 lines) and chips on row 2, strike-through drawn left to right (560 ms). State classes use the `is-` prefix (never reuse a component class such as `.pop`). Rendering never replaces an element while a pointer is held (`paint()` in `public/app.js`).
- "Upcoming" date cell: `내일`/`모레` + `MM/DD` (no weekday); 3 or more days ahead: `MM/DD` only.
- Dark = black + purple, light = white + amber-orange; the accent only means now · done · primary action · focus.

## Layout

`server.js` (http + SSE + watcher) · `lib/vault.js` (parsing, line-safe writes, rules, state) · `public/` (vanilla ES modules: `app.js`, `dialogs.js`, `ui.js`, `i18n.js`, `theme.js`, CSS, `design.html`) · `scripts/` (`dl.mjs`, `service.mjs`) · `test/*.test.js` (unit) · `test/playwright/` (browser suite, page objects, tools) · `.claude/skills/`.
