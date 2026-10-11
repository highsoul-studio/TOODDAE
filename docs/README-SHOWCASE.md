# README screenshot notes

The English-first README uses actual TOODDAE UI captures, not interface mockups. Main README and `readme/README.en.md` share the same copy, with adjusted relative links.

## Source and scope

- Application source: a TOODDAE v1.0.1 build from before the Write list fixes, so the screenshots still show the old "Add today's note" label (it now reads "Add note").
- UI language: English.
- Demo date: October 8, 2026; the captured Day line clock is fixed at 10:42.
- Workspace: an isolated, temporary folder containing only fictional tasks, routine occurrences, and notes.
- No application code, real notes, real AI credentials, repository visibility, or payment settings were changed for this showcase.
- Korean, Japanese, and Chinese README translations were not rewritten in this English-first pass.

## Assets

All images are stored in `docs/assets/readme/`. They are PNGs with descriptive alternative text in the README and no external image-host dependency.

| Asset | What it shows |
| --- | --- |
| `do-overview.png` | Dark-mode Do overview: Day line, Today, Routine, and Upcoming. Deliberately cropped above the lower panels. |
| `history.png` | The real Last 12 weeks component, filled with fictional daily completion records. |
| `write-library.png` | Searchable note library and a rendered weekly plan with a list, table, and quotation. |
| `ai-organize.png` | Original note, a locally supplied example proposal, and the explicit Apply control. |
| `colors.png` | Actual light/dark preview cards and background/accent controls in Set. |
| `do-light.png` | The same Do demo in the Ivory/Amber light theme. |

Cropping removes unrelated screen areas without modifying the UI content. Do overview and library captures do not imply that the entire scrollable page is shown.

## AI example boundary

The organization capture uses a **local response fixture** through the application's normal Organize request and comparison UI. No external model inference or live subscription login was performed. The fixture demonstrates the interaction, not model quality or a guaranteed output.

The original selected note was not replaced for the capture. The screenshot shows **Apply AI proposal** still available and **Undo** disabled. Real AI use requires a configured connection, consent for the destination, and a successful connection test. Results depend on the selected provider and model.

## Refresh checklist

1. Use a new synthetic workspace, never the user's active notes folder.
2. Capture the current source with an English interface and English sample content.
3. Populate daily records for the activity view, with both partial and complete days.
4. For an illustrative AI fixture, disclose it beside the showcase; do not label it a live result.
5. Capture only the color controls, not credentials or account settings.
6. Inspect each final image at its README display size and full resolution. Check crops, contrast, text, and Apply/Undo state.
7. Verify all relative links in both English entry points and scan the documentation changes for secrets.
8. Keep source installation, local launcher, hosted/mobile access, and prebuilt release availability distinct.

## Documentation validation

- Both English entry points: 32 local-link references and 12 image references verified; six distinct image files.
- GitHub's Markdown renderer accepted the README; all six images loaded in the local rendered preview. Final crops were inspected directly.
- Fresh `node scripts/start-demo.mjs` launch in a separate source copy: local app routes, default folder, and welcome note verified without `npm install` or existing user notes. The verification used an unused port override and stopped its own server afterward.
- Gitleaks scan of the exact documentation change files: zero findings. The full current-source scan is also clean (the earlier synthetic key assertion in `Dayline/test/settings.test.js` now uses a low-entropy placeholder).
- Current `npm test` run: **225/226 passed**. The macOS launcher executable check was terminated with `SIGKILL`; its cause is unresolved in this environment. This documentation change does not claim a complete test-suite pass or a verified macOS bundle launch.
- No production source change, repository visibility change, live AI request, or payment action was part of the showcase.

## Animated README mascot

The five product README entry points prefer `assets/readme/highsoul-idle.webp` above the TOODDAE title, with `highsoul-idle.gif` as an animated fallback. It is rendered only from the existing HIGHSOUL `body-charcoal`, `body-sky-blue`, `eyes-default`, `mouth-default`, and `monocle` layers in `Dayline/public/assets/highsoul/layers`. The source layers and the application component are unchanged; the right-facing orientation and white monocle are preserved.

Both transparent 320 × 280 animations have 234 frames at an average **30fps**, three times the original 10fps version, and a seamless 7.8-second loop. WebP uses full color rather than GIF's limited palette to avoid visible color bands. Its browser encoder quality setting is 0.98; this is high-quality lossy RGB encoding, not a lossless claim. Four sampled frames had opaque-RGB RMSE of 1.11–1.37 on the 0–255 scale and identical alpha. The small idle combines breathing, a slight tilt, eye movement and blinking, and a gradual charcoal/sky-blue color change. The eyelids now close, briefly hold, and reopen with eased interpolation rather than an abrupt triangular pulse. This is a pre-rendered animation, not the application's JavaScript/hover component. GitHub READMEs cannot run that component.

Each header uses a `<picture>` source for `prefers-reduced-motion: reduce`. It selects `highsoul-hidden.png`, a transparent 160 × 1 image, instead of displaying a static character. The next source selects animated WebP in supporting browsers, followed by the 30fps GIF fallback. The normal image is 160 CSS pixels wide. There are no scripts, dependencies, remote services, or changes to app behavior.

The macOS-only documentation generator is `assets/readme/source/render-highsoul.swift` and uses the built-in CoreGraphics and ImageIO frameworks. It is not an app runtime dependency. With a local Swift toolchain, run from the repository root:

```bash
swift docs/assets/readme/source/render-highsoul.swift \
  Dayline/public/assets/highsoul/layers \
  docs/assets/readme/highsoul-idle.gif \
  "${TMPDIR:-/tmp}/tooddae-mascot-frames"
```

The generator also creates the transparent motion-reduction image and all 234 PNG frames for inspection. `source/encode-highsoul-frame.mjs` provides the standard browser `OffscreenCanvas` WebP encoder for those PNG frames; save its results as `frame-000.webp` through `frame-233.webp`. Then assemble the animation with:

```bash
node docs/assets/readme/source/assemble-highsoul-webp.mjs \
  /path/to/webp-frames \
  docs/assets/readme/highsoul-idle.webp
```

WebP frame durations alternate between 33 and 34 ms and total exactly 7.8 seconds. Complete-frame replacement preserves alpha without trails. GIF durations use 3 and 4 centiseconds with the same total and disposal mode 2. A lossless APNG prototype was 11.5 MB; the high-quality WebP is about 2.9 MB, so the heavier prototype is not shipped. Regeneration may vary in encoded bytes across OS/toolchain versions; the visual source and frame recipe remain recorded.
