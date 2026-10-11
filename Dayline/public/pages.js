import { t, escapeHtml as esc } from '/i18n.js';
import { runtime } from '/api.js';
import * as ui from '/ui.js';

let epoch = 0;
export function route() { return ['do', 'write', 'set'].includes(location.hash.slice(2)) ? location.hash.slice(2) : 'do'; }

function routeState(id, key, retry = false) {
  const page = document.querySelector(`#page-${id}`);
  if (!page || page.dataset.ready === 'true' || page.childElementCount) return;
  page.innerHTML = `<div class="route-state" role="${key === 'route.error' ? 'alert' : 'status'}" data-testid="route-state"><p>${esc(t(key))}</p>${retry ? `<button type="button" class="btn btn--primary" data-testid="route-retry">${esc(t('route.retry'))}</button>` : ''}</div>`;
  page.querySelector('[data-testid="route-retry"]')?.addEventListener('click', () => { page.innerHTML = ''; navigate(); });
}

export async function navigate() {
  const id = route(), ticket = ++epoch;
  document.documentElement.dataset.page = id;
  for (const page of document.querySelectorAll('main[data-page]')) page.hidden = page.dataset.page !== id;
  document.querySelector('#quick').hidden = id !== 'do';
  for (const link of document.querySelectorAll('#pages a')) {
    const active = link.hash === `#/${id}`;
    active ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current');
    link.title = t(`nav.${link.hash.slice(2)}`);
  }
  document.querySelector('#pages').style.setProperty('--page-index', ['do', 'write', 'set'].indexOf(id));
  if (id === 'do') return;
  routeState(id, 'route.loading');
  try {
    const mod = await import(id === 'write' ? '/write.js' : '/settings.js');
    if (ticket === epoch) await mod.init();
  } catch {
    if (ticket === epoch) {
      const page = document.querySelector(`#page-${id}`);
      if (page?.dataset.ready !== 'true') { page.innerHTML = ''; routeState(id, 'route.error', true); }
    }
  }
}

function rootChangedDialog() {
  const dialog = document.querySelector('#root-changed');
  if (dialog.open) return;
  ui.unmountMascots(dialog);
  dialog.innerHTML = `<div class="form"><div class="dlg-head"><h2 id="root-changed-h">${esc(t('rootChanged.title'))}</h2><span class="dlg-head__mascot" data-hs-state="notice" data-hs-assets="/assets/highsoul/layers" style="--hs-size:56px"></span></div><p class="cf__body">${esc(t('rootChanged.body'))}</p><div class="form__foot"><button type="button" class="btn btn--ghost" data-testid="copy-draft">${esc(t('rootChanged.copy'))}</button><span class="grow"></span><button type="button" class="btn btn--primary" data-testid="root-reload">${esc(t('rootChanged.reload'))}</button></div></div>`;
  dialog.oncancel = (event) => event.preventDefault();
  dialog.querySelector('[data-testid="copy-draft"]').onclick = async () => {
    const title = document.querySelector('[data-testid="write-title-input"]')?.value ?? '';
    const body = document.querySelector('[data-testid="write-editor"]')?.innerText ?? '';
    await navigator.clipboard.writeText([title, body].filter(Boolean).join('\n\n'));
  };
  dialog.querySelector('[data-testid="root-reload"]').onclick = () => location.reload();
  ui.mountMascots(dialog);
  dialog.showModal();
}

addEventListener('tooddae-root-changed', rootChangedDialog);
addEventListener('hashchange', navigate);
document.addEventListener('keydown', (event) => {
  if(event.target.closest?.('[data-testid="write-editor"]'))return;
  if (!((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') || route() === 'do') return;
  location.hash = '#/do'; navigate(); document.querySelector('#quick-input').focus();
}, true);
// Shift+1 / 2 / 3 で Do / Write / Set へ移動。文字入力中・ダイアログ表示中・IME 変換中は何もしない (Shift+数字は記号の入力)
document.addEventListener('keydown', (event) => {
  const index = event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && !event.isComposing && !event.repeat ? ['Digit1', 'Digit2', 'Digit3'].indexOf(event.code) : -1;
  if (index < 0 || event.defaultPrevented || document.querySelector('dialog[open]')) return;
  const target = event.target;
  if (target?.isContentEditable || target?.closest?.('input,textarea,select,[contenteditable]')) return;
  const link = document.querySelectorAll('#pages a')[index];
  if (!link) return;
  event.preventDefault();
  location.hash = link.hash;
});
addEventListener('dayline-language', () => { for (const link of document.querySelectorAll('#pages a')) link.title = t(`nav.${link.hash.slice(2)}`); });
document.querySelector('#app-version').textContent = runtime.version ? `v${runtime.version}` : 'v—';
navigate();
