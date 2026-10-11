import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '../fixtures.js';
import { rawRequest, tryConnect } from '../helpers/http.js';

// ブラウザではなく生の HTTP で、サーバ自身の守りを確かめる (README: 127.0.0.1 のみ / Host・Origin 検査 / CSP)。
const origin = (url) => ({ origin: url, 'content-type': 'application/json' });
const rooted = (server, headers = origin(server.url)) => ({ ...headers, 'x-tooddae-root': server.status.rootId });
const post = (url, p, body, headers = origin(url)) => rawRequest(url, { method: 'POST', path: p, headers, body: JSON.stringify(body) });
const snapshot = (vault) => [vault.note(), vault.template(), vault.inbox()].join('\0');

test.describe('観点: Host の検査 (DNS rebinding 対策)', () => {
  test('パターン: Host が自分のものでなければ、読み取りも 403。正しい Host は通る', async ({ server }) => {
    const { port } = new URL(server.url);
    for (const host of ['evil.example', `evil.example:${port}`, `localhost.evil.example:${port}`, `127.0.0.1:${Number(port) + 1}`]) {
      for (const p of ['/api/state', '/']) expect((await rawRequest(server.url, { path: p, headers: { host } })).status, `Host: ${host} → ${p}`).toBe(403);
    }
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`]) expect((await rawRequest(server.url, { path: '/api/state', headers: rooted(server, { host }) })).status, `Host: ${host}`).toBe(200);
  });
});

test.describe('観点: 書き込みは「同じ場所からの JSON」だけ受け付ける (CSRF 対策)', () => {
  test('パターン: 他サイトの Origin・Origin なし・フォーム送信は 403 で、ファイルは変わらない。正しい送信は通る', async ({ server, vault }) => {
    const { url } = server;
    const { port } = new URL(url);
    const before = snapshot(vault);
    const asJson = { 'content-type': 'application/json' };
    const cases = [
      ['他サイトの Origin', { ...asJson, origin: 'http://evil.example' }],
      ['自分に似せた別ホストの Origin', { ...asJson, origin: `http://127.0.0.1:${port}.evil.example` }],
      ['Origin なし', asJson],
      ['フォーム送信 (text/plain)', { origin: url, 'content-type': 'text/plain' }],
      ['フォーム送信 (urlencoded)', { origin: url, 'content-type': 'application/x-www-form-urlencoded' }],
    ];
    for (const [label, headers] of cases) {
      const res = await post(url, '/api/add', { text: 'CSRF で入れられたタスク', scheduled: vault.today, due: vault.today }, headers);
      expect(res.status, label).toBe(403);
    }
    expect(snapshot(vault), 'ファイルが変わっていない').toBe(before);
    const ok = await post(url, '/api/add', { text: '正しい送信', scheduled: vault.today, due: vault.today }, rooted(server));
    expect(ok.status, '対照: 同じ Origin の JSON は通る').toBe(200);
    expect(vault.note()).toContain('正しい送信');
  });

  test('パターン: 壊れた JSON・大きすぎる本文は 400 で断られ、サーバは落ちない', async ({ server }) => {
    const { url } = server;
    const bad = await rawRequest(url, { method: 'POST', path: '/api/add', headers: rooted(server), body: '{' });
    expect(bad.status).toBe(400);
    const big = await post(url, '/api/add', { text: 'x'.repeat(70_000) }, rooted(server));
    expect(big.status).toBe(400);
    expect(JSON.parse(big.body).error).toBe('too large');
    expect((await rawRequest(url, { path: '/api/status' })).status, 'まだ動いている').toBe(200);
  });
});

