// テストの土台 (チームの e2e 規約: データはテストごとに独立、共有データは fixture で読み込む)。
//  - server  (worker ごと): 一時 vault + Dayline サーバを自前で立てる。実際の vault (~/TASK-Manager) と 4317 のサーバには触れない
//  - vault   (テストごと): 初期状態へ戻した一時 vault
//  - page    : ブラウザのコンソールエラー / 例外が 1 件でもあればそのテストを失敗にする (全テスト共通の規則)
//  - dayline : 画面の操作をまとめた Page Object
import { test as base, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vault } from './helpers/vault.js';
import { DaylinePage } from './page-objects/dayline.page.js';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

async function startServer(vaultRoot, { env = {}, port: wanted } = {}) {
  const port = wanted ?? (await freePort());
  const runtimeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tooddae-home-'));
  const proc = spawn(process.execPath, [path.join(APP, 'server.js')], {
    cwd: APP,
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/API_KEY|TOKEN|SECRET|PASSWORD/i.test(key))), HOME: runtimeHome, PORT: String(port), VAULT: vaultRoot, DAYLINE_SUPERVISED: '', READONLY: '', DAYLINE_HOME: runtimeHome, ...env },
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  // 起動待ち: ポートが応答するまで (固定の待ち時間ではなく、条件で待つ)
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(`${url}/api/status`);
      if (response.ok) return { proc, url, status: await response.json(), runtimeHome };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  proc.kill();
  fs.rmSync(runtimeHome, { recursive: true, force: true });
  throw new Error('Dayline サーバが起動しませんでした');
}

// vault を書き換えると、サーバの監視 (fs.watch → SSE) が少し遅れて「変更あり」を送る。ページを開く直前にそれが来ると、
// テストの最中に画面が作り直されて計測が外れる。SSE を 1 本つないで、イベントが来て、そのあと静かになる (quietMs) まで待つ。
async function settleWatcher(url, { quietMs = 300, maxMs = 3000 } = {}) {
  const ctl = new AbortController();
  const start = Date.now();
  let last = start;
  let seen = false;
  const res = await fetch(`${url}/api/events`, { signal: ctl.signal });
  (async () => {
    for await (const chunk of res.body) {
      if (Buffer.from(chunk).toString().includes('event: change')) {
        seen = true;
        last = Date.now();
      }
    }
  })().catch(() => {});
  while (!(seen && Date.now() - last >= quietMs) && Date.now() - start < maxMs) await new Promise((r) => setTimeout(r, 50));
  ctl.abort();
}

export const test = base.extend({
  alternateFolder: async ({}, use) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tooddae-folder-'));
    await use(root);
    fs.rmSync(root, { recursive: true, force: true });
  },
  server: [
    async ({}, use) => {
      const vault = new Vault(fs.mkdtempSync(path.join(os.tmpdir(), 'dl-pw-')));
      vault.reset();
      const { proc, url, status, runtimeHome } = await startServer(vault.root);
      vault.rootId = status.rootId;
      vault.settle = async () => {
        if (!vault.dirty) return;
        vault.dirty = false;
        await settleWatcher(url);
      };
      await use({ vault, url, status });
      proc.kill();
      fs.rmSync(runtimeHome, { recursive: true, force: true });
      fs.rmSync(vault.root, { recursive: true, force: true });
    },
    { scope: 'worker' },
  ],
  // 読み取り専用モードのサーバ (同じ一時 vault を READONLY=1 で)
  readonlyServer: [
    async ({ server }, use) => {
      const { proc, url, runtimeHome } = await startServer(server.vault.root, { env: { READONLY: '1' } });
      await use({ url });
      proc.kill();
      fs.rmSync(runtimeHome, { recursive: true, force: true });
    },
    { scope: 'worker' },
  ],
  // 自分でサーバを立てたり止めたりしたいテスト用 (落ちたあとの復帰など)。終わったら残りを片付ける
  spawnServer: async ({ server }, use) => {
    const started = [];
    await use(async (opts) => {
      const s = await startServer(server.vault.root, opts);
      started.push(s);
      return s;
    });
    for (const s of started) { s.proc.kill(); fs.rmSync(s.runtimeHome, { recursive: true, force: true }); }
  },
  // 想定どおりに出るコンソールエラー (サーバを止めたときの接続エラーなど) を、そのテストだけ許す
  allowedConsoleErrors: [[], { option: true }],
  baseURL: async ({ server }, use) => {
    await use(server.url);
  },
  vault: async ({ server }, use) => {
    server.vault.reset();
    await server.vault.settle();
    await use(server.vault);
  },
  page: async ({ page, allowedConsoleErrors }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    // Firefox は、EventSource を持つページから離れるとき (別の URL へ移る・タブを閉じる) 必ずこのログを出す (こちらで閉じても出る)。ユーザーには見えない無害なもの
    const firefoxNavigationNoise = /The connection to .*\/api\/events was interrupted while the page was loading/;
    page.on('console', (m) => m.type() === 'error' && !firefoxNavigationNoise.test(m.text()) && !allowedConsoleErrors.some((re) => re.test(m.text())) && errors.push(`console.error: ${m.text()}`));
    // アプリの既定の言語は English。既存のテストは「保存された言語が無いときは日本語」を前提に書かれているので、ここで日本語を既定にそろえる (初回起動の既定は topbar.spec.js が個別に確かめる)
    await page.addInitScript(() => { try { if (localStorage.getItem('lang') === null) localStorage.setItem('lang', 'ja'); } catch {} });
    await use(page);
    expect(errors, 'ブラウザのコンソールにエラーが出ていない').toEqual([]);
  },
  dayline: async ({ page, vault, browserName }, use) => {
    await use(new DaylinePage(page, vault, browserName));
  },
});

export { expect };
