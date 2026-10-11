# Implementation status

This source snapshot contains the local TOODDAE application. The application directory remains named `Dayline/` for compatibility. Node.js 20 or later is required; there are no runtime npm dependencies. Run `node scripts/start-demo.mjs` from the repository root, then open `http://127.0.0.1:44318`.

## Available workflows

- **Do:** Tasks, recurring routines, sections, inbox and upcoming work, timed items on the Day line, completion history, and an 84-day activity view. Existing Markdown files remain the data source.
- **Write:** Daily Markdown editing, autosave, title editing, rendered previews including tables, private recovery snapshots, conflict detection, and reversible note deletion. Undo checks the current file state before restoring archived content.
- **Set:** Korean, Japanese, English and Chinese interfaces; appearance settings; provider, model and effort selection; connection testing; and explicit AI consent.
- **Local folders:** A fresh default folder and welcome note, a macOS folder picker, remembered folder selection, and opening the current folder in Finder. Root identity guards prevent stale browser operations or Undo actions from crossing into another connected folder. Folder classification is a hint, not proof of cloud synchronization.
- **Local launch:** An optional macOS `.app` launcher starts or reuses the matching background server and opens the browser. It uses the installed Node.js and recorded source paths; it does not bundle Node.js or install a login service.

## AI behavior and boundaries

API-key adapters support OpenAI, Anthropic, Gemini and DeepSeek. Settings include provider-specific effort controls and model catalogs. Automatic catalog requests use supported official endpoints and saved credentials; a custom endpoint requires explicit refresh and consent. Catalog retrieval does not send notes.

AI actions require a configured connection, effective consent, and a successful Test for the current model/effort/credential configuration. Consent is remembered privately per folder and connection. A changed endpoint, key, account or authentication mode cannot inherit another connection's approval. Browser consent actions carry a server-issued token so stale approvals cannot authorize a newer credential. Model or effort changes invalidate Test readiness while retaining consent for the same destination.

**Write Organize** sends the selected note only after explicit submission. One request includes guidance for engineering, numeric comparisons, meetings, actions, learning, journals and ideas. Optional additional instructions can request an output language or title rewording; factual, numeric and code integrity rules remain. The result is a proposal and is saved only when Apply is chosen. Prompt and protocol tests establish construction and control flow, not measured model-output quality.

**Do AI** has eight bounded tools for task/routine/section creation, task/routine editing, item lookup, task movement and section ordering. It has no arbitrary shell, file, delete, credential or runtime-management tools. Arguments, active permissions, targets and file versions are validated before mutation; receipts distinguish real changes, duplicates, no-ops and partial failures. See [AI tools and skills](AI-TOOLS-AND-SKILLS.md) for the executable contracts and limits.

Optional ChatGPT sign-in and Claude Code subscription adapters are included. Their availability depends on supported account and local-runtime conditions. Authentication, credential refresh, callback validation, tool protocols and failure paths were tested with synthetic credentials and mocked providers. This does not establish eligibility or successful operation with a real subscription account. API keys and subscription credentials stay in the private machine settings area outside the notes folder.

## Verification snapshot

| Check | Recorded result | Scope |
| --- | --- | --- |
| Unit and local HTTP suite | **169/169 passed** | Synthetic folders and credentials; includes consent races, restart behavior, note conflict/Undo, and mocked AI/auth integration |
| Full browser run | **447/448 passed** | Chromium desktop and mobile viewport emulation; one Unicode case required follow-up |
| Unicode follow-up | **20/20 passed** | Focused recheck after the Unicode correction; not a second complete 448-case run |
| Fresh repository launch | Passed | Default folder and welcome note created on an isolated port; new logo served; no runtime npm installation |
| Do AI and authentication | Focused checks passed | Mock provider protocols and actual additions to temporary test folders; no live provider or login claim |

Run the unit/HTTP suite from source:

```bash
cd Dayline
npm test
```

Browser checks use the separate Playwright test workspace and require its development dependencies and browser installation. These are not needed to run the application.

### Latest follow-up verification

- Deletion notices and Undo use the common bottom toast instead of occupying the note body. Each Undo retains its own receipt. Failed restores remain retryable without blocking another note; conflict Reload recovers after a handled request failure. Six targeted deletion/Undo checks passed, followed by an independent review of the failure/retry boundaries.
- AI request inputs have a fixed responsive height, internal scrolling and no manual resize handle. Assistant and consent dialogs remain inside desktop, mobile and short viewports; narrow English buttons stack. The layout/no-resize checks passed twice, including all four consent languages at 320px.
- The header and favicon use the supplied TD-check logo's two paths and 512 viewBox. Current-color rendering and the two-phase theme fade remain. Four targeted logo/theme checks passed.

