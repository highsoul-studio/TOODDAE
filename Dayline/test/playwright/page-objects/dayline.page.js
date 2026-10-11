// Dayline の画面操作 (Page Object)。UI の操作と取得だけを持ち、期待値の判断はテスト側に置く。
// セレクタの優先順位 (チーム規約): data-testid > role > 文言 > class > id。行は表示文言 (タイトル) で探し、行番号や data-id には頼らない。
import { expect } from '@playwright/test';

export class DaylinePage {
  constructor(page, vault, browserName = 'chromium') {
    this.page = page;
    this.vault = vault;
    this.browserName = browserName;
  }

  // ---------- ロケータ ----------
  get themeToggle() { return this.page.getByTestId('theme-toggle'); }
  get brandIcon() { return this.page.getByTestId('brand').locator('svg'); }
  brandGeometry() { return this.brandIcon.evaluate(svg=>({viewBox:svg.getAttribute('viewBox'),fill:svg.getAttribute('fill'),paths:[...svg.querySelectorAll('path')].map(path=>path.getAttribute('d'))})); }
  get langButton() { return this.page.getByTestId('lang-button'); }
  get syncPill() { return this.page.getByTestId('sync-pill'); }
  get quickInput() { return this.page.getByTestId('quick-input'); }
  get quickMore() { return this.page.getByTestId('quick-more'); }
  get toasts() { return this.page.getByTestId('toast'); }
  get popover() { return this.page.getByTestId('popover'); }
  get itemDialog() { return this.page.getByTestId('item-dialog'); }
  get dialogTitle() { return this.itemDialog.getByTestId('dialog-title'); }
  get confirmDialog() { return this.page.getByTestId('confirm-dialog'); }
  get sectionDialog() { return this.page.getByTestId('section-dialog'); }
  get upcomingDates() { return this.page.getByTestId('upcoming-date'); }
  get dayPills() { return this.page.getByTestId('day-pill'); }
  panel(name) { return this.page.getByTestId(`panel-${name}`); } // hero | tasks | routine | side
  fontSize(testId) { return this.page.getByTestId(testId).evaluate(el=>Number.parseFloat(getComputedStyle(el).fontSize)); }
  task(title, panel) { return (panel ? this.panel(panel) : this.page).getByTestId('task').filter({ hasText: title }); }
  taskCheck(title, panel) { return this.task(title, panel).getByTestId('task-check'); }
  taskTitle(title, panel) { return this.task(title, panel).getByTestId('task-title'); }
  taskMemo(title, panel) { return this.task(title, panel).getByTestId('task-memo'); }
  dayPill(title) { return this.dayPills.filter({ hasText: title }); }
  dayPillFilter(title){return this.dayPill(title).evaluate(el=>getComputedStyle(el).filter);}
  dayPillVisual(title){return this.dayPill(title).evaluate(el=>{const line=el.querySelector('.dl-strike-line'),matrix=getComputedStyle(line).transform,filter=getComputedStyle(el).filter;return{opacity:filter==='none'?1:Number.parseFloat(filter.match(/opacity\(([^)]+)/)?.[1]??1),strike:matrix==='none'?0:Number(matrix.slice(7,-1).split(',')[0])||0};});}
  section(name, panel = 'tasks') { return this.panel(panel).getByTestId('section').filter({ has: this.page.getByTestId('section-name').filter({ hasText: new RegExp(`^${name}$`) }) }); }

