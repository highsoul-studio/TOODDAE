// モーダル群: タスク/ルーティンの追加・編集、確認、セクション、接続状態。
// 画面は開くたびに作り直す (言語の切り替えにも追従し、前回の状態を引きずらない)。
import { t, escapeHtml as esc, dowIndex } from '/i18n.js';
import * as ui from '/ui.js';
import { get as apiGet, post as apiPost, prepareRootSwitch } from '/api.js';

const $ = (s) => document.querySelector(s);
const PRIOS = ['highest', 'high', 'medium', 'low', 'lowest'];
// 時刻: 14:00 (開始) / 12:00-12:15 (範囲) / 〜12:00 (終了だけ = 締切の時刻。タスク・ルーティン共通)。サーバの TIME_RE と同じ形で、本文のどこにあっても最初の 1 つを拾う。グループ 1,2 = 開始 / 3,4 = 範囲の終了 / 5,6 = 終了だけ
const ANY_TIME = /(?<![\w:/.=#])(?:([01]?\d|2[0-3]):([0-5]\d)(?:\s*[-–〜~～]\s*([01]?\d|2[0-3]):([0-5]\d))?|[〜~～]\s*([01]?\d|2[0-3]):([0-5]\d))(?![\d:])/;
const DATE_META = /(?:^|\s)([⏳🛫📅])\s+(\d{4}-\d{2}-\d{2})(?=\s|$)/gu;
const pad = (s) => s.padStart(5, '0');

// 保存先のファイル名ではなく、画面と同じ日付規則で追加後の表示位置を決める。
export function addedToastKey(raw, today) {
  const dates = {};
  for (const match of String(raw ?? '').matchAll(DATE_META)) dates[match[1]] = match[2];
  const start = dates['⏳'] ?? dates['🛫'];
  const due = dates['📅'];
  if (!start && !due) return 'toast.addedInbox';
  if (start && start > today) return 'toast.addedUpcoming';
  return (start ?? due) <= today || due <= today ? 'toast.addedToday' : 'toast.addedUpcoming';
}

// 本文中の最初の時刻 (一覧・Day line と同じ規則) は専用の欄に出し、保存時に先頭へ置く。
export function splitTime(text) {
  const m = text.match(ANY_TIME);
  if (!m) return { ts: '', te: '', rest: text };
  const rest = [text.slice(0, m.index).trimEnd(), text.slice(m.index + m[0].length).trimStart()].filter(Boolean).join(' ');
  if (m[5]) return { ts: '', te: pad(`${m[5]}:${m[6]}`), rest };
  return { ts: pad(`${m[1]}:${m[2]}`), te: m[3] ? pad(`${m[3]}:${m[4]}`) : '', rest };
}
const joinTime = (ts, te, text) => `${ts ? `${ts}${te ? `-${te}` : ''} ` : te ? `〜${te} ` : ''}${text}`;

// ダイアログ共通: 背景クリックで閉じる / Esc ではポップアップだけを先に閉じる
export function initDialogs() {
  for (const dlg of document.querySelectorAll('dialog')) {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg && !ui.popOpen()) dlg.close();
    });
    dlg.addEventListener('cancel', (e) => {
      if (ui.popOpen()) {
        e.preventDefault();
        ui.closePop(true);
      }
    });
    dlg.addEventListener('close', () => ui.closePop());
  }
}

// ---------- 確認 ----------
export function confirmDialog({ title, body, yes, danger = true }) {
  return new Promise((resolve) => {
    const dlg = $('#confirm');
    dlg.innerHTML = `<div class="form"><h2 id="confirm-h" data-testid="confirm-title">${esc(title)}</h2><p class="cf__body" data-testid="confirm-body">${esc(body)}</p>
      <div class="form__foot"><span class="grow"></span>
        <button type="button" class="btn btn--ghost" data-r="0" data-testid="confirm-no" autofocus>${esc(t('btn.back'))}</button>
        <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-r="1" data-testid="confirm-yes">${esc(yes)}</button></div></div>`;
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(v);
      if (dlg.open) dlg.close();
    };
    dlg.onclick = (e) => {
      const r = e.target.closest('[data-r]');
      if (r) finish(r.dataset.r === '1');
      else if (e.target === dlg) finish(false);
    };
    dlg.onclose = () => finish(false); // Esc など
    dlg.showModal();
  });
}