These are targeted follow-up results, not a claim that the complete 448-case browser suite was rerun after every later UI refinement. Test credentials and app data were synthetic. No real subscription login or paid model inference was performed during validation.

## Platform and mobile limits

macOS is the primary development environment. The browser results above use Chromium and mobile viewport emulation; physical phones, other browser engines, native Windows/Linux installation, native Windows drive detection and live provider behavior have not been verified. Windows drive classification has mock coverage; a drive letter alone is not treated as evidence of cloud storage.

A locally mounted synchronized folder can be selected on the computer that runs TOODDAE. This does not make the app available on a phone or implement a Google Drive API backend. The shipped server uses loopback access.

For future mobile access, a privately reachable host running the app and a separate Drive API storage integration are distinct approaches. Private hosting needs an explicit authenticated access design; direct Drive access needs OAuth, synchronization and conflict handling. Neither is deployed or enabled by this source snapshot. Sharing a notes folder through Drive alone does not supply the mobile app runtime.

The repository excludes personal runtime folders, notes, keys, account credentials, generated app bundles, private test evidence and screenshots. Packaged release availability is independent of runnable source availability. See the existing [license](../LICENSE) for distribution terms.

## Write/Do feedback checkpoint (2026-10-07)

Write has an explicit Save action, safe basic Markdown syntax, editor-scoped formatting shortcuts, a dashed new-note card, independent same-day note identities and paginated title/body/date search. Existing date-only notes and their recovery history remain readable without migration.

Do has section-order mode with task rows hidden, drag handles and keyboard/touch buttons. Ordering moves original section blocks in today's file and template with version checks and truthful partial-conflict reporting. Progress, history and streak share deadline eligibility; future deadlines are excluded and actual early completions are separate. Active today's deadlines, overdue work, no-deadline Today work and daily routines count toward the target. Section bars animate in both directions.

The checkpoint passed 186 unit/HTTP tests, two independent backend reviews with 91 scoped passes each, 16 focused UI checks, final race/shortcut repetitions, and independent frontend closure. Four backend guard mutations were detected.

The Lead's repeated Chromium desktop/mobile run executed 486 cases: 484 passed and two repetitions of one obsolete delayed-save test failed. That test waited for Read mode before releasing its gated Save request. A test-only correction now checks that the editor remains visible, Save is disabled and Delete is hidden before releasing Save, then verifies one confirmation and deletion for a double click. The corrected case passed 20/20 repetitions; this is a focused closure, not a second full-suite run.

The reviewed production files were applied to the existing local runtime. The restart retained the app, private runtime home and selected notes folder; root identity rotated as designed. A post-cutover read-only browser pilot at 1280px and 390px covered Do/Write/Set, blocked browser writes and external requests, and confirmed 14 Markdown file hashes unchanged during the pilot. This is not a claim of full CommonMark conformance, native IME, physical touch, other browser engines or live provider validation.

See [Settings review](SETTINGS-REVIEW.md) for the requested settings assessment.

## AI and UI audit source checkpoint (2026-10-07)

The complete [feature inventory](FEATURE-INVENTORY.md) maps UI/API/storage operations to runtime tool coverage or deliberate UI-only handling. Runtime Do/Write playbooks and developer skills are documented separately; no additional runtime dependency or skill-loader framework was introduced.

Do placement now distinguishes Today, explicit Inbox and dated tasks. Lookup and created-item references support subsequent edits; same-name task/routine sections are distinct. Batch validation, normalized duplicate detection, truthful no-op receipts and guarded two-file movement/order are covered with synthetic data. Write Organize remains a selected-note proposal, checks saved identity/base before and after inference, displays shorter/truncated warnings, and binds all async stages and Apply/Undo to the current selection intent.

The source also includes shared soft focus shadows, semantic gold AI actions, palette labels, custom tooltips, guarded language reload, Cmd/Ctrl+Enter hints/actions, responsive memo/footer layout, Day-line animation/alignment, an opt-in dot/ring/caret cursor and minute-aligned automatic theme checks. Native cursor/focus fallbacks remain for the relevant system accessibility conditions.

Recorded validation includes final sequential unit/HTTP **199/199 PASS**, independent Sol source closure, backend mutation proof, frontend boundary repetitions and the repaired Round 1 full Chromium desktop/mobile run **524/524 PASS**. The final source's complete browser repetition is a separate pending Lead check; interrupted executions are not full passes. A Node 26 test-runner native assertion during earlier concurrent execution is retained separately from the successful sequential results.

This S checkpoint is local source on `codex/ai-tools-ui`; it has not replaced the active R runtime or been pushed to main. Required L4/R1 independent Astra review remains outstanding because the current agent tool rejected the reviewer connection with `agent thread limit reached`. Source/test preparation does not waive that review requirement. Actual paid inference, subscription eligibility, physical phones, native IME and other browser engines have not been verified.
