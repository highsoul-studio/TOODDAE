// ダッシュボード本体。状態はサーバ (= vault の md) が持ち、ここは描画と操作の送信だけ。
// 注意: 多言語の t() と名前がぶつからないよう、タスクを指す変数は x / task を使う。
import { LANGS, getLang, setLang, t, h, escapeHtml as esc, weekdayShort, weekdayLong, monthDay, md } from '/i18n.js';
import * as ui from '/ui.js';
import { renderMarkdown } from '/markdown.js';
import {PROVIDER_INFO} from '/providers.js';
import { initDialogs, itemDialog, sectionDialog, confirmDialog, statusDialog, addedToastKey } from '/dialogs.js';
import { get, post, openEvents, registerRootGuard, prepareRootSwitch, runtime } from '/api.js';

const $ = (s, r = document) => r.querySelector(s);
const icon = ui.icon;
const toast = ui.toast;
// サーバ側 (lib/vault.js) の TIME_RE と同じ: 14:00 / 12:00-12:15 / 〜12:00 (終了だけ)
const TIME_SRC = '(?<![\\w:/.=#])(?:([01]?\\d|2[0-3]):([0-5]\\d)(?:\\s*[-–〜~～]\\s*([01]?\\d|2[0-3]):([0-5]\\d))?|[〜~～]\\s*([01]?\\d|2[0-3]):([0-5]\\d))(?![\\d:])';
const ONE_HOUR = 60;

let S = null; // 最新の状態
let seq = 0; // 古い応答で上書きしない
let intro = true; // 初回だけ Day line を演出
let live = false; // EventSource の接続状態
let lastOk = 0; // 最後に状態を取得できた時刻
let center = true; // Day line を now 中心にスクロールする (初回・幅変更時)
let animate = null; // 次の描画で取り消し線を引く/消す行
let holdUntil = 0; // この時刻までは再描画を待つ (取り消し線の途中で DOM を作り直さない)
let holdTimer = 0;
let es = null;
let progressFrame = 0;
const assistantCapable=runtime.capabilities?.assistant===true;
let assistantReady=false,assistantBusy=false,assistantEpoch=0,assistantRefresh=0,assistantAttempt=null,assistantContext='';

// ポインタを押している間は、保存通知 (SSE) や定期更新で DOM を作り直さない。押した要素が差し替わると、離したときに click が成立せず、
// 押したのに何も起きない (Obsidian の保存や、直前の操作の echo がちょうど押している間に届くと起きる)。離したあと、その click の処理が終わってから描く。
const PRESS_MAX = 3000; // 「離した」が届かないまま (ウィンドウの外で離した等) でも、描画を止めっぱなしにしない
let pressedAt = 0;
let repaint = false; // 押している間に描画が必要になった
const pressed = () => pressedAt > 0 && Date.now() - pressedAt < PRESS_MAX;
function paint() {
  if (pressed()) return void (repaint = true);
  repaint = false;
  render();
}
addEventListener('pointerdown', () => (pressedAt = Date.now()), true);
for (const type of ['pointerup', 'pointercancel']) {
  addEventListener(type, () => {
    pressedAt = 0;
    if (repaint) setTimeout(paint, 0); // click / change は pointerup の直後に同じタスクで届く。その後で描く
  }, true);
}
const showAll = { upcoming: false, inbox: false };
let sectionMode=null,sectionFrames={};
const byId = new Map();
const QUICK_PLACEHOLDERS = ['quick.ph1','quick.ph2','quick.ph3','quick.ph4','quick.ph5'];
let quickPlaceholderIndex = Math.floor(Math.random() * QUICK_PLACEHOLDERS.length);
const quickPlaceholder = () => t(QUICK_PLACEHOLDERS[quickPlaceholderIndex]);
const nextQuickPlaceholder = () => { quickPlaceholderIndex = (quickPlaceholderIndex + 1 + Math.floor(Math.random() * (QUICK_PLACEHOLDERS.length - 1))) % QUICK_PLACEHOLDERS.length; $('#quick-input').placeholder = quickPlaceholder(); };

// ---------- 日付 ----------
const addDays = (s, k) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
};
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const toMin = (x) => +x.slice(0, 2) * 60 + +x.slice(3);
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// 保存の送信中は、画面の状態を取り直さない。送信は 1 つずつ順に行い、各応答が返す最新の行 (raw) を次の送信が使う。
// 取り直して行を入れ替えると、次の送信が古い行を指して 409 になり、押した回数と保存が食い違う (素早い連打で起きた)。
const inflight = new Map(); // 行 id → 直前の送信 (サーバが返した最新の raw に解決する)
const idle = new Set(); // 送信が全部終わったら呼ぶもの
let writes = 0; // 保存の送信を始めた回数。状態の取得とすれ違った (取得の最中に送信が始まった) ら、その取得は古いので捨てる

async function load() {
  if (inflight.size) return void idle.add(load);
  const n = ++seq;
  const w = writes;
  try {
    const s = await get('/api/state');
    if (n !== seq) return;
    if (w !== writes) return void load(); // この取得より後に保存が始まった: 取得した行は古い。取り直す
    if (inflight.size) return void idle.add(load);
    S = s;
    lastOk = Date.now();
    const wait = holdUntil - Date.now();
    clearTimeout(holdTimer);
    if (wait > 0) holdTimer = setTimeout(paint, wait);
    else paint();
  } catch {
    paintSync();
  }
}

function connect() {
  es?.close();
  es = openEvents({ change: load, open: () => {
    live = true;
    paintSync();
    load();
  }, error: () => {
    live = false;
    paintSync();
  } });
}

function paintSync() {
  const el = $('#sync');
  const state = !live ? 'retry' : S?.vault.readonly ? 'ro' : 'live';
  el.dataset.state = state;
  const connected=S?.vault?.kind==='drive'?'sync.drive':S?.vault?.kind==='local'?'sync.live':'sync.folder';
  $('#sync-text').textContent = t(state === 'retry' ? 'sync.retry' : state === 'ro' ? 'sync.ro' : connected);
  el.title = t('sync.open');
}

const refOf = (x) => ({ file: x.file, line: x.line, raw: x.raw, kind: x.kind });

function errorText(err) {
  if (err.status === 409) return t('e.conflict');
  if (err.status === 403) return t('e.readonly');
  if (err.message === 'exists') return t('e.exists');
  if (err.message === 'not empty') return t('e.notEmpty');
  return t('e.server');
}
function fail(err) {
  toast(errorText(err));
  load();
}

// ---------- 本文の簡易レンダリング (必ずエスケープしてから HTML 化) ----------
// 見出し用に Markdown 記法を外した文字列 (時刻ピル・通知で使う)
const plain = (s) => s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '');