// ---------- タスク / ルーティンの追加・編集 ----------
export function itemDialog(ctx, { task = null, text = '' } = {}) {
  const S = ctx.S();
  const today = S.today;
  const dlg = $('#dlg');
  const edit = !!task;
  const from = task?.kind === 'routine' ? 'routine' : 'task';
  let kind = from;

  const lead = splitTime(task?.text ?? text);
  const memo0 = task?.memo ?? '';
  const rep0 = task?.repeat; // ルーティン: {type,...} / null = テンプレートに無い (今日だけ) / undefined = 該当なし
  const repType0 = from === 'routine' ? (rep0 === null ? 'once' : (rep0?.type ?? 'daily')) : 'daily';
  const init = {
    start: edit && from === 'task' ? (task.scheduled ?? task.start ?? task.date ?? '') : today,
    due: edit && from === 'task' ? (task.due ?? '') : today,
    prio: edit && from === 'task' ? (task.priority ?? '') : '',
    group: edit ? (task.group ?? '') : '',
    days: rep0?.days ?? [dowIndex(today) + 1], // 毎週を選んだときの初期値は今日の曜日
    dom: rep0?.dom ?? '1',
    until: rep0?.until ?? '', // 繰り返しの終了日 (空 = 続く)
  };
  const startKey = edit && from === 'task' && task.scheduled == null && task.start != null ? 'start' : 'scheduled';
  const routesToToday = (s, d) => (s ? s <= today : !!d && d <= today);

  dlg.innerHTML = `<form class="form form--item" novalidate>
    <h2 id="dlg-h" data-r="title" data-testid="dialog-title" tabindex="-1"></h2>
    <div class="item-grid"><div class="item-main">
      <div class="field"><label class="field__l" for="dlg-text">${esc(t('f.text'))}</label><input id="dlg-text" class="input" data-r="text" data-testid="field-text" maxlength="500" autocomplete="off"></div>
      <div class="form__row" data-row="dates"><div class="field"><span class="field__l">${esc(t('f.start'))}</span><div data-slot="start" data-testid="field-start"></div></div><div class="field"><span class="field__l">${esc(t('f.due'))}</span><div data-slot="due" data-testid="field-due"></div></div></div>
      <p class="hint" data-row="hintDates"></p>
      <div class="form__row"><div class="field"><span class="field__l">${esc(t('f.ts'))}</span><div data-slot="ts" data-testid="field-ts"></div></div><div class="field"><span class="field__l">${esc(t('f.te'))}</span><div data-slot="te" data-testid="field-te"></div></div></div>
      <p class="hint" data-row="hintTime" data-testid="hint-time"></p>
      <div class="field" data-row="prio"><span class="field__l">${esc(t('f.prio'))}</span><div data-slot="prio" data-testid="field-prio"></div></div>
      <div class="field" data-row="section"><span class="field__l">${esc(t('f.section'))}</span><div data-slot="section" data-testid="field-section"></div></div>
      <label class="check"><input type="checkbox" class="chk" data-r="routine" data-testid="field-routine"><span class="check__t"><b>${esc(t('f.routine'))}</b><small>${esc(t('f.routineHint'))}</small></span></label>
      <div class="field" data-row="repeat"><span class="field__l">${esc(t('f.repeat'))}</span><div data-slot="repeat" data-testid="field-repeat"></div></div>
      <div class="field" data-row="days"><span class="field__l">${esc(t('rp.days'))}</span><div data-slot="days" data-testid="field-days"></div></div>
      <div class="field" data-row="dom"><span class="field__l">${esc(t('rp.dom'))}</span><div data-slot="dom" data-testid="field-dom"></div></div>
      <div class="field" data-row="until"><span class="field__l">${esc(t('f.until'))}</span><div data-slot="until" data-testid="field-until"></div></div>
      <p class="hint" data-row="hintRepeat"></p>
    </div><div class="item-memo"><div class="field item-memo__field"><label class="field__l" for="dlg-memo">${esc(t('f.memo'))}</label><p class="hint">${esc(t('f.memoHint'))}</p><textarea id="dlg-memo" class="input input--area" data-r="memo" data-testid="field-memo" rows="3" placeholder="${esc(t('f.memoPh'))}"></textarea></div></div></div>
    <p class="form__err" role="alert" hidden></p>
    <div class="form__foot">
      <button type="button" class="btn btn--danger" data-act="cancelTask" data-testid="dialog-danger">${esc(t(from === 'routine' ? 'btn.deleteRoutine' : 'btn.cancelTask'))}</button><span class="grow"></span>
      <button type="button" class="btn btn--ghost" data-act="close" data-testid="dialog-close">${esc(t('btn.close'))}</button>
      <button type="submit" class="btn btn--primary" data-testid="dialog-submit">${esc(t(edit ? 'btn.save' : 'btn.add'))}</button>
    </div><small class="key-hint form__key-hint" data-testid="item-key-hint">${esc(t('key.itemSave'))}</small></form>`;

  const form = dlg.querySelector('form');
  let saving=false;
  const el = (r) => form.querySelector(`[data-r="${r}"]`);
  const row = (r) => form.querySelector(`[data-row="${r}"]`);
  const err = form.querySelector('.form__err');
  const showErr = (msg) => {
    err.hidden = !msg;
    err.textContent = msg ?? '';
  };

  const sectionOpts = () =>
    [{ value: '', label: t('section.none') }, ...(kind === 'routine' ? S.sections.routine : S.sections.tasks).map((n) => ({ value: n, label: n }))];
  const repOpts = [
    ...(from === 'routine' && rep0 === null ? [{ value: 'once', label: t('rp.once') }] : []),
    ...(from === 'routine' && rep0?.type === 'custom' ? [{ value: 'custom', label: t('rp.custom', { raw: rep0.raw }) }] : []),
    { value: 'daily', label: t('rp.daily') },
    { value: 'weekday', label: t('rp.weekday') },
    { value: 'weekly', label: t('rp.weekly') },
    { value: 'monthly', label: t('rp.monthly') },
  ];
  const domOpts = [
    ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: t('rp.domOpt', { d: i + 1 }) })),
    { value: 'last', label: t('rp.last') },
  ];

  const C = {
    ts: ui.timePicker({ label: t('f.ts'), value: lead.ts, onChange: () => showErr('') }),
    te: ui.timePicker({ label: t('f.te'), value: lead.te, onChange: () => showErr('') }),
    start: ui.datePicker({
      label: t('f.start'),
      value: init.start,
      today,
      onChange: (v) => {
        if (v && C.due.get() && C.due.get() < v) C.due.set(v); // 開始日を締切より後にしたら、締切も追従させる
        refresh();
      },
    }),
    due: ui.datePicker({ label: t('f.due'), value: init.due, today, onChange: refresh }),
    prio: ui.select({ label: t('f.prio'), value: init.prio, options: [{ value: '', label: t('prio.none') }, ...PRIOS.map((p) => ({ value: p, label: t(`prio.${p}`) }))] }),
    repeat: ui.select({ label: t('f.repeat'), value: repType0, options: repOpts, onChange: refresh }),
    days: ui.weekdayChips({ label: t('rp.days'), value: init.days }),
    dom: ui.select({ label: t('rp.dom'), value: String(init.dom), options: domOpts }),
    until: ui.datePicker({ label: t('f.until'), value: init.until, today }),
    section: ui.select({ label: t('f.section'), value: init.group, options: sectionOpts() }),
  };
  for (const [k, c] of Object.entries(C)) form.querySelector(`[data-slot="${k}"]`).append(c.el);
  el('text').value = lead.rest;
  el('memo').value = memo0;
  el('routine').checked = kind === 'routine';
  const initDays = new Set(init.days);

  function refresh() {
    const routine = kind === 'routine';
    const rtype = C.repeat.get();
    row('dates').hidden = routine;
    row('hintDates').hidden = routine;
    row('prio').hidden = routine;
    row('repeat').hidden = !routine;
    row('days').hidden = !routine || rtype !== 'weekly';
    row('dom').hidden = !routine || rtype !== 'monthly';
    row('until').hidden = !routine || rtype === 'once' || rtype === 'custom'; // 今日だけ / 解釈できない規則には付けない
    row('hintRepeat').hidden = !(routine || (edit && from === 'routine'));
    row('section').hidden = routine ? false : !(edit && from === 'task' ? task.date === today : routesToToday(C.start.get(), C.due.get()));
    form.querySelector('h2').textContent = t(routine ? (edit ? 'dlg.routineEdit' : 'dlg.routineAdd') : edit ? 'dlg.edit' : 'dlg.add');
    form.querySelector('[data-act="cancelTask"]').hidden = !edit;
    const hints = [];
    if (!routine) hints.push(t(edit ? 'hint.datesEdit' : 'hint.datesAdd'));
    if (!routine && edit && from === 'routine' && rep0) hints.push(t('hint.leave'));
    row('hintDates').textContent = hints.join(' ');
    row('hintTime').textContent = t(routine ? 'hint.timeRoutine' : 'hint.timeTask');
    const rh = [];
    if (routine) rh.push(t('hint.repeat'));
    if (routine && rtype === 'once') rh.push(t('hint.once'));
    if (routine && rtype !== 'once' && rtype !== 'custom') rh.push(t('hint.until'));
    row('hintRepeat').textContent = rh.join(' ');
  }
  el('routine').addEventListener('change', (e) => {
    kind = e.target.checked ? 'routine' : 'task';
    C.section.setOptions(sectionOpts()); // 項目の置き場所はパネルごとに別
    C.section.set(kind === from ? init.group : '');
    showErr('');
    refresh();
  });
  refresh();

  form.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') dlg.close();
    else if (act === 'cancelTask') {
      if (await ctx.cancelTask(task)) dlg.close();
    }
  });
  form.addEventListener('input', () => showErr(''));
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing && !e.repeat && !saving) {
      e.preventDefault();
      form.requestSubmit(); // ⌘/Ctrl+Enter で保存
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = el('text').value.replace(/\s+/g, ' ').trim();
    const ts = C.ts.get();
    const te = C.te.get();
    const routine = kind === 'routine';
    const start = C.start.get();
    const due = C.due.get();
    const rtype = C.repeat.get();
    const days = C.days.get();
    if (!content) return showErr(t('err.empty'));
    if (!routine && start && due && due < start) return showErr(t('err.dateOrder'));
    if (ts && te && te <= ts && !(start && due && due > start)) return showErr(t('err.timeOrder'));
    if (routine && rtype === 'weekly' && !days.length) return showErr(t('err.weekly'));

    // 時刻も本文も変えていなければ、元の本文のまま送る (時刻が文中にあっても並びを変えない)
    const untouched = edit && task && ts === lead.ts && te === lead.te && content === lead.rest.replace(/\s+/g, ' ').trim();
    const body = { to: kind, text: untouched ? task.text : joinTime(ts, te, content) };
    if (edit) Object.assign(body, { from, ref: { file: task.file, line: task.line, raw: task.raw } });
    const secVal = C.section.get();
    const secShown = !row('section').hidden;
    if (routine) {
      const until = C.until.get();
      const rep = rtype === 'custom' ? undefined : { type: rtype, days, dom: C.dom.get() === 'last' ? 'last' : Number(C.dom.get()), ...(until ? { until } : {}) };
      const repChanged = !edit || from !== 'routine' || rtype !== repType0 || (rtype === 'weekly' && days.join() !== [...initDays].sort().join()) || (rtype === 'monthly' && String(C.dom.get()) !== String(init.dom)) || until !== init.until;
      if (rep && repChanged) body.repeat = rep;
      if (secShown && (!edit || from !== 'routine' || secVal !== init.group)) body.section = secVal;
    } else if (!edit || from !== 'task') {
      Object.assign(body, { scheduled: start, due, priority: C.prio.get() });
      if (secShown) body.section = secVal;
    } else {
      if (start !== init.start) body[startKey] = start; // 既存の 🛫 / ⏳ の種類を保つ。変えていない欄は送らない
      if (due !== init.due) body.due = due;
      if (!start && !due && ('scheduled' in body || 'due' in body)) Object.assign(body, { scheduled: '', due: '' }); // 両方空 = 「いつでも」。片方だけ送ると、暗黙の開始日 (日次ノート) を消しても何も起きない
      if (C.prio.get() !== init.prio) body.priority = C.prio.get();
      if (secShown && secVal !== init.group) body.section = secVal;
    }
    // メモは変えたときだけ送る (Obsidian で書いた形のまま保つ)。ルーティンに繰り返しを付けるときは、テンプレートにも書けるよう一緒に送る
    const memo = el('memo').value;
    if (memo !== memo0 || (routine && body.repeat && memo.trim())) body.memo = memo;
    saving=true;form.querySelector('[data-testid="dialog-submit"]').disabled=true;
    // ルーティンを外す = テンプレートの定義も消える → 確認する
    if (edit && from === 'routine' && !routine && rep0) {
      const ok = await confirmDialog({ title: t('cf.leave.title'), body: t('cf.leave.body'), yes: t('btn.save') });
      if (!ok){saving=false;form.querySelector('[data-testid="dialog-submit"]').disabled=false;return;}
    }
    try {
      const r = await ctx.post('/api/save', body);
      dlg.close();
      const toastKey = edit ? 'toast.saved' : r.later ? 'toast.routineLater' : r.converted ? 'toast.converted' : routine ? 'toast.added' : addedToastKey(r.raw, today);
      ctx.toast(t(toastKey));
      if (!edit) ctx.clearQuick();
      ctx.load();
    } catch (err) {
      dlg.close();
      ctx.fail(err);
    } finally {
      saving=false;
      form.querySelector('[data-testid="dialog-submit"]')?.removeAttribute('disabled');
    }
  });

  dlg.showModal();
  form.querySelector('h2').focus({ preventScroll: true });
}

