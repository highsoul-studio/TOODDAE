# TOODDAE design system

Living style guide: run the app and open `/design` (the custom controls there are live). Tokens: `public/tokens.css` (single source of truth). Components: `public/styles.css`. Behaviour of the custom controls: `public/ui.js`.

## Brief

Personal daily-operations dashboard, local only, one user, glanced at all day. It mirrors a chosen Markdown folder, so the job is "what must I not forget right now?".
User's direction: black base with a very faint achromatic gradient, refined business purple as the highlight, dashboard layout. A **light theme** (white-family base, orange-yellow highlight) is switchable with a sun/moon button; both themes share the same token names and the same meaning rules. Name: **TOODDAE** (the Day line is the signature element; the brand mark is a tiny Day line with its "now" dot).

Inputs used
- `frontend-design` (Anthropic): plan tokens first, review the plan against generic defaults, one memorable element, restraint, copy as design.
- `ui-ux-pro-max` (`--design-system --density 8`, `--domain color/typography/style/ux/chart`): "Dark Mode (OLED)" + "Minimalism & Swiss" style family, 4.5:1 text contrast on dark, visible focus, reduced motion, SVG icons (no emoji), heatmaps must not rely on colour alone. Its generated palette (teal/orange) and landing-page pattern were **not** used: the brief pins the palette and this is an app, not a landing page.

## Design plan