const INLINE_RE = new RegExp(
  [
    '(`[^`]+`)', // 1 code
    '(\\[\\[[^\\]]+\\]\\])', // 2 wikilink
    '(\\[[^\\]]+\\]\\(https?://[^\\s)]+\\))', // 3 md link
    '(https?://[^\\s<>)]+)', // 4 url
    '(\\*\\*[^*]+\\*\\*)', // 5 bold
    '((?<=^|\\s)#[^\\s#]+)', // 6 tag
    `(${TIME_SRC})`, // 7 time
  ].join('|'),
  'g',
);
function inline(text, { time = true } = {}) {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    out += esc(text.slice(last, m.index));
    const s = m[0];
    if (m[1]) out += `<code>${esc(s.slice(1, -1))}</code>`;
    else if (m[2]) {
      const [note, alias] = s.slice(2, -2).split('|');
      out += `<a href="obsidian://open?vault=${encodeURIComponent(S.vault.name)}&amp;file=${encodeURIComponent(note.split('#')[0])}">${esc(alias || note)}</a>`;
    } else if (m[3]) {
      const k = s.indexOf('](');
      out += `<a href="${esc(s.slice(k + 2, -1))}" target="_blank" rel="noopener noreferrer">${esc(s.slice(1, k))}</a>`;
    } else if (m[4]) {
      const short = s.replace(/^https?:\/\//, '');
      out += `<a href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(short.length > 34 ? `${short.slice(0, 33)}…` : short)}</a>`;
    } else if (m[5]) out += `<strong>${esc(s.slice(2, -2))}</strong>`;
    else if (m[6]) out += `<span class="tag">${esc(s)}</span>`;
    else out += time ? `<span class="t-time">${esc(s)}</span>` : esc(s);
    last = m.index + s.length;
  }
  return out + esc(text.slice(last));
}

// ---------- 行 ----------
function repeatLabel(r) {
  if (!r) return '';
  let s;
  if (r.type === 'daily') s = r.until ? t('rp.daily') : ''; // 毎日はラベルなし。終了日があるときだけ「毎日 〜10/09」
  else if (r.type === 'weekday') s = t('rep.weekday');
  else if (r.type === 'weekly') s = t('rep.weekly', { days: r.days.map((d) => weekdayShort(d - 1)).join(t('sep.days')) });
  else if (r.type === 'monthly') s = r.dom === 'last' ? t('rep.monthlyLast') : t('rep.monthly', { d: r.dom });
  else return t('rep.custom');
  return r.until ? `${s} ${t('rep.until', { d: md(r.until) })}` : s;
}

// opts.routine: ルーティン行 / opts.defer: 締切を 1 日延ばす / opts.today: 今日へ移す / opts.groupDate: 日付見出しと同じ締切チップを省く
function row(x, { routine = false, defer = true, today = false, groupDate = null } = {}) {
  byId.set(x.id, x);
  const dom = `tx-${x.id.replace(/[^\w-]/g, '_')}`;
  const chips = [];
  if (x.overdue) chips.push(`<span class="chip chip--over">${icon('calendar')}${esc(t('chip.over', { d: md(x.due) }))}</span>`);
  else if (x.carry > 0) chips.push(`<span class="chip chip--carry">${esc(t('chip.carry', { n: x.carry }))}</span>`);
  if (x.priority) chips.push(`<span class="chip ${x.priority === 'high' || x.priority === 'highest' ? 'chip--prio' : ''}">${icon('flag')}${esc(t(`prio.${x.priority}`))}</span>`);
  const startDate = x.scheduled ?? x.start;
  if (startDate) chips.push(`<span class="chip">${icon('calendar')}${esc(t('chip.start', { d: md(startDate) }))}</span>`);
  if (x.due && x.due !== S.today && x.due !== groupDate && !x.overdue) chips.push(`<span class="chip">${icon('calendar')}${esc(t('chip.due', { d: md(x.due) }))}</span>`);
  if (routine) {
    const label = x.repeat === null ? t('rp.once') : repeatLabel(x.repeat);
    if (label) chips.push(`<span class="chip">${icon('repeat')}${esc(label)}</span>`);
  } else if (x.recurrence) chips.push(`<span class="chip">${icon('repeat')}${esc(x.recurrence)}</span>`);
  if (!x.date && x.file !== 'Inbox.md') {
    const name = x.file.replace(/\.md$/, '').split('/').pop();
    chips.push(`<a class="chip" href="obsidian://open?vault=${encodeURIComponent(S.vault.name)}&amp;file=${encodeURIComponent(x.file)}">${esc(name)}</a>`);
  }
  const ro = S.vault.readonly;
  const btn = (act, label, ic) => `<button type="button" class="icon-btn" data-act="${act}" data-testid="task-${act}" aria-label="${esc(label)}" title="${esc(label)}">${icon(ic)}</button>`;
  const acts = ro
    ? ''
    : `${!routine && !x.done && today ? btn('today', t('act.today'), 'calendar') : ''}${!routine && !x.done && defer ? btn('tomorrow', t('act.defer'), 'skip') : ''}${btn('edit', t('act.edit'), 'pencil')}${btn('cancel', t(routine ? 'act.deleteRoutine' : 'act.cancel'), 'x')}`;
  // 1行目 = チェックボックス・タイトル・操作 (チェックはタイトルの上下中央)。メモとチップは2行目に置くので、あっても1行目は動かない
  const memo = x.memo ? `<div class="task__memo" data-testid="task-memo">${inline(x.memo, { time: false })}</div>` : '';
  const sub = memo || chips.length ? `<div class="task__sub" data-testid="task-sub">${memo}${chips.length ? `<div class="task__meta">${chips.join('')}</div>` : ''}</div>` : '';
  return `<li class="task${x.done ? ' is-done' : ''}${animate?.id === x.id && !animate.done ? ' is-unchecking' : ''}" data-testid="task" data-id="${esc(x.id)}">
    <input class="chk" type="checkbox" data-act="toggle" data-testid="task-check" aria-labelledby="${dom}"${x.done ? ' checked' : ''}${ro ? ' disabled' : ''}>
    <div class="task__text" data-testid="task-title" id="${dom}"><span class="strike">${inline(x.text)}</span></div>
    <div class="task__act">${acts}</div>${sub}
  </li>`;
}

const counts = () => {
  const c = (l) => [l.filter((x) => x.done).length, l.length];
  return { t: c(S.tasks), r: c(S.routine.flatMap((g) => g.items)) };
};

// ---------- 描画 ----------
function render() {
  const a = document.activeElement?.closest?.('[data-id]');
  const keep = a ? [a.dataset.id, document.activeElement.dataset.act] : null;
  byId.clear();

  const ro = S.vault.readonly;
  $('#quick-input').disabled = ro;
  $('#quick-more').disabled = ro;
  $('#quick-input').placeholder = ro ? t('quick.readonly') : quickPlaceholder();
  $('#folder-name').textContent = S.vault.name;
  $('#folder').title = t('folder.reveal');
  $('#lang').title = `${t('lang.label')} (${shortcutLabel('U')})`;
  paintSync();

  renderHero();
  renderTasks();
  renderRoutine();
  renderSide();

  if (keep) ($(`[data-id="${CSS.escape(keep[0])}"][data-act="${keep[1]}"]`) ?? $(`[data-id="${CSS.escape(keep[0])}"] [data-act="${keep[1]}"]`))?.focus();
  if (animate) {
    replayStrike(animate);
    animate = null;
  }
}

// 描画は DOM を作り直すので、完了にした行だけ「線なし」の状態へ一瞬戻してから、取り消し線を左から引かせる
function replayStrike(change) {
  const { id, done } = change;
  if (!done) return; // uncheck は新しい row の CSS keyframes が 100%→0% を担う
  const li = $(`li[data-id="${CSS.escape(id)}"]`); // 時刻付きは Day line のピルも同じ data-id を持つ。一覧の行だけを指す
  const parts = li ? [$('.task__text', li), $('.strike', li)] : [];
  for (const p of parts) p?.classList.add('is-reset');
  void li?.offsetWidth; // 強制リフロー: 線なしの状態を確定させる
  for (const p of parts) p?.classList.remove('is-reset');
}

