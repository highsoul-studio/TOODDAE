# Playwright rules for Dayline

Source of the conventions: the team's E2E suite (its README, `playwright.config.ts` and ESLint config) and the team's E2E-test-creator guidance. This file states each rule, why it exists, and how Dayline applies it. Where Dayline deviates, the deviation is listed at the end.

## 1. Layout and layers

```
test/playwright/
  playwright.config.js     projects, timeouts, reporters, evidence settings
  fixtures.js              infrastructure fixtures: server, vault, page (console guard), dayline
  page-objects/            UI only: locators + user actions + in-page probes   (dayline.page.js)
  helpers/                 data/business plumbing: Vault (temp vault, fixtures, file reads), pixels
  tests/*.spec.js          one file per perspective area; no selectors, no fs code
  lint.mjs                 self-check of these rules (npm run e2e:lint)
```

- **Page objects = UI only** (what a user sees and does). **Helpers = data and flow** (what the vault looks like). Never put a selector in a helper or a file write in a page object.
- A spec reads like the user's story: `await dayline.openEditDialog('…'); await dayline.memoField.fill('…'); await dayline.saveDialog(); await expect(dayline.taskMemo('…')).toBeVisible();`
- Reuse before adding: look for an existing page-object method / vault helper first. New UI element → new `data-testid` in the app, new locator in the page object.

## 2. Selectors

Priority (most stable first): `data-testid` → role → visible text → class → id.

- The app exposes `data-testid` on everything a test asserts or clicks (`grep -rn "data-testid" public/`). Names are kebab-case, `<thing>` or `<thing>-<part>`: `task`, `task-check`, `task-title`, `task-memo`, `panel-tasks|routine|side|hero`, `item-dialog`, `confirm-dialog`, `field-<slot>` (`text memo ts te start due prio repeat days dom until section routine`), `dialog-submit|danger|close`, `popover`, `select-button`, `cal-day`, `toast`, `toast-undo`, `sync-pill`, `theme-toggle`, `lang-button`, `quick-input`, `day-pill`, `section*`, `upcoming-date`, …
- Accessibility is part of the contract: prefer `getByRole('dialog', { name })`, `toHaveAccessibleName`. A control you cannot reach by role/name is also an accessibility bug.
- Class selectors are allowed only inside the page object, for probes that measure a visual (`.strike`, `.sync__dot`). Never in specs.
- When you add UI, add the `data-testid` in the same change.

## 3. Waiting

- **Never** `waitForTimeout`, fixed `sleep`, or `networkidle`. Wait for the condition the user would wait for: `await expect(locator).toBeVisible()`, `toHaveText`, `toHaveClass`, `toHaveCount`.
- Non-DOM conditions (a file on disk, a computed value that changes): `await expect.poll(() => vault.note()).toContain('…')`.
- The only timers live in `fixtures.js` and are condition-driven: server readiness polling and `settleWatcher` (waits for the SSE echo of our own file writes, then a short quiet period). Tests never call it: `Vault.write()` sets `dirty`, and `vault.settle()` (run by the `vault` fixture and at the start of `dayline.open()`) does the waiting only when something was written.
- `document.fonts.ready` + one `requestAnimationFrame` in `dayline.open()`: fonts and layout must be settled before any geometry is measured.
- Auto-waiting actions already check visible/enabled/stable; do not add `{ force: true }`.

## 4. Measuring geometry and style (the rule learned on 2026-10-06)

The app rebuilds the whole DOM on every state load, and our own writes come back through SSE and trigger another load ~100–300 ms later. A test that does `locator.evaluate(…)` right after a save can resolve a row that is detached by the time the function runs; a detached element reports all-zero rects, so `a.top - b.top` is `0` — a flaky, vacuous result (40 % failure rate on Firefox before the fix).

- Find **and** measure inside one `page.evaluate` (see `dayline.checkOffset(title)`, `dayline.dayPillBoxes(titles)`); throw if the element is missing or has no layout (`offsetHeight === 0`) so a degenerate measurement can never pass. Playwright's own `boundingBox()` is two-step too (it returned `null` once on a pill that the echo re-render had just replaced) — use it only where nothing can re-render.
- Assert the "before" value is sane (`> 0`) so `before === after` cannot be satisfied by two zeros.
- For "stays the same" assertions use `expect.poll(() => measure()).toBe(before)`.
- Animations: sample inside the page (`requestAnimationFrame` / `setInterval` in `page.evaluate`) — `dayline.sampleFrames`, `dayline.sampleStrike`.

## 4b. Reproducing races deterministically

Never "click fast and hope". Widen the window with fault injection and synchronise on events:

- `dayline.delayStateResponses(500, 1500)` delays the response of `GET /api/state` (1st fetch 500 ms, later ones 1500 ms) while keeping its content as of the request time → the snapshot arrives stale. Undo with `dayline.stopDelayingState()` at the end.
- Start the second action on an event, not on a timer: `const echo = page.waitForRequest(...)` → first action → `await echo` → second action.
- To prove "an action survives a re-render", hold the gesture open: `dayline.pressDown(locator)` → write the vault (`vault.editNote`) → wait for the state response (`waitForResponse`) and `dayline.nextFrames()` → `dayline.release()` → assert the action happened. A normal `click()` is too fast to straddle a re-render, which is why this bug hid behind green tests.
- Observe the in-between states inside the page (`dayline.sampleChecked`, `sampleFrames`, `sampleStrike`), then assert on the sampled array.
- Several defences may overlap (the stale-snapshot protection is four-fold: `seq`, the `writes` epoch, two `inflight` guards). Removing one is invisible by design; prove the test by removing all of them (`stale-snapshot-unguarded` in `tools/mutate.mjs`).