| | Decision |
|---|---|
| Colour | Void `#09090b` page · Slate `#0f0f11` sheet · Bone `#f3f3f6` text · Smoke `#b1b1b3` secondary · Amethyst `#7057d5` action/fill · Lavender `#a193fc` now/focus. Purple is OKLCH hue 288, chroma ≤ 0.185. Signals: amber (carried over), coral (overdue), **danger red `#c4403b` (fill, white text 5.1:1) for destructive buttons only**. |
| Page | `n-1` with two faint white radial lights over a black vertical gradient. No colour in the background. |
| Type | System stack per language: SF Pro + Hiragino Sans + Apple SD Gothic Neo (+ PingFang SC for Chinese). Tabular figures everywhere. Date as a 300-weight display numeral; everything else 12–20 px. Sentence case, no all-caps labels, no middle-dot meta strings. |
| Layout | Hero (date + progress) → **Day line (07–22, extends if a task or "now" is outside)** → 3 columns: raised sheet (today's tasks) · flat routine column · flat side column (upcoming, inbox, history). Panels can hold named **sections** (`###` headings) with a progress hairline. |
| Memorable element | The Day line: timed tasks placed on the day's horizontal axis, a purple "now" line, elapsed time as a growing line. |
| Purple rule | Purple only means: now · done · primary action · focus. Everything else is neutral. The same four meanings carry the amber-orange in the light theme. |
| Light theme | Page `#f6f6f7` · sheet `#ffffff` · text `#131416` · fill amber `#fb9d00` with dark-brown text `#2a1700` (8.1:1) · accent text `#b44f00` (5.2:1 on white) · icons/now `#d86800` (3.6:1) · focus `#bc4f00`. Heatmap runs pale yellow → deep orange. Danger red and carry/overdue signals keep their meaning with darker values. |

## Review against generic defaults (what was changed)

- Near-black + one acid accent → muted violet (L 0.55, C 0.185), used sparingly; text never uses the fill colour.
- SaaS card kit → one raised sheet; other columns are flat with hairlines; radii differ by role (6 / 10 / 18 / pill).
- Chrome tells → no all-caps eyebrow labels, no "A · B · C" strings, no monospace data labels (tabular figures instead), no "→" suffixes, no numbered markers.
- KPI hero (big number + label + gradient) → the hero is the date and the Day line; progress is a quiet segmented line.
- Motion → no scroll reveals or card hovers. One orchestrated moment on first load (elapsed line grows, pills rise in sequence). Check marks pop on user action only.

## Tokens (see `tokens.css`)

- Neutral `n-0…n-5`, lines `line-1…3`, text `text-1…4`. `text-3` (5.3:1) is the weakest allowed body colour; `text-4` is decoration only.
- Purple `p-50…950`. Fill `p-600` (white text 5.2:1), hover `p-550` (4.5:1), press `p-700`, accent text `p-300`, icons/focus/now `p-400`.
- Danger `--danger / -hover / -press` (white text 5.1 / 4.7 / 6.5:1).
- Space 4px grid. Radius 6/10/18/pill. Motion 120/220/700 ms, `cubic-bezier(.2,.7,.2,1)`; the strike-through draw uses `--t-strike` 560 ms with `--ease-draw` `cubic-bezier(.5,0,.2,1)`.
- **Themes**: `:root` holds the dark values, `:root[data-theme='light']` overrides the same names (neutrals, text, the `p-*` ramp, accent roles, signals, `--page-bg`, `--top-bg`, `--sheet-bg`, shadows, backdrop, glow, `--tag`, `--strike`, `--heat-*`, `--brand-*`, selection). Components must only use these tokens, never a literal colour. `public/theme.js` runs before first paint (no flash), stores the choice in `localStorage` and cross-fades the switch with View Transitions when available.

## Components

Button (primary / default / ghost / **danger = red fill, same shape as primary** / small / icon) · Quick add · **Theme button (sun ⇄ moon, rotates and fades)** · Language button + list popover · Sync pill (a button → connection dialog with Reconnect) · Task row (row 1: checkbox · title · hover actions, all vertically centred on the title block; row 2: **memo** then chips; Today on Inbox/Upcoming, postpone-due on today's tasks, edit, cancel/delete) · Section header · Chips · Progress ticks · Day line · Upcoming row · Heatmap + legend · Toast with undo · Dialogs · Empty state.

**Custom controls (no native pickers)**: select (listbox popover) · date (calendar popover, Sunday-first; Saturday blue and Sunday / public holidays red via `--cal-sat` / `--cal-sun`, holidays of the Set country (JP, KR) from `public/holidays.js`; today / clear, clear button inline) · time (typed `HH:mm` with hour/minute popover) · weekday chips · checkbox card. All open inside the modal `<dialog>` (outside a modal is inert), flip above the trigger when there is no room, close on outside click / Esc (Esc closes only the popover).

**Destructive pattern**: any cancel / delete goes through a confirm dialog — title as a question, one sentence on what happens (and what is kept), a safe "go back" button and a red filled action. Cancelling a task never removes the line from the file (`[-]`), so the toast offers undo. Deleting a routine is a real delete (today's line + its template definition, so it is gone from tomorrow; past notes stay) and the confirm text says exactly that — it must never promise that the routine "comes back". Converting a routine back to a task (which deletes its template definition) also asks first.

**Class naming**: transient state classes use the `is-` prefix (`is-done`, `is-pop`, `is-reset`, `is-intro`…). Never reuse a component class for a state: the popover is `.pop`, so the checkbox's check animation is `.chk.is-pop` — when it was also called `.pop`, the popover's `position: fixed` pulled the checkbox out of the row's grid and it jumped to the middle of the whole task for a moment.

States that exist for every interactive element: default, hover, focus-visible (soft `accent-wash` shadow for text/composite entry surfaces; neutral outline for note cards; 2 px system-visible outline in forced colors), active, disabled. Done tasks are muted and struck through.

**Strike-through draw**: the title sits in `.strike`, whose line is a `background-size` gradient that animates `0% → 100%` from the left (wrapped titles fill line by line), while the text colour eases to `text-3`. The app re-renders by rebuilding the DOM, so after a check it momentarily applies `.is-reset`, forces a reflow and removes it to replay the transition, and holds the follow-up re-render (SSE echo of its own write) for 620 ms so the line is not cut off. Un-checking removes the line at once. The `/design` task rows animate the same way with plain class toggling.

**Icons**: the sprite (`icons.svg`) is inlined into `index.html` by the server (same-document `<use href="#i-…">`). External `<use>` references were re-fetched on every re-render and flashed blank icons.

## Language

Japanese is the default; Korean, English and Chinese (Simplified) are selectable. All UI text lives in `public/i18n.js` (`test/i18n.test.js` checks that every key used exists in all four languages with matching placeholders). Dates use `Intl` per language. Task text, section names and template content are the user's own and are never translated.

## Accessibility

- Text ≥ 12 px, body contrast ≥ 4.5:1, non-text ≥ 3:1.
- Native `<input type=checkbox>` and `<dialog>`; custom controls follow listbox / dialog patterns with roving focus and arrow-key support; icon buttons have `aria-label`; decorative icons `aria-hidden`.
- State is never colour-only: "Carried over 1d", "Overdue 10/03" accompany colour. Heatmap cells carry date + count labels.
- Light theme contrast: text-1 18.4:1, text-3 5.1:1, accent text 5.2:1 on white; amber fill carries dark-brown text (8.1:1) instead of white.
- `prefers-reduced-motion` removes all animation (including the strike draw and the theme cross-fade); `(hover: none)` keeps row actions visible; `(pointer: coarse)` enlarges targets.
- Responsive: 3 columns ≥ 1181 px, 2 columns ≥ 761 px, 1 column below; the Day line scrolls horizontally on narrow screens and centres on "now"; dialogs never exceed the viewport width.

## Copy

Plain verbs, one name per action. Errors state cause and fix. Empty states invite the next action. Confirmations are a question plus one reassuring sentence.

## Do / Write / Set review (2026-10-06)

The existing black/violet and white/amber identity remains the source of truth. New pages reuse its system-font typography, sheets, space/radius tokens, and native-looking custom input primitives. Write opens in Read mode; editing uses an unboxed title plus a fixed responsive plain document surface with internal scrolling. Read offers Edit and Organize with AI; Edit offers one accented Read action. Task dialogs use a desktop two-column form/memo layout and stack on mobile without auto-selecting the title. Set aligns provider/model/effort/URL in one row for verified model families, and each swatch group is one horizontally scrollable, keyboard-reachable strip at every width. Navigation uses equal-width links with aria-current.

The Day line clips dated ranges to local `00:00–24:00`, labels previous/next-day continuation, and never infers overnight from an undated or same-day reverse range. End-only deadlines appear and notify only on their due date.

The header uses the supplied rounded TOODDAE mask as an inline `currentColor` SVG, scaled so its visible geometry fills the 22 px mark. Theme and accent changes freeze the current computed color, fade it out, replace it only while hidden after the root token transition, and fade the new color in; rapid changes continue from the current opacity and reduced-motion changes are immediate. Write editing uses a fixed responsive plaintext viewport with internal scrolling. Formatting shortcuts insert visible Markdown markers and remain local to the focused body editor; Save waits for the atomic title/body queue before entering Read. Read renders safe structural Markdown, including emphasis, strikethrough, horizontal rules, task lists and bounded horizontally scrollable tables, while escaped and code content stays literal. Note deletion flushes autosave, requires confirmation, preserves the exact bytes in history, and exposes immediate conflict-safe Undo. Model selection combines an editable field with the existing accessible list popover and live/default catalog provenance. Catalog responses are accepted only for the current saved provider/root and stale picker callbacks cannot apply to replaced controls.

The intentionally small Markdown surface supports H1–H6, soft paragraphs and two-space hard breaks, blockquotes, nested unordered/ordered/task lists with preserved indentation, horizontal rules, safe links, inline/fenced code, simple pipe tables, bold, emphasis and `~~strike~~`. Escapes and code are isolated before inline formatting, raw HTML remains text, and unsafe URL schemes never become links. Reference links, images and arbitrary HTML are outside this local renderer; source remains available in Edit for unsupported syntax.

Write note cards are keyed by `noteId`, including multiple UUID notes on the same date and legacy date-only notes. Search scans cursor pages without replacing the selected editor or draft, and its add card creates a localized titled note on the current date. Do section-order mode replaces task rows with named-section handles and explicit touch/keyboard move controls; its captured source hashes stay fixed until Save so an external edit produces a conflict and a truthful refetch. Hero completion uses the deadline-aware `progress.total` contract while panel counts remain visible-row counts, and early completion is shown separately. Named-section bars carry their computed fill into the next render before transitioning to the target.

Write keeps the localized route loading state visible until settings, the note rail and the selected note are ready. The header, rail and sheet then appear together; failed initialization uses the localized route error and Retry.

Do exposes the natural-language task assistant only when the boot capability exists. It is gated by the same credential, consent, and successful connection proof as Write AI and uses a UUIDv4 idempotency key. Its allowlist can find, add, edit and move tasks or routines and add or reorder sections; server validation and receipts remain authoritative. The UI counts only actual changed receipts, labels create/update/move/reorder separately, and reports resolved no-ops as unchanged rather than as zero creations. Settings keeps API-key and subscription authentication as explicit modes for OpenAI and Anthropic. Subscription secrets never enter the vault or browser; OpenAI OIDC state/nonce/PKCE is root- and revision-bound. The Claude CLI adapter disables local tools/customizations and rejects detected managed policy. It enables inference only when CLI status positively reports first-party `claude.ai` authentication and a personal Pro/Max subscription; missing or organization-plan metadata fails closed.

Write Organize opens an anchored custom popover first. Opening, cancelling, clicking outside, or pressing Escape sends nothing; submit sends the optional bounded instruction separately from note source text. The visible consent checkbox represents the remembered grant for the current effective connection, while Test proof remains specific to the current provider/model/effort/auth identity. Inference actions use the normal theme highlight and a Sparkles icon plus text; configuration actions such as login and key save do not imply inference. Palette strips remain horizontally keyboard-scrollable with their scrollbar hidden. Folder status uses local/drive/unknown evidence and explains that renaming occurs in the OS file manager before reconnecting.

Motion answers interaction rather than decorating content. Theme changes interpolate explicitly registered color properties on the live DOM (450 ms manual/palette, 2400 ms schedule), never View Transition overlays. Reduced motion disables interpolation. List-row completion keeps its existing strike behavior; the Day-line pill now mirrors that direction and muted state. Scheduling follows the browser's local clock; country sunrise/sunset values are annual-average starting points, not live astronomy. Manual override ends at the next local boundary.

Editable controls use a soft focus shadow instead of a thin ring; the model composite owns one `:focus-within` halo, while forced-colors restores a native high-contrast outline. Meaningful AI actions share the stable gold `btn--ai` semantic class, and destructive actions remain red. Native `title` bubbles are migrated to one text-only tooltip layer that works from hover or focus, stays inside the viewport and the active modal top layer, and closes first on Escape. The optional accent cursor is off by default and starts only after a real fine-pointer coordinate: a soft dot on ordinary surfaces, a ring on actions and a caret on text inputs. It never captures the pointer, restores the native cursor when a modal closes or the pointer context is unknown, and stays disabled for touch, coarse pointers and forced colors. Theme changes freeze its old color through fade-out, swap color only while hidden, then fade it in.

Language changes persist only after the shared Write, Set and Do guards finish, then reload the whole document without an intermediate translated frame. `Cmd/Ctrl+Enter` submits item and Assistant forms and saves Write, while composition, repeat, empty, readiness and busy states cannot submit. The item memo hint sits between its label and textarea; the memo and routine card share the same desktop bottom edge and stack naturally on mobile.

Timed completion samples the rendered Day-line pill before every rebuild, then animates its content fade and strike transform toward the latest state. A rapid reverse, SSE rebuild or reload therefore starts from the visible fraction; reduced motion applies the target immediately. The now dot and rail share one geometry source. Automatic appearance evaluates a changed schedule immediately and on minute-aligned, visibility and route checks. Manual overrides are bound to the sunrise/sunset schedule that created them, so changing that schedule invalidates the stale override while an unchanged schedule keeps it until its next boundary.

UI/UX Pro Max search: “personal productivity dashboard minimal” returned Flat Design guidance. Its keyboard/focus/contrast/reduced-motion recommendations fit; its marketing hero, teal/orange palette and external-font recommendation do not fit and were rejected. No generated system replaces this document.

## App icon

The macOS app icon is the brand mark in the accent purple (`--p-600`, #7057d5) on a light rounded tile: `design/app-icon/AppIcon.svg`. The mark is centred and its width is 75% of the tile (measured on the render: 74.9%). `design/app-icon/build.sh` renders it to `AppIcon.icns` (needs librsvg once; commit the result), and `npm run app:package` copies that file into the bundle. After rebuilding the app, Finder may need `touch TOODDAE.app` or a relaunch to refresh its cached icon.