function renderHero() {
  const c = counts();
  const [done,total] = S.progress?.total ?? [c.t[0] + c.r[0],c.t[1] + c.r[1]];
  const ratio=total?done/total:0,oldBar=$('[data-testid="progress-bar"]'),oldFill=oldBar?.querySelector('.ticks__fill'),oldGap=oldBar?.querySelector('.ticks__gaps i'),oldWidth=oldBar?.clientWidth||0;
  const previous=oldWidth?Math.max(0,Math.min(1,oldFill.getBoundingClientRect().width/oldWidth)):ratio,wasComplete=oldBar?.classList.contains('is-complete')??(total>0&&done===total),matrix=oldGap?getComputedStyle(oldGap).transform:'none',previousGap=oldGap&&matrix!=='none'?Math.max(0,Math.min(1,Number(matrix.slice(7,-1).split(',')[0])||0)):(wasComplete?0:1),segments=Math.min(total,40);
  const gaps=Array.from({length:Math.max(0,segments-1)},(_,index)=>`<i style="--gap:${index+1};transform:scaleX(${previousGap})"></i>`).join('');
  cancelAnimationFrame(progressFrame);
  $('#hero').classList.toggle('is-intro', intro);
  const scrolled = $('#dl-wrap')?.scrollLeft ?? 0; // 再描画しても Day line のスクロール位置を保つ
  ui.unmountMascots($('#hero'));
  $('#hero').innerHTML = `
    <div class="hero__row">
      <div class="hero__date"><h1>${esc(monthDay(S.today))}</h1><span>${esc(weekdayLong(S.today))}</span></div>
      <div class="progress">
        <div class="progress__row">
          ${assistantCapable?`<button type="button" class="btn btn--ai assistant-launch" data-testid="assistant-launch">${ui.mascot()}${esc(t('assistant.open'))}</button>`:''}
          <span class="progress__num" data-testid="progress">${done}<small>/${total} ${esc(t('hero.done'))}</small></span>
          ${S.progress?.earlyCompleted?`<span class="progress__early" data-testid="early-completed">${esc(t('hero.early',{n:S.progress.earlyCompleted}))}</span>`:''}
          ${S.streak > 0 ? `<span class="progress__streak">${icon('flame')}${esc(t('hero.streak', { n: S.streak }))}</span>` : ''}
        </div>
        ${total ? `<div class="ticks${wasComplete?' is-complete':''}" data-testid="progress-bar" role="img" aria-label="${esc(t('hero.ticks', { done, total }))}" data-done="${done}" data-total="${total}" style="--progress:${previous};--segments:${segments};--gap-delay:${oldBar&&wasComplete?'0ms':'var(--t-strike)'}"><i class="ticks__fill"></i><span class="ticks__gaps" aria-hidden="true">${gaps}</span></div>` : ''}
        ${assistantCapable?`<a class="assistant-setup" data-testid="assistant-setup" href="#/set">${esc(t('assistant.setup'))}</a>`:''}
      </div>
    </div>
    <div class="dayline-wrap" id="dl-wrap" role="group" aria-label="${esc(t('dayline.aria'))}"></div>`;
  ui.mountMascots($('#hero'));
  if(assistantCapable){$('#hero [data-testid="assistant-launch"]').onclick=openAssistant;paintAssistant();}
  const bar=$('[data-testid="progress-bar"]');if(bar){void bar.offsetWidth;progressFrame=requestAnimationFrame(()=>{bar.style.setProperty('--progress',String(ratio));bar.classList.toggle('is-complete',total>0&&done===total);for(const gap of bar.querySelectorAll('.ticks__gaps i'))gap.style.removeProperty('transform');});}
  renderDayline();
  $('#dl-wrap').scrollLeft = scrolled;
  if (intro) {
    intro = false;
    setTimeout(() => $('#hero').classList.remove('is-intro'), 2600);
  }
}

const assistantButtons=()=>[$('[data-testid="assistant-launch"]'),document.querySelector('[data-testid="assistant-run"]')].filter(Boolean);
function paintAssistant(){if(!assistantCapable)return;const button=$('[data-testid="assistant-launch"]'),hint=$('[data-testid="assistant-setup"]'),detail=assistantContext?` ${assistantContext}`:'';for(const control of assistantButtons())ui.restMascot(control,assistantBusy);if(button){button.disabled=assistantBusy||!assistantReady||!!S?.vault.readonly;button.title=assistantReady?assistantContext||t('assistant.open'):t('assistant.setup')+detail;}if(hint){hint.hidden=assistantReady;hint.textContent=t('assistant.setup')+detail;}}
async function refreshAssistantReady(){if(!assistantCapable)return;const ticket=++assistantRefresh;try{const data=await get('/api/settings');if(ticket!==assistantRefresh)return;assistantReady=!!data.assistantReady;const provider=data.settings?.ai?.provider,mode=data.settings?.ai?.authModes?.[provider]??'apikey',account=data.subscriptions?.[provider]?.accounts?.find(item=>item.active)?.label||data.subscriptions?.[provider]?.label||'';assistantContext=[PROVIDER_INFO[provider]?.label,t(mode==='chatgpt'?'auth.chatgpt':mode==='claudeCode'?'auth.claude':'auth.apiKey'),account].filter(Boolean).join(' · ');}catch{assistantReady=false;assistantContext='';}paintAssistant();}
const assistantErrorKey=code=>code==='read-only'?'assistant.error.readonly':['test-required','no-consent','settings-changed','readonly'].includes(code)?`assistant.error.${code}`:'assistant.error';
function assistantDestination(value){if(typeof value==='string')return ['tasks','routine'].includes(value)?t(value==='routine'?'routine.title':'tasks.title'):value;if(!value||typeof value!=='object')return'';const panel=value.panel?t(value.panel==='routine'?'routine.title':'tasks.title'):'',bucket=value.bucket?t(`assistant.destination.${value.bucket}`):'',later=value.later?t('assistant.destination.later'):'';return[panel,value.section,bucket,value.date,later].filter(Boolean).join(' · ');}
function renderAssistantResult(dialog,data){const box=dialog.querySelector('[data-testid="assistant-result"]');box.replaceChildren();const count=data.results?.length??0,key=data.status==='completed'&&count?'assistant.completed':data.status==='completed'&&data.noops?'assistant.unchanged':data.status==='partial'?'assistant.partial':data.status==='needs-input'?'assistant.needsInput':'assistant.failed',heading=document.createElement('strong');heading.textContent=t(key,{n:count});box.append(heading);if(count){const lines=data.results.map(result=>{const created=result.created??{},name=created.text??created.name??'',where=created.file??created.panel??'';return `- ${result.action?t(`assistant.action.${result.action}`):t(`assistant.tool.${result.tool}`)}${result.action?` · ${t(`assistant.tool.${result.tool}`)}`:''}: ${name}${assistantDestination(result.destination)?` · ${assistantDestination(result.destination)}`:where?` · ${assistantDestination(where)}`:''}`.replace(/\s*\r?\n\s*/g,' ');});const list=document.createElement('div');list.className='markdown';list.innerHTML=renderMarkdown(lines.join('\n'));box.append(list);}if(data.message){const message=document.createElement('div');message.className='markdown';message.innerHTML=renderMarkdown(data.message);box.append(message);}if(data.status==='partial'&&data.error?.changedFiles?.length){const changed=document.createElement('p');changed.textContent=t('assistant.changedFiles',{files:data.error.changedFiles.join(', ')});box.append(changed);}for(const control of assistantButtons())ui.flashMascot(control,data.status==='completed'?'success':data.status==='needs-input'?'question':'notice');if(data.error?.code){const error=document.createElement('p');error.textContent=t(assistantErrorKey(data.error.code));box.append(error);}box.hidden=false;if(count||data.status==='partial'&&data.error?.changedFiles?.length)load();}
function openAssistant(){if(!assistantCapable||assistantBusy||!assistantReady)return;const ticket=++assistantEpoch,dialog=document.createElement('dialog');dialog.className='assistant-dialog';dialog.dataset.testid='assistant-dialog';dialog.setAttribute('aria-labelledby','assistant-title');dialog.innerHTML=`<form class="form"><h2 id="assistant-title" data-i18n="assistant.title">${esc(t('assistant.title'))}</h2><p class="cf__body" data-i18n="assistant.body">${esc(t('assistant.body'))}</p><label class="field"><span data-i18n="assistant.request">${esc(t('assistant.request'))}</span><textarea class="assistant-input" data-testid="assistant-message" data-i18n-aria="assistant.request" aria-label="${esc(t('assistant.request'))}" maxlength="4000"></textarea></label><div class="assistant-result" data-testid="assistant-result" role="status" aria-live="polite" hidden></div><div class="form__foot"><button type="button" class="btn btn--ghost" data-testid="assistant-cancel" data-i18n="write.cancel">${esc(t('write.cancel'))}</button><span class="grow"></span><button type="submit" class="btn btn--ai" data-testid="assistant-run" data-i18n="assistant.run" disabled>${ui.mascot()}<span>${esc(t('assistant.run'))}</span></button></div><small class="key-hint form__key-hint" data-testid="assistant-key-hint">${esc(t('key.assistantRun'))}</small></form>`;document.body.append(dialog);ui.mountMascots(dialog);const form=dialog.querySelector('form'),input=dialog.querySelector('[data-testid="assistant-message"]'),run=dialog.querySelector('[data-testid="assistant-run"]'),cancel=dialog.querySelector('[data-testid="assistant-cancel"]');input.oninput=()=>{run.disabled=assistantBusy||!input.value.trim();};input.onkeydown=event=>{if(!event.isComposing&&!event.repeat&&(event.metaKey||event.ctrlKey)&&event.key==='Enter'&&input.value.trim()&&!assistantBusy){event.preventDefault();form.requestSubmit();}};const close=()=>{if(assistantBusy)return;assistantEpoch++;ui.unmountMascots(dialog);dialog.close();dialog.remove();};cancel.onclick=close;dialog.oncancel=event=>{if(assistantBusy)event.preventDefault();else close();};form.onsubmit=async event=>{event.preventDefault();const message=input.value.trim();if(!message||assistantBusy||!assistantReady)return;assistantBusy=true;dialog.setAttribute('aria-busy','true');paintAssistant();run.disabled=true;cancel.disabled=true;const request=assistantAttempt?.message===message?assistantAttempt:{message,id:crypto.randomUUID()};assistantAttempt=request;const result=dialog.querySelector('[data-testid="assistant-result"]');result.hidden=false;result.textContent=t('assistant.running');try{const data=await post('/api/assistant/run',{message,requestId:request.id});if(ticket!==assistantEpoch||!dialog.isConnected)return;assistantAttempt=null;renderAssistantResult(dialog,data);input.value='';}catch(error){if(ticket!==assistantEpoch||!dialog.isConnected)return;if(error.status)assistantAttempt=null;result.textContent=t(assistantErrorKey(error.code??error.message));}finally{if(ticket===assistantEpoch&&dialog.isConnected){assistantBusy=false;dialog.removeAttribute('aria-busy');paintAssistant();cancel.disabled=false;run.disabled=!input.value.trim();refreshAssistantReady();}}};dialog.showModal();input.focus();}

