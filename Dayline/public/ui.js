// 自前の入力部品。ネイティブの <select> / <input type=date|time> のポップアップは使わず、見た目も操作も自前で作る。
// ポップオーバーはモーダル <dialog> の中に置く (モーダルの外は inert になり操作できなくなるため)。
import { t, weekdayShort, monthYear, fullDate, dateLabel, escapeHtml as esc } from '/i18n.js';
import { holidayName } from '/holidays.js';

export const icon = (n) => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`; // スプライトは index.html に埋め込み済み (server.js)
// AI ボタン用のキャラクター (highsoul.js が [data-hs-state] を初期化する。描画し直す前に unmount で後始末)
export const mascot = (state = 'default') => `<span class="ai-mascot" data-hs-state="${state}" data-hs-assets="/assets/highsoul/layers"></span>`;
// 単独で置くキャラクター (サイズ px)。置いたあとに mountMascots、作り直す前に unmountMascots
export const badge = (state = 'default', size = 56) => `<span class="hs-badge" data-hs-state="${state}" data-hs-assets="/assets/highsoul/layers" style="--hs-size:${size}px"></span>`;
export const mountMascots = (scope = document) => window.Highsoul?.init(scope);
// 場面に合わせてキャラクターの状態を変える (Highsoul が未読み込みなら何もしない)。flashMascot は一定時間だけ別の状態にして default へ戻す
export const setMascot = (scope, state) => { for (const el of scope?.querySelectorAll?.('[data-hs-state]') ?? []) window.Highsoul?.setState(el, state); };
export function flashMascot(scope, state, ms = 2400) {
  if (!scope) return;
  setMascot(scope, state);
  scope.dataset.hsFlash = '1';
  clearTimeout(scope._hsFlashTimer);
  scope._hsFlashTimer = setTimeout(() => { delete scope.dataset.hsFlash; setMascot(scope, 'default'); }, ms);
}
export function restMascot(scope, busy) {
  if (!scope) return;
  if (busy) { clearTimeout(scope._hsFlashTimer); delete scope.dataset.hsFlash; setMascot(scope, 'thinking'); }
  else if (!scope.dataset.hsFlash) setMascot(scope, 'default');
}
export const unmountMascots = (scope = document) => { for (const el of scope.querySelectorAll('[data-hs-state]')) window.Highsoul?.destroy(el); };
export function toast(message,undo){const el=document.createElement('div');el.className='toast';el.dataset.testid='toast';el.innerHTML=`<span>${esc(message)}</span>${undo?`<button type="button" data-testid="toast-undo">${esc(t('toast.undo'))}</button>`:''}`;if(undo){const button=el.querySelector('button');button.onclick=async()=>{button.disabled=true;try{if(await undo()===false)return void(button.disabled=false);el.remove();}catch{button.disabled=false;}};}document.querySelector('#toasts')?.append(el);setTimeout(()=>el.remove(),undo?9000:2800);return el;}
const mk = (tag, cls, attrs = {}) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const p2 = (n) => String(n).padStart(2, '0');

let globalUiReady=false,tip=null,tipTrigger=null,cursor=null;
const adoptTitle=el=>{if(!el.hasAttribute?.('title'))return;const value=el.getAttribute('title');if(value)el.dataset.tooltip=value;else delete el.dataset.tooltip;el.removeAttribute('title');if(tipTrigger===el&&!value)hideTip();};
const tipText=el=>el?.dataset?.tooltip||'';
function hideTip(){if(!tipTrigger)return;const ids=(tipTrigger.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!=='app-tooltip');ids.length?tipTrigger.setAttribute('aria-describedby',ids.join(' ')):tipTrigger.removeAttribute('aria-describedby');tipTrigger=null;tip?.remove();}
function showTip(trigger){const value=tipText(trigger);if(!value)return;hideTip();tipTrigger=trigger;tip??=mk('div','app-tooltip',{id:'app-tooltip',role:'tooltip','data-testid':'app-tooltip'});tip.textContent=value;(trigger.closest('dialog[open]')??document.body).append(tip);trigger.setAttribute('aria-describedby',[trigger.getAttribute('aria-describedby'),'app-tooltip'].filter(Boolean).join(' '));const r=trigger.getBoundingClientRect(),b=tip.getBoundingClientRect(),left=Math.min(Math.max(8,r.left+(r.width-b.width)/2),innerWidth-b.width-8),below=r.bottom+8,top=below+b.height<=innerHeight-8?below:Math.max(8,r.top-b.height-8);tip.style.left=`${Math.round(left)}px`;tip.style.top=`${Math.round(top)}px`;}
export function initGlobalUi(){if(globalUiReady)return;globalUiReady=true;for(const el of document.querySelectorAll('[title]'))adoptTitle(el);new MutationObserver(records=>{for(const record of records){if(record.type==='attributes')adoptTitle(record.target);else for(const node of record.addedNodes){if(node.nodeType!==Node.ELEMENT_NODE)continue;adoptTitle(node);for(const el of node.querySelectorAll('[title]'))adoptTitle(el);}}}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['title']});document.addEventListener('pointerover',event=>{if(event.pointerType==='touch')return;const trigger=event.target.closest?.('[data-tooltip]');if(trigger)showTip(trigger);});document.addEventListener('pointerout',event=>{if(tipTrigger&&!tipTrigger.contains(event.relatedTarget))hideTip();});document.addEventListener('focusin',event=>{const trigger=event.target.closest?.('[data-tooltip]');if(trigger)showTip(trigger);});document.addEventListener('focusout',event=>{if(tipTrigger===event.target||tipTrigger?.contains(event.target))hideTip();});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&tipTrigger){event.preventDefault();event.stopImmediatePropagation();hideTip();}},true);initAccentCursor();}
const finePointer=()=>matchMedia('(hover: hover) and (pointer: fine)').matches;
export const accentCursorEnabled=()=>{try{return localStorage.getItem('accentCursor')==='1';}catch{return false;}};
export function setAccentCursor(enabled){try{localStorage.setItem('accentCursor',enabled?'1':'0');}catch{}const root=document.documentElement;root.classList.toggle('has-accent-cursor',enabled&&finePointer());if(!enabled||!finePointer()){root.classList.remove('is-accent-cursor-active');if(cursor)cursor.hidden=true;}}
function initAccentCursor(){
  if(cursor)return;
  const root=document.documentElement;
  cursor=mk('div','accent-cursor',{'aria-hidden':'true','data-testid':'cursor-orb'});cursor.hidden=true;document.body.append(cursor);setAccentCursor(accentCursorEnabled());
  const deactivate=()=>{root.classList.remove('is-accent-cursor-active');cursor.hidden=true;cursor.classList.remove('is-action','is-text','is-down');};
  document.addEventListener('pointermove',event=>{
    if(!accentCursorEnabled()||!finePointer()||event.pointerType==='touch'||matchMedia('(forced-colors: active)').matches)return deactivate();
    root.classList.add('is-accent-cursor-active');
    const action=event.target.closest?.('button,a,[role="button"],input:is([type="checkbox"],[type="radio"],[type="range"],[type="button"],[type="submit"],[type="color"],[type="file"])'),text=event.target.closest?.('input,textarea')||event.target.isContentEditable,parent=event.target.closest?.('dialog[open]')??document.body;
    if(cursor.parentElement!==parent)parent.append(cursor);
    cursor.classList.toggle('is-action',!!action);cursor.classList.toggle('is-text',!action&&!!text);cursor.style.transform=`translate3d(${event.clientX}px,${event.clientY}px,0)`;cursor.hidden=false;
  });
  document.addEventListener('pointerout',event=>{if(!event.relatedTarget)deactivate();},true);
  document.addEventListener('close',deactivate,true);addEventListener('blur',deactivate);document.addEventListener('visibilitychange',()=>document.hidden&&deactivate());new MutationObserver(()=>{if(!cursor.isConnected){document.body.append(cursor);deactivate();}}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('pointerdown',()=>cursor?.classList.add('is-down'),true);for(const type of ['pointerup','pointercancel'])document.addEventListener(type,()=>cursor?.classList.remove('is-down'),true);
  addEventListener('tooddae-theme-changing',()=>{const style=getComputedStyle(cursor);cursor.style.borderColor=style.borderColor;cursor.style.backgroundColor=style.backgroundColor;cursor.style.boxShadow=style.boxShadow;cursor.classList.add('is-changing');});addEventListener('tooddae-theme-changed',()=>{cursor.style.removeProperty('border-color');cursor.style.removeProperty('background-color');cursor.style.removeProperty('box-shadow');void cursor.offsetWidth;requestAnimationFrame(()=>cursor?.classList.remove('is-changing'));});
  matchMedia('(hover: hover) and (pointer: fine)').addEventListener('change',()=>setAccentCursor(accentCursorEnabled()));matchMedia('(forced-colors: active)').addEventListener('change',event=>event.matches?deactivate():setAccentCursor(accentCursorEnabled()));
}

// ---------- ポップオーバー (同時に開くのは1つ) ----------
let cur = null;
let outsideClosedAt = -1e9; // 外側を押してポップアップを閉じた時刻
// 外側を押してポップアップを閉じた直後の click は「閉じるための操作」として扱う (背景クリックでダイアログまで閉じ、入力が消えないように)
export const popOpen = () => !!cur || performance.now() - outsideClosedAt < 450;
export function closePop(refocus = false) {
  if (!cur) return;
  const { trigger, pop } = cur;
  cur = null;
  unmountMascots(pop);
  pop.remove();
  trigger.setAttribute('aria-expanded', 'false');
  if (refocus) trigger.focus();
}
export function openPop(trigger, pop) {
  closePop();
  pop.classList.add('pop');
  pop.dataset.testid = 'popover';
  (trigger.closest('dialog[open]') ?? document.body).append(pop);
  const r = trigger.getBoundingClientRect();
  pop.style.minWidth = `${Math.round(r.width)}px`;
  const { offsetWidth: w, offsetHeight: h } = pop;
  const left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
  const below = r.bottom + 6;
  const top = below + h > innerHeight - 8 && r.top - h - 6 > 8 ? r.top - h - 6 : below; // 入らなければ上に出す
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
  cur = { trigger, pop };
  trigger.setAttribute('aria-expanded', 'true');
}
document.addEventListener(
  'pointerdown',
  (e) => {
    if (!cur || cur.pop.contains(e.target)) return;
    if (cur.trigger.contains(e.target)) {
      // 開いているトリガーを押し直したら閉じる。直後の click で開き直さないよう、その click を1回だけ止める
      const trigger = cur.trigger;
      closePop();
      document.addEventListener('click', (ev) => trigger.contains(ev.target) && ev.stopPropagation(), { capture: true, once: true });
    } else {
      outsideClosedAt = performance.now();
      closePop();
    }
  },
  true,
);
const onEsc = (e) => {
  if (e.key !== 'Escape') return false;
  e.preventDefault();
  e.stopPropagation(); // ダイアログごと閉じないよう、ポップオーバーだけ閉じる
  closePop(true);
  return true;
};

// ---------- 一覧 (セレクト / 言語メニュー共通) ----------
export function openList(trigger, options, value, onPick) {
  trigger ||= document.activeElement;
  const ul = mk('ul', 'pop--list', { role: 'listbox', tabindex: '-1' });
  for (const o of options) {
    const li = mk('li', 'opt', { role: 'option', tabindex: '-1', 'aria-selected': String(o.value === value) });
    li.dataset.v = o.value;
    li.textContent = o.label;
    ul.append(li);
  }
  openPop(trigger, ul);
  const first = ul.querySelector('[aria-selected="true"]') ?? ul.firstElementChild;
  first?.focus();
  first?.scrollIntoView({ block: 'nearest' });
  const pick = (li) => {
    closePop(true);
    onPick(li.dataset.v);
  };
  ul.addEventListener('click', (e) => {
    const li = e.target.closest('.opt');
    if (li) pick(li);
  });
  ul.addEventListener('keydown', (e) => {
    if (onEsc(e)) return;
    const items = [...ul.children];
    const li = e.target.closest('.opt');
    const go = (n) => {
      e.preventDefault();
      items[(n + items.length) % items.length].focus();
    };
    const i = items.indexOf(li);
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if ((e.key === 'Enter' || e.key === ' ') && li) {
      e.preventDefault();
      pick(li);
    } else if (e.key === 'Tab') closePop();
  });
}

export function select({ label, options, value = '', onChange }) {
  let val = value;
  let opts = options;
  const root = mk('div', 'sel');
  const btn = mk('button', 'sel__btn', { type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': label, 'data-testid': 'select-button' });
  root.append(btn);
  const paint = () => {
    btn.innerHTML = `<span class="sel__val">${esc(opts.find((o) => o.value === val)?.label ?? '')}</span>${icon('chevron-down')}`;
  };
  const open = () =>
    openList(btn, opts, val, (v) => {
      val = v;
      paint();
      onChange?.(v);
    });
  btn.addEventListener('click', open);
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open();
    }
  });
  paint();
  return {
    el: root,
    get: () => val,
    set: (v) => {
      val = v;
      paint();
    },
    setOptions: (o) => {
      opts = o;
      if (!o.some((x) => x.value === val)) val = o[0]?.value ?? '';
      paint();
    },
  };
}

// ---------- 日付 (カレンダーのポップアップ) ----------
const isoAdd = (iso, k) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
};
const isoAddMonths = (iso, k) => {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + k + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + k, Math.min(d, last))).toISOString().slice(0, 10);
};

// 休日の国は Set の国設定 (起動時の値 + Set で変えたときの通知)
let holidayCountry = '';
try { holidayCountry = JSON.parse(document.getElementById('boot')?.textContent || '{}').auto?.country || ''; } catch {}
addEventListener('tooddae-country', (event) => { holidayCountry = event.detail?.country ?? ''; });

export function datePicker({ label, value = '', today, onChange }) {
  let val = value;
  const root = mk('div', 'dp');
  const btn = mk('button', 'sel__btn dp__btn', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': label, 'data-testid': 'date-button' });
  const clear = mk('button', 'icon-btn dp__clear', { type: 'button', 'aria-label': `${label}: ${t('date.clear')}`, 'data-testid': 'date-clear' });
  clear.innerHTML = icon('x');
  root.append(btn, clear);
  const paint = () => {
    btn.innerHTML = `<span class="sel__val${val ? '' : ' is-empty'}">${esc(val ? dateLabel(val) : t('date.none'))}</span>${icon('calendar')}`;
    clear.hidden = !val;
  };
  const set = (v) => {
    val = v;
    paint();
    onChange?.(v);
  };
  clear.addEventListener('click', () => {
    set('');
    btn.focus();
  });

  function open() {
    let focus = val || today;
    const pop = mk('div', 'cal', { role: 'dialog', 'aria-label': label });
    const draw = () => {
      const [y, m] = focus.split('-').map(Number);
      const off = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 日曜始まり
      let html = `<div class="cal__head"><button type="button" class="icon-btn" data-nav="-1" aria-label="${esc(t('date.prev'))}">${icon('chevron-left')}</button><b class="cal__title" aria-live="polite">${esc(monthYear(y, m - 1))}</b><button type="button" class="icon-btn" data-nav="1" aria-label="${esc(t('date.next'))}">${icon('chevron-right')}</button></div>`;
      html += `<div class="cal__wd" aria-hidden="true">${[6, 0, 1, 2, 3, 4, 5].map((i) => `<span>${esc(weekdayShort(i))}</span>`).join('')}</div><div class="cal__grid">`;
      for (let i = 0; i < 42; i++) {
        const d = new Date(Date.UTC(y, m - 1, 1 - off + i)).toISOString().slice(0, 10);
        const holiday = holidayName(holidayCountry, d), dow = i % 7; // 列 0=日 … 6=土
        const cls = `cal__d${d.slice(0, 7) !== focus.slice(0, 7) ? ' is-out' : ''}${dow === 6 ? ' is-sat' : ''}${dow === 0 || holiday ? ' is-sun' : ''}${d === today ? ' is-today' : ''}${d === val ? ' is-sel' : ''}`;
        html += `<button type="button" class="${cls}" data-testid="cal-day" data-d="${d}" tabindex="${d === focus ? 0 : -1}" aria-label="${esc(holiday ? `${fullDate(d)} · ${holiday}` : fullDate(d))}"${d === val ? ' aria-pressed="true"' : ''}>${+d.slice(8)}</button>`;
      }
      html += `</div><div class="cal__foot"><button type="button" class="btn btn--ghost btn--sm" data-act="today">${esc(t('date.today'))}</button><button type="button" class="btn btn--ghost btn--sm" data-act="clear">${esc(t('date.clear'))}</button></div>`;
      pop.innerHTML = html;
    };
    const focusDay = () => pop.querySelector(`[data-d="${focus}"]`)?.focus();
    const pick = (v) => {
      closePop(true);
      set(v);
    };
    draw();
    openPop(btn, pop);
    focusDay();
    pop.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        focus = isoAddMonths(focus, Number(nav.dataset.nav));
        draw();
        pop.querySelector(`[data-nav="${nav.dataset.nav}"]`).focus();
        return;
      }
      const day = e.target.closest('[data-d]');
      if (day) return pick(day.dataset.d);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'today') pick(today);
      else if (act === 'clear') pick('');
    });
    pop.addEventListener('keydown', (e) => {
      if (onEsc(e) || !e.target.closest('[data-d]')) return;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (step) focus = isoAdd(focus, step);
      else if (e.key === 'PageUp' || e.key === 'PageDown') focus = isoAddMonths(focus, e.key === 'PageUp' ? -1 : 1);
      else return;
      e.preventDefault();
      draw();
      focusDay();
    });
  }
  btn.addEventListener('click', open);
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      open();
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && val) {
      e.preventDefault();
      set('');
    }
  });
  paint();
  return {
    el: root,
    get: () => val,
    set: (v) => {
      val = v;
      paint();
    },
  };
}

// ---------- 時刻 (入力欄 + 時/分のポップアップ) ----------
export function normTime(s) {
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(String(s).normalize('NFKC').trim()); // 全角の数字・コロンも受ける (IME 入力)
  if (!m) return null;
  const h = Number(m[1]);
  const mi = m[2] ? Number(m[2]) : 0;
  return h > 23 || mi > 59 ? null : `${p2(h)}:${p2(mi)}`;
}
const HOURS = Array.from({ length: 24 }, (_, i) => p2(i));
const MINS = Array.from({ length: 12 }, (_, i) => p2(i * 5));

export function timePicker({ label, iconName = 'clock', value = '', onChange }) {
  let val = value;
  const root = mk('div', 'tp');
  const input = mk('input', 'tp__in', { type: 'text', inputmode: 'numeric', maxlength: '5', placeholder: '--:--', 'aria-label': label, autocomplete: 'off', 'data-testid': 'time-input' });
  const btn = mk('button', 'icon-btn tp__btn', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': `${label}: ${t('time.pick')}`, 'data-testid': 'time-button' });
  btn.innerHTML = icon(iconName);
  root.append(input, btn);
  input.value = val;
  const set = (v) => {
    val = v;
    input.value = v;
    input.removeAttribute('aria-invalid');
    onChange?.(v);
  };
  const commit = () => {
    const n = input.value.trim() ? normTime(input.value) : '';
    if (n === null) {
      input.setAttribute('aria-invalid', 'true'); // 解釈できない入力は元に戻す
      input.value = val;
    } else set(n);
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // フォーム送信ではなく確定だけ
      commit();
    }
  });

  btn.addEventListener('click', () => {
    let [hh, mm] = val ? val.split(':') : ['', ''];
    const pop = mk('div', 'tpop', { role: 'dialog', 'aria-label': label });
    const col = (items, sel, k) =>
      `<ul class="tpop__col" role="listbox" aria-label="${k === 'h' ? 'H' : 'M'}">${items.map((v) => `<li role="option" tabindex="${v === sel ? 0 : -1}" data-${k}="${v}" aria-selected="${v === sel}">${v}</li>`).join('')}</ul>`;
    const draw = () => {
      pop.innerHTML = `<div class="tpop__cols">${col(HOURS, hh, 'h')}${col(MINS, mm, 'm')}</div><div class="cal__foot"><button type="button" class="btn btn--ghost btn--sm" data-act="clear">${esc(t('time.clear'))}</button></div>`;
    };
    draw();
    openPop(btn, pop);
    (pop.querySelector('[aria-selected="true"]') ?? pop.querySelector('li'))?.focus();
    pop.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
    const choose = (li) => {
      if (li.dataset.h) {
        hh = li.dataset.h;
        mm ||= '00';
      } else {
        mm = li.dataset.m;
        hh ||= '09';
      }
      set(`${hh}:${mm}`);
      if (li.dataset.m) closePop(true);
      else {
        const top = pop.querySelector('.tpop__col').scrollTop;
        draw();
        pop.querySelector('.tpop__col').scrollTop = top;
        pop.querySelector(`[data-h="${hh}"]`).focus();
      }
    };
    pop.addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (li) return choose(li);
      if (e.target.closest('[data-act="clear"]')) {
        closePop(true);
        set('');
      }
    });
    pop.addEventListener('keydown', (e) => {
      if (onEsc(e)) return;
      const li = e.target.closest('li');
      if (!li) return;
      const items = [...li.parentElement.children];
      const i = items.indexOf(li);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[Math.min(items.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        choose(li);
      }
    });
  });
  return {
    el: root,
    get: () => val,
    set: (v) => {
      val = v;
      input.value = v;
    },
  };
}

// ---------- 曜日チップ (毎週の繰り返し用) ----------
export function weekdayChips({ label, value = [], onChange }) {
  const on = new Set(value);
  const root = mk('div', 'wk', { role: 'group', 'aria-label': label });
  for (let i = 0; i < 7; i++) {
    const b = mk('button', 'wk__d', { type: 'button', 'aria-pressed': String(on.has(i + 1)), 'data-testid': 'weekday-chip' });
    b.dataset.d = String(i + 1);
    b.textContent = weekdayShort(i);
    root.append(b);
  }
  const get = () => [...on].sort((a, b) => a - b);
  root.addEventListener('click', (e) => {
    const b = e.target.closest('.wk__d');
    if (!b) return;
    const d = Number(b.dataset.d);
    if (on.has(d)) on.delete(d);
    else on.add(d);
    b.setAttribute('aria-pressed', String(on.has(d)));
    onChange?.(get());
  });
  return { el: root, get };
}