// ---------- セクションの追加・編集 ----------
export function sectionDialog(ctx, { panel, name = null }) {
  const S = ctx.S();
  const dlg = $('#sec');
  const edit = name != null;
  const count =
    panel === 'tasks'
      ? S.tasks.filter((x) => x.date === S.today && x.group === name).length
      : (S.routine.find((g) => g.group === name)?.items.length ?? 0);
  dlg.innerHTML = `<form class="form" novalidate>
    <h2 id="sec-h">${esc(t(edit ? 'sec.edit' : 'sec.add'))}</h2>
    <div class="field"><label class="field__l" for="sec-name">${esc(t('sec.name'))}</label><input id="sec-name" class="input" data-testid="section-name-input" maxlength="60" autocomplete="off"></div>
    <p class="hint">${esc(t(panel === 'tasks' ? 'sec.panelTasks' : 'sec.panelRoutine'))}</p>
    ${edit && count ? `<p class="hint">${esc(t('sec.hintDelete'))}</p>` : ''}
    <p class="form__err" role="alert" hidden></p>
    <div class="form__foot">
      ${edit ? `<button type="button" class="btn btn--danger" data-act="delete" data-testid="section-delete"${count ? ' disabled' : ''}>${esc(t('btn.delete'))}</button>` : ''}<span class="grow"></span>
      <button type="button" class="btn btn--ghost" data-act="close" data-testid="dialog-close">${esc(t('btn.close'))}</button>
      <button type="submit" class="btn btn--primary" data-testid="dialog-submit">${esc(t(edit ? 'btn.save' : 'btn.add'))}</button>
    </div></form>`;
  const form = dlg.querySelector('form');
  const input = form.querySelector('input');
  const err = form.querySelector('.form__err');
  input.value = name ?? '';
  input.addEventListener('input', () => (err.hidden = true));

  const run = async (body, toast) => {
    try {
      await ctx.post('/api/section', { panel, ...body });
      dlg.close();
      ctx.toast(t(toast));
      ctx.load();
    } catch (e) {
      err.hidden = false;
      err.textContent = ctx.errorText(e);
    }
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.replace(/\s+/g, ' ').trim();
    if (!v) {
      err.hidden = false;
      err.textContent = t('err.empty');
      return;
    }
    if (!edit) run({ op: 'add', name: v }, 'toast.sectionSaved');
    else if (v === name) dlg.close();
    else run({ op: 'rename', name, to: v }, 'toast.sectionSaved');
  });
  form.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') dlg.close();
    else if (act === 'delete') {
      const ok = await confirmDialog({ title: t('cf.section.title'), body: t('cf.section.body'), yes: t('btn.delete') });
      if (ok) run({ op: 'delete', name }, 'toast.sectionDeleted');
    }
  });
  dlg.showModal();
  input.focus();
  input.select();
}