function renderDayline() {
  const wrap = $('#dl-wrap');
  if (!wrap || !S) return;
  const previous=new Map([...wrap.querySelectorAll('.dl-item[data-id]')].map(item=>{const line=item.querySelector('.dl-strike-line'),matrix=line?getComputedStyle(line).transform:'none',filter=getComputedStyle(item).filter,opacity=filter==='none'?1:Number.parseFloat(filter.match(/opacity\(([^)]+)/)?.[1]??1),strike=matrix==='none'?0:Number(matrix.slice(7,-1).split(',')[0])||0;return[item.dataset.id,{opacity,strike}];}));
  const W = Math.max(720, wrap.clientWidth - 32);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // 開始が無い (〜12:00) 項目は、終了の 1 時間前から終了までを占めるものとして並べる (題名が読めるだけの幅を取るため)
  const raw = S.timeline.map((x) => {
    const time = x.segment ?? x.time;
    if (!time.start) return { x, a: Math.max(0, toMin(time.end) - ONE_HOUR), b: toMin(time.end), endOnly: true };
    return { x, a: toMin(time.start), b: time.end ? toMin(time.end) : toMin(time.start) + 30, time };
  });

  let lo = 7 * 60;
  let hi = 22 * 60;
  for (const i of raw) {
    lo = Math.min(lo, Math.floor(i.a / 60) * 60);
    hi = Math.max(hi, Math.ceil(i.b / 60) * 60);
  }
  lo = Math.min(lo, Math.floor(nowMin / 60) * 60);
  hi = Math.max(hi, Math.min(24 * 60, Math.ceil((nowMin + 30) / 60) * 60));
  const px = W / (hi - lo);
  const pct = (m) => `${(((m - lo) / (hi - lo)) * 100).toFixed(2)}%`;

  // 幅と左端 (px) は、題名の長さ (概算) と時間の幅から決める。終了だけの項目は右端を終了時刻に揃える (左は軸の端まで)
  const items = raw
    .map((i) => {
      const title = plain(i.x.text.replace(new RegExp(TIME_SRC), '')).replace(/^[\s:：\-–]+/, '').trim() || plain(i.x.text);
      const est = (i.endOnly ? 90 : 70) + [...title].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 13 : /[A-Z]/.test(ch) ? 9.5 : 7), 0); // 余白・時刻の分 + 文字幅 (全角 13 / 大文字 9.5 / ほか 7)。「〜12:00」は全角の 〜 のぶん広い
      const span = (i.b - i.a) * px;
      const clipped = i.x.segment?.startedPrevious || i.x.segment?.continuesNext;
      const w = Math.round(clipped ? Math.max(1, span) : Math.max(110, Math.min(260, est), span));
      const left = i.endOnly ? Math.max(0, (i.b - lo) * px - w) : (i.a - lo) * px;
      return { ...i, title, w, left };
    })
    .sort((p, q) => p.left - q.left);

  // 重ならないよう段に振り分ける
  const ends = [];
  const next = items.find((i) => !i.x.done && i.b >= nowMin);
  const pills = items.map((i, n) => {
    let lane = ends.findIndex((e) => e + 8 <= i.left);
    if (lane < 0) lane = ends.push(0) - 1;
    ends[lane] = i.left + i.w;
    const when = i.endOnly ? `〜${i.x.segment?.end ?? i.x.time.end}` : (i.time?.start ?? i.x.time.start); // 終了だけのときは、終了の時刻だけを出す
    const edges = `${i.x.segment?.startedPrevious ? `<small class="dl-item__edge">${esc(t('dayline.startedPrevious'))}</small>` : ''}${i.x.segment?.continuesNext ? `<small class="dl-item__edge">${esc(t('dayline.continuesNext'))}</small>` : ''}`;
    const place = i.endOnly ? `left:max(0px, calc(${pct(i.b)} - ${i.w}px))` : `left:${pct(i.a)}`; // 終了だけ: 右端 = 終了の位置
    const from=previous.get(i.x.id)??{opacity:i.x.done ? .45 : 1,strike:i.x.done?100:0};
    return `<button type="button" class="dl-item${i.x.done ? ' is-done' : ''}${i === next ? ' is-next' : ''}${i.endOnly ? ' is-until' : ''}" data-testid="day-pill" ${S.vault.readonly ? '' : 'data-act="edit" '}data-id="${esc(i.x.id)}" style="${place};width:${i.w}px;bottom:${40 + lane * 34}px;--i:${n};filter:opacity(${from.opacity})" title="${esc(plain(i.x.text))}"><time>${when}</time><span class="dl-strike">${esc(i.title)}<i class="dl-strike-line" aria-hidden="true" style="transform:scaleX(${from.strike})"></i></span>${edges}</button>`;
  });

  const step = px * 60 >= 44 ? 60 : 120;
  let ticks = '';
  for (let m = Math.ceil(lo / step) * step; m <= hi; m += step) {
    ticks += `<i class="dayline__tick" style="left:${pct(m)}"></i><span class="dayline__label" style="left:${pct(m)}">${m / 60}</span>`;
  }
  const inRange = nowMin >= lo && nowMin <= hi;
  if (inRange && center) {
    center = false;
    requestAnimationFrame(() => (wrap.scrollLeft = ((nowMin - lo) / (hi - lo)) * wrap.scrollWidth - wrap.clientWidth / 2));
  }
  wrap.innerHTML = `<div class="dayline" style="--lanes:${Math.max(1, ends.length)}">
    <div class="dayline__rail"></div>
    ${inRange ? `<div class="dayline__elapsed" style="width:${pct(nowMin)}"></div>` : ''}
    ${ticks}
    ${items.length ? pills.join('') : `<div class="dayline__hint">${h('dayline.hint')}</div>`}
    ${inRange ? `<div class="dayline__now" style="left:${pct(nowMin)}"><b>${hhmm(nowMin)}</b></div>` : ''}
  </div>`;
  void wrap.offsetWidth;const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:560;for(const item of wrap.querySelectorAll('.dl-item')){const done=item.classList.contains('is-done'),line=item.querySelector('.dl-strike-line'),opacity=done ? .45 : 1,scale=done?1:0,filter=`opacity(${opacity})`,transform=`scaleX(${scale})`;if(!duration){item.style.filter=filter;line.style.transform=transform;continue;}const fade=item.animate([{filter:getComputedStyle(item).filter},{filter}],{duration,easing:'cubic-bezier(.5,0,.2,1)',fill:'forwards'}),strike=line.animate([{transform:getComputedStyle(line).transform},{transform}],{duration,easing:'cubic-bezier(.5,0,.2,1)',fill:'forwards'});fade.finished.then(()=>{if(item.isConnected){item.style.filter=filter;fade.cancel();}}).catch(()=>{});strike.finished.then(()=>{if(line.isConnected){line.style.transform=transform;strike.cancel();}}).catch(()=>{});}
}

