# UI follow-up requests: dated-task notice and nested Markdown lists

Finder is explicitly excluded at the owner's request. These are separate UI changes, not fixes implemented by the prompt expansion.

## 1. Future-dated task gets an Inbox save notice

### Reproduction

1. Open Do and the full new-task dialog.
2. Enter a synthetic task; set start and due dates after today, preserving normal date validation.
3. Save. Confirm that the task appears in Upcoming with its intended dates.
4. Observe the notice: it says the item was added to Inbox even though the UI classifies it as a dated future item.

### Observed versus expected

- Observed during QA: the dates and placement are correct, but the notice says Inbox.
- Expected: an undated new item says Inbox; a Today item says Today or simply added; a future-dated item says Upcoming or includes its scheduled date. An ordinary edit says saved, not newly added.
- The notice must describe the effective user-facing action/placement, not the physical Markdown file that stores the item.

### Source-level cause and additional risk

- `Dayline/public/dialogs.js` uses `r.file === 'Inbox.md'` to select `toast.addedInbox`.
- `Inbox.md` can physically hold both undated Inbox items and future-dated Upcoming items, so file identity alone cannot determine the label.
- The current conditional also checks the file before the edit fallback. Source inspection suggests an existing Inbox item's ordinary edit can get an added-to-Inbox notice too; this specific variant still needs a UI reproduction.
- Preserve explicit move, conversion, routine-later and other action-specific notices rather than replacing them with an overly broad placement test.

### Acceptance and regression criteria

- Test new items with no dates, Today dates, future start dates and future due-only dates; follow the existing placement policy and date validation.
- Test ordinary editing of existing Today, Inbox and Upcoming items.
- Test explicit move/conversion/routine-later flows to preserve their specific notices.
- Assert the actual resulting item, dates, memo, priority and panel as well as the notice. Do not alter persistence rules or move the item merely to make the message true.
- Keep Japanese, Korean, English and Chinese message keys/placeholders aligned.
- Add a regression and a disposable-copy mutant that restores the filename-only decision. Do not write test items into owner notes without an approved test-folder plan.

## 2. Indented Markdown list items lose their hierarchy

### Reproduction

Create a synthetic Write note with:

```markdown
- Parent
  - Child
    - Grandchild
- Next parent
```

Read the note. Child and Grandchild are rendered as peers of Parent.

### Direct source reproduction

`renderMarkdown('- Parent\n  - Child')` returns:

```html
<ul><li>Parent</li><li>Child</li></ul>
```

Expected structural relationship:

```html
<ul><li>Parent<ul><li>Child</li></ul></li></ul>
```

### Source-level cause

- `Dayline/public/markdown.js` accepts arbitrary leading whitespace in list regexes, but its state retains only one current list.
- Indentation depth, parent list items and nested transitions are not represented, so whitespace is effectively ignored.
- This request is scoped to the Write renderer. Do not change task parsing or the saved Markdown to simulate indentation.

### Acceptance and regression criteria

- Render two and three levels; support common 2-space and 4-space child-list inputs consistently.
- A return to shallower indentation must close the appropriate lists and keep the next sibling at the right level.
- Cover unordered, ordered, mixed and checkbox lists, preserving their supplied numbering and checkbox state.
- Confirm that paragraphs, headings, tables and fenced code following a list have valid boundaries; code contents must not be parsed as lists.
- Preserve safe HTML escaping and dangerous-link rejection at every nesting level. Use existing design tokens for any necessary spacing change.
- Assert nested DOM/HTML parent-child structure, not just the presence of all text. Add a visual check and a source-preservation check.
- Retain the existing heading/link/inline-code/strike/table/escape regressions. This is not a request to claim full CommonMark conformance or add an unapproved runtime dependency.
- Add a disposable-copy mutant that flattens indentation again. Keep performance bounded for long/deep synthetic inputs.

## Scope boundary

- No UI source is changed by this request document.
- Prompt clarity can produce better ordinary bullets, but does not close either renderer or notice defect.
- Earlier broad-test failures remain separate unresolved verification; this document does not classify them all as confirmed product defects.


## Later active-UI observation during QA20

- Active `public/i18n.js`, `dialogs.js`, `markdown.js` and `write.js` became different from the prompt worktree baseline (active mtimes around 2026-10-07T16:03:13Z). This prompt task did not write or apply those UI files. The prompt `ai.js` hash remained unchanged.
- Active renderer source now tracks indentation with a list stack. In the current UI, the existing `[QA20-06]` note was reopened without another AI call: cache → example and invalidation → source are correctly nested. This verifies the two-level sample, not every ordered/mixed/checkbox/depth/security acceptance case above.
- Active task-dialog source now uses date-based `addedToastKey` rather than `r.file === 'Inbox.md'`. The source change is observed, but the complete live notice/edit/move/routine regression matrix has not been rerun in this prompt task. Do not mark full acceptance solely from source inspection.
- Current apply wording is `AI 제안 적용`. QA automation was adjusted to that actual accepted UI wording; the already-generated 16th response was not submitted again.
- Initial reproduction and source evidence above are historical observations, not a claim that the same defects remain in the current active files.
