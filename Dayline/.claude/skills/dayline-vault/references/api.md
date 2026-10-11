# Current local API reference

Use the verified local endpoint. All vault reads and POSTs carry the immutable boot `X-TOODDAE-Root`; stale root responses require reload, not a new header applied to an old draft. POSTs require the exact same-origin Origin, JSON object body and writable mode. A 409 is a conflict, not permission to force a write.

| Endpoint | Contract / effect |
| --- | --- |
| GET `/api/status` | Rootless runtime identity and availability; no credential values |
| GET `/api/state` | Task/routine/upcoming/Inbox, sections, paired sectionOrder bases, timeline, visible counts, deadline progress, history/streak |
| POST `/api/add` | Task text/start/scheduled/due/priority/section/memo. Explicit blank dates retain the manual Inbox contract. |
| POST `/api/save` | Add/edit/convert using from/to/ref; conversion creates the new item before removing the old one |
| POST `/api/edit` | Task ref plus changed fields; omitted preserves, empty clears; raw-ref conflict guard |
| POST `/api/toggle` | Complete/reopen; repeating task may create the next occurrence |
| POST `/api/cancel` | Reversible task cancellation, not routine deletion |
| POST `/api/delete-routine` | Today's routine plus template definition; past notes preserved |
| POST `/api/today` | Change schedule to today; returns a server-issued row Undo token |
| POST `/api/reschedule` | Extend deadline to at least the supplied date and beyond existing relevant dates; does not silently change start |
| POST `/api/undo-row` | One-time token; restore exact guarded prior raw row |
| POST `/api/section` | panel tasks/routine; op add/rename/delete. Delete requires empty section; today's file and template are separate writes. |
| POST `/api/section/reorder` | panel, complete unique order, base `{daily,template}`. Raw whole blocks; 409 may include changedFiles. |
| GET `/api/write/notes` | q/limit/cursor; full-source search, nextCursor may follow an empty result page |
| POST `/api/write/create` | date and supported language; server-generated noteId, localized H1 |
| GET `/api/write/note` | noteId, optional matching date; date-only selects only the legacy file |
| POST `/api/write/save` | noteId/date, text, base, optional snapshot organize/restore |
| POST `/api/write/delete` | noteId/date and base; archive latest content and return guarded Undo identity/version/base |
| GET `/api/write/history` | Versions for exactly the selected noteId/date |
| POST `/api/write/restore` | noteId/date, history version id, current base |
| POST `/api/write/organize` | Selected identity, saved base, optional matching text, separate additionalInstructions; proposal only, response includes identity/base/warnings |
| POST `/api/assistant/run` | message and requestId; finite allowlist, exact mutation receipts, partial failures |

A ref is the server-observed file/line/raw identity, not a model-supplied arbitrary path. Models receive only run-scoped ids registered by the server. Task memo/nested lines must remain with their task. Routines use the existing text-based template identity; duplicate routine names are not independent template definitions.

Settings, connection Test, catalogs, credentials, auth/account operations, folder choice/connect/reveal and restart are separate direct-UI/admin routes. Their existence does not make them Do AI tools. Never copy secrets into notes, tool arguments, reports or logs. See `docs/FEATURE-INVENTORY.md` and `docs/AI-TOOLS-AND-SKILLS.md` at the repository root for the complete mapping and runtime boundaries.

Relative dates use the app's captured today/timezone context. Task display counts differ from deadline-based progress; future-deadline completion is separate earlyCompleted activity, not a free 100% day. Existing data and the current API implementation are authoritative over older examples.