// 見出しなし (先頭) + セクションごとのまとまり。空のセクションも出す。
function blocks(items, names, groupOf) {
  const out = [{ name: '', items: [] }, ...names.map((n) => ({ name: n, items: [] }))];
  for (const x of items) {
    const g = groupOf(x);
    let b = g ? out.find((o) => o.name === g) : out[0];
    if (!b) out.push((b = { name: g, items: [] }));
    b.items.push(x);
  }
  return out;
}

function sectionBlock(panel, b, opts, previous) {
  const done = b.items.filter((x) => x.done).length;
  const total = b.items.length;
  const edit = S.vault.readonly
    ? ''
    : `<button type="button" class="icon-btn" data-act="section-edit" data-testid="section-edit" data-panel="${panel}" data-name="${esc(b.name)}" aria-label="${esc(t('section.edit'))}" title="${esc(t('section.edit'))}">${icon('pencil')}</button>`;
  const target=total?done/total:0;
  return `<div class="rgroup" data-testid="section" data-section-name="${esc(b.name)}"><div class="rgroup__head"><span class="rgroup__name" data-testid="section-name">${esc(b.name)}</span><span class="rgroup__bar" data-target="${target}" style="--v:${(previous??target)*100}%"><i></i></span><span class="count">${done}/${total}</span>${edit}</div>
    ${total ? `<ul class="tasks">${b.items.map((x) => row(x, opts)).join('')}</ul>` : `<div class="empty empty--sm">${esc(t('section.empty'))}</div>`}</div>`;
}

const addSectionBtn = (panel) =>
  S.vault.readonly ? '' : `<button type="button" class="btn btn--ghost btn--sm" data-act="section-add" data-testid="section-add" data-panel="${panel}">${icon('plus')}<span>${esc(t('section.add'))}</span></button>`;
