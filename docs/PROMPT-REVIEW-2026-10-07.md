# TOODDAE prompt structure review

> Historical nine-playbook review checkpoint. The later twenty-playbook candidate, activation, real-provider QA and subsequent GitHub publication authorization are documented in `ORGANIZE-SCENARIOS-20.md` and `ORGANIZE-APP-QA20-2026-10-08.md`. The earlier no-activation/no-upload boundaries below describe this earlier checkpoint, not the later owner's authorization.

## Scope and source

- Owner request: exclude Finder from the QA issues; review and improve runtime system prompts, especially general organization, numeric tables and context-specific handling.
- Baseline: published local `main` at `d1ead64289a3772d24e4536b8ae6ede15e532616`. The active application's `lib/ai.js` and `lib/assistant.js` matched that checkout byte-for-byte before this change.
- Candidate: local branch `aside/prompt-structure-20261007`, in a separate worktree. The unrelated, unreleased `codex/ai-tools-ui` repair was not modified or merged.
- Production changes are confined to system-prompt strings. Tool schemas, execution/validation logic, provider adapters, consent, credentials, request composition and token limits are unchanged.
- No GitHub push, active-source cutover, runtime restart, credentials change or real-provider evaluation is included in this change.

## QA issues, excluding Finder

### Dated-task save notice: UI issue, not a prompt issue

- A future-dated task was saved with its dates intact but the notice said it had been added to Inbox.
- Source: `Dayline/public/dialogs.js` chooses `toast.addedInbox` from `r.file === 'Inbox.md'`. Future-dated items can be stored physically in that file while appearing in Upcoming, so a physical storage filename is not a sufficient user-facing placement label.
- This notice has not been changed in the prompt-only candidate.

### Nested lists: renderer limitation, not a prompt issue

- Indented child bullets were displayed at the same level as their parent.
- Source: `Dayline/public/markdown.js` accepts leading whitespace in list-item regexes but retains only one current list, not an indentation stack.
- Direct reproduction: `- Parent\n  - Child` renders as `<ul><li>Parent</li><li>Child</li></ul>`.
- The renderer has not been changed. Clear ordinary bullets in AI output do not constitute a fix for nested-list support.

### AI organization: presentation weaknesses addressed in this candidate

- The observed synthetic note retained changed time, confirmed versus waiting attendees, budget versus spending, uncertainty, dependencies and sending restrictions.
- Weaknesses: a redundant parenthetical explaining duplication remained, and ordinary action deadlines were not ordered chronologically. Numeric information also had insufficiently broad table-selection guidance.
- These observations do not prove that prompt wording alone caused every model-output weakness. The old prompts already had useful fidelity and safety rules; the candidate makes presentation criteria more explicit without claiming measured semantic improvement.

### Automated failures: unresolved verification, not 14 confirmed product defects

- The earlier broad Chromium run recorded 440 passes and 14 failures, including timing, locator ambiguity, delayed-save/Undo and cross-tab draft scenarios.
- The subsequent isolated-browser recheck could not execute because the browser terminated during launch. The broad run is not reclassified as a full pass.
- This prompt-only change does not repair or close those UI/concurrency findings.

## Runtime system-message inventory

- Write: nine `SYSTEM_PROMPTS` modules in `Dayline/lib/ai.js`: common, coding, numeric, meeting, action, learning, journal, ideas and mixed.
- Do: the bounded five-tool assistant's `SYSTEM` string in `Dayline/lib/assistant.js`.
- Connection ping: the small `Reply with the single word: ok` instruction. It has one purpose and was left unchanged; it does not send note content.
- Provider adapters: transport the supplied system string. The Claude subscription adapter additionally supplies the bounded application tool schema; this bridge was inspected and left unchanged.
- Developer `.claude/skills` are not loaded as runtime system prompts.

## Prompt changes

### Common rules

- Replace paragraph-style instructions with named sections and focused bullets: goal/output, input/trust boundary, fidelity/protected text, language/title and general structure.
- Keep source-note text untrusted; keep explicit additional formatting/language instructions separate and subordinate to integrity rules.
- Treat the supplied date as context, not proof of an event date.
- Use topic headings and one idea per bullet for independent facts/actions; retain connected prose for explanations and journals. Make short/already-organized notes change little.
- Merge genuine repeated mentions without adding editorial duplication commentary. Do not merge distinct transactions, events, measurements or task occurrences just because values or wording match.
- Preserve code, task syntax/state/metadata, identifiers, links, uncertainty and meaningful qualifiers; do not invent facts or checkbox tasks.

### Numeric and action rules

- Actively prefer meaningful tables for budgets/costs, attendance/counts, prices/quotas and other related numeric records, not only comparisons or repeated measurements.
- Separate ceilings, actual/approved spending and estimates; separate confirmed and waiting/provisional attendees.
- Preserve units, periods, denominators, conditions, missing values and explicit zero. Do not calculate new totals, percentages or conversions.
- Keep ordinary structured actions readable in a table or concise bullets. Sort comparable explicit deadlines earliest first within a group unless a supplied order/dependency takes precedence.
- Do not invent dates for ambiguous/undated actions, promote proposals into commitments, or turn conditional future sending into immediate authorization.
- Keep existing checkbox task lines verbatim and outside tables.

### Other situations and Do

- Keep distinct engineering, meeting, learning, journal, ideas and mixed-note guidance. Apply only relevant guidance in the same single organization request; no classifier request or extra provider round trip was added.
- Reorganize Do instructions into authorization, trust boundary, dates/recurrence, target/section/deduplication and truthful-result sections.
- Clarify that an ambiguous add request must not become an unrequested edit; unmentioned fields remain unchanged; sections must be requested or explicitly named rather than invented from incidental text.
- Preserve the existing five-tool scope and date defaults. No backend permission or tool capability was expanded.

## Verification

- Final affected tests: 77/77 PASS with serial Node test execution across `test/ai.test.js`, `test/assistant.test.js`, `test/settings.test.js` and `test/backend-http.test.js`; 0 failures, cancellations or skips. This includes five newly added prompt-contract regressions.
- Syntax checks passed for both changed production modules and both changed test files; `git diff --check` passed.
- A disposable-copy baseline passed; removing the numeric table trigger, deadline-order rule or note trust-boundary rule caused the corresponding assertion to fail. All three mutants were detected; the candidate and active app were never mutated.
- Code outside the two system-prompt blocks is byte-identical to the active baseline. Candidate SHA256: `lib/ai.js` = `c592d07d45198055d81e000c96120cfacc6cadaa3a237cead1611710007f6487`; `lib/assistant.js` = `c901d7f8a1958ff782a001c246929a5d8c34b532096da88e9210265ed6e3e00b`.
- No formatter dependency/configuration was introduced; the project's zero-runtime-dependency and existing formatting setup remain unchanged.
- This review is authored by Aside, not an independent release review.
- Mock/unit tests check request contracts, safety guards and structured guidance. They do not establish actual provider adherence, factual completeness of every generated note or improved live model quality.
- The Write system message grows from 9,226 to 11,961 characters. This is added instruction coverage, not a measured token/billing result; organization still uses a single provider request.

## Remaining gates

- Keep the candidate separate from the active app until the scoped review and activation boundary is settled. Current user approval covers local prompt editing, not a new GitHub push or bundled deployment.
- A real-provider before/after quality check would need the new candidate to be active in an approved test environment and use only explicitly approved synthetic notes.
- Address nested-list rendering and the dated-placement notice as separate bounded UI changes; do not claim them fixed by prompt wording.
