<div align="center">

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="../docs/assets/readme/highsoul-hidden.png">
  <source type="image/webp" srcset="../docs/assets/readme/highsoul-idle.webp">
  <img src="../docs/assets/readme/highsoul-idle.gif" width="160" alt="Animated HIGHSOUL white-monocle mascot.">
</picture>

# TOODDAE

### A little more room in your day.

Tasks, time, and notes. In a folder you own.

[Get started](#get-started) · [What you can do](#what-you-can-do) · [Your files](#your-files-stay-yours)

![TOODDAE in dark mode, showing the Day line, today's tasks, daily routines, and upcoming plans.](../docs/assets/readme/do-overview.png)

</div>

**TOODDAE is a local-first personal workspace for planning, doing, and remembering.** Give your tasks a place in the day, keep routines close, and save the thoughts around them as ordinary Markdown files.

English is the default language of this README. [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh.md)

> These are real app screens with fictional demo data. The AI comparison uses a local example response to demonstrate review and Apply, not a live model result. A fresh workspace does not include these sample records.

---

<a id="try-this"></a>

## 🤖 Try this

Let an AI agent handle the local setup for you. Expand and copy the prompt below into an agent that can run terminal commands on your own computer.

<details>
<summary>📋 Copy the setup prompt</summary>

```text
Please help me install and run TOODDAE safely on my own computer.
Repository: https://github.com/highsoul-studio/TOODDAE

1. First confirm whether you can operate my local computer.
   If you only have a cloud/remote environment, explain that limit
   and guide me instead of running setup there. Do not claim the app
   is running on my computer.
2. Check my OS and Node.js version. Node.js 20 or later is required.
   If it is missing or too old, explain the official installation
   method for my OS and ask before installing or changing my system.
3. Choose a new, separate installation folder. Never overwrite,
   reset, or delete existing files or notes. If the folder already
   exists, ask before changing it or choose another new folder.
4. Clone the repository there, or use an authorized source download
   if Git is unavailable. If repository access requires sign-in or
   permission, explain what I need to do; do not bypass access checks
   or ask me to paste passwords or tokens into chat.
5. Read the current README and project instructions. Then, from the
   repository root, run these as ordinary commands that finish. Do
   not leave the server running in a blocking foreground command.
   - macOS (recommended): cd Dayline && npm run app:package
     This builds TOODDAE.app in the repository root. Then open it
     (for example: open ../TOODDAE.app, relative to Dayline/).
   - Other OS (the app launcher is macOS-only): run
     node scripts/start-demo.mjs --detach
     It starts the server in the background and returns after
     printing the URL and PID. Do not start it with a bare "&"
     while capturing its output: the server would hold the output
     pipe and the command would never end. If the default port
     44318 is occupied, set DAYLINE_DEMO_PORT to an unused port
     and report the actual URL.
   No npm install is needed; the app has no runtime dependencies.
   If macOS shows a first-open warning (the app is ad-hoc signed,
   not notarized by Apple), tell me to right-click the app and
   choose Open. Do not disable Gatekeeper or change security
   settings yourself.
   Do not connect existing note folders, configure AI/API keys,
   enable login-time services, or deploy a public website.
6. Verify the app actually responds at http://127.0.0.1:44318
   (for example, request /api/status). In a browser, wait for a
   visible element, not for "network idle": the page keeps one
   live-update connection open, so the network never goes idle.
   If the port is occupied,
   do not stop another process; tell me what is using it (the
   launcher names the other copy and its PID) and ask me. Never
   use port 4317 for this starter.
7. Tell me the installation folder and where TOODDAE.app is.
   Explain that I can drag it into Applications to use it like a
   normal app, but it still needs this folder and Node.js where
   they are now. Tell me how to open it again (reopening reuses
   the background server) and how to stop the server (Activity
   Monitor, or: lsof -ti tcp:44318 -sTCP:LISTEN | xargs kill).
   Separate verified results from anything you could not check.
   Explain errors in plain language.
```

</details>

A chat-only assistant can guide you, but cannot start an app on your computer by itself. Prefer to do it manually? See [Get started](#get-started).

---

<a id="what-you-can-do"></a>

## 🧭 What you can do

<a id="see-today-without-losing-sight-of-whats-next"></a>

### 📅 See today without losing sight of what's next

The **Do** page brings four everyday views together:

- **Today:** Break work into sections, add priorities and short memos, and check things off.
- **Routine:** Keep recurring habits alongside today's work, with their own times and repeat rules.
- **Upcoming:** See dated tasks before they become today's work.
- **Inbox:** Catch ideas and undated tasks without deciding when to do them yet.

The **Day line** puts timed tasks and routines on the same daily timeline. Use a start time, a time range, or an end-only deadline such as `〜17:00 Send the proposal`.

<a id="watch-small-days-add-up"></a>

### 📈 Watch small days add up

See your recent activity in the **Last 12 weeks** grid, with completion levels and a daily progress indicator. Finish every eligible item on consecutive days to build a streak. Future deadlines stay out of today's main completion target.

<img src="../docs/assets/readme/history.png" alt="Last 12 weeks activity grid with varied completion levels and a legend from less to more." width="364">

<a id="build-a-library-of-notes-not-a-pile-of-tabs"></a>

### 📝 Build a library of notes, not a pile of tabs

Use **Write** for meeting notes, ideas, reading, and reflection. Create multiple notes on the same date, search titles and full note content, and switch between editing and a readable Markdown preview.

![The Write library with searchable notes on the left and a weekly plan containing headings, a list, a table, and a quotation on the right.](../docs/assets/readme/write-library.png)

- Give each note a title and keep the details in its body.
- Write with headings, lists, links, and tables.
- Let autosave handle edits, or use **Save** to return to reading.
- Recover earlier versions and undo supported note deletions.

<a id="turn-a-rough-note-into-something-you-can-use"></a>

### ✨ Turn a rough note into something you can use

**Organize with AI** proposes a clearer version of the selected note. Add instructions such as *“Separate decisions, next steps, and items for later.”* Review the original and proposal side by side, then choose **Apply AI proposal** if you want to save it.

![AI organization comparison: the original meeting note on the left, decisions and next steps on the right, and an explicit Apply AI proposal button below.](../docs/assets/readme/ai-organize.png)

**You stay in control.** Organize sends the selected note only after explicit submission, consent, and a successful connection test. Generating a proposal does not overwrite the original. Model output can be wrong, so review it before applying.

The Do page also has a bounded natural-language assistant for supported task, routine, and section operations. It is separate from Write's note-organization flow. See [AI tools and limits](../docs/AI-TOOLS-AND-SKILLS.md).

<a id="make-the-workspace-feel-like-yours"></a>

### 🎨 Make the workspace feel like yours

In **Set**, choose separate backgrounds and accent colors for light and dark mode. Preview your choices before switching the whole workspace. You can also set sunrise/sunset theme timing and choose an English, Korean, Japanese, or Chinese interface.

![Color settings showing separate light and dark previews, background choices, and accent swatches.](../docs/assets/readme/colors.png)

<details>
<summary>☀️ See the same day in light mode</summary>

![The same tasks, routines, and upcoming plans in the Ivory background and Amber accent light theme.](../docs/assets/readme/do-light.png)

</details>

---

<a id="get-started"></a>

## 🚀 Get started

**Requirements:** Node.js **20 or later** and a browser. The app has **no runtime npm dependencies**; you do not need `npm install` to run it.

Clone the repository, or download and extract its source:

```bash
git clone https://github.com/highsoul-studio/TOODDAE.git
cd TOODDAE
node scripts/start-demo.mjs
```

Open **[http://127.0.0.1:44318](http://127.0.0.1:44318)**. This is your local app, not a hosted website. Stop it with **Ctrl+C** in the terminal.

On first run, the launcher creates a notes folder at `runtime/default/` and keeps machine settings in `runtime/demo-home/`. It does not connect your existing notes or install a login service automatically. A folder you explicitly select later is remembered. Back up existing notes before connecting them.

<details open>
<summary>🍎 macOS: open TOODDAE like a normal app</summary>

From the repository root:

```bash
cd Dayline
npm run app:package
```

Open the generated **TOODDAE.app** in the repository root with Finder. It starts or reuses the matching local background server and opens your browser. To use it like a real app, drag **TOODDAE.app** into the **Applications** folder and open it from Launchpad or Spotlight. It still uses this repository folder and the Node.js recorded when you generated it, so keep both in place.

This is a local convenience launcher, **not a standalone installer**. It does not bundle Node.js or install a LaunchAgent/login item. It depends on the recorded Node.js and workspace paths; regenerate it if either moves. The launcher is macOS-only.

The generated app is ad-hoc signed for local use only; it is not notarized by Apple. If macOS shows an "Apple could not verify..." warning the first time you open it, right-click the app in Finder and choose **Open**, or allow it under System Settings → Privacy & Security → **Open Anyway**.

**Opening it again is safe.** Closing the browser tab does not stop the background server. Opening **TOODDAE.app** again just reuses that server and shows no "port in use" message. That message appears only when a *different* copy or version of TOODDAE is still running on port 44318. Quit that one first (Activity Monitor → search `node`, or run `kill <PID>` with the PID shown in the message), then open the app again. To stop the background server yourself, run `lsof -ti tcp:44318 -sTCP:LISTEN | xargs kill`. Don't run `node scripts/start-demo.mjs` while the app's server is running; both use port 44318.

</details>

<a id="optional-ai-setup"></a>

### 🔌 Optional AI setup

The core task and writing workflow works without AI or a cloud account.

For AI assistance, open **Set**, choose a provider and model, configure the connection, give consent for that destination, and run **Test AI connection**. API-key adapters support **OpenAI, Anthropic, Gemini, and DeepSeek**. Provider usage may incur charges.

Optional ChatGPT sign-in and Claude Code subscription adapters are also included, but availability depends on the account and supported local runtime. Their presence does not guarantee eligibility or live-account compatibility. API keys and subscription credentials are kept outside the notes folder.

See [implementation status](../docs/IMPLEMENTATION-STATUS.md) for setup boundaries and verification details.

---

<a id="your-files-stay-yours"></a>

## 📁 Your files stay yours

TOODDAE reads and writes a folder of Markdown files:

```text
Your notes folder/
├── Daily/              Daily tasks and routine occurrences
├── Templates/          Routine definitions for future days
├── Write/              Notes, including multiple notes per date
├── Inbox.md            Tasks without a date
└── Set/                Workspace settings
```

- **Local first:** Run the app on your computer and choose the folder it uses.
- **Plain Markdown:** Read and edit the files in Obsidian or another Markdown editor. No Obsidian plugin is required.
- **Two-way editing:** App changes and edits to the connected files use the same data.
- **Optional external AI:** Local storage does not mean local inference. AI actions send the permitted context to your chosen connection when you submit them.

A mounted synchronized folder can store your notes, but it does not turn TOODDAE into a hosted service or provide a phone runtime. The shipped server uses loopback access.

---

<a id="project-status-and-development"></a>

## 🛠️ Project status and development

The runnable application lives in `Dayline/`, a directory name retained from the original prototype. **macOS is the primary development environment.** Browser testing includes Chromium and mobile viewport emulation; physical phones, other browser engines, and native Windows/Linux installation have not been verified.

Run the unit and local HTTP tests:

```bash
cd Dayline
npm test
```

Playwright checks use a separate development test workspace and require their own dependencies and browsers. They are not needed to run the app.

- [Feature inventory](../docs/FEATURE-INVENTORY.md)
- [Implementation status and known limits](../docs/IMPLEMENTATION-STATUS.md)
- [AI tools, permissions, and boundaries](../docs/AI-TOOLS-AND-SKILLS.md)
- [Screenshot notes](../docs/README-SHOWCASE.md)
- [Releases](https://github.com/highsoul-studio/TOODDAE/releases)

Runnable source and prebuilt release availability are separate. TOODDAE's name combines **Too + ddae (때)**: to-dos, time, and moments worth recording.

---

<a id="license"></a>

## 📜 License

TOODDAE uses the custom **[TOODDAE No-Sale License v1.0](../LICENSE)**, not an OSI-approved open-source license.

- Personal and business use, modification, and free sharing are allowed.
- Selling the app or modified versions, paid hosting/SaaS, and paid bundles or access require separate written authorization.
- When sharing, include the license, preserve applicable notices, and identify modifications. Publishing modified source is not required.
- Independently created notes, tasks, and output are not covered merely because you use TOODDAE. Third-party material keeps its own license.

The English LICENSE is the controlling text; this section is a summary.