const orderSectionBtn=panel=>{const state=S.sectionOrder?.[panel];return S.vault.readonly||state?.error||!state?.order?.length?'':`<button type="button" class="icon-btn" data-act="section-order" data-testid="section-order" data-panel="${panel}" aria-label="${esc(t('section.order'))}" title="${esc(t('section.order'))}">${icon('sort')}</button>`;};
function sectionRatios(container){return new Map([...container.querySelectorAll('[data-section-name]')].map(section=>{const bar=section.querySelector('.rgroup__bar'),width=bar?.clientWidth||0,fill=bar?.querySelector('i')?.getBoundingClientRect().width||0;return[section.dataset.sectionName,width?fill/width:0];}));}
function animateSectionBars(container){cancelAnimationFrame(sectionFrames[container.id]);sectionFrames[container.id]=requestAnimationFrame(()=>{for(const bar of container.querySelectorAll('.rgroup__bar[data-target]'))bar.style.setProperty('--v',`${Number(bar.dataset.target)*100}%`);});}
function reconcileSectionMode(panel){if(sectionMode?.panel!==panel)return;const state=S.sectionOrder?.[panel];if(!state||state.error)return void(sectionMode=null);if(state.base.daily!==sectionMode.base.daily||state.base.template!==sectionMode.base.template)sectionMode.stale=true;}
function sectionOrderView(panel){reconcileSectionMode(panel);const mode=sectionMode?.panel===panel?sectionMode:null,order=mode?.order??[],busy=!!mode?.busy;return `<div class="section-order" data-testid="section-order-list" data-panel="${panel}">${order.map((name,index)=>`<div class="section-order__row" ${busy?'':'draggable="true"'} data-testid="section-order-row" data-name="${esc(name)}"><button type="button" class="section-order__handle" data-testid="section-order-handle" aria-label="${esc(t('section.move',{name}))}" title="${esc(t('section.move',{name}))}" ${busy?'disabled':''}>${icon('grip')}</button><strong>${esc(name)}</strong><button type="button" class="icon-btn" data-order-move="up" ${busy||!index?'disabled':''} aria-label="${esc(t('section.up'))}">↑</button><button type="button" class="icon-btn" data-order-move="down" ${busy||index>=order.length-1?'disabled':''} aria-label="${esc(t('section.down'))}">↓</button></div>`).join('')}<div class="section-order__actions"><button type="button" class="btn btn--ghost" data-act="section-order-cancel" data-testid="section-order-cancel" ${busy?'disabled':''}>${esc(t('write.cancel'))}</button><button type="button" class="btn btn--primary" data-act="section-order-save" data-testid="section-order-save" ${busy?'disabled':''}>${esc(t('write.save'))}</button></div></div>`;}
function moveSection(name,delta){if(!sectionMode||sectionMode.busy)return;const index=sectionMode.order.indexOf(name),next=index+delta;if(index<0||next<0||next>=sectionMode.order.length)return;[sectionMode.order[index],sectionMode.order[next]]=[sectionMode.order[next],sectionMode.order[index]];sectionMode.panel==='tasks'?renderTasks():renderRoutine();requestAnimationFrame(()=>document.querySelector(`[data-name="${CSS.escape(name)}"] [data-testid="section-order-handle"]`)?.focus());}
function wireSectionOrder(panel){const container=$(panel==='tasks'?'#tasks':'#routine'),view=container.querySelector('[data-testid="section-order-list"]');if(!view)return;let dragged='';for(const row of view.querySelectorAll('[data-testid="section-order-row"]')){row.ondragstart=event=>{if(sectionMode?.busy)return event.preventDefault();dragged=row.dataset.name;event.dataTransfer?.setData('text/plain',dragged);};row.ondragover=event=>{if(!sectionMode?.busy)event.preventDefault();};row.ondrop=event=>{event.preventDefault();if(sectionMode?.busy)return;const target=row.dataset.name,from=sectionMode.order.indexOf(dragged||event.dataTransfer?.getData('text/plain')),to=sectionMode.order.indexOf(target);if(from<0||to<0||from===to)return;sectionMode.order.splice(to,0,sectionMode.order.splice(from,1)[0]);panel==='tasks'?renderTasks():renderRoutine();};for(const button of row.querySelectorAll('[data-order-move]'))button.onclick=()=>moveSection(row.dataset.name,button.dataset.orderMove==='up'?-1:1);const handle=row.querySelector('[data-testid="section-order-handle"]');handle.onkeydown=event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();moveSection(row.dataset.name,event.key==='ArrowUp'?-1:1);}else if(event.key==='Escape'){event.preventDefault();cancelSectionOrder();}};}}
function beginSectionOrder(panel){if(sectionMode?.busy)return;const state=S.sectionOrder?.[panel];if(!state||state.error||!state.order.length)return;sectionMode={panel,order:[...state.order],original:[...state.order],base:state.base,busy:false};panel==='tasks'?renderTasks():renderRoutine();}
function cancelSectionOrder(){const panel=sectionMode?.panel;if(!panel||sectionMode.busy)return;sectionMode=null;panel==='tasks'?renderTasks():renderRoutine();}
async function saveSectionOrder(){if(!sectionMode||sectionMode.busy)return;const mode=sectionMode,request={panel:mode.panel,order:[...mode.order],base:{...mode.base}};mode.busy=true;mode.panel==='tasks'?renderTasks():renderRoutine();try{await post('/api/section/reorder',request);if(sectionMode!==mode)return void await load();sectionMode=null;await load();}catch(error){if(error.status===409){await load();toast(t(error.changedFiles?.length?'section.orderPartial':'section.orderConflict'));if(sectionMode!==mode)return;const state=S.sectionOrder?.[mode.panel];sectionMode=state&&!state.error?{panel:mode.panel,order:[...state.order],original:[...state.order],base:state.base,busy:false}:null;mode.panel==='tasks'?renderTasks():renderRoutine();}else if(sectionMode===mode){mode.busy=false;mode.panel==='tasks'?renderTasks():renderRoutine();fail(error);}}}

function renderTasks() {
  const c = counts().t;
  const container=$('#tasks'),previous=sectionRatios(container);
  ui.unmountMascots(container);
  reconcileSectionMode('tasks');if(sectionMode?.panel==='tasks'){container.innerHTML=`<div class="sec__head"><h2 class="sec__title" id="h-tasks">${esc(t('tasks.title'))}</h2></div>${sectionOrderView('tasks')}`;wireSectionOrder('tasks');return;}
  const bl = blocks(S.tasks, S.sections.tasks, (x) => (x.date === S.today ? (x.group ?? '') : ''));
  const body = bl.map((b, i) => (i === 0 ? (b.items.length ? `<ul class="tasks">${b.items.map((x) => row(x)).join('')}</ul>` : '') : sectionBlock('tasks', b, {},previous.get(b.name)))).join('');
  container.innerHTML = `
    <div class="sec__head"><h2 class="sec__title" id="h-tasks">${esc(t('tasks.title'))}</h2><span class="count">${c[0]}/${c[1]}</span>${orderSectionBtn('tasks')}${addSectionBtn('tasks')}</div>
    ${S.tasks.length || S.sections.tasks.length ? body : `<div class="empty empty--hs">${ui.badge('welcome', 72)}<div>${h('tasks.empty')}</div></div>`}`;
  animateSectionBars(container);
  ui.mountMascots(container);
}

function renderRoutine() {
  const all = S.routine.flatMap((g) => g.items);
  const done = all.filter((x) => x.done).length;
  const container=$('#routine'),previous=sectionRatios(container);
  ui.unmountMascots(container);
  reconcileSectionMode('routine');if(sectionMode?.panel==='routine'){container.innerHTML=`<div class="sec"><div class="sec__head"><h2 class="sec__title" id="h-routine">${esc(t('routine.title'))}</h2></div>${sectionOrderView('routine')}</div>`;wireSectionOrder('routine');return;}
  const bl = blocks(all, S.sections.routine, (x) => x.group ?? '');
  const body = bl.map((b, i) => (i === 0 ? (b.items.length ? `<ul class="tasks">${b.items.map((x) => row(x, { routine: true })).join('')}</ul>` : '') : sectionBlock('routine', b, { routine: true },previous.get(b.name)))).join('');
  container.innerHTML = `<div class="sec">
    <div class="sec__head"><h2 class="sec__title" id="h-routine">${esc(t('routine.title'))}</h2><span class="count">${done}/${all.length}</span>${orderSectionBtn('routine')}${addSectionBtn('routine')}</div>
    ${all.length || S.sections.routine.length ? body : `<div class="empty empty--hs">${ui.badge('welcome', 72)}<div>${h('routine.empty')}</div></div>`}
  </div>`;
  animateSectionBars(container);
  ui.mountMascots(container);
}

function renderSide() {
  const list = (items, key) => {
    const shown = showAll[key] ? items : items.slice(0, 6);
    return { shown, more: items.length > shown.length ? `<button type="button" class="btn btn--ghost btn--sm more" data-act="more" data-testid="more" data-key="${key}">${esc(t('more', { n: items.length - shown.length }))}</button>` : '' };
  };

  const up = list(S.upcoming, 'upcoming');
  const groups = new Map();
  for (const x of up.shown) {
    const k = x.scheduled ?? x.start ?? x.date ?? x.due;
    groups.set(k, [...(groups.get(k) ?? []), x]);
  }
  // 日付の列は「明日 / 10/07」の2行。曜日は出さない。3日以上先は日付 (MM/DD) だけ
  const dateCell = (k) => {
    const n = dayDiff(S.today, k);
    const rel = n === 1 ? t('rel.tomorrow') : n === 2 ? t('rel.dayafter') : '';
    return rel ? `<b>${esc(rel)}</b>${esc(md(k))}` : `<b>${esc(md(k))}</b>`;
  };
  const upHtml = [...groups]
    .map(([k, xs]) => `<div class="upc" data-testid="upcoming-group"><div class="upc__date" data-testid="upcoming-date">${dateCell(k)}</div><ul class="tasks">${xs.map((x) => row(x, { defer: false, today: true, groupDate: k })).join('')}</ul></div>`)
    .join('');

  const inb = list(S.inbox, 'inbox');
  $('#side').innerHTML = `
    <section class="sec" aria-labelledby="h-up" data-testid="upcoming">
      <div class="sec__head"><h2 class="sec__title" id="h-up">${esc(t('upcoming.title'))}</h2><span class="count">${S.upcoming.length}</span></div>
      ${upHtml ? upHtml + up.more : `<div class="empty">${esc(t('upcoming.empty'))}</div>`}
    </section>
    <section class="sec" aria-labelledby="h-in" data-testid="inbox">
      <div class="sec__head"><h2 class="sec__title" id="h-in">${esc(t('inbox.title'))}</h2><span class="count">${S.inbox.length}</span></div>
      ${inb.shown.length ? `<ul class="tasks">${inb.shown.map((x) => row(x, { defer: false, today: true })).join('')}</ul>${inb.more}` : `<div class="empty">${esc(t('inbox.empty'))}</div>`}
    </section>
    <section class="sec" aria-labelledby="h-hist">
      <div class="sec__head"><h2 class="sec__title" id="h-hist">${esc(t('history.title'))}</h2></div>
      ${heat()}
    </section>`;
}

