// 後援モーダル (Set の「後援」から開く)。1〜3 段階を選ぶとキャラクターが段階に応じて反応する。
// 段階ごとの Stripe 決済リンク (JPY 基準・Adaptive Pricing で購入者の通貨に換算表示される)。リンクが空の段階は、メールの下書きを開く。
import { t, getLang, escapeHtml as esc } from '/i18n.js';
import * as ui from '/ui.js';

const MAIL = 'highsoul1227@highsoulstudio.com';
// 段階 1 / 2 / 3 の金額。中国語は米ドル
const PRICING = {
  ko: { currency: 'KRW', amounts: [1000, 3000, 10000] },
  ja: { currency: 'JPY', amounts: [100, 300, 1000] },
  en: { currency: 'USD', amounts: [0.99, 2.99, 9.99] },
  zh: { currency: 'USD', amounts: [0.99, 2.99, 9.99] },
};
const STRIPE = { 1: 'https://buy.stripe.com/4gM28q9v73zT5v68dMcbC01', 2: 'https://buy.stripe.com/5kQ6oGgXzdatcXy3XwcbC02', 3: 'https://buy.stripe.com/4gM5kCazb3zT0aMdy6cbC00' };
// 通貨ごとに別リンクを持てる。今は円のリンクだけなので、どの言語でも同じ 3 本
export const SPONSOR_LINKS = { KRW: STRIPE, JPY: STRIPE, USD: STRIPE };
const SIZES = { 1: 64, 2: 80, 3: 96 };

export const sponsorPricing = (lang = getLang()) => PRICING[lang] ?? PRICING.en;
export function formatAmount(currency, value, lang = getLang()) {
  if (currency === 'KRW') return `${value.toLocaleString('ko-KR')}원`;
  if (currency === 'JPY') return `${value.toLocaleString('ja-JP')}${lang === 'ko' ? '엔' : '円'}`;
  return `$${value.toFixed(2)}`;
}

export function openSponsor(opener) {
  const { currency, amounts } = sponsorPricing();
  const lang = getLang();
  const linked = [1, 2, 3].every((n) => SPONSOR_LINKS[currency]?.[n]); // 3 段階ともリンクがあれば決済ページ、なければメール
  const dialog = document.createElement('dialog');
  dialog.className = 'sponsor-dialog';
  dialog.dataset.testid = 'sponsor-dialog';
  dialog.setAttribute('aria-labelledby', 'sponsor-title');
  const tiers = [1, 2, 3].map((n) => `<label class="sponsor-tier" data-level="${n}" data-testid="sponsor-tier-${n}"><input type="radio" name="sponsor-tier" value="${n}" data-testid="sponsor-radio-${n}"><span class="sponsor-tier__mascot" data-hs-state="sparkle" data-hs-assets="/assets/highsoul/layers" style="--hs-size:${SIZES[n]}px"></span><span class="sponsor-tier__step">${esc(t('sponsor.step', { n }))}</span><strong class="sponsor-tier__name">${esc(t(`sponsor.step${n}`))}</strong><span class="sponsor-tier__amount" data-testid="sponsor-amount-${n}">${esc(formatAmount(currency, amounts[n - 1], lang))}</span></label>`).join('');
  dialog.innerHTML = `<form class="form sponsor-form"><h2 id="sponsor-title">${esc(t('sponsor.title'))}</h2><p class="cf__body">${esc(t('sponsor.intro'))}</p><div class="sponsor-tiers" role="radiogroup" aria-label="${esc(t('sponsor.steps'))}">${tiers}</div><p class="sponsor-note muted" data-testid="sponsor-note">${esc(t(linked ? 'sponsor.noteLink' : 'sponsor.note'))}</p><p class="sponsor-thanks" data-testid="sponsor-thanks" role="status" aria-live="polite" hidden>${esc(t(linked ? 'sponsor.thanksLink' : 'sponsor.thanks'))}</p><div class="form__foot"><button type="button" class="btn btn--ghost" data-testid="sponsor-close">${esc(t('btn.close'))}</button><span class="grow"></span><button type="submit" class="btn btn--primary" data-testid="sponsor-send" disabled>${esc(t(linked ? 'sponsor.sendLink' : 'sponsor.send'))}</button></div></form>`;
  document.body.append(dialog);
  ui.mountMascots(dialog);
  const form = dialog.querySelector('form'), send = dialog.querySelector('[data-testid="sponsor-send"]'), thanks = dialog.querySelector('[data-testid="sponsor-thanks"]');
  const mascotOf = (n) => dialog.querySelector(`[data-level="${n}"] [data-hs-state]`);
  const react = (n) => window.Highsoul?.react?.(mascotOf(n), n);
  const selected = () => Number(dialog.querySelector('input[name="sponsor-tier"]:checked')?.value ?? 0);
  form.addEventListener('change', () => {
    const n = selected();
    send.disabled = !n;
    thanks.hidden = true;
    for (const m of dialog.querySelectorAll('.sponsor-tier [data-hs-state]')) window.Highsoul?.setState(m, 'sparkle');
    if (n) react(n);
  });
  for (const label of dialog.querySelectorAll('.sponsor-tier')) label.addEventListener('pointerenter', () => { if (matchMedia('(hover:hover)').matches) react(Number(label.dataset.level)); });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const n = selected();
    if (!n) return;
    const amount = formatAmount(currency, amounts[n - 1], lang), link = SPONSOR_LINKS[currency]?.[n];
    const a = document.createElement('a');
    if (link) { a.href = link; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    else a.href = `mailto:${MAIL}?subject=${encodeURIComponent(t('sponsor.mailSubject', { n, amount }))}&body=${encodeURIComponent(t('sponsor.mailBody', { n, amount }))}`;
    a.click();
    thanks.hidden = false;
    window.Highsoul?.setState(mascotOf(n), 'success');
    react(n);
  });
  dialog.querySelector('[data-testid="sponsor-close"]').onclick = () => dialog.close();
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { ui.unmountMascots(dialog); dialog.remove(); opener?.focus?.(); });
  dialog.showModal();
  return dialog;
}
