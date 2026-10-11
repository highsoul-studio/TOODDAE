# Worked examples

Names below (`Core`, `Errands`, `Water refill`, …) are placeholders; the real ones come from `dl.mjs state`. Run from `<root>` (the Dayline project folder).

## A. Move a routine group into today's tasks

Request: "the Core routines → today's tasks; the water refill is not a routine; keep the office cleaning as a routine, 11:00–12:00, until this Friday."
Plan shown and approved first. Sections `Core` / `Errands` already existed under "오늘 할 일" — that is why they were the destination. Script (re-reads state before every write):

```js
import { api, state, items, refOf, backup } from '<root>/scripts/dl.mjs';
const today = (await state()).today;
const fri = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7)); return d.toISOString().slice(0, 10); })();
console.log('backup →', backup(today, 'move-routines-to-tasks'));
const find = async (panel, text) => items(await state()).find((x) => x.panel === panel && x.text === text);
const toTask = async (text, section) => {
  const t = await find('routine', text);                       // re-read every time: line numbers shift
  await api('POST', '/api/save', { from: 'routine', to: 'task', ref: refOf(t), text, scheduled: today, due: today, section });
};
for (const text of ['Clarify the quarter goal', 'Clarify the weekly goal' /* …the other core routines… */]) await toTask(text, 'Core');
await toTask('Water refill', 'Errands');
await api('POST', '/api/section', { panel: 'routine', op: 'delete', name: 'Core (top-down)' });   // the routine section is empty now
const oc = await find('routine', 'Office cleaning');
await api('POST', '/api/save', { from: 'routine', to: 'routine', ref: refOf(oc), text: '11:00-12:00 Office cleaning', repeat: { type: 'daily', until: fri } });
```

Result: the tasks appear under `Core` (start = due = today); the routine definitions are gone from the template (not in tomorrow's note); the template line is `- [ ] 11:00-12:00 Office cleaning 🔁 every day until <friday>`; the day after the end date the note no longer has it; past notes are untouched.

## B. Other one-liners

```bash
node scripts/dl.mjs post /api/add '{"text":"Write estimate","scheduled":"2026-10-06","due":"2026-10-09","section":"Core","memo":"step 1\nstep 2"}'   # start ≤ today → today's note, in that section
# a start date after today (or no dates) goes to Inbox.md instead and "section" is ignored there
node scripts/dl.mjs find cleaning        # item + ref as JSON
node scripts/dl.mjs post /api/section '{"panel":"tasks","op":"add","name":"Personal"}'
node scripts/dl.mjs post /api/delete-routine '{"file":"Daily/2026-10-06.md","line":21,"raw":"- [ ] Cleaning","kind":"routine"}'
```

## C. Rehearsal on a copy

```bash
SP=$(mktemp -d); mkdir $SP/v && cp -R <vault>/Daily <vault>/Templates <vault>/Inbox.md $SP/v/
(PORT=4413 VAULT=$SP/v node server.js > /dev/null 2>&1 & echo $! > $SP/pid); sleep 1
PORT=4413 VAULT=$SP/v node scripts/dl.mjs state          # same helper, other target
PORT=4413 VAULT=$SP/v BACKUP_DIR=$SP/backups node my-plan.mjs     # the script imports dl.mjs, so it follows PORT/VAULT/BACKUP_DIR
diff -r <vault> $SP/v | head -60                         # what the plan would change
kill $(cat $SP/pid); rm -rf $SP                          # the rehearsal's backups went to $SP/backups — nothing else to clean
```
To see tomorrow/Friday/Saturday from the template: `import * as V from '<root>/lib/vault.js'; await V.ensureDaily('<copy>', '2026-10-10')` (creates the note in the copy only).

## D. Reading the room before asking

- `dl.mjs state` shows sections, so you can say "오늘 할 일에 `Core` 섹션이 이미 있어서 거기로 옮깁니다".
- If a request has two plausible readings ("이번주 금요일까지" = end date / weekly Friday / task due Friday), put them as options with the one you recommend first.
