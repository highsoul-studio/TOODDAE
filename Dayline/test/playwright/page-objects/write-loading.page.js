import { PagesPage } from './pages.page.js';

export class WriteLoadingPage extends PagesPage {
  get routeState() { return this.page.getByTestId('route-state'); }
  get routeRetry() { return this.page.getByTestId('route-retry'); }
  get editAction() { return this.page.getByTestId('write-edit'); }
  get saveAction() { return this.page.getByTestId('write-read'); }
  get organizeAction() { return this.page.getByTestId('write-organize'); }

  async holdFirstGet(pattern, all = false) {
    let release, start;
    const gate = new Promise((resolve) => { release = resolve; });
    const started = new Promise((resolve) => { start = resolve; });
    let held = false;
    await this.page.route(pattern, async (route) => {
      if ((all || !held) && route.request().method() === 'GET') {
        held = true;
        start();
        await gate;
      }
      await route.continue();
    });
    return { release, started };
  }

  holdSettings() { return this.holdFirstGet('**/api/settings', true); }
  holdInitialNote() { return this.holdFirstGet('**/api/write/note?*'); }

  async openInKorean() {
    await this.page.addInitScript(() => localStorage.setItem('lang', 'ko'));
    await this.page.goto('/#/write');
  }

  async trackPointerListeners() {
    await this.page.addInitScript(() => {
      window.__writePointerAdds = 0;
      const original = Document.prototype.addEventListener;
      Document.prototype.addEventListener = function(type, ...args) {
        if (type === 'pointerup') window.__writePointerAdds++;
        return original.call(this, type, ...args);
      };
    });
  }

  pointerListenerCount() { return this.page.evaluate(() => window.__writePointerAdds); }

  async captureLoadingEvidence() {
    const directory = process.env.DAYLINE_LOADING_EVIDENCE;
    const phase = process.env.DAYLINE_LOADING_PHASE;
    if (directory && phase) await this.page.screenshot({ path: `${directory}/${phase}-write-loading.png`, fullPage: true });
  }
}
