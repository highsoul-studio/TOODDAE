# Feature inventory

This inventory describes the included source. API presence, a runtime AI tool, and a developer skill are separate capabilities. Core storage remains Markdown; generated runtime state and credentials are not part of the repository.

| Feature | UI/API and implementation | Runtime AI coverage |
| --- | --- | --- |
| New tasks, dates, times, priority, memo | Do; `/api/add`, `/api/save`; `lib/vault.js` | `add_task`; explicit today/inbox/dated destination |
| Routine creation, recurrence, end date | Do; `/api/save`; daily note and template | `add_routine`; no implicit recurrence guess |
| Task text/date/priority/memo/section editing | Do; `/api/edit`, `/api/save` | `edit_task`, run-scoped target id |
| Routine text/repeat/memo/section editing | Do; `/api/save` | `edit_routine`; today's occurrence/template, not past notes |
| Place an item in Today; postpone deadline | Do; `/api/today`, `/api/reschedule` | `move_task`; physical placement in a daily section is explicit |
| Task/routine conversion | Do; `/api/save` | Plan-only; no runtime conversion tool |
| Complete/reopen and recurring-task next occurrence | Do; `/api/toggle` | UI-only; no toggle tool |
| Cancel task, delete routine | Do; `/api/cancel`, `/api/delete-routine` | UI-only; no destructive tools |
| Undo Today/postpone | Do; `/api/undo-row` | UI-only; server-issued action token |
| Add/rename/delete section | Do; `/api/section` | `add_section` only; rename/delete remain UI-only |
| Reorder task/routine sections | Do; `/api/section/reorder` | `reorder_sections`; complete permutation and paired file hashes |
| Today, Upcoming, Inbox, section lookup | `/api/state` | Initial bounded context plus `find_items` |
| Day line, progress, early completion, 84-day history, streak | `/api/state`; `counts` and `progress` have distinct meanings | Read-only state, no statistic mutation tool |
| Multiple notes on one date | Write; `/api/write/create`, `/api/write/note` | Direct UI; not exposed to Do tools |
| Note title/body editing and autosave | `/api/write/save` with base hash | Direct UI; Organize only proposes text |
| Full-source note search and pagination | `/api/write/notes` | Direct UI; no automatic transfer of other notes |
| Note deletion, history, restore and Undo | `/api/write/delete`, `/api/write/history`, `/api/write/restore` | Direct UI, guarded by note identity/base |
| AI organization, translation instructions, comparison tables | `/api/write/organize`; `lib/ai.js` playbooks | One text-generation request; selected-note proposal, Apply required |
| Markdown preview, editor shortcuts, save/read mode | `public/write.js`, `public/markdown.js` | Presentation/editing controls, not tools |
| Notification bell, browser permission and reminders | `public/app.js` bell/checkReminders; localStorage preference and sessionStorage sent keys | Browser/UI-only; no AI permission/toggle/delivery tool |
| Language, appearance, automatic theme timing | Browser language and `/api/settings` | Direct UI, not AI tools |
| Provider/model/effort and model catalogs | `/api/settings`, `/api/ai/models` | Direct settings; catalog metadata does not include notes |
| Consent and connection Test readiness | `/api/settings`, `/api/ai/test` | Preconditions for AI; explicit Test required again after restart; AI cannot grant its own consent |
| API keys, subscription login/accounts/disconnect | `/api/ai/key`, `/api/auth/*` | Never exposed as runtime tools |
| Folder picker/connect/reveal and stale-root handling | `/api/folder/*`, `/api/runtime/reveal`, `/api/status`, SSE | Never exposed as runtime tools |
| Local launcher/restart/service scripts | Launcher scripts and `/api/restart` | Never exposed as runtime tools |
| Drag/drop, search focus, keyboard/IME/busy states, toast, themes, responsive layout | Frontend modules | Interaction behavior, not AI tools |

## Storage and consistency

Tasks use daily files, the routine template and Inbox. Notes use `Write/YYYY-MM-DD.md` for legacy identities or `Write/YYYY-MM-DD--<UUID>.md` for additional notes; no migration is required. Private connection credentials and remembered consent stay outside the notes folder. Settings and note/task history retain their existing locations.

Same-origin JSON, immutable root identity, READONLY and optimistic file/ref/hash guards apply to new routes and AI dispatch. Two-file operations can produce a truthful partial result after a filesystem conflict; no unsafe rollback or all-or-nothing claim is made.

Future deadlines do not inflate today's main progress. Explicit early completion is separate; an empty eligible day is not a free streak day. Routine totals use the occurrence date. UI row counts remain independent from deadline-based progress.

See [AI tools and skills](AI-TOOLS-AND-SKILLS.md) for the executable allowlist, runtime playbooks, limits and verification boundaries.

## Notification and top-level-control audit

The bell requests browser Notification permission only through the user's direct action. Unsupported/denied states are explained in the UI. When enabled and the app tab remains open, a 20-second check sends a start-time reminder within the next 10 minutes (including now), or an end-only due-time reminder for entries such as `〜12:00`. Completed items, elapsed/out-of-window times, previously notified date/item/time keys and continuations already started on a previous day are excluded. The date-aware timeline determines which day's timed occurrences are candidates. Session deduplication is not background push delivery; a closed tab does not run reminders.

Existing browser coverage is in `Dayline/test/playwright/tests/end-time.spec.js` (start/due wording and timing window), with timeline/day segmentation covered by vault and browser timeline cases. Permission denial, unsupported browser and cross-session delivery must not be inferred from mock permission-granted timing cases alone. Real OS/browser delivery is not established by unit tests.

Other top-level controls are accounted for by the rows above: Do/Write/Set navigation; quick-add and keyboard focus; panel presentation; search/load-more; notes editor save/read/format shortcuts; theme/language and optional custom pointer/tooltips; AI dialogs and settings; sync/folder status; brand navigation and version footer; and toast/Undo affordances. They remain direct interaction controls, not implicit new AI tools.
