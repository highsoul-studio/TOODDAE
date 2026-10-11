---
name: dayline-verify
description: "Check, with evidence, that the Dayline dashboard really works: run the Playwright suite (Chromium, Firefox, WebKit = Safari engine, plus mobile profiles) against a throw-away vault, reproduce a reported visual glitch frame by frame, prove a test can fail (mutation), and look at the real server read-only. Carries the team's Playwright rules (Page Object Model, data-testid > role > text, no fixed waits, ID-independent tests, 観点/パターン design). Use after any Dayline UI or server change, when the user reports something visual (잠깐 …가, ずれる, 애니메이션/정렬/깜빡임), when writing or reviewing a Dayline test, or when asked 'is it really fine? / 문제 없는 거 맞아?'."
---

# Verifying Dayline

Run everything from the project root `<root>` (the folder with `server.js`; `~/Dayline` on the owner's machine). The app itself has no dependencies; the test tooling lives in `test/playwright/` with its own `package.json`.

## Quick start

```bash
npm test                  # unit and local HTTP tests; record the actual count and duration
npm run e2e:install       # once per machine: @playwright/test + browsers (chromium, firefox, webkit)
npm run e2e               # configured desktop engines and mobile profiles; record actual availability and duration
npm run e2e -- --project=chromium -g "strike"     # a subset (any playwright flag works after --)
npm run e2e:lint          # the team's Playwright rules as a self-check
npm run e2e:report        # open the HTML report of the last run
npm run verify:real       # real server, real notes, read-only (see below)
```

Every worker starts its own server on a free port with a temp vault (`dl-pw-*` in the OS temp dir). The real vault and the server on 4317 are never touched; `test/playwright/helpers/vault.js` refuses any path outside the temp dir.

## "Is it really fine?" — what counts as evidence

Work down this list; never loosen a test to get green.

1. `npm test` — parsing, write rules, i18n key parity.
2. `npm run e2e -- --repeat-each=2` — flakes only show on repetition. Any red is one of: **app bug** (fix the app, keep the test, add a row to the pitfall table in `dayline-dev`), **test bug** (wrong assumption or a race in the measurement; fix the test and say why), **environment**. Decide by evidence: the final screenshot (`test/playwright/test-results/<test>/test-failed-1.png`), `error-context.md` next to it, and re-running that one test 20× (`-g "<title>" --repeat-each=20`). A test that fails 40 % of the time is not "mostly fine" — find the cause.
3. **Mutation proof** for the area you touched: reintroduce the bug in a disposable copy and watch the matching test go red (`references/recipes.md`). A check that cannot fail proves nothing.
4. `npm run verify:real` — the real server with the owner's own notes in each engine, POSTs intercepted so nothing is written (md5 of the notes before/after proves it). Fixtures cannot imagine what real notes contain.
5. **Report in the user's language**: tests × engines × repeats, which mutations were killed, real defects found, and what is *not* covered (Obsidian GUI refresh, a physical phone, real Safari vs the WebKit build, other OS).

For AI changes, use the feature inventory and runtime allowlist in `docs/FEATURE-INVENTORY.md` and `docs/AI-TOOLS-AND-SKILLS.md` (repository root). Compare tool receipts with actual temporary-file changes, including destination, section, duplicate/no-op calls, stale targets and partial failure. Mock protocol checks prove local dispatch and control flow; they do not prove real model quality, account eligibility or successful paid inference. Developer skills are not runtime prompts.

For a local runtime cutover, verify the source, app path, private runtime home and selected folder independently. A restart intentionally rotates `rootId` and clears process-local AI Test proof; obtain fresh browser headers and require an explicit connection Test rather than copying old proof. Record file hashes before a read-only pilot and after it, and distinguish that pilot interval from a deployment interval. Preserve a failed probe's evidence instead of converting a later success into stronger proof.

## Playwright rules (summary — full text and rationale in `references/playwright-rules.md`)

| # | rule | how Dayline does it |
|---|---|---|
| 1 | Layers: specs → page object → helpers/fixtures. Specs hold no selectors and no file plumbing | `tests/` · `page-objects/dayline.page.js` · `helpers/` · `fixtures.js` |
| 2 | Selector priority: `data-testid` > role > visible text > class > id | the app carries `data-testid` hooks (`getByTestId`); classes only inside pixel/animation probes in the page object |
| 3 | No fixed waits (`waitForTimeout`), no `networkidle`; wait on conditions | web-first `expect(locator)…`, `expect.poll` for files and computed values; the only timers are in `fixtures.js` (server readiness, watcher settle) |
| 4 | Measure atomically: find + measure in ONE `page.evaluate` | the app rebuilds the DOM on every state load; locator → evaluate in two steps can land on a detached element (all-zero rects) |
| 5 | ID-independent: find rows by visible text, never by line number or `data-id` | `dayline.task(title, panel)` |
| 6 | Independent data per test; nothing shared, no order dependence; test data is clearly fake | `vault` fixture resets a disposable temp vault; the team's `E2E-` prefix + cleanup project is for shared environments and is not needed here |
| 7 | 観点 / パターン: `describe` = perspective, `test` = one concrete pattern with one reason to fail | titles read `観点: …` / `パターン: …` and describe behaviour in the user's words |
| 8 | Capture evidence on failure | screenshot only-on-failure, video retain-on-failure, trace on-first-retry; CI: retries 2, workers 1, forbidOnly |
| 9 | Console guard | the `page` fixture fails a test on any `pageerror` / `console.error` (allow-list via the `allowedConsoleErrors` option) |
| 10 | Real engines | chromium, firefox, webkit (+ mobile-safari, mobile-chrome for `mobile.spec.js`); engine quirks live in the page object, not in specs |
| 11 | Lint | `npm run e2e:lint` mirrors the team's eslint-plugin-playwright set without adding ESLint |

Deliberate deviations from the team's setup: JavaScript instead of TypeScript (no build step), a disposable vault instead of `E2E-` data + cleanup, no auth setup project, video only on failure.

## Probes for "just after the click" bugs

Alignment and animation bugs live in the frames between a click and the re-render ~0.6 s later; a screenshot misses them.

- `dayline.sampleFrames(title, panel, windowMs)` — per `requestAnimationFrame`: checkbox-vs-title centre offset, position, border radius, shadow (guards the `.pop` class collision and "checkbox jumps to the row centre").
- `dayline.sampleStrike(title, panel, windowMs)` — 40 ms samples of the strike's `background-size` (expect several values strictly between 5 % and 95 %).
- Both run inside the page, so Node-side polling jitter cannot hide a frame.

## Quirks learned the hard way

- **State loads rebuild the DOM.** Our own write is echoed back through SSE ~100–300 ms later and re-renders. After a UI write, never "locate, then measure" (rule 4); wait on a visible condition first.
- **Every vault write → a delayed SSE `change` → the page rebuilds itself.** `Vault.write()` marks the vault `dirty`; the `vault` fixture and `dayline.open()` call `vault.settle()` (event-driven: wait for the watcher's echo, then a short quiet period) before the page opens, so a test may `editNote()` and then `open()` safely. Writes made *after* `open()` are observed with web-first assertions / `expect.poll`, never measured right away. (Found when a 3-repeat run hit `boundingBox() === null` once in ~650 runs.)
- `toHaveText` / `toContainText` compare `textContent`; pass `{ useInnerText: true }` when CSS decides the visible text (e.g. the two-line date cell).
- WebKit (Safari) does not Tab to buttons by default → `dayline.tab()` sends Alt+Tab there. Desktop Safari has DPR 2: scale pixel coordinates.
- Firefox logs "The connection to …/api/events was interrupted while the page was loading" when navigating away from an SSE page; the fixture filters exactly that message.
- CSS transitions advance with frames: sample inside the page (`requestAnimationFrame` or a timer in `page.evaluate`), do not poll from Node.
- Reduced motion makes animations instant by design: `page.emulateMedia({ reducedMotion: 'reduce' })`.
- Open a specific language/theme with `dayline.open({ lang, theme })`; an empty day needs `open({ withTasks: false })` (the default waits for a task row).

## Reading screenshots

Open the PNG with the Read tool. For small details crop and enlarge with `sips -c H W --cropOffset Y X in.png --out crop.png` then `sips -z H W crop.png --out big.png`.

More: `references/playwright-rules.md` (rules + test design), `references/recipes.md` (mutation proof, real-server check, new-spec skeleton, debugging).
