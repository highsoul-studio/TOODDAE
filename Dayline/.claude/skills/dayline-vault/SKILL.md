---
name: dayline-vault
description: "Operate on the user's personal task-manager data (Dayline app + its Obsidian vault, default ~/TASK-Manager): add / move / convert / edit / delete tasks, routines, sections and memos, set routine times and end dates, summarize today's state. Use for requests like 오늘 할 일로 옮겨줘, 루틴 만들어/수정/삭제/종료일, 섹션 추가, 메모 달아줘, 오늘 뭐 남았어, タスク・ルーティンを移して, or anything about the content of the task dashboard. Goes through the app's API with confirmation + backup; never hand-edits the markdown."
---

# Dayline vault operations

The connected app stores tasks and notes as Markdown in the active folder. Discover the actual endpoint, root identity and source path from the authorized workspace/runtime status; do not assume a default port, machine-specific path or login service. The user may edit files concurrently, so re-read relevant state before an authorized write. Runtime Do AI tools are a separate allowlist in `lib/assistant.js`; this developer skill does not grant those tools extra capabilities.

## Procedure for write requests

1. **Read the state** using `node scripts/dl.mjs state` against the verified endpoint. If unavailable, report that boundary; do not start or restart a service without authorization for that runtime.
2. **Interpret** using the vocabulary table below. Prefer what the user already built: e.g. empty sections they created under "오늘 할 일" are usually where a move should land.
3. **Check the authorized scope before writing the real folder.** Preserve explicit session authorization; clarify a genuinely ambiguous target or destructive change with concrete before → after details (items, panel/section, dates, template effect and backup). Do not add an extra confirmation merely because this skill was read. Pure reads need no confirmation. Runtime Run authorization covers only the requested supported operations, not unrelated changes.
4. **Back up**: `node scripts/dl.mjs backup <label>` → `<BACKUP_DIR>/<timestamp>-<label>/` (default `~/.dayline/backups/`, outside the project and the vault; holds today's note, the template and Inbox). Restoration is a separate reviewed operation: prefer the app's guarded Undo/history APIs. Never blindly copy a backup over concurrently edited live files.
5. **Rehearse multi-item changes on a copy** (recipe: `references/examples.md`): copy the vault to a temp dir, start a second server on another port against it, run the same script there, inspect, then delete the copy and the extra backup it made.
6. **Apply through the API** from a small node script (`import { api, state, items, refOf } from '<root>/scripts/dl.mjs'`; payloads in `references/api.md`). Re-read the state before each write: line numbers shift, the server locates by `raw`, and a 409 means the line changed under you → re-read, never force.
7. **Verify**: `dl.mjs state` again; `diff <backup>/<file> <vault>/<file>` must show only the planned changes. For how it looks, use `npm run verify:real` (read-only) from the `dayline-verify` skill.
8. **Report in the user's language**: what changed, the backup path and how to undo, and every assumption you made.

## Hard rules

- Never edit the markdown by hand and never write test data into the real vault (use a temp vault; see `dayline-verify`). The API takes care of file locks, stale-line checks, memo/nested lines and template sync.
- Past daily notes (`Daily/<earlier date>.md`) are history — leave them alone unless explicitly asked.
- Do not "clean up" the user's leftovers (stale `✅` on `[ ]` lines, cancelled `[-]` lines) unless asked.
- Server or UI code changes are not data operations → `dayline-dev`.

## Vocabulary → data

| the user says | it means |
|---|---|
| 오늘 할 일 / 今日のタスク | `## 今日のタスク` panel of today's note; `###` headings under it are sections |
| 루틴 / ルーティン | `## ルーティン` panel. Defined in `Templates/Daily.md` and copied into each new day's note on matching days. Edits apply from tomorrow's note on |
| 다가오는 일정 | open tasks whose start (⏳) is after today |
| 인박스 | `Inbox.md`: undated or future tasks |
| 메모 | indented lines directly under a task/routine line |
| 취소 (✕ on a task) | `[-]` + ❌ date; reversible, line stays in the file |
| 루틴 삭제 (✕ on a routine) | real delete of today's line **and** the template definition; past notes untouched. There is no "skip today" |
| 시작일 / 마감일 | ⏳ / 📅. New tasks default both to today. **A routine→task conversion must pass both, or the task lands in the Inbox** |
| 시간 11:00-12:00 | leading `11:00-12:00 ` in the text (puts the item on the Day line) |
| 마감 시각만 (12시까지) | leading `〜12:00 ` (end only; tasks and routines) |
| 이번주 금요일까지 (routine) | repeat with `until: 'YYYY-MM-DD'` (inclusive) — compute the date, never guess it |
| 이름/섹션 이동 | `/api/save` with `section` (tasks) — see api.md |

## More

- `references/api.md` — endpoints, payloads, semantics, gotchas
- `references/examples.md` — worked examples (move a routine group into tasks, set time + end date, rehearsal recipe)
- Data format and rules: `README.md`
