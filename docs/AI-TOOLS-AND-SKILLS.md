# AI tools and skills

## Three distinct layers

1. **Runtime Do tools:** `lib/assistant.js` owns `ASSISTANT_TOOLS`, argument validation and finite dispatch to the existing vault primitives. The server supplies the active root and validated connection; the model cannot choose either.
2. **Runtime playbooks:** `DO_PLAYBOOKS` provides placement, lookup, routine and execution guidance. Write's `SYSTEM_PROMPTS` provides twenty situation-specific playbooks, including the original common/engineering/numeric/meeting/action/learning/journal/ideas/mixed guidance and eleven additional contexts. The complete inventory and synthetic fixtures are documented in `ORGANIZE-SCENARIOS-20.md`. These constants are sent in the existing request. There is no skill loader, extra classification request, SDK or agent framework.
3. **Developer skills:** `.claude/skills/dayline-dev`, `dayline-verify` and `dayline-vault` guide a coding agent's implementation, tests and authorized data operations. They are not automatically loaded by the application or sent to a provider. Updating their prose does not expose a runtime tool.

## Executable Do allowlist

| Tool | Contract |
| --- | --- |
| `add_task` | Explicit `destination: today/inbox/dated`. With today and no date values, the tool boundary fills scheduled and due with today. Inbox requires blank dates and section. Dated requires at least one date. The shared manual `V.add` blank-date contract remains Inbox. |
| `add_routine` | Nonempty explicit repeat rule or once; blank additions are rejected. Monthly days must be 1–31 or last. Section belongs to the routine panel. Existing routine protection remains add-only. |
| `edit_task` | Target must be an issued open-task id. Empty fields keep values; clear removes supported date/priority/section/memo fields. Moving an Inbox row to a daily section uses `move_task` first. |
| `edit_routine` | Target must be an issued routine id. Updates today's occurrence and template as appropriate; never rewrites past days. |
| `move_task` | Today updates the schedule and places the whole task/memo/nested block in today's task section. Postpone uses the existing deadline-extension primitive, not a hidden start-date change. |
| `add_section` | Explicit tasks/routine panel. Already present is a no-op and does not abort later valid calls. |
| `reorder_sections` | Complete unique order for one panel, up to 40 names. Uses canonical raw-block ordering and paired daily/template hashes. |
| `find_items` | Literal query plus optional panel/section/date filters, maximum 20 open items per call. Returns opaque run-scoped ids and explicit truncation metadata, not file contents or Write notes. |

The initial context is capped at 60 items and marks `itemsTruncated`; item text is capped at 500 characters and marks `textTruncated`. Lookup narrows the query rather than growing an unlimited initial snapshot. Internal ref registration is capped at 240 per run. Ambiguous raw matches are not registered for later edits. A routine created only in the future template may have no editable current-occurrence id; the receipt reports its later status instead of inventing a current item.

The runtime keeps explicit `every day` distinct from the empty edit/keep sentinel. The shared Markdown serializer still omits the token for an unbounded daily rule. Semantic repeat validation is shared with the vault and runs for the whole batch before any write.

All fields are required by the tool schemas for provider compatibility. Blank strings mean the documented empty/keep value, not an implicit permission or destination. The server validates the entire batch's schema, dates, recurrence and add-time semantics before the first write. Ref and filesystem checks remain at execution time, so later conflicts can still yield partial changes.

## Dates, destinations and execution receipts

The server captures `today` and `timezone` together from the host date context. It does not change the OS timezone. Relative dates use that explicit context; Asia/Tokyo midnight and year rollover have synthetic coverage. A task section and a routine section with the same name are distinct.

`POST /api/assistant/run` still accepts `{message, requestId}`. Successful mutations return receipts in `results`, with `tool`, `action`, `changed:true`, optional `itemId`/`destination`, and the existing `created` payload retained for compatibility. Despite that legacy field name, action distinguishes created, updated, moved and reordered. Read/no-op results are sent back to the model but do not inflate the UI mutation count; no-ops have a separate count. Ordinary no-ops use action `unchanged`. A different call id deduplicated against an earlier addition gets action `deduplicated`, changed false and the original item id; a replay of the same logical call id returns its original receipt. A resolved no-op-only run completes with zero mutations and a noops count, while unresolved lookup ambiguity still needs input. The frontend must treat receipts, not the model's prose, as authoritative.

Successfully resolved creation receipts register a run-scoped reference for later edits. Stale raw refs, changed root/configuration/credential/Test proof and ambiguous targets fail closed. Add identity uses the normalized values actually written, so today with blank dates and dated with the same explicit dates are equivalent. Exactly identical canonical additions collapse to one write within the same run even if the model changes the call id or argument property order. This deliberately collapses a request for two completely identical items in one run; request distinct text or use separate explicit runs when separate copies are intended. This is not vault-wide deduplication.

The existing limits remain three provider rounds, eight calls, 90 seconds and bounded request/response bytes. Request UUID idempotency is process-local, capped at 200 entries and fails closed at capacity rather than evicting protection. It is not an exactly-once guarantee across process restarts. Mixed outcomes return the mutations already applied plus the failure. Two-file movement/order failures may leave a duplicate or one file updated; known changed paths are reported and original data is not force-deleted or blindly rolled back.

No tools expose completion/cancellation/deletion, task/routine conversion, raw Undo, arbitrary files/commands, settings, credentials, auth, folder switching or runtime control. Browser notification permission, bell toggling and date-aware ten-minute reminders also remain direct browser/UI behavior, not runtime tools. These remain direct UI actions or future design work with their own authorization and verification requirements.

## Readiness after restart

Connection-Test proof is intentionally process-local. Restarting the server preserves stored keys and eligible remembered consent, but resets both `aiReady` and `assistantReady` to false until the user explicitly runs Test again. The app does not persist proof or automatically perform an inference request to recreate it. S does not change that authentication/consent policy.

## Write proposal and Apply

Organize uses one existing provider request and no runtime mutation tools. The request includes the selected `noteId`/date, saved `base`, optional matching `text`, and separate bounded `additionalInstructions`. The server reads the selected note, checks base/text before inference and checks base again afterward. The response carries the same identity/base. Stale responses do not authorize overwriting newer text.

Playbooks preserve facts, uncertainty, code/commands/paths, numbers/units and original task lines. Explicit language/title instructions override default presentation language without overriding integrity rules. Comparison tables must use source values rather than invented calculations. Other notes are not automatically read or sent.

The UI presents the proposal and original. A `truncated` warning blocks Apply; `shorter` is an explicit information-loss warning. No response auto-saves. Apply still uses optimistic save with `snapshot: organize`, preserving the prior selected note in its existing history; Undo uses guarded restore. No separate audit database or secret-bearing prompt log is introduced.

## Verification boundaries

Tests use temporary folders, synthetic credentials and mocked provider protocols. They cover placement, same-name panel routing, lookup limits, batch validation, repeated-call deduplication, no-op counts, created-id edits, raw-ref conflicts, move/reorder concurrency and partial failures, root/config changes, and selected-note optimistic guards. All four API-key adapters advertise the expanded schemas and receive real local tool receipts in mock continuations, including edit tools. Subscription adapters retain their existing guarded protocol boundary.

These checks do not establish real-provider tool quality, model/account availability, subscription eligibility or actual inference results. Prompt tests establish construction and control flow, not measured improvements to prose quality. Final test totals and review status belong in the release verification receipt rather than being inferred from this design document.