  // class や属性でしか指せないものは、セレクタをここに集める (スペックには置かない: 名前が変わったとき直す場所を 1 か所にするため)
  get root() { return this.page.locator('html'); }
  get formError() { return this.itemDialog.locator('.form__err'); }
  get progressNum() { return this.panel('hero').locator('.progress__num'); }
  get progressBar() { return this.panel('hero').getByTestId('progress-bar'); }
  sectionOrderButton(panel) { return this.panel(panel).getByTestId('section-order'); }
  sectionOrderIcon(panel) { return this.sectionOrderButton(panel).locator('svg'); }
  sectionOrderRows(panel) { return this.panel(panel).getByTestId('section-order-row'); }
  sectionOrderNames(panel) { return this.sectionOrderRows(panel).evaluateAll(rows=>rows.map(row=>row.dataset.name)); }
  sectionOrderHandle(panel,name) { return this.sectionOrderRows(panel).filter({hasText:name}).getByTestId('section-order-handle'); }
  sectionOrderHandleIcon(panel,name) { return this.sectionOrderHandle(panel,name).locator('svg'); }
  sectionOrderMove(panel,name,direction) { return this.sectionOrderRows(panel).filter({hasText:name}).locator(`[data-order-move="${direction}"]`); }
  sectionNames(panel) { return this.panel(panel).getByTestId('section-name').allTextContents(); }
  sectionProgress(panel,name) { return this.section(name,panel).locator('.rgroup__bar'); }
  panelHasOverflow(panel) { return this.panel(panel).evaluate(el=>el.scrollWidth>el.clientWidth); }
  panelCount(panel) { return this.panel(panel).locator('.sec__head .count').first(); }
  nowGeometry(){return this.panel('hero').evaluate(hero=>{const rail=hero.querySelector('.dayline__rail')?.getBoundingClientRect(),line=hero.querySelector('.dayline__now'),box=line?.getBoundingClientRect(),after=line&&getComputedStyle(line,'::after'),dot=box&&after?box.bottom-Number.parseFloat(after.bottom)-Number.parseFloat(after.height)/2:NaN;return{railCenter:rail&&(rail.top+rail.height/2),dot,diff:rail?Math.abs(dot-(rail.top+rail.height/2)):NaN};});}
  startDayPillSampling(title,duration=1400){return this.page.evaluate(({title,duration})=>{const values=[],started=performance.now();window.__dayPillSamples=new Promise(resolve=>{const frame=()=>{const pill=[...document.querySelectorAll('[data-testid="day-pill"]')].find(item=>item.textContent.includes(title)),line=pill?.querySelector('.dl-strike-line');if(pill&&line){const matrix=getComputedStyle(line).transform,filter=getComputedStyle(pill).filter;values.push({opacity:filter==='none'?1:Number.parseFloat(filter.match(/opacity\(([^)]+)/)?.[1]??1),strike:matrix==='none'?0:Number(matrix.slice(7,-1).split(',')[0])||0});}if(performance.now()-started<duration)requestAnimationFrame(frame);else resolve(values);};requestAnimationFrame(frame);});},{title,duration});}
  dayPillSamples(){return this.page.evaluate(()=>window.__dayPillSamples);}
  itemMemoGeometry(){return this.itemDialog.evaluate(dialog=>{const label=dialog.querySelector('[for="dlg-memo"]').getBoundingClientRect(),hint=dialog.querySelector('.item-memo .hint').getBoundingClientRect(),memo=dialog.querySelector('[data-testid="field-memo"]').getBoundingClientRect(),routine=dialog.querySelector('[data-testid="field-routine"]').closest('.check').getBoundingClientRect(),main=dialog.querySelector('.item-main').getBoundingClientRect();return{labelBottom:label.bottom,hintTop:hint.top,hintBottom:hint.bottom,memoTop:memo.top,memoBottom:memo.bottom,routineBottom:routine.bottom,mainBottom:main.bottom};});}
  dispatchItemShortcut({repeat=false,isComposing=false}={}){return this.itemDialog.evaluate((dialog,init)=>dialog.querySelector('[data-testid="field-text"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',metaKey:true,bubbles:true,cancelable:true,...init})),{repeat,isComposing});}
  setDialogTimeTitle(value){return this.field('ts').getByTestId('time-button').evaluate((el,text)=>el.title=text,value);}
  prepareLanguageFrameProbe(){return this.page.evaluate(()=>{sessionStorage.removeItem('translated-before-reload');const before=document.documentElement.lang;new MutationObserver(()=>{if(document.documentElement.lang!==before)sessionStorage.setItem('translated-before-reload','1');}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});});}
  languageFrameProbe(){return this.page.evaluate(()=>sessionStorage.getItem('translated-before-reload'));}
  async tooltipFor(control){await control.hover();const tooltip=this.page.getByTestId('app-tooltip');await expect(tooltip).toBeVisible();return tooltip.evaluate(el=>{const r=el.getBoundingClientRect();return{text:el.textContent,width:r.width,height:r.height,described:document.querySelector(`[aria-describedby~="${el.id}"]`)?.getAttribute('data-testid')??''};});}
  itemDialogFit(){return this.itemDialog.evaluate(dialog=>{const footer=dialog.querySelector('.form__foot').getBoundingClientRect(),hint=dialog.querySelector('.form__key-hint').getBoundingClientRect(),buttons=[...dialog.querySelectorAll('.form__foot button')].filter(button=>!button.hidden).map(button=>{const r=button.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};});return{clientWidth:dialog.clientWidth,scrollWidth:dialog.scrollWidth,footer:{left:footer.left,right:footer.right,top:footer.top,bottom:footer.bottom},hint:{left:hint.left,right:hint.right,top:hint.top,bottom:hint.bottom},buttons};});}
  quickFocusShadows(){return this.quickInput.evaluate(input=>({outer:getComputedStyle(input.closest('.quick')).boxShadow,inner:getComputedStyle(input).boxShadow}));}
  quickBorder(){return this.quickInput.evaluate(input=>getComputedStyle(input.closest('.quick')).borderColor);}
  itemControlBorders(){return this.itemDialog.evaluate(dialog=>({text:getComputedStyle(dialog.querySelector('[data-testid="field-text"]')).borderColor,memo:getComputedStyle(dialog.querySelector('[data-testid="field-memo"]')).borderColor,time:getComputedStyle(dialog.querySelector('[data-testid="field-ts"] .tp')).borderColor,select:getComputedStyle(dialog.querySelector('[data-testid="field-prio"] [data-testid="select-button"]')).borderColor}));}
  async delayNextSectionReorder(){let release,start,delayed=false;const gate=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{start=resolve}),calls=[];await this.page.route('**/api/section/reorder',async route=>{calls.push(route.request().postDataJSON());if(!delayed){delayed=true;start();await gate;}await route.continue();});return{calls,release,started};}
  forgeBusySectionControls(panel){return this.panel(panel).evaluate(container=>{const cancel=container.querySelector('[data-testid="section-order-cancel"]');cancel.disabled=false;cancel.click();const down=container.querySelector('[data-order-move="down"]');down.disabled=false;down.click();});}
  get todayHeatCell() { return this.page.getByTestId('heat-cell').and(this.page.locator('.is-today')); }
  get syncDot() { return this.syncPill.locator('.sync__dot'); }
  themeIcon(kind) { return this.themeToggle.locator(`.i-${kind}`); } // 'moon' | 'sun'
  taskStrike(title, panel) { return this.taskTitle(title, panel).locator('.strike'); }
  calDay(date) { return this.page.getByTestId('cal-day').and(this.page.locator(`[data-d="${date}"]`)); }
  option(value) { return this.popover.locator(`[data-v="${value}"]`); }
  // 文字が HTML として解釈されていないかを見る: 題名・メモの中に現れてはいけない要素 / 子要素そのもの
  injectedMarkup(inside) { return inside.locator('img, script, svg, b, u, i, a[href^="javascript"]'); }
  childElements(inside) { return inside.locator('*'); }

  // 詳細ダイアログの入力欄
  field(name) { return this.itemDialog.getByTestId(`field-${name}`); } // ts te start due prio repeat days dom until section / text memo routine
  get memoField() { return this.itemDialog.getByTestId('field-memo'); }
  get textField() { return this.itemDialog.getByTestId('field-text'); }
  get routineBox() { return this.itemDialog.getByTestId('field-routine'); }
  timeInput(slot) { return this.field(slot).getByTestId('time-input'); } // ts | te
  get hintTime() { return this.itemDialog.getByTestId('hint-time'); }
  get submit() { return this.itemDialog.getByTestId('dialog-submit'); }
  get danger() { return this.itemDialog.getByTestId('dialog-danger'); }

  // ---------- 操作 ----------
  // キーボードで次 / 前の要素へ。Safari (WebKit) は既定ではボタンへ Tab が届かない (Option+Tab で届く) ので、そちらを使う
  async tab({ back = false } = {}) {
    const alt = this.browserName === 'webkit' ? 'Alt+' : '';
    await this.page.keyboard.press(`${alt}${back ? 'Shift+' : ''}Tab`);
  }

  // ページを開き、言語とテーマを決めて (localStorage)、最初の描画が終わるまで待つ
  async open({ lang = 'ko', theme = 'light', url = '/', withTasks = true } = {}) {
    await this.vault?.settle(); // テストが先に vault を書き換えていたら、サーバの「変更あり」の通知が落ち着くのを待つ (開いたあとに画面が作り直されないように)
    await this.page.goto(url);
    await this.page.evaluate(([l, t]) => { localStorage.setItem('lang', l); localStorage.setItem('theme', t); }, [lang, theme]);
    await this.page.reload();
    await this.ready({ withTasks });
  }

  // 最初の描画が終わるまで待つ (再読み込みのあとにも使う)。何もない日は withTasks: false
  async ready({ withTasks = true } = {}) {
    await expect(this.syncPill).toHaveAttribute('data-state', /live|ro/);
    await expect(withTasks ? this.page.getByTestId('task').first() : this.panel('tasks').getByRole('heading', { level: 2 })).toBeVisible();
    await this.page.evaluate(() => document.fonts.ready.then(() => new Promise(requestAnimationFrame))); // 書体の読み込みと配置が落ち着くまで
  }

  progressStats() { return this.progressBar.evaluate(el=>{const fill=el.querySelector('.ticks__fill'),gaps=[...el.querySelectorAll('.ticks__gaps i')];return{done:Number(el.dataset.done),total:Number(el.dataset.total),width:el.clientWidth,fill:fill.getBoundingClientRect().width,gaps:gaps.length,gapWidths:gaps.map(gap=>gap.getBoundingClientRect().width),label:el.getAttribute('aria-label')};}); }
  progressGapCount() { return this.progressBar.locator('.ticks__gaps i').count(); }
  progressTransitionDuration() { return this.progressBar.locator('.ticks__fill').evaluate(el=>Number.parseFloat(getComputedStyle(el).transitionDuration)); }
  progressGapMotion() { return this.progressBar.locator('.ticks__gaps i').first().evaluate(el=>{const style=getComputedStyle(el);return{duration:Number.parseFloat(style.transitionDuration),delay:Number.parseFloat(style.transitionDelay)};}); }
  hasPageOverflow() { return this.page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth); }
  waitForPost(path) { return this.page.waitForResponse(response=>new URL(response.url()).pathname===path&&response.request().method()==='POST'); }
  startProgressSampling(duration=1800) { return this.page.evaluate(ms=>{const samples=[],started=performance.now();window.__progressSamples=new Promise(resolve=>{const frame=()=>{const bar=document.querySelector('[data-testid="progress-bar"]'),fill=bar?.querySelector('.ticks__fill'),gaps=[...bar?.querySelectorAll('.ticks__gaps i')??[]];if(bar&&fill){const box=bar.getBoundingClientRect(),ink=fill.getBoundingClientRect(),width=box.width;samples.push({fill:ink.width,fraction:ink.width/width,left:(ink.left-box.left)/width,right:(ink.right-box.left)/width,width,gap:gaps.reduce((sum,item)=>sum+item.getBoundingClientRect().width,0)});}if(performance.now()-started<ms)requestAnimationFrame(frame);else resolve(samples);};requestAnimationFrame(frame);});},duration); }
  progressSamples() { return this.page.evaluate(()=>window.__progressSamples); }
  startSectionProgressSampling(panel,name,duration=1800){return this.page.evaluate(({panel,name,duration})=>{const samples=[],started=performance.now();window.__sectionProgressSamples=new Promise(resolve=>{const frame=()=>{const sections=[...document.querySelectorAll(`[data-testid="panel-${panel}"] [data-testid="section"]`)],section=sections.find(item=>item.querySelector('[data-testid="section-name"]')?.textContent===name),bar=section?.querySelector('.rgroup__bar'),fill=bar?.querySelector('i');if(bar&&fill)samples.push(fill.getBoundingClientRect().width/bar.getBoundingClientRect().width);if(performance.now()-started<duration)requestAnimationFrame(frame);else resolve(samples);};requestAnimationFrame(frame);});},{panel,name,duration});}
  sectionProgressSamples(){return this.page.evaluate(()=>window.__sectionProgressSamples);}

  // 行の上端からチェックボックスの上端までの距離。探す・測るを 1 回の evaluate で行う:
  // 保存の直後は SSE の echo で一覧が作り直されるので、要素を取ってから測る 2 段階だと、外れた要素の座標 (全部 0) を測ってしまう。
  checkOffset(title) {
    return this.page.evaluate((t) => {
      const row = [...document.querySelectorAll('[data-testid="task"]')].find((li) => li.querySelector('[data-testid="task-title"]')?.textContent.includes(t));
      const box = row?.querySelector('[data-testid="task-check"]');
      if (!box || !row.offsetHeight) throw new Error(`row not found or not laid out: ${t}`);
      return box.getBoundingClientRect().top - row.getBoundingClientRect().top;
    }, title);
  }

  async openEditDialog(title, panel) {
    const row = this.task(title, panel);
    await row.hover(); // 操作ボタンは行に載せたときに見える
    await row.getByTestId('task-edit').click();
    await expect(this.itemDialog).toBeVisible();
  }

  async openAddDialog() {
    await this.quickMore.click();
    await expect(this.itemDialog).toBeVisible();
  }

  async saveDialog() {
    await this.submit.click();
    await expect(this.itemDialog).toBeHidden();
  }

  async pickOption(slot, value) {
    await this.field(slot).getByTestId('select-button').click();
    await this.option(value).click();
  }

  // 曜日チップを指定の曜日 (0 = 月 … 6 = 日) だけが押された状態にする。分岐はテストではなくここに置く
  async setWeekdays(days) {
    const chips = this.field('days').getByTestId('weekday-chip');
    for (let i = 0; i < 7; i++) {
      const want = days.includes(i);
      const on = (await chips.nth(i).getAttribute('aria-pressed')) === 'true';
      if (on !== want) await chips.nth(i).click();
    }
  }

  // 時刻欄に入れて、確定 (フォーカスを外す) する。空文字で消す
  async setTime(slot, value) {
    const input = this.timeInput(slot);
    await input.fill(value);
    await input.blur();
  }

  async clearDate(slot) {
    await this.field(slot).getByTestId('date-clear').click();
  }

  async setDate(slot, date) {
    await this.field(slot).getByTestId('date-button').click();
    await this.calDay(date).click();
  }

  async confirm(yes) {
    await expect(this.confirmDialog).toBeVisible();
    await this.confirmDialog.getByTestId(yes ? 'confirm-yes' : 'confirm-no').click();
    await expect(this.confirmDialog).toBeHidden();
  }

  async deleteRoutine(title) {
    const row = this.task(title, 'routine');
    await row.hover();
    await row.getByTestId('task-cancel').click();
  }

  // ---------- 計測 (画面の挙動を数値で見る) ----------
  // 押した直後から再描画の後まで、毎フレームの「チェックの中心 - タイトルの中心」・position・角丸・影を記録する。
  // 計測 (評価) を先に走らせてから、本物のクリックを行う。待ち時間は「計測の窓」であって、同期のための固定待機ではない
  async sampleFrames(title, panel, windowMs = 2300) {
    return this.sampleFramesOf(this.task(title, panel), windowMs);
  }

  async sampleFramesOf(row, windowMs = 2300) {
    const id = await row.getAttribute('data-id');
    const sampler = this.page.evaluate(({ id, windowMs }) => new Promise((resolve) => {
      const out = [];
      const t0 = performance.now();
      const tick = () => {
        const li = document.querySelector(`[data-testid="task"][data-id="${CSS.escape(id)}"]`);
        if (li) {
          const c = li.querySelector('[data-testid="task-check"]');
          const cb = c.getBoundingClientRect();
          const tb = li.querySelector('[data-testid="task-title"]').getBoundingClientRect();
          const cs = getComputedStyle(c);
          out.push({ off: +(cb.top + cb.height / 2 - (tb.top + tb.height / 2)).toFixed(2), pos: cs.position, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow !== 'none' });
        }
        if (performance.now() - t0 < windowMs) requestAnimationFrame(tick);
        else resolve(out);
      };
      requestAnimationFrame(tick);
    }), { id, windowMs });
    await row.getByTestId('task-check').click();
    const f = await sampler;
    return { frames: f.length, offCentre: f.filter((x) => Math.abs(x.off) > 0.5).length, nonStatic: f.filter((x) => x.pos !== 'static').length, wrongRadius: f.filter((x) => x.radius !== '6px').length, shadow: f.filter((x) => x.shadow).length };
  }

  // 押した後の .strike の幅 (0% → 100%) を 40ms 刻みで記録。途中の値があれば「描かれている」
  async sampleStrike(title, panel, windowMs = 1300) {
    return this.sampleStrikeOf(this.task(title, panel), windowMs);
  }

  async sampleStrikeOf(row, windowMs = 1300) {
    const id = await row.getAttribute('data-id');
    const sampler = this.page.evaluate(({ id, windowMs }) => new Promise((resolve) => {
      const out = [];
      const t0 = performance.now();
      const iv = setInterval(() => {
        const st = document.querySelector(`[data-testid="task"][data-id="${CSS.escape(id)}"] .strike`);
        out.push([Math.round(performance.now() - t0), st ? parseFloat(getComputedStyle(st).backgroundSize) : null]);
        if (performance.now() - t0 >= windowMs) { clearInterval(iv); resolve(out); }
      }, 40);
    }), { id, windowMs });
    await row.getByTestId('task-check').click();
    const log = await sampler;
    const first = log.find((x) => x[1] > 0.5)?.[0];
    const full = log.find((x) => x[1] >= 99.9)?.[0];
    return { mid: log.filter((x) => x[1] > 5 && x[1] < 95).length, spanMs: first != null && full != null ? full - first : null, ended: log.at(-1)[1], sizes: log.map((x) => x[1]).filter((v) => v !== null) };
  }

  async sampleUnstrike(title, panel, windowMs = 1300) {
    const row = this.task(title, panel);
    const id = await row.getAttribute('data-id');
    const sampler = this.page.evaluate(({ id, windowMs }) => new Promise((resolve) => {
      const out = []; const t0 = performance.now();
      const iv = setInterval(() => {
        const strike = document.querySelector(`li[data-id="${CSS.escape(id)}"] .strike`);
        out.push(strike ? parseFloat(getComputedStyle(strike).backgroundSize) : null);
        if (performance.now() - t0 >= windowMs) { clearInterval(iv); resolve(out); }
      }, 40);
    }), { id, windowMs });
    await row.getByTestId('task-check').click();
    const sizes = (await sampler).filter((value) => value !== null);
    return { sizes, mid: sizes.filter((value) => value > 5 && value < 95).length, ended: sizes.at(-1) };
  }

  heatSummary() { return this.page.getByTestId('heat-cell').evaluateAll((cells) => cells.map((cell) => ({ level: cell.dataset.l ?? '0', label: cell.getAttribute('aria-label'), future: cell.classList.contains('is-future') }))); }

  // マウスのボタンを押したまま止める / 離す (押している最中に何かが起きる状況を作る)。押す位置は要素の中央
  async pressDown(locator) {
    const box = await locator.boundingBox();
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await this.page.mouse.down();
  }

  release() {
    return this.page.mouse.up();
  }

  // 画面側で、ここまでに積まれた処理が一巡するまで待つ (描画の 2 フレーム分)。「届いた通知がページに処理された」ことの区切りに使う
  nextFrames() {
    return this.page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }

  // 状態の取得 (GET /api/state) の応答だけを遅らせる (競合の再現用)。1 回目の取得は delays[0]、2 回目は delays[1]…、最後の値はそれ以降すべて。
  // 中身は取得した時点のまま届くので、遅れた分だけ古くなる
  async delayStateResponses(...delays) {
    let n = 0;
    await this.page.route('**/api/state', async (route) => {
      const ms = delays[Math.min(n++, delays.length - 1)];
      const res = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, ms));
      await route.fulfill({ response: res });
    });
  }

  // 遅らせるのをやめる。待っている途中の応答は捨てる (テストの終わりでエラーにしない)
  stopDelayingState() {
    return this.page.unrouteAll({ behavior: 'ignoreErrors' });
  }

  // 行のチェックの状態を、画面の中で一定間隔に記録する (true = 付いている)。巻き戻りなどの「途中」を見る
  sampleChecked(title, panel, windowMs = 1200) {
    return this.task(title, panel).getAttribute('data-id').then((id) => this.page.evaluate(({ id, windowMs }) => new Promise((resolve) => {
      const out = [];
      const t0 = performance.now();
      const iv = setInterval(() => {
        out.push(document.querySelector(`[data-testid="task"][data-id="${CSS.escape(id)}"] [data-testid="task-check"]`)?.checked ?? null);
        if (performance.now() - t0 >= windowMs) { clearInterval(iv); resolve(out); }
      }, 30);
    }), { id, windowMs }));
  }

  // ---------- 計測 (値を返すだけ。良し悪しの判断はテスト側) ----------
  // 行ごとの「チェックの中心 - タイトルの中心」(px、絶対値)。行を渡さなければ画面の全ての行
  centreOffsets(rows = this.page.getByTestId('task')) {
    return rows.evaluateAll((list) => list.map((li) => {
      const c = li.querySelector('[data-testid="task-check"]').getBoundingClientRect();
      const t = li.querySelector('[data-testid="task-title"]').getBoundingClientRect();
      return Math.abs(c.top + c.height / 2 - (t.top + t.height / 2));
    }));
  }

  // 題名が何行に見えているか
  titleLines(title) {
    return this.taskTitle(title).evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
  }

  // メモが何行見えていて、切れているか
  memoClamp(title) {
    return this.taskMemo(title).evaluate((el) => ({ visible: Math.round(el.clientHeight / parseFloat(getComputedStyle(el).lineHeight)), clipped: el.scrollHeight > el.clientHeight + 1 }));
  }

  // 取り消し線の幅 (%)。0 = 引かれていない、100 = 全部
  strikeWidth(title, panel) {
    return this.taskStrike(title, panel).evaluate((el) => parseFloat(getComputedStyle(el).backgroundSize));
  }

  // 「今後の予定」の日付の列が、それぞれ何行に見えているか (文字の行の上端が違うものを数える)
  upcomingDateLines() {
    return this.upcomingDates.evaluateAll((cells) => cells.map((d) => {
      const tops = [];
      const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const r = document.createRange();
        r.selectNodeContents(n);
        for (const q of r.getClientRects()) if (q.width > 0 && !tops.some((t) => Math.abs(t - q.top) < 4)) tops.push(q.top);
      }
      return tops.length;
    }));
  }

  hasHorizontalScroll() {
    return this.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  }

  // 要素の中身が、その要素の幅からはみ出しているか
  overflowsHorizontally(locator) {
    return locator.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  }

  // パネルの右端から外へはみ出している要素の数
  overflowingChildren(panel) {
    return this.panel(panel).evaluate((el) => [...el.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).length);
  }

  // Day line の予定 (ピル) の中身: 時刻の表示 / 題名が切れているか / 目盛り (時) の x 座標 / Day line 全体の枠
  pillTime(title) { return this.dayPill(title).locator('time'); }
  pillTruncates(title) { return this.dayPill(title).locator('span').evaluate((el) => el.scrollWidth > el.clientWidth); }
  hourX(hour) {
    return this.page.evaluate((h) => {
      const label = [...document.querySelectorAll('.dayline__label')].find((el) => el.textContent.trim() === String(h));
      const tick = label?.previousElementSibling; // 目盛りの線 (ラベルの直前の要素) の位置 = その時刻の x
      if (!tick) throw new Error(`tick not found: ${h}`);
      return tick.getBoundingClientRect().left;
    }, hour);
  }
  dayLineBox() { return this.page.locator('.dayline').boundingBox(); }
  dayLineScrollProbe() { return this.page.evaluate(() => { const el=document.querySelector('.dayline-wrap');el.scrollLeft=120;return{scrollbar:getComputedStyle(el).scrollbarWidth,left:el.scrollLeft,scrollable:el.scrollWidth>el.clientWidth}; }); }

  // Day line の予定 (ピル) の位置と大きさ。全部を 1 回の evaluate で測る (途中で作り直されて、外れた要素の座標を測らないように)
  dayPillBoxes(titles) {
    return this.page.evaluate((list) => list.map((t) => {
      const pill = [...document.querySelectorAll('[data-testid="day-pill"]')].find((el) => el.textContent.includes(t));
      if (!pill || !pill.offsetHeight) throw new Error(`pill not found or not laid out: ${t}`);
      const { x, y, width, height } = pill.getBoundingClientRect();
      return { x, y, width, height };
    }), titles);
  }

  focusInDialog() {
    return this.page.evaluate(() => !!document.activeElement?.closest('dialog'));
  }
  itemDialogLayout() { return this.itemDialog.evaluate((dialog) => { const main=dialog.querySelector('.item-main').getBoundingClientRect(),memo=dialog.querySelector('.item-memo').getBoundingClientRect(),foot=dialog.querySelector('.form__foot').getBoundingClientRect(),form=dialog.querySelector('form').getBoundingClientRect(),area=dialog.querySelector('[data-testid="field-memo"]'); return { main:{x:main.x,y:main.y,w:main.width},memo:{x:memo.x,y:memo.y,w:memo.width},foot:{x:foot.x,w:foot.width},form:{x:form.x,w:form.width},resize:getComputedStyle(area).resize }; }); }

  // 詳細ダイアログの中に見えている文言 (翻訳漏れのキーが出ていないかを見る)
  async dialogTexts() {
    return (await this.itemDialog.locator('label, button, h2, .field__l, .hint, small, b').allInnerTexts()).map((s) => s.trim()).filter(Boolean);
  }

  // デザイントークン (CSS 変数) が実際に描く色 [r, g, b]
  tokenColours(names) {
    return this.page.evaluate((list) => {
      const cs = getComputedStyle(document.documentElement);
      const rgb = (name) => {
        const el = document.createElement('i');
        el.style.color = cs.getPropertyValue(name);
        document.body.append(el);
        const c = getComputedStyle(el).color;
        el.remove();
        return c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      };
      return Object.fromEntries(list.map((n) => [n, rgb(n)]));
    }, names);
  }
}