function heat() {
  const dow = (new Date(`${S.today}T00:00:00Z`).getUTCDay() + 6) % 7; // 月曜始まり
  const start = addDays(S.today, -dow - 77);
  let cells = '';
  for (let i = 0; i < 84; i++) {
    const d = addDays(start, i);
    const [done, total] = S.history[d] ?? [0, 0];
    const r = total ? done / total : 0;
    const l = r === 0 ? 0 : r < 0.34 ? 1 : r < 0.67 ? 2 : r < 1 ? 3 : 4;
    const label = d > S.today ? t('cell.future', { date: d }) : total ? t('cell.some', { date: d, total, done }) : t('cell.none', { date: d });
    cells += `<li data-testid="heat-cell"${l ? ` data-l="${l}"` : ''} class="${d > S.today ? 'is-future' : ''}${d === S.today ? ' is-today' : ''}" title="${esc(label)}" aria-label="${esc(label)}"></li>`;
  }
  return `<ul class="heat" aria-label="${esc(t('history.aria'))}">${cells}</ul>
    <div class="heat-legend"><span>${esc(t('history.note'))}</span><span class="heat-legend__scale" aria-hidden="true"><span>${esc(t('legend.less'))}</span><i></i><i data-l="1"></i><i data-l="2"></i><i data-l="3"></i><i data-l="4"></i><span>${esc(t('legend.more'))}</span></span></div>`;
}

// ---------- 操作 ----------
async function toggleTask(x) {
  x.done = !x.done;
  animate = { id: x.id, done: x.done };
  holdUntil = Date.now() + 620; // 両方向の線が動く間、SSE echo の再描画で途切れさせない
  render();
  if (x.done) $(`[data-id="${CSS.escape(x.id)}"] .chk`)?.classList.add('is-pop'); // ポップアップの .pop とは別名 (同名だと position: fixed が当たり、一瞬チェックが行の中央へ飛ぶ)
  const run = (inflight.get(x.id) ?? Promise.resolve(null)).then(async (prevRaw) => {
    const target = byId.get(x.id) ?? x;
    writes++;
    const r = await post('/api/toggle', { ...refOf(target), ...(prevRaw ? { raw: prevRaw } : {}) }); // 前の送信が返した最新の行を使う
    target.raw = x.raw = r.raw;
    if (r.next) toast(t('toast.next', { d: md(r.next) }));
    if (r.warn) toast(t('toast.recurrence'));
    return r.raw;
  });
  const tail = run.catch(() => null); // 失敗しても、次の送信は続ける (その場合は画面の行を使う)
  inflight.set(x.id, tail);
  tail.then(() => {
    if (inflight.get(x.id) !== tail) return; // もっと後の送信がある
    inflight.delete(x.id);
    if (!inflight.size) {
      idle.add(load); // SSE の echo に頼らず取り直す (接続が詰まっていても、上の進捗 N/M が更新される)
      const fns = [...idle]; // 全部終わった: 取り直しを 1 回だけ
      idle.clear();
      for (const fn of fns) fn();
    }
  });
  try {
    await run;
  } catch (e) {
    fail(e);
  }
}

// 取り消し。確認してから行う。
// タスク = キャンセル ([-])。ファイルの行は消さないので元に戻せる。
// ルーティン = 削除。今日の行とテンプレートの定義を消す (明日以降は出ない。過去の日のノートはそのまま)。
async function cancelTask(x) {
  const routine = x.kind === 'routine';
  const ok = await confirmDialog({
    title: t(routine ? 'cf.routine.title' : 'cf.task.title'),
    body: t(routine ? 'cf.routine.body' : 'cf.task.body'),
    yes: t(routine ? 'btn.deleteRoutine' : 'btn.cancelTask'),
  });
  if (!ok) return false;
  try {
    if (routine) {
      await post('/api/delete-routine', refOf(x));
      toast(t('toast.routineDeleted'));
    } else {
      const r = await post('/api/cancel', refOf(x));
      toast(t('toast.canceled'), async () => {
        try {
          await post('/api/toggle', { file: x.file, line: x.line, raw: r.raw, kind: x.kind });
          load();
        } catch (e) {
          fail(e);
        }
      });
    }
    load();
    return true;
  } catch (e) {
    fail(e);
    return false;
  }
}

async function deferTask(x) {
  try {
    const r = await post('/api/reschedule', { ref: refOf(x), date: addDays(S.today, 1) });
    toast(t('toast.deferred'), async () => {
      try {
        await post('/api/undo-row', { undo: r.undo });
        load();
      } catch (e) {
        fail(e);
      }
    });
    load();
  } catch (e) {
    fail(e);
  }
}

async function moveToday(x) {
  try {
    const r = await post('/api/today', { ref: refOf(x) });
    toast(t('toast.today'), async () => {
      try {
        await post('/api/undo-row', { undo: r.undo });
        load();
      } catch (e) {
        fail(e);
      }
    });
    load();
  } catch (e) {
    fail(e);
  }
}

const ctx = {
  S: () => S,
  post,
  load,
  toast,
  fail,
  errorText,
  cancelTask,
  clearQuick: () => ($('#quick-input').value = ''),
  live: () => live,
  lastOk: () => lastOk,
  reconnect: connect,
};

registerRootGuard('do', async () => {
  await Promise.allSettled([...inflight.values()]);
  if(sectionMode)return 'section-order';
  if(assistantBusy)return 'assistant-running';
  if ($('#quick-input').value.trim()) return 'quick-draft';
  if(document.querySelector('[data-testid="assistant-dialog"][open]'))return 'assistant-draft';
  if ($('#dlg').open || $('#sec').open || $('#confirm').open) return 'dialog-draft';
  return true;
});

// 入力欄: Enter でそのまま追加。開始日・締切日はどちらも今日が既定
$('#quick').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#quick-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  try {
    // 文中に日付 (⏳ 🛫 📅) を書いたときは、既定の「今日」で上書きしない
    const result = await post('/api/add', /[⏳🛫📅]/u.test(text) ? { text } : { text, scheduled: S.today, due: S.today });
    nextQuickPlaceholder();
    toast(t(addedToastKey(result.raw, S.today)));
    load();
  } catch (err) {
    input.value = text;
    fail(err);
  }
});
$('#quick-more').onclick = () => itemDialog(ctx, { text: $('#quick-input').value });
$('#quick-input').addEventListener('keydown', (e) => e.key === 'Escape' && e.target.blur());
// ⌘/Ctrl+K: 1 回 = 入力欄へ。続けてもう 1 回 (DOUBLE_K_MS 以内) = 日付や優先度を決める詳細ダイアログ (入力欄の右のボタンと同じ)
const DOUBLE_K_MS = 500;
let lastK = -Infinity; // 直前の ⌘K の時刻 (まだ押していない = 無限に昔)
document.addEventListener('keydown', (e) => {
  if(e.defaultPrevented||e.target.closest?.('[data-testid="write-editor"]'))return;
  if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) return;
  e.preventDefault();
  if (e.repeat) return; // 押しっぱなしの自動リピートは 2 回と数えない
  const now = performance.now();
  const twice = now - lastK < DOUBLE_K_MS;
  lastK = twice ? -Infinity : now;
  // 読み取り専用では開かない。ダイアログが開いている間は、2 回目で入力中の内容を作り直さない
  if (twice && !S?.vault.readonly && !document.querySelector('dialog[open]')) return void itemDialog(ctx, { text: $('#quick-input').value });
  $('#quick-input').focus();
});