// ---------- ローカルフォルダ接続 ----------
export async function statusDialog(ctx, { choose = false } = {}) {
  const dlg = $('#status');
  const icon = ui.icon;
  let busy = false;
  let pendingPath = null;
  const draw = async (note = '') => {
    const s = await apiGet('/api/status').catch(() => null);
    const live = ctx.live() && !!s?.ready;
    const name = s?.vault?.name ?? t('folder.none'),kind=['drive','local'].includes(s?.vault?.kind)?s.vault.kind:'unknown';
    ui.unmountMascots(dlg);
    dlg.innerHTML = `<div class="form"><div class="dlg-head"><h2 id="status-h">${esc(t('st.title'))}</h2><span class="dlg-head__mascot" data-testid="status-mascot" data-hs-state="${live ? 'default' : 'sleep'}" data-hs-assets="/assets/highsoul/layers" style="--hs-size:56px"></span></div>
      <p class="st__now"><i class="st__dot" data-s="${live ? 'live' : s ? 'retry' : 'lost'}"></i><b>${esc(note || t(live ? 'st.connected' : s ? 'st.retry' : 'st.lost'))}</b></p>
      <dl class="kv"><dt>${esc(t(`folder.kind.${kind}`))}</dt><dd class="folder-current"><button type="button" class="folder-link" data-act="reveal" data-testid="folder-reveal"${busy||!s?.ready?' disabled':''}>${esc(name)}${s?.vault?.readonly ? ` (${esc(t('sync.ro'))})` : ''}</button><button type="button" class="btn btn--ghost btn--sm" data-act="choose" data-testid="folder-edit"${busy ? ' disabled' : ''}>${icon('folder')}${esc(t('folder.edit'))}</button></dd></dl>
      <p class="folder-hint" data-testid="folder-hint">${esc(t('folder.renameHint'))}</p>
      ${s?.folderError ? `<p class="form__err" role="alert">${esc(t('folder.unavailable'))}</p>` : ''}
      ${pendingPath !== null ? `<label class="field"><span>${esc(t('folder.path'))}</span><input class="input" data-testid="folder-path" value="${esc(pendingPath)}" autocomplete="off"></label>` : ''}
      <div class="form__foot"><span class="grow"></span>
        <button type="button" class="btn btn--ghost" data-act="close" data-testid="dialog-close">${esc(t('btn.close'))}</button>
        ${pendingPath !== null ? `<button type="button" class="btn btn--primary" data-act="connect" data-testid="folder-connect"${busy ? ' disabled' : ''}>${esc(t('folder.connect'))}</button>` : `<button type="button" class="btn btn--primary" data-act="reconnect" data-testid="status-reconnect"${busy ? ' disabled' : ''}>${icon('refresh')}${esc(t('btn.reconnect'))}</button>`}</div></div>`;
    ui.mountMascots(dlg);
  };
  const chooseFolder = async () => {
    busy = true;
    await draw(t('folder.choosing'));
    try {
      const result = await apiPost('/api/folder/choose', {});
      if (!result.cancelled) pendingPath = result.path ?? '';
    } catch { pendingPath = ''; }
    busy = false;
    await draw();
  };
  const connectFolder = async () => {
    const path = dlg.querySelector('[data-testid="folder-path"]')?.value.trim();
    if (!path) return draw(t('folder.pathRequired'));
    busy = true;
    await draw(t('folder.switching'));
    const ready = await prepareRootSwitch();
    if (!ready.ok) { busy = false; return draw(t('folder.finishDrafts')); }
    try {
      await apiPost('/api/folder/connect', { path }, { allowRootChange: true });
      location.reload();
    } catch { busy = false; await draw(t('folder.failed')); }
  };
  dlg.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') dlg.close();
    else if (act === 'reconnect' && !busy) { ctx.reconnect(); ctx.load(); dlg.close(); }
    else if (act === 'choose' && !busy) chooseFolder();
    else if (act === 'connect' && !busy) connectFolder();
    else if (act === 'reveal' && !busy) apiPost('/api/runtime/reveal', {}).catch(()=>draw(t('folder.failed')));
  };
  await draw();
  if (!dlg.open) dlg.showModal();
  if (choose) chooseFolder();
}