## 5. Data

- **ID-independent**: rows are found by their visible text (`dayline.task('メモ付きのタスク')`), never by line number or `data-id`.
- **Independent tests**: the `vault` fixture resets a disposable temp vault before every test (fixed fixture set in `helpers/vault.js`, dates relative to today). No test depends on another, on order, or on leftovers.
- **Fake data only**; never point a test at the real vault. `Vault` refuses a root outside the OS temp dir and the owner's real vault. (The team's `E2E-` prefix + cleanup project exists because their data lives in a shared environment; here the whole vault is disposable, so cleanup = delete the temp dir.)
- Files are checked as bytes, not only DOM: after a UI action read the markdown (`vault.note()`, `vault.template()`) and assert exact lines. Unchanged data must be byte-identical (edit round-trips).
- Custom servers (read-only mode, a stopped server) come from fixtures (`readonlyServer`, `spawnServer`) — never hand-start a server in a spec.

## 6. Test design: 観点 / パターン

- `test.describe('観点: <what quality is being checked>')` — the perspective.
- `test('パターン: <one concrete variation, stated as the expected behaviour>')` — the pattern. One reason to fail per test.
- Cover, per feature: normal / boundary / error / state-change. For visuals: steady state **and** the frames right after the action. For text: all four languages where wording matters. For layout: desktop and 375 px.
- A bug found in production gets a pattern named after the symptom, and the cause goes into `dayline-dev`'s pitfall table.
- Data-driven loops (`for (const … of PATTERNS)` generating tests) are fine; conditionals (`if`) inside a test body are not — split into two tests.

## 7. Console and error guard

The `page` fixture records `pageerror` and `console.error` for every test and fails the test at teardown if any occurred. Expected errors (e.g. a stopped server) are declared per test with the `allowedConsoleErrors` option; never blanket-ignore. One engine-specific noise is filtered centrally: Firefox's "The connection to …/api/events was interrupted while the page was loading".

## 8. Config (mirrors the team's `playwright.config.ts`)

| setting | value | note |
|---|---|---|
| `timeout` | 30 s | `expect` timeout 5 s |
| `fullyParallel` | true | each worker owns a server + temp vault (worker-scoped fixture) |
| `forbidOnly` | `!!CI` | |
| `retries` / `workers` | `CI ? 2 : 0` / `CI ? 1 : auto` | locally a retry would hide flakes — keep 0 |
| `reporter` | list + html (`open: never`) | team: html |
| `use.screenshot` | `only-on-failure` | |
| `use.trace` | `on-first-retry` | |
| `use.video` | `retain-on-failure` | team: `on` (too heavy for 600+ runs) |
| viewport | 1280 × 800 desktop | mobile projects use device descriptors |
| projects | `chromium`, `firefox`, `webkit`, `mobile-safari` (iPhone 13), `mobile-chrome` (Pixel 7) | mobile projects run only `mobile.spec.js` |

## 9. Lint (the team's eslint-plugin-playwright set, without ESLint)

`npm run e2e:lint` (`test/playwright/lint.mjs`) fails on: `waitForTimeout`, `networkidle`, `page.pause`, `test.only`, titled `test.skip` / `fixme` (a conditional `test.skip(cond, reason)` for an environment is allowed), `{ force: true }` on locators, `if` / `switch` inside spec files, `setTimeout` in specs, CSS selectors / DOM measurement in specs (`.locator(`, `querySelector`, `getComputedStyle`, `getBoundingClientRect`, `evaluateAll` — they belong in the page object), `expect` without `await` on web-first matchers, and fixtures a test receives but never uses. Mapping to the team's rules: `no-wait-for-timeout`, `no-networkidle`, `no-page-pause`, `no-focused-test` (forbidOnly), `no-skipped-test`, `no-force-option`, `no-conditional-in-test`, `valid-expect`, `no-unused-vars`. The check itself was verified with a deliberately bad spec (every rule fired).

## 10. Engine notes

- **WebKit** (Safari engine): no Tab focus on buttons by default → `dayline.tab()` uses Alt+Tab there; Desktop Safari DPR is 2 (pixel probes scale by `devicePixelRatio`).
- **Firefox**: SSE navigation noise (see §7); slower first paint — never shorten timeouts to hide it.
- **Mobile** profiles: touch (`tap`), no hover → action buttons must be visible without hover (a tested pattern).
- Playwright's WebKit is a WebKit build, not Safari itself; say so when reporting.

## 11. Deviations from the team's setup (intentional)

| team | Dayline | why |
|---|---|---|
| TypeScript, ESLint, pnpm | JavaScript, `lint.mjs`, npm | no build step; the app is zero-dependency, test deps stay in `test/playwright/` |
| `data-setup` / `cleanup` projects, `.test-data.json`, `E2E-` prefix | per-test disposable vault via fixtures | nothing shared, nothing to clean |
| auth `globalSetup` + `storageState` | none | local app has no login |
| `video: 'on'` | `retain-on-failure` | volume |
| single browser (chromium) | three engines + mobile | the owner uses Safari-family browsers too |
