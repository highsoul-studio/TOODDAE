import {test,expect} from '../fixtures.js';
import {PagesPage} from '../page-objects/pages.page.js';

// 観点: 後援モーダル (Set > 後援)。言語ごとの金額表示、段階の選択、送信 (既定はメール下書き)
const AMOUNTS={ko:['1,000원','3,000원','10,000원'],ja:['100円','300円','1,000円'],en:['$0.99','$2.99','$9.99'],zh:['$0.99','$2.99','$9.99']};

for(const lang of Object.keys(AMOUNTS)){
  test(`パターン: 後援モーダルは ${lang} の通貨で 3 段階を表示する`,async({page,vault})=>{
    const pages=new PagesPage(page,vault);await page.addInitScript(l=>{try{localStorage.setItem('lang',l);}catch{}},lang);
    await pages.open('set');
    await page.getByTestId('sponsor-open').click();
    const dialog=page.getByTestId('sponsor-dialog');await expect(dialog).toBeVisible();
    for(const [index,amount] of AMOUNTS[lang].entries())await expect(page.getByTestId(`sponsor-amount-${index+1}`)).toHaveText(amount);
    await expect(page.getByTestId('sponsor-send')).toBeDisabled();
  });
}

const LINKS={1:'https://buy.stripe.com/4gM28q9v73zT5v68dMcbC01',2:'https://buy.stripe.com/5kQ6oGgXzdatcXy3XwcbC02',3:'https://buy.stripe.com/4gM5kCazb3zT0aMdy6cbC00'};

for(const [lang,tier] of [['ko',3],['ja',1],['en',2],['zh',3]]){
  test(`パターン: ${lang} で ${tier} 段階を選んで進むと、その段階の Stripe 決済ページを新しいタブで開く`,async({page,vault})=>{
    const pages=new PagesPage(page,vault);await page.addInitScript(l=>{try{localStorage.setItem('lang',l);}catch{}window.__opened=[];HTMLAnchorElement.prototype.click=function(){window.__opened.push({href:this.href,target:this.target,rel:this.rel});};},lang);
    await pages.open('set');
    await page.getByTestId('sponsor-open').click();
    await expect(page.getByTestId('sponsor-send')).toBeDisabled();
    await page.getByTestId(`sponsor-tier-${tier}`).click();
    await expect(page.getByTestId(`sponsor-radio-${tier}`)).toBeChecked();await expect(page.getByTestId('sponsor-send')).toBeEnabled();
    await page.getByTestId('sponsor-send').click();
    await expect(page.getByTestId('sponsor-thanks')).toBeVisible();
    expect(await page.evaluate(()=>window.__opened)).toEqual([{href:LINKS[tier],target:'_blank',rel:'noopener noreferrer'}]);
    await page.keyboard.press('Escape');await expect(page.getByTestId('sponsor-dialog')).toHaveCount(0);
    await expect(page.getByTestId('sponsor-open')).toBeFocused();
  });
}

test('パターン: 決済ページを開くことと金額の換算について、モーダルに説明が出る',async({page,vault})=>{
  const pages=new PagesPage(page,vault);await page.addInitScript(()=>{try{localStorage.setItem('lang','ko');}catch{}});
  await pages.open('set');await page.getByTestId('sponsor-open').click();
  await expect(page.getByTestId('sponsor-note')).toContainText('Stripe');await expect(page.getByTestId('sponsor-note')).toContainText('¥100');
});