test.describe('観点: ファイルの指し方 — vault の外には出られない', () => {
  test('パターン: vault の外・隠しフォルダ・.md 以外を指す参照は、どの書き込み API でも 400 で断られ、外のファイルは変わらない', async ({ server, vault }) => {
    const outsideName = `dl-outside-${process.pid}.md`;
    const outside = path.join(path.dirname(vault.root), outsideName);
    fs.writeFileSync(outside, '- [ ] outside\n');
    vault.write('.hidden/secret.md', '- [ ] hidden\n');
    vault.write('Daily/not-markdown.txt', '- [ ] txt\n');
    try {
      const ref = (file, kind = 'task') => ({ file, line: 1, raw: '- [ ] outside', kind });
      const endpoints = {
        '/api/toggle': (f) => ref(f),
        '/api/cancel': (f) => ref(f),
        '/api/delete-routine': (f) => ref(f, 'routine'),
        '/api/edit': (f) => ({ ref: ref(f), text: 'changed' }),
        '/api/reschedule': (f) => ({ ref: ref(f), date: '2030-01-01' }),
        '/api/save': (f) => ({ from: 'task', to: 'task', ref: ref(f), text: 'changed' }),
      };
      const files = [`../${outsideName}`, outside, `Daily/../../${outsideName}`, '.hidden/secret.md', 'Daily/not-markdown.txt'];
      const before = snapshot(vault);
      for (const file of files) {
        for (const [endpoint, body] of Object.entries(endpoints)) {
          const res = await post(server.url, endpoint, body(file), rooted(server));
          expect(res.status, `${endpoint} ${file}`).toBe(400);
        }
      }
      expect(fs.readFileSync(outside, 'utf8')).toBe('- [ ] outside\n');
      expect(fs.readFileSync(path.join(vault.root, '.hidden/secret.md'), 'utf8')).toBe('- [ ] hidden\n');
      expect(snapshot(vault)).toBe(before);
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  test('パターン: 静的ファイルは public/ の中だけ。../ もエンコードした ../ もソース (server.js / lib / package.json) も取れない', async ({ server }) => {
    const paths = ['/../server.js', '/%2e%2e/server.js', '/..%2fserver.js', '/..%5cserver.js', '/public/../server.js', '/server.js', '/lib/vault.js', '/package.json', '/%2e%2e%2f%2e%2e%2fetc/passwd', '/%00', '/index.html%00.js'];
    for (const p of paths) {
      const res = await rawRequest(server.url, { path: p });
      expect([400, 404], `GET ${p}`).toContain(res.status);
      expect(res.body, `GET ${p} がソースを返している`).not.toMatch(/createServer|export (async )?function|root:/);
    }
    const index = await rawRequest(server.url, { path: '/' });
    expect(index.status, '対照: 画面は取れる').toBe(200);
    expect((await rawRequest(server.url, { path: '/app.js' })).headers['content-type']).toMatch(/javascript/);
  });
});

test.describe('観点: 応答ヘッダとネットワーク', () => {
  test('パターン: どの応答も no-store・nosniff・CSP (スクリプトは自分のファイルだけ・外部通信なし・フレーム埋め込み不可)', async ({ server }) => {
    for (const p of ['/', '/app.js', '/api/state', '/nope']) {
      const { headers } = await rawRequest(server.url, { path: p });
      expect(headers['cache-control'], p).toBe('no-store');
      expect(headers['x-content-type-options'], p).toBe('nosniff');
      const csp = headers['content-security-policy'];
      expect(csp, p).toContain("default-src 'self'");
      expect(csp, p).toContain("frame-ancestors 'none'");
      expect(csp, p).toContain("connect-src 'self'");
      expect(csp, 'スクリプトの許可に unsafe-inline / unsafe-eval が無い').not.toMatch(/script-src[^;]*unsafe-/);
    }
  });

  test('パターン: 待ち受けは 127.0.0.1 だけ — この PC の LAN 側アドレスからは繋がらない', async ({ server }) => {
    const port = Number(new URL(server.url).port);
    const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);
    test.skip(lan.length === 0, 'LAN 側のアドレスを持たない環境 (オフライン)');
    expect(await tryConnect('127.0.0.1', port), '対照: ループバックには繋がる').toBe('connected');
    for (const host of lan) expect(await tryConnect(host, port), `${host}:${port} に繋がってはいけない`).not.toBe('connected');
  });
});

test.describe('観点: 読み取り専用モードは書き込み系の API を全部断る', () => {
  test('パターン: どの書き込み API も 403 で、ファイルは変わらない (正しい Origin でも)', async ({ readonlyServer, vault }) => {
    const before = snapshot(vault);
    const ref = { file: `Daily/${vault.today}.md`, line: 1, raw: '- [ ] x', kind: 'task' };
    const bodies = {
      '/api/toggle': ref,
      '/api/cancel': ref,
      '/api/edit': { ref, text: 'changed' },
      '/api/reschedule': { ref, date: '2030-01-01' },
      '/api/add': { text: '入ってはいけない' },
      '/api/save': { from: 'task', to: 'task', text: '入ってはいけない' },
      '/api/delete-routine': { ...ref, kind: 'routine' },
      '/api/section': { panel: 'tasks', op: 'add', name: '入ってはいけない' },
    };
    for (const [endpoint, body] of Object.entries(bodies)) expect((await post(readonlyServer.url, endpoint, body)).status, endpoint).toBe(403);
    expect(snapshot(vault)).toBe(before);
  });
});
