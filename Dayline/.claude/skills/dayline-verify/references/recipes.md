# Recipes (run from the project root `<root>`)

## Run, filter, debug

```bash
npm run e2e                                              # everything (5 projects)
npm run e2e -- --project=webkit tests/a11y.spec.js       # one engine, one file
npm run e2e -- -g "strike" --repeat-each=20              # one test 20× (flake hunting)
npm run e2e -- --headed --workers=1 -g "title"           # watch it
npm run e2e -- --debug -g "title"                        # Playwright inspector
npm run e2e -- --trace on -g "title" && (cd test/playwright && npx playwright show-trace test-results/<dir>/trace.zip)
npm run e2e:report                                       # HTML report (screenshots, videos of failures)
```
Failure artifacts: `test/playwright/test-results/<test-dir>/` → `test-failed-1.png`, `video.webm`, `error-context.md` (page snapshot at the failure).

## New spec skeleton

```js
import { test, expect } from '../fixtures.js';

test.describe('観点: <what quality is checked>', () => {
  test('パターン: <one variation, stated as expected behaviour>', async ({ dayline, vault }) => {
    await dayline.open({ lang: 'ko', theme: 'light' });
    await dayline.openEditDialog('メモ付きのタスク');            // rows are found by visible text
    await dayline.memoField.fill('追加したメモ');
    await dayline.saveDialog();
    await expect(dayline.taskMemo('メモ付きのタスク')).toContainText('追加したメモ');   // what the user sees
    await expect.poll(() => vault.note()).toContain('  追加したメモ');                    // what is on disk
  });
});
```
Need a locator/probe that does not exist? Add it to `page-objects/dayline.page.js` (selectors and DOM measurement live only there), a `data-testid` in the app if the element has none, and a fixture/vault helper in `helpers/vault.js` for data. Then `npm run e2e:lint`.

Need different data? `vault.editNote((s) => s.replace('## 今日のタスク\n', '## 今日のタスク\n- [ ] …\n'))` before `dayline.open()` (the vault is a disposable temp copy, reset before every test). A second server: `spawnServer({ port })`, read-only: the `readonlyServer` fixture. Raw HTTP (Host/Origin/paths): `helpers/http.js` → `rawRequest`, `tryConnect`.

## Mutation proof (a check that cannot fail is worthless)

Automated for the bugs this project has had and for the security gates:

```bash
npm run e2e:mutate                  # all mutants (a few minutes)
npm run e2e:mutate pop-class        # those whose name contains "pop-class"
```
`test/playwright/tools/mutate.mjs` copies the project to a temp dir, first proves the chosen specs are green there, then applies one mutant at a time (a source edit that reintroduces the bug) and expects the matching spec to go red (`KILLED`). `SURVIVED` = the test does not guard that behaviour; `INVALID` = the mutation site no longer exists (source changed) — update the table. When you fix a new bug, add its mutant to the `MUTANTS` table in the same change.

By hand, for a one-off:
```bash
D=$(mktemp -d); rsync -a --exclude node_modules --exclude test-results ./ "$D"/ && ln -s "$PWD/test/playwright/node_modules" "$D/test/playwright/node_modules"
# edit "$D/public/app.js" to reintroduce the bug, then
(cd "$D/test/playwright" && npx playwright test --project=chromium tests/<spec>.js)    # must FAIL
rm -rf "$D"
```
(`fixtures.js` locates the app relative to itself, so the copy runs its own `server.js` and `public/`.)

## Real server, real notes, read-only

```bash
npm run verify:real                          # chromium + firefox + webkit, light + dark
ENGINES=webkit DAYLINE_LANG=ko BASE=http://127.0.0.1:4317 npm run verify:real
```
`test/playwright/tools/real-readonly.mjs` opens the running server with the owner's actual notes, **intercepts every POST** (`context.route`) and answers with a fake success, then for every row measures the frames right after the click (centre offset, `position`, radius, shadow) and the strike animation, checks 1280/375 px overflow, an accessible dialog name and a clean console. Proof of "nothing was written": the count of intercepted POSTs and an md5 of every `.md` in the vault before/after. If a file changed it is almost certainly the owner editing in Obsidian meanwhile — look at the names it prints.
Never click a real confirm button on the real server for a test; data changes go through `dayline-vault`.

## A glitch right after a click (frames)

```js
const r = await dayline.sampleFrames('メモ付きのタスク', 'tasks');   // per rAF for ~2.3 s, starts the click itself
expect(r.offCentre + r.nonStatic + r.wrongRadius + r.shadow).toBe(0);
const s = await dayline.sampleStrike('日報', 'routine');             // { mid, spanMs, ended, sizes }: strike width over time
```
Both start sampling inside the page first and click afterwards, so no frame is missed. To see what the user saw, screenshot at several moments with `page.screenshot()` right after `click()` and open the PNG with the Read tool.

## Languages, themes, widths, motion

```js
await dayline.open({ lang: 'ja', theme: 'dark' });              // ja | ko | en | zh, dark | light (localStorage, then reload)
await page.setViewportSize({ width: 375, height: 800 });        // before open() to start narrow
await page.emulateMedia({ reducedMotion: 'reduce' });           // before open()
```
Mobile profiles (`mobile-safari`, `mobile-chrome`) run only `tests/mobile.spec.js`; use `tap()` there.

## Pixels: what is actually painted

`helpers/pixels.js`: `decodePng(await page.screenshot())` → `png.at(x, y)` → `[r, g, b]`, `hue([r,g,b])`, `contrast(a, b)` (WCAG). Scale coordinates by `devicePixelRatio` (Desktop Safari = 2). Wait for `document.getAnimations().length === 0` before sampling after a theme switch.