document.addEventListener('change', (e) => {
  const box = e.target.closest('[data-act="toggle"]');
  const x = box && byId.get(box.closest('[data-id]').dataset.id);
  if (x) toggleTask(x);
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'more') {
    showAll[b.dataset.key] = true;
    return renderSide();
  }
  if (act === 'section-add') return sectionDialog(ctx, { panel: b.dataset.panel });
  if (act === 'section-edit') return sectionDialog(ctx, { panel: b.dataset.panel, name: b.dataset.name });
  if (act === 'section-order') return beginSectionOrder(b.dataset.panel);
  if (act === 'section-order-cancel') return cancelSectionOrder();
  if (act === 'section-order-save') return saveSectionOrder();
  const x = byId.get(b.closest('[data-id]')?.dataset.id);
  if (!x) return;
  if (act === 'edit') itemDialog(ctx, { task: x });
  else if (act === 'cancel') cancelTask(x);
  else if (act === 'tomorrow') deferTask(x);
  else if (act === 'today') moveToday(x);
});
document.addEventListener('dblclick', (e) => {
  const x = !e.target.closest('a') && byId.get(e.target.closest('.task__text')?.closest('[data-id]')?.dataset.id);
  if (x && !S.vault.readonly) itemDialog(ctx, { task: x });
});
document.addEventListener('keydown',event=>{if(sectionMode&&event.key==='Escape'&&!document.querySelector('dialog[open]')){event.preventDefault();cancelSectionOrder();}});

// ツールチップに添えるショートカット表記 (Mac は ⌘⇧、それ以外は Ctrl+Shift+)
const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const shortcutLabel = (key) => (MAC ? `⌘⇧${key}` : `Ctrl+Shift+${key}`);

// ---------- 言語 / 接続状態 ----------
function applyStatic() {
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  $('#quick-input').placeholder = quickPlaceholder();
  $('#lang-name').textContent = LANGS.find((l) => l.code === getLang()).name;
  if (!$('#folder-name').textContent) $('#folder-name').textContent = t('folder.none');
  $('#folder').title = t('folder.reveal');
  $('#lang').title = `${t('lang.label')} (${shortcutLabel('U')})`;
  document.title = 'TOODDAE';
  paintTheme();
}

// ---------- テーマ (ダーク / ライト) ----------
// 初期値と切り替え本体は theme.js (描画前に決めてちらつきを防ぐ)。ここはボタンの表示だけ。
function paintTheme() {
  const label = t(window.dayTheme.get() === 'light' ? 'theme.toDark' : 'theme.toLight');
  $('#theme').setAttribute('aria-label', label);
  $('#theme').title = `${label} (${shortcutLabel('Y')})`;
}
$('#theme').onclick = () => window.dayTheme.toggle(paintTheme);
async function changeLang(code) {
  if(code===getLang())return;
  const ready=await prepareRootSwitch();
  if(!ready.ok)return toast(t('lang.blocked'));
  setLang(code,{applyDocument:false});
  location.reload();
}
$('#lang').onclick = (e) =>
  ui.openList(e.currentTarget, LANGS.map((l) => ({ value: l.code, label: l.name })), getLang(), changeLang);
// ⌘/Ctrl+Shift+Y = ライト/ダーク、⌘/Ctrl+Shift+U = 次の言語。IME が ㅛ / ㅕ を返しても動くよう、キーは文字ではなく物理キー (code) で見る
document.addEventListener('keydown', (e) => {
  if (e.isComposing || e.repeat || e.defaultPrevented || !(e.metaKey || e.ctrlKey) || !e.shiftKey || e.altKey) return;
  if (e.code === 'KeyY') { e.preventDefault(); return void $('#theme').click(); }
  if (e.code === 'KeyU') {
    e.preventDefault();
    if (document.querySelector('dialog[open]')) return; // 開いたダイアログの入力を、再読み込みで失わせない
    const i = LANGS.findIndex((l) => l.code === getLang());
    changeLang(LANGS[(i + 1) % LANGS.length].code);
  }
});
$('#sync').onclick = () => statusDialog(ctx);
$('#folder').onclick = async () => { try { await post('/api/runtime/reveal', {}); } catch { statusDialog(ctx); } };

// ---------- 通知 (タブを開いている間だけ。開始10分前) ----------
const bell = $('#bell');
let notifyOn = localStorage.getItem('notify') === '1' && globalThis.Notification?.permission === 'granted';
bell.setAttribute('aria-pressed', String(notifyOn));
bell.onclick = async () => {
  if (!globalThis.Notification) return toast(t('bell.unsupported'));
  if (!notifyOn && (await Notification.requestPermission()) !== 'granted') return toast(t('bell.denied'));
  notifyOn = !notifyOn;
  localStorage.setItem('notify', notifyOn ? '1' : '0');
  bell.setAttribute('aria-pressed', String(notifyOn));
  toast(t(notifyOn ? 'bell.on' : 'bell.off'));
};
function checkReminders() {
  if (!notifyOn || !S) return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const seen = new Set(JSON.parse(sessionStorage.getItem('notified') || '[]'));
  for (const x of S.timeline) {
    if (x.segment?.startedPrevious) continue; // 前日から続く区間を、今日の開始通知として再通知しない
    const until = !x.time.start; // 終了だけ (〜12:00): その時刻が締切
    const at = x.time.start ?? x.time.end;
    const lead = toMin(at) - nowMin;
    const key = `${S.today}|${x.id}|${at}`;
    if (x.done || lead < 0 || lead > 10 || seen.has(key)) continue;
    seen.add(key);
    const body = until ? (lead ? t('notif.dueSoon', { n: lead }) : t('notif.dueNow')) : lead ? t('notif.soon', { n: lead }) : t('notif.now');
    new Notification(`${until ? `〜${at}` : at} ${plain(x.text.replace(new RegExp(TIME_SRC), '')).trim() || plain(x.text)}`, { body, tag: key });
  }
  sessionStorage.setItem('notified', JSON.stringify([...seen]));
}

// ---------- 起動 ----------
initDialogs();
ui.initGlobalUi();
applyStatic();
connect();
if(assistantCapable){refreshAssistantReady();addEventListener('tooddae-ai-readiness',event=>{assistantReady=!!event.detail?.aiReady;paintAssistant();if(assistantReady)refreshAssistantReady();});}
document.addEventListener('visibilitychange', () => !document.hidden && load());
let lastW = 0;
new ResizeObserver(([e]) => {
  const w = Math.round(e.contentRect.width);
  if (w !== lastW) {
    lastW = w;
    center = true;
    renderDayline();
  }
}).observe($('#hero'));
setInterval(() => pressed() || renderDayline(), 30000); // now の線を進める (押している間は次の回へ)
setInterval(checkReminders, 20000);
(function midnight() {
  const n = new Date();
  setTimeout(() => {
    load();
    midnight();
  }, new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 5) - n);
})();
load();
