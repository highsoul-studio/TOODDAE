// 偽の vault と home だけで HTTP 境界を検証する。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.dirname(app);
async function launch(readonly = false, { preload = null, existingRoot = null } = {}) {
  const root = existingRoot || await fs.mkdtemp(path.join(workspace, 'backend-http-'));
  await fs.mkdir(path.join(root, 'vault'), { recursive: true }); await fs.mkdir(path.join(root, 'home'), { recursive: true });
  const probe = http.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port; await new Promise(r => probe.close(r));
  const env = { PATH: process.env.PATH, HOME: root, TMPDIR: root, VAULT: path.join(root, 'vault'), DAYLINE_HOME: path.join(root, 'home'), PORT: String(port), READONLY: readonly ? '1' : '0' };
  const args = ['server.js'];
  if (preload) { const file = path.join(root, 'test-preload.mjs'); await fs.writeFile(file, preload); args.unshift('--import', file); }
  const child = spawn(process.execPath, args, { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  const base = `http://127.0.0.1:${port}`;
  let info;
  for (let i = 0; i < 100; i++) {
    try { info = await (await fetch(base + '/api/status')).json(); if (info.ready) break; } catch {}
    if (child.exitCode !== null) throw new Error('startup failed: ' + stderr);
    await new Promise(r => setTimeout(r, 30));
  }
  assert.ok(info?.ready, 'server becomes ready');
  let rootId = info.rootId;
  const get = (url, headers = {}) => fetch(base + url, { headers: { 'X-TOODDAE-Root': rootId, ...headers } });
  const post = async (url, body = {}, headers = {}) => {
    // 正常系の fixture は UI と同じく接続を保存してから表示 token で同意する。
    // stale/missing-token 回帰は raw HTTP または明示 consentToken を使用する。
    if (url === '/api/settings' && typeof body?.ai?.consent === 'boolean' && !Object.hasOwn(body, 'consentToken')) {
      const { consent, ...ai } = body.ai;
      const rest = { ...body, ai }; delete rest.consentToken;
      if (Object.keys(ai).length || Object.keys(rest).some(k => k !== 'ai')) {
        const configured = await post(url, rest, headers); if (!configured.ok) return configured;
      }
      const current = await get('/api/settings'); if (!current.ok) return current;
      body = { ai: { consent }, consentToken: (await current.json()).consentToken };
    }
    try { return await fetch(base + url, { method: 'POST', headers: { Origin: base, 'content-type': 'application/json', 'X-TOODDAE-Root': rootId, ...headers }, body: JSON.stringify(body) }); }
    catch (error) { throw new Error(`${url}: ${error.message}\n${stderr}`, { cause: error }); }
  };
  return { get, post, base, root, rootId: () => rootId, adopt: id => { rootId = id; }, close: async ({ keepRoot = false } = {}) => { child.kill(); await new Promise(r => child.once('exit', r)); if (!keepRoot) await fs.rm(root, { recursive: true, force: true }); } };
}
test('HTTP regression: local-only boundaries, Write conflicts, secrets and body limits', async () => {
  const srv = await launch();
  try {
    assert.equal((await srv.get('/api/settings')).status, 200);
    const hostStatus = await new Promise((resolve, reject) => { const req = http.get(srv.base + '/api/settings', { headers: { Host: 'attacker.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); });
    assert.equal(hostStatus, 403);
    assert.equal((await srv.post('/api/settings', {}, { Origin: 'https://attacker.example' })).status, 403);
    assert.equal((await srv.post('/api/settings', {}, { Origin: srv.base + '/' })).status, 403);
    assert.equal((await srv.post('/api/settings', {}, { 'content-type': 'application/json-evil' })).status, 403);
    for (const body of [null, [], 'string']) assert.equal((await srv.post('/api/settings', body)).status, 400);
    assert.equal((await srv.post('/api/ai/test')).status, 403);
    const before = await (await srv.get('/api/write/note?date=2026-10-06')).json();
    assert.equal((await srv.post('/api/write/save', { date: before.date, text: 'FAKE note', base: before.hash })).status, 200);
    const stale = await srv.post('/api/write/save', { date: before.date, text: 'overwrite', base: before.hash });
    assert.equal(stale.status, 409); assert.equal((await stale.json()).current.text, 'FAKE note');
    assert.equal((await srv.get('/api/write/note?date=../outside')).status, 400);
    assert.equal((await srv.post('/api/ai/key', { provider: 'custom', key: 'FAKE-SECRET-abcdef' })).status, 200);
    assert.ok(!(await (await srv.get('/api/settings')).text()).includes('FAKE-SECRET'));
    const state = await (await srv.get('/api/state')).json();
    assert.equal((await srv.post('/api/add', { text: 'undo endpoint', scheduled: state.today })).status, 200);
    const task = (await (await srv.get('/api/state')).json()).tasks.find(x => x.text === 'undo endpoint');
    const postponed = await (await srv.post('/api/reschedule', { ref: task, date: state.today })).json();
    assert.match(postponed.undo, /^[0-9a-f-]{36}$/);
    assert.equal((await srv.post('/api/undo-row', { undo: postponed.undo })).status, 200);
    assert.equal((await srv.post('/api/undo-row', { undo: postponed.undo })).status, 400, 'undo token is one-time');
    assert.equal((await srv.post('/api/undo-row', { undo: '00000000-0000-0000-0000-000000000000' })).status, 400, 'arbitrary token cannot restore raw text');
    assert.equal((await srv.post('/api/settings', { oversized: 'x'.repeat(70000) })).status, 400);
    assert.equal((await srv.post('/api/write/save', { date: before.date, text: 'x'.repeat(1400000), base: before.hash })).status, 400);
  } finally { await srv.close(); }
});
test('HTTP regression: readonly rejects settings, keys, notes, network and restart', async () => {
  const srv = await launch(true);
  try {
    for (const url of ['/api/settings', '/api/ai/key', '/api/write/save', '/api/write/restore', '/api/write/delete', '/api/today', '/api/undo-row', '/api/write/organize', '/api/ai/test', '/api/restart', '/api/folder/choose', '/api/folder/connect', '/api/runtime/reveal', '/api/ai/models', '/api/assistant/run', '/api/auth/start', '/api/auth/select', '/api/auth/disconnect']) assert.equal((await srv.post(url)).status, 403, url);
    assert.deepEqual(await fs.readdir(path.join(srv.root, 'vault')), []);
    assert.deepEqual(await fs.readdir(path.join(srv.root, 'home')), []);
  } finally { await srv.close(); }
});

test('root identity: stale tabs, slow bodies and Undo cannot cross folders or return trips', async () => {
  const srv = await launch();
  try {
    const second = path.join(srv.root, 'second'); await fs.mkdir(second);
    const originalId = srv.rootId();
    const missingIdentity = await fetch(srv.base + '/api/state');
    assert.equal(missingIdentity.status, 409); assert.equal((await missingIdentity.json()).rootId, originalId);
    assert.equal((await srv.get('/api/settings', { 'X-TOODDAE-Root': 'old' })).status, 409);
    const page = await (await fetch(srv.base + '/')).text();
    assert.ok(page.includes(originalId) && page.includes('"appId":"tooddae"'));
    const state = await (await srv.get('/api/state')).json();
    await srv.post('/api/add', { text: 'ORIGINAL ONLY', scheduled: state.today });
    const task = (await (await srv.get('/api/state')).json()).tasks.find(x => x.text === 'ORIGINAL ONLY');
    const undo = await (await srv.post('/api/reschedule', { ref: task, date: state.today })).json();
    const body = JSON.stringify({ date: state.today, text: 'WRONG ROOT', base: 'not-needed' });
    let response;
    const delayed = new Promise((resolve, reject) => {
      response = http.request(srv.base + '/api/write/save', { method: 'POST', headers: { origin: srv.base, 'content-type': 'application/json', 'X-TOODDAE-Root': originalId, 'content-length': Buffer.byteLength(body) } }, res => { res.resume(); resolve(res.statusCode); });
      response.on('error', reject); response.write(body.slice(0, 1));
    });
    const switched = await srv.post('/api/folder/connect', { path: second });
    assert.equal(switched.status, 200);
    const next = await switched.json(); assert.notEqual(next.rootId, originalId);
    response.end(body.slice(1)); assert.equal(await delayed, 409, 'identity checked again after delayed body');
    assert.equal((await srv.post('/api/undo-row', { undo: undo.undo })).status, 409);
    assert.equal((await srv.post('/api/settings', { ai: { consent: true } })).status, 409);
    srv.adopt(next.rootId);
    assert.equal((await srv.post('/api/undo-row', { undo: undo.undo })).status, 400);
    assert.ok(!(await (await srv.get('/api/state')).text()).includes('ORIGINAL ONLY'));
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(srv.root, 'home/runtime.json'))), { version: 1, vaultPath: second });
    assert.equal((await fs.stat(path.join(srv.root, 'home/runtime.json'))).mode & 0o777, 0o600);
    assert.equal((await srv.post('/api/folder/connect', { path: path.join(srv.root, 'missing') })).status, 400);
    assert.equal((await srv.post('/api/folder/connect', { path: srv.root })).status, 400, 'private home cannot be inside notes');
    const back = await (await srv.post('/api/folder/connect', { path: path.join(srv.root, 'vault') })).json();
    srv.adopt(back.rootId); assert.notEqual(back.rootId, originalId);
    assert.equal((await srv.post('/api/undo-row', { undo: undo.undo })).status, 400);
    assert.ok((await (await srv.get('/api/state')).text()).includes('ORIGINAL ONLY'));
  } finally { await srv.close(); }
});

test('AI readiness: saved configuration plus current successful test; identity changes and races revoke proof', async () => {
  const srv = await launch();
  let count = 0, release, seen;
  const mock = http.createServer(async (req, res) => {
    let text = ''; for await (const c of req) text += c;
    count++;
    const body = JSON.parse(text);
    if (body.model === 'hold') { seen?.(); await new Promise(r => { release = r; }); }
    res.writeHead(body.model === 'fail' ? 401 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '# Organized\n- unchanged facts' }, finish_reason: 'stop' }] }));
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${mock.address().port}`;
  const settings = ai => srv.post('/api/settings', { ai });
  const getSettings = async () => (await srv.get('/api/settings')).json();
  try {
    assert.equal((await getSettings()).aiConfigured, false);
    await settings({ provider: 'custom', models: { custom: 'ok' }, baseUrls: { custom: base }, consent: true });
    assert.equal((await getSettings()).aiReady, false);
    const note = { date: '2026-10-06', text: 'FACT 42' };
    const blank = await (await srv.get('/api/write/note?date=' + note.date)).json();
    note.base = (await (await srv.post('/api/write/save', { ...note, base: blank.hash })).json()).hash;
    assert.equal((await srv.post('/api/write/organize', note)).status, 409); assert.equal(count, 0);
    assert.equal((await srv.post('/api/ai/test')).status, 200);
    assert.equal((await getSettings()).aiReady, true);
    assert.equal((await srv.post('/api/write/organize', note)).status, 200); assert.equal(count, 2);
    assert.equal((await srv.post('/api/settings', { appearance: { light: { accent: 'teal' } } })).status, 200);
    assert.equal((await getSettings()).aiReady, true, 'appearance does not invalidate proof');
    await srv.post('/api/ai/key', { provider: 'custom', key: 'FAKE-TEST-KEY' });
    assert.equal((await getSettings()).settings.ai.consent, false);
    await settings({ consent: true });
    assert.equal((await getSettings()).aiReady, false);
    await srv.post('/api/ai/test');
    await settings({ models: { custom: 'hold' }, consent: true });
    const received = new Promise(r => { seen = r; });
    const pending = srv.post('/api/ai/test'); await received;
    const second = path.join(srv.root, 'second'); await fs.mkdir(second);
    assert.equal((await srv.post('/api/folder/connect', { path: second })).status, 409, 'in-flight test prevents folder change');
    await settings({ models: { custom: 'ok' }, consent: true });
    await srv.post('/api/ai/test');
    release(); assert.equal((await pending).status, 409, 'old successful response cannot establish proof');
    assert.equal((await getSettings()).aiReady, true, 'newer test proof survives older result');
    await settings({ models: { custom: 'fail' }, consent: true });
    assert.equal((await srv.post('/api/ai/test')).status, 502);
    assert.equal((await getSettings()).aiReady, false);
    const before = count;
    await settings({ consent: false });
    assert.equal((await srv.post('/api/write/organize', note)).status, 403); assert.equal(count, before);
    const keyPayload = JSON.stringify(await getSettings()); assert.ok(!keyPayload.includes('FAKE-TEST-KEY'));
  } finally { release?.(); mock.closeAllConnections(); await new Promise(r => mock.close(r)); await srv.close(); }
});

test('missing active folder stays recoverable without recreating it', async () => {
  const srv = await launch();
  try {
    const original = path.join(srv.root, 'vault'), moved = path.join(srv.root, 'moved');
    await fs.rename(original, moved);
    assert.equal((await srv.get('/api/state')).status, 503);
    assert.equal((await srv.post('/api/add', { text: 'never create missing folder' })).status, 503);
    assert.equal((await fetch(srv.base + '/api/status')).status, 200);
    assert.equal((await fetch(srv.base + '/')).status, 200);
    await assert.rejects(fs.stat(original), { code: 'ENOENT' });
    assert.equal((await srv.post('/api/folder/connect', { path: moved })).status, 200);
  } finally { await srv.close(); }
});

test('SSE announces identity immediately and on switch; failed persistence leaves old root selected', async () => {
  const srv = await launch();
  let reader;
  try {
    const original = srv.rootId();
    const stream = await fetch(srv.base + '/api/events', { signal: AbortSignal.timeout(5000) }); reader = stream.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), new RegExp('event: context[\\s\\S]*' + original));
    const second = path.join(srv.root, 'second'); await fs.mkdir(second);
    await fs.mkdir(path.join(srv.root, 'home/runtime.json'));
    assert.equal((await srv.post('/api/folder/connect', { path: second })).status, 503);
    assert.equal((await (await fetch(srv.base + '/api/status')).json()).rootId, original);
    assert.equal((await srv.get('/api/state')).status, 200);
    await fs.rmdir(path.join(srv.root, 'home/runtime.json'));
    const next = await (await srv.post('/api/folder/connect', { path: second })).json();
    let data = '';
    while (!data.includes('event: root-changed')) data += new TextDecoder().decode((await reader.read()).value);
    assert.ok(data.includes(next.rootId));
  } finally { await reader?.cancel().catch(() => {}); await srv.close(); }
});

test('catalog HTTP uses saved identity only, blocks automatic custom fetch and rejects stale settings/key replies', async () => {
  const srv = await launch();
  let calls = 0, bodySeen = '', release, seen;
  const mock = http.createServer(async (req, res) => {
    calls++; for await (const part of req) bodySeen += part;
    assert.equal(req.method, 'GET'); assert.equal(req.url, '/models');
    if (seen) { seen(); await new Promise(r => { release = r; }); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'local-text' }, { id: 'local-text' }, { id: 'embedding-only' }] }));
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${mock.address().port}`;
  try {
    const initial = await (await srv.post('/api/ai/models', { manual: false })).json();
    assert.equal(initial.source, 'defaults'); assert.equal(initial.reason, 'not-saved');
    assert.equal((await srv.post('/api/ai/models', { provider: 'custom', baseUrl: base, key: 'never use body key' })).status, 400);
    await srv.post('/api/settings', { ai: { provider: 'deepseek' } });
    const noKey = await (await srv.post('/api/ai/models', {})).json();
    assert.equal(noKey.reason, 'no-key'); assert.deepEqual(noKey.models, ['deepseek-flash', 'deepseek-v4-pro']);
    await srv.post('/api/settings', { ai: { provider: 'custom', models: { custom: 'local-text' }, baseUrls: { custom: base }, consent: true } });
    await srv.post('/api/ai/key', { provider: 'custom', key: 'FAKE-CUSTOM-CATALOG' });
    await srv.post('/api/settings', { ai: { consent: true } }); // Credential changes require a new explicit grant.
    const automatic = await (await srv.post('/api/ai/models', { manual: false })).json();
    assert.equal(automatic.reason, 'manual-required'); assert.equal(calls, 0);
    const live = await (await srv.post('/api/ai/models', { manual: true })).json();
    assert.equal(live.source, 'live'); assert.deepEqual(live.models, ['local-text']); assert.equal(bodySeen, '');
    assert.equal((await (await srv.get('/api/settings')).json()).aiReady, false, 'catalog is not a connection proof');
    const received = new Promise(r => { seen = r; });
    const pending = srv.post('/api/ai/models', { manual: true }); await received;
    const second = path.join(srv.root, 'second'); await fs.mkdir(second);
    assert.equal((await srv.post('/api/folder/connect', { path: second })).status, 409);
    await srv.post('/api/ai/key', { provider: 'custom', key: 'FAKE-REPLACED-CATALOG' });
    release(); const stale = await pending;
    assert.equal(stale.status, 409); assert.equal((await stale.json()).code, 'settings-changed');
    await srv.post('/api/settings', { ai: { consent: false } });
    const noConsent = await (await srv.post('/api/ai/models', { manual: true })).json();
    assert.equal(noConsent.reason, 'no-consent'); assert.equal(calls, 2);
  } finally { release?.(); mock.closeAllConnections(); await new Promise(r => mock.close(r)); await srv.close(); }
});

test('Finder endpoint rejects arbitrary targets, stale tabs and missing folders without launching Finder', async () => {
  const srv = await launch();
  try {
    assert.equal((await srv.post('/api/runtime/reveal', { path: '/tmp' })).status, 400);
    assert.equal((await srv.post('/api/runtime/reveal', {}, { 'X-TOODDAE-Root': 'stale' })).status, 409);
    assert.equal((await srv.post('/api/runtime/reveal', {}, { Origin: 'https://attacker.invalid' })).status, 403);
    await fs.rename(path.join(srv.root, 'vault'), path.join(srv.root, 'gone'));
    assert.equal((await srv.post('/api/runtime/reveal', {})).status, 503);
  } finally { await srv.close(); }
});

test('effort changes invalidate readiness and pending Test/catalog even when other identity fields stay the same', async () => {
  const srv = await launch();
  let hold = false, release, received;
  const sent = [];
  const mock = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    if (body) sent.push(JSON.parse(body));
    if (hold) { received?.(); await new Promise(r => { release = r; }); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(req.method === 'GET' ? { data: [{ id: 'gpt-6.1-sol' }] } : { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }));
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  try {
    await srv.post('/api/settings', { ai: { provider: 'openai', baseUrls: { openai: `http://127.0.0.1:${mock.address().port}` }, consent: true } });
    await srv.post('/api/ai/key', { provider: 'openai', key: 'FAKE-EFFORT-KEY' });
    await srv.post('/api/settings', { ai: { consent: true } }); // Credential changes require a new explicit grant.
    assert.equal((await srv.post('/api/ai/test')).status, 200);
    assert.equal(sent.at(-1).reasoning_effort, 'medium');
    assert.equal((await (await srv.get('/api/settings')).json()).aiReady, true);
    await srv.post('/api/settings', { ai: { efforts: { openai: 'high' } } });
    assert.equal((await (await srv.get('/api/settings')).json()).aiReady, false);
    assert.equal((await srv.post('/api/write/organize', { date: '2026-10-07', text: 'Do not send before retest' })).status, 409);
    hold = true; let seen = new Promise(r => { received = r; });
    const ping = srv.post('/api/ai/test'); await seen;
    await srv.post('/api/settings', { ai: { efforts: { openai: 'max' } } });
    release(); hold = false;
    assert.equal((await ping).status, 409);
    assert.equal((await srv.post('/api/ai/test')).status, 200);
    assert.equal(sent.at(-1).reasoning_effort, 'max');
    hold = true; seen = new Promise(r => { received = r; });
    const catalog = srv.post('/api/ai/models', { manual: true }); await seen;
    await srv.post('/api/settings', { ai: { efforts: { openai: 'low' } } });
    release(); hold = false;
    const stale = await catalog; assert.equal(stale.status, 409); assert.equal((await stale.json()).code, 'settings-changed');
    assert.equal((await srv.post('/api/ai/test')).status, 200);
    const file = path.join(srv.root, 'vault/Set/Settings.md');
    const text = await fs.readFile(file, 'utf8'); const match = text.match(/```json\n([\s\S]*?)\n```/);
    const settings = JSON.parse(match[1]); settings.ai.efforts.openai = 'medium';
    await fs.writeFile(file, text.replace(match[1], JSON.stringify(settings, null, 2)));
    assert.equal((await (await srv.get('/api/settings')).json()).aiReady, false, 'fingerprint also notices direct file effort edits');
  } finally { release?.(); mock.closeAllConnections(); await new Promise(r => mock.close(r)); await srv.close(); }
});

test('Write delete: archive/Undo, stale autosave, duplicate deletion and root guards', async () => {
  const srv = await launch();
  const date = '2026-10-07';
  try {
    const empty = await (await srv.get('/api/write/note?date=' + date)).json();
    assert.equal((await srv.post('/api/write/delete', { date, base: empty.hash })).status, 409);
    const original = '# Keep bytes\r\n\r\n- [ ] untouched\r\n';
    const saved = await (await srv.post('/api/write/save', { date, text: original, base: empty.hash })).json();
    assert.equal((await srv.post('/api/write/delete', { date, base: empty.hash })).status, 409);
    const results = await Promise.all([srv.post('/api/write/delete', { date, base: saved.hash }), srv.post('/api/write/delete', { date, base: saved.hash })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    const deleted = await results.find(r => r.status === 200).json();
    assert.equal(deleted.exists, false); assert.equal(deleted.undo.base, deleted.hash);
    assert.equal((await (await srv.get('/api/write/notes')).json()).notes.some(n => n.date === date), false);
    assert.equal((await srv.post('/api/write/save', { date, text: 'stale draft', base: saved.hash })).status, 409);
    const restored = await (await srv.post('/api/write/restore', deleted.undo)).json();
    assert.equal((await (await srv.get('/api/write/note?date=' + date)).json()).text, original);
    assert.equal((await srv.post('/api/write/delete', { date: '../escape', base: restored.hash })).status, 400);
    assert.equal((await srv.post('/api/write/delete', { date, base: restored.hash, path: '/tmp/never' })).status, 400);
    assert.equal((await srv.post('/api/write/delete', { date, base: restored.hash }, { Origin: 'https://attacker.invalid' })).status, 403);
    const oldRoot = srv.rootId(), nextFolder = path.join(srv.root, 'next'); await fs.mkdir(nextFolder);
    const next = await (await srv.post('/api/folder/connect', { path: nextFolder })).json(); srv.adopt(next.rootId);
    assert.equal((await srv.post('/api/write/delete', { date, base: restored.hash }, { 'X-TOODDAE-Root': oldRoot })).status, 409);
    assert.equal(await fs.readFile(path.join(srv.root, 'vault/Write', date + '.md'), 'utf8'), original);
  } finally { await srv.close(); }
});

test('assistant HTTP readiness, actual native tools, UUID idempotency and config changes', async () => {
  const srv = await launch(); let toolRequests = 0, hold = false, release, seen;
  const task = { destination: 'dated', text: 'Assistant generated', start: '', scheduled: '2026-10-07', due: '2026-10-07', priority: '', section: '', memo: '' };
  const mock = http.createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    if (body.tools) { toolRequests++; assert.ok(!raw.includes('PRIVATE VAULT TEXT')); if (hold) { seen(); await new Promise(r => { release = r; }); } }
    const final = !body.tools || body.messages.at(-1).role === 'tool';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ finish_reason: final ? 'stop' : 'tool_calls', message: { role: 'assistant', content: final ? 'ok' : '', reasoning_content: 'PRIVATE REASONING', ...(final ? {} : { tool_calls: [{ type: 'function', id: 'native-1', function: { name: 'add_task', arguments: JSON.stringify(task) } }] }) } }] }));
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  try {
    const id = randomUUID(), request = { requestId: id, message: 'Add one requested item' };
    const status = await (await fetch(srv.base + '/api/status')).json(); assert.equal(status.capabilities.assistant, true); assert.equal(status.capabilities.notesDelete, true);
    assert.equal((await srv.post('/api/assistant/run', request)).status, 403);
    await srv.post('/api/settings', { ai: { provider: 'deepseek', baseUrls: { deepseek: `http://127.0.0.1:${mock.address().port}` }, consent: true } });
    await srv.post('/api/ai/key', { provider: 'deepseek', key: 'FAKE-ASSISTANT-HTTP' });
    await srv.post('/api/settings', { ai: { consent: true } }); // Credential changes require a new explicit grant.
    assert.equal((await srv.post('/api/assistant/run', request)).status, 409);
    await srv.post('/api/ai/test');
    assert.equal((await (await srv.get('/api/settings')).json()).assistantReady, true);
    const replies = await Promise.all([srv.post('/api/assistant/run', request), srv.post('/api/assistant/run', request)]);
    const results = await Promise.all(replies.map(r => r.json())); assert.deepEqual(results[0], results[1]);
    assert.equal(results[0].status, 'completed'); assert.equal(results[0].results.length, 1); assert.equal(toolRequests, 2);
    assert.ok(!JSON.stringify(results).includes('PRIVATE REASONING'));
    assert.equal((await srv.post('/api/assistant/run', { ...request, message: 'different' })).status, 409);
    assert.equal((await srv.post('/api/assistant/run', { ...request, requestId: 'bad' })).status, 400);
    hold = true; const received = new Promise(r => { seen = r; });
    const pending = srv.post('/api/assistant/run', { message: 'another', requestId: randomUUID() }); await received;
    const next = path.join(srv.root, 'next'); await fs.mkdir(next);
    assert.equal((await srv.post('/api/folder/connect', { path: next })).status, 409);
    await srv.post('/api/settings', { ai: { efforts: { deepseek: 'max' } } }); release(); hold = false;
    const changed = await (await pending).json(); assert.equal(changed.status, 'failed'); assert.equal(changed.error.code, 'settings-changed'); assert.equal(changed.results.length, 0);
  } finally { release?.(); mock.closeAllConnections(); await new Promise(r => mock.close(r)); await srv.close(); }
});

test('subscription routes retain saved keys, reject forged/root-stale callback before exchange, and never accept pasted tokens', async () => {
  const srv = await launch();
  try {
    await srv.post('/api/ai/key', { provider: 'openai', key: 'FAKE-RETAINED-KEY' });
    assert.equal((await srv.post('/api/auth/start', { provider: 'openai', token: 'never accept' })).status, 400);
    assert.equal((await srv.post('/api/auth/start', { provider: 'deepseek' })).status, 400);
    assert.equal((await srv.post('/api/auth/select', { provider: 'openai', accountId: '__proto__' })).status, 400);
    assert.equal((await srv.post('/api/auth/start', { provider: 'openai', accountId: '__proto__' })).status, 400);
    assert.equal((await srv.post('/api/auth/start', { provider: 'anthropic', accountId: '' })).status, 400);
    assert.equal((await fetch(srv.base + '/auth/callback?code=fake&state=forged')).status, 403);
    const login = await (await srv.post('/api/auth/start', { provider: 'openai' })).json(); const url = new URL(login.url);
    assert.equal(url.origin, 'https://auth.openai.com'); assert.equal(new URL(url.searchParams.get('redirect_uri')).pathname, '/auth/callback');
    const other = path.join(srv.root, 'other'); await fs.mkdir(other);
    const switched = await (await srv.post('/api/folder/connect', { path: other })).json(); srv.adopt(switched.rootId);
    const callback = new URL('/auth/callback', srv.base); callback.searchParams.set('state', url.searchParams.get('state')); callback.searchParams.set('code', 'fake'); callback.searchParams.set('client_id', 'oaiapp_fake');
    assert.equal((await fetch(callback)).status, 403, 'wrong-root state rejected before token exchange');
    await srv.post('/api/settings', { ai: { provider: 'openai', authModes: { openai: 'chatgpt' } } });
    const settings = await (await srv.get('/api/settings')).json();
    assert.equal(settings.settings.ai.authModes.openai, 'chatgpt'); assert.equal(settings.aiReady, false);
    assert.equal(settings.keys.openai.hasKey, true); assert.equal(settings.subscriptions.openai.connected, false);
    assert.ok(!(JSON.stringify(settings)).includes('FAKE-RETAINED-KEY'));
    assert.equal((await srv.post('/api/settings', { ai: { authModes: { gemini: 'chatgpt' } } })).status, 400);
  } finally { await srv.close(); }
});

test('read-only subscription settings never trigger login, refresh or credential store creation', async () => {
  const srv = await launch(true);
  try {
    await fs.mkdir(path.join(srv.root, 'vault/Set'), { recursive: true });
    await fs.writeFile(path.join(srv.root, 'vault/Set/Settings.md'), '```json\n{"ai":{"provider":"openai","authModes":{"openai":"chatgpt"},"consent":true}}\n```\n');
    const data = await (await srv.get('/api/settings')).json();
    assert.equal(data.authError, 'read-only'); assert.equal(data.aiReady, false); assert.equal(data.assistantReady, false);
    assert.deepEqual(await fs.readdir(path.join(srv.root, 'home')), []);
    assert.equal((await fetch(srv.base + '/auth/callback?state=anything')).status, 403);
  } finally { await srv.close(); }
});

test('forged auth callbacks do not revoke a valid proof; actual assistant auth rejection does', async () => {
  const srv = await launch();
  const mock = http.createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    res.writeHead(body.tools ? 401 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body.tools ? { error: 'invalid' } : { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }));
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  try {
    await srv.post('/api/settings', { ai: { provider: 'deepseek', baseUrls: { deepseek: `http://127.0.0.1:${mock.address().port}` }, consent: true } });
    await srv.post('/api/ai/key', { provider: 'deepseek', key: 'FAKE-PROOF' });
    await srv.post('/api/settings', { ai: { consent: true } }); // Credential changes require a new explicit grant.
    await srv.post('/api/ai/test');
    assert.equal((await fetch(srv.base + '/auth/callback?state=forged&code=bad')).status, 403);
    assert.equal((await (await srv.get('/api/settings')).json()).assistantReady, true);
    const result = await (await srv.post('/api/assistant/run', { requestId: randomUUID(), message: 'add a task' })).json();
    assert.equal(result.status, 'failed'); assert.equal(result.error.code, 'auth');
    assert.equal((await (await srv.get('/api/settings')).json()).assistantReady, false);
  } finally { mock.closeAllConnections(); await new Promise(r => mock.close(r)); await srv.close(); }
});

// テストの子プロセスだけに注入する fetch。production に URL override / 認証 bypass はない。
const oauthPreload = String.raw`
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...pair.publicKey.export({format:'jwk'}),kid:'test-http-key',alg:'RS256',use:'sig'};
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
globalThis.fetch=async(url,options={})=>{
  const endpoint=String(url);
  if(endpoint==='https://auth.openai.com/.well-known/jwks.json')return json({keys:[jwk]});
  if(endpoint==='https://auth.openai.com/api/accounts/oauth/token'){
    const fixture=JSON.parse(await fs.readFile(path.join(process.env.HOME,'auth-fixture.json'),'utf8'));
    const form=new URLSearchParams(options.body);assert.equal(form.get('client_id'),'oaiapp_http_integration');
    assert.equal(form.get('grant_type'),'authorization_code');assert.ok(form.get('code_verifier'));
    const now=Math.floor(Date.now()/1000),claims={iss:'https://auth.openai.com',aud:'oaiapp_http_integration',sub:'mock-http-subject',email:'mock@example.test',iat:now,exp:now+3600,nonce:fixture.nonce};
    const input=b64({alg:'RS256',kid:jwk.kid})+'.'+b64(claims),token=input+'.'+sign('RSA-SHA256',Buffer.from(input),pair.privateKey).toString('base64url');
    return json({access_token:'FAKE-SUBSCRIPTION-HTTP-ACCESS',refresh_token:'FAKE-SUBSCRIPTION-HTTP-REFRESH',id_token:token,token_type:'Bearer',scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',expires_in:3600});
  }
  assert.equal(options.headers.authorization,'Bearer FAKE-SUBSCRIPTION-HTTP-ACCESS');
  if(endpoint==='https://api.openai.com/v1/models')return json({models:[{slug:'gpt-6.1-sol',display_name:'Mock Sol',visibility:'list'}]});
  if(endpoint==='https://api.openai.com/v1/responses'){
    const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.stream,true);assert.equal(typeof body.instructions,'string');assert.ok(!('max_output_tokens' in body));assert.ok(!('previous_response_id' in body));
    assert.ok(!body.input.some(item=>item.type==='system'||item.role==='system'));
    let output,message='ok';
    if(body.tools&&!body.input.some(item=>item.type==='function_call_output')){
      assert.equal(body.tools[0].type,'namespace');assert.equal(body.tools[0].name,'tooddae');
      const date=new Date().toLocaleDateString('en-CA'),args={destination:'today',text:'OAuth HTTP task',start:'',scheduled:date,due:date,priority:'',section:'',memo:''};
      output=[{type:'function_call',call_id:'http-native-call',namespace:'tooddae',name:'add_task',arguments:JSON.stringify(args)}];message='';
    }else output=[{type:'message',content:[{type:'output_text',text:message}]}];
    const events=[...(message?[{type:'response.output_text.delta',delta:message}]:[]),{type:'response.completed',response:{status:'completed',output}}];
    return new Response(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join('').replaceAll('\\n','\n'),{headers:{'content-type':'text/event-stream'}});
  }
  throw new Error('Real network is forbidden in this test');
};
`;

test('valid HTTP OAuth callback commits guarded credentials, then explicit Test enables real allowlisted assistant tools', { timeout: 15000 }, async () => {
  const srv = await launch(false, { preload: oauthPreload });
  try {
    const setup = await srv.post('/api/settings', { ai: { provider: 'openai', authModes: { openai: 'chatgpt' }, consent: true } }); assert.equal(setup.status, 200);
    const begin = await (await srv.post('/api/auth/start', { provider: 'openai' })).json();
    const auth = new URL(begin.url);
    await fs.writeFile(path.join(srv.root, 'auth-fixture.json'), JSON.stringify({ nonce: auth.searchParams.get('nonce') }));
    const callback = new URL('/auth/callback', srv.base);
    for (const [key, value] of Object.entries({ code: 'fake-valid-code', state: auth.searchParams.get('state'), client_id: 'oaiapp_http_integration' })) callback.searchParams.set(key, value);
    const finished = await fetch(callback, { signal: AbortSignal.timeout(5000) }); assert.equal(finished.status, 200, await finished.text());
    const before = await (await srv.get('/api/settings')).json();
    assert.equal(before.subscriptions.openai.connected, true); assert.equal(before.subscriptions.openai.accounts.length, 1);
    assert.equal(before.aiConfigured, true); assert.equal(before.aiReady, false); assert.equal(before.assistantReady, false);
    assert.ok(!JSON.stringify(before).includes('FAKE-SUBSCRIPTION-HTTP'));
    await srv.post('/api/settings', { ai: { consent: true } }); // New account identity is a new privacy destination.
    const tested = await srv.post('/api/ai/test'); assert.equal(tested.status, 200, await tested.text());
    assert.equal((await (await srv.get('/api/settings')).json()).assistantReady, true);
    const catalog = await (await srv.post('/api/ai/models', {})).json(); assert.deepEqual(catalog.models, ['gpt-6.1-sol']);
    const executed = await (await srv.post('/api/assistant/run', { message: 'Add one task for today', requestId: randomUUID() })).json();
    assert.equal(executed.status, 'completed'); assert.equal(executed.results.length, 1);
    assert.ok((await (await srv.get('/api/state')).json()).tasks.some(task => task.text === 'OAuth HTTP task'));
    assert.ok(!JSON.stringify(executed).includes('FAKE-SUBSCRIPTION-HTTP'));
    const reauth = await (await srv.post('/api/auth/start', { provider: 'openai', accountId: before.subscriptions.openai.accounts[0].id })).json();
    assert.equal(new URL(reauth.url).searchParams.get('client_id'), 'oaiapp_http_integration');
    const another = await (await srv.post('/api/auth/start', { provider: 'openai', accountId: '' })).json();
    assert.equal(new URL(another.url).searchParams.get('client_id'), 'dynamic_agent_client');
    assert.equal(new URL(another.url).searchParams.get('agent_name_hint'), 'TOODDAE');

  } finally { await srv.close(); }
});

test('M consent memory restores exact connections, preserves model/effort consent and revokes explicit OFF without exposing credentials', async () => {
  const srv = await launch(); let calls = 0;
  const mock = http.createServer(async (req, res) => {
    for await (const _part of req) {}
    calls++; res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(req.headers['x-api-key'] ? { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' } : { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }));
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${mock.address().port}`;
  const patch = async ai => { const res = await srv.post('/api/settings', { ai }); assert.equal(res.status, 200); return res.json(); };
  try {
    const privateFile = path.join(srv.root, 'home/consents.json');
    await srv.get('/api/settings'); await assert.rejects(fs.stat(privateFile), { code: 'ENOENT' });
    for (const provider of ['anthropic', 'openai']) await srv.post('/api/ai/key', { provider, key: 'FAKE-MEMORY-' + provider });
    await patch({ baseUrls: { anthropic: base, openai: base } });
    await patch({ consent: true }); await srv.post('/api/ai/test');
    let value = await patch({ provider: 'openai' }); assert.equal(value.settings.ai.consent, false);
    await patch({ consent: true }); await srv.post('/api/ai/test');
    value = await patch({ provider: 'anthropic' }); assert.equal(value.settings.ai.consent, true); assert.equal(value.aiReady, false);
    await srv.post('/api/ai/test');
    value = await patch({ models: { anthropic: 'claude-opus-5-5' } }); assert.equal(value.settings.ai.consent, true); assert.equal(value.aiReady, false);
    await srv.post('/api/ai/test');
    value = await patch({ efforts: { anthropic: 'high' } }); assert.equal(value.settings.ai.consent, true); assert.equal(value.aiReady, false);
    value = await patch({ baseUrls: { anthropic: base + '/other' } }); assert.equal(value.settings.ai.consent, false);
    value = await patch({ baseUrls: { anthropic: base + '/' } }); assert.equal(value.settings.ai.consent, true, 'same normalized remembered endpoint');
    const rotated = await (await srv.post('/api/ai/key', { provider: 'anthropic', key: 'FAKE-ROTATED' })).json(); assert.equal(rotated.settings.ai.consent, false);
    const restored = await (await srv.post('/api/ai/key', { provider: 'anthropic', key: 'FAKE-MEMORY-anthropic' })).json(); assert.equal(restored.settings.ai.consent, true);
    await patch({ consent: false }); await patch({ provider: 'openai' });
    value = await patch({ provider: 'anthropic' }); assert.equal(value.settings.ai.consent, false);
    value = await patch({ provider: 'openai' }); assert.equal(value.settings.ai.consent, true);
    value = await patch({ authModes: { openai: 'chatgpt' } }); assert.equal(value.settings.ai.consent, false);
    value = await patch({ authModes: { openai: 'apikey' } }); assert.equal(value.settings.ai.consent, true);
    const missing = await (await srv.post('/api/ai/key', { provider: 'openai', key: '' })).json(); assert.equal(missing.settings.ai.consent, false);
    const stored = await fs.readFile(privateFile, 'utf8'); assert.ok(!stored.includes('FAKE-')); assert.ok(!stored.includes(srv.root));
    assert.equal((await fs.stat(privateFile)).mode & 0o777, 0o600);
    assert.ok(calls >= 3);
    assert.ok(['drive', 'local', 'unknown'].includes((await (await fetch(srv.base + '/api/status')).json()).vault.kind));
  } finally { mock.closeAllConnections(); await new Promise(r => mock.close(r)); await srv.close(); }
});

test('M legacy consent migrates only on explicit action; corrupt store fails closed without modifying bytes', async () => {
  const srv = await launch();
  try {
    const folder = path.join(srv.root, 'vault/Set'); await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(srv.root, 'home/secrets.json'), JSON.stringify({ keys: { anthropic: 'FAKE-LEGACY' } }));
    await fs.writeFile(path.join(folder, 'Settings.md'), '```json\n{"ai":{"provider":"anthropic","consent":true}}\n```\n');
    const privateFile = path.join(srv.root, 'home/consents.json');
    const first = await (await srv.get('/api/settings')).json(); assert.equal(first.settings.ai.consent, true);
    await assert.rejects(fs.stat(privateFile), { code: 'ENOENT' });
    const migrated = await (await srv.post('/api/settings', { ai: { efforts: { anthropic: 'high' } } })).json(); assert.equal(migrated.settings.ai.consent, true);
    assert.ok((await fs.readFile(privateFile, 'utf8')).includes('"version":1'));
    await fs.writeFile(privateFile, '{ corrupt keep bytes');
    const denied = await (await srv.get('/api/settings')).json(); assert.equal(denied.settings.ai.consent, false); assert.equal(denied.aiReady, false); assert.ok(denied.warnings.includes('consent-store-invalid'));
    assert.equal((await srv.post('/api/settings', { ai: { consent: true } })).status, 400);
    assert.equal(await fs.readFile(privateFile, 'utf8'), '{ corrupt keep bytes');
  } finally { await srv.close(); }
});

test('M additional instructions reach one Organize request only and proposals do not persist notes', async () => {
  const srv = await launch(); const sent = [];
  const mock = http.createServer(async (req, res) => {
    let raw = ''; for await (const part of req) raw += part; sent.push(JSON.parse(raw));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '# 한국어 제목\n\n100 JPY' }, finish_reason: 'stop' }] }));
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  try {
    await srv.post('/api/settings', { ai: { provider: 'custom', models: { custom: 'mock' }, baseUrls: { custom: `http://127.0.0.1:${mock.address().port}` }, consent: true } });
    await srv.post('/api/ai/test');
    const count = sent.length;
    const request = { date: '2026-10-07', text: '# English title\n100 JPY', additionalInstructions: '한국어로 제목과 본문을 정리해주세요' };
    const blank = await (await srv.get('/api/write/note?date=' + request.date)).json();
    request.base = (await (await srv.post('/api/write/save', { date: request.date, text: request.text, base: blank.hash })).json()).hash;
    const result = await srv.post('/api/write/organize', request); assert.equal(result.status, 200);
    assert.equal(sent.length, count + 1); assert.equal(sent.at(-1).tools, undefined);
    assert.deepEqual(JSON.parse(sent.at(-1).messages[1].content), { date: request.date, additionalInstructions: request.additionalInstructions, note: request.text });
    const note = await (await srv.get('/api/write/note?date=' + request.date)).json(); assert.equal(note.text, request.text);
    assert.equal((await srv.post('/api/write/organize', { ...request, additionalInstructions: 'x'.repeat(2001) })).status, 400);
    assert.equal((await srv.post('/api/write/organize', { ...request, additionalInstructions: {} })).status, 400);
    assert.equal(sent.length, count + 1);
    const created = await (await srv.post('/api/write/create', { date: request.date, language: 'en' })).json();
    const saved = await (await srv.post('/api/write/save', { noteId: created.noteId, date: created.date, base: created.hash, text: request.text })).json();
    const proposal = await srv.post('/api/write/organize', { noteId: created.noteId, base: saved.hash, additionalInstructions: request.additionalInstructions });
    assert.equal(proposal.status, 200); assert.equal(sent.length, count + 2);
    assert.equal(JSON.parse(sent.at(-1).messages[1].content).note, request.text);
    assert.equal((await (await srv.get('/api/write/note?noteId=' + created.noteId)).json()).text, request.text);
    assert.equal((await srv.post('/api/write/organize', { noteId: created.noteId, date: '2026-10-08', text: 'wrong' })).status, 400);
    assert.equal(sent.length, count + 2);
  } finally { mock.closeAllConnections(); await new Promise(r => mock.close(r)); await srv.close(); }
});

test('M remembered privacy consent survives process restart but connection Test proof does not', async () => {
  let srv = await launch(); const root = srv.root;
  try {
    await srv.post('/api/ai/key', { provider: 'anthropic', key: 'FAKE-RESTART-CONSENT' });
    const saved = await (await srv.post('/api/settings', { ai: { consent: true } })).json(); assert.equal(saved.settings.ai.consent, true);
    const previousRoot = srv.rootId();
    await srv.close({ keepRoot: true }); srv = null;
    srv = await launch(false, { existingRoot: root });
    const current = await (await srv.get('/api/settings')).json();
    assert.equal(current.settings.ai.consent, true); assert.equal(current.aiReady, false); assert.notEqual(current.rootId, previousRoot);
    assert.equal((await srv.get('/api/settings', { 'X-TOODDAE-Root': previousRoot })).status, 409);
  } finally { if (srv) await srv.close(); else await fs.rm(root, { recursive: true, force: true }); }
});

test('M changing to another root does not adopt that folders copied legacy ON flag', async () => {
  const srv = await launch();
  try {
    await srv.post('/api/ai/key', { provider: 'anthropic', key: 'FAKE-ROOT-BOUND' });
    await srv.post('/api/settings', { ai: { consent: true } });
    const other = path.join(srv.root, 'copied'); await fs.mkdir(path.join(other, 'Set'), { recursive: true });
    await fs.writeFile(path.join(other, 'Set/Settings.md'), '```json\n{"ai":{"provider":"anthropic","consent":true}}\n```\n');
    const changed = await srv.post('/api/folder/connect', { path: other }); assert.equal(changed.status, 200);
    srv.adopt((await changed.json()).rootId);
    const settings = await (await srv.get('/api/settings')).json();
    assert.equal(settings.aiConfigured, true); assert.equal(settings.settings.ai.consent, false); assert.equal(settings.aiReady, false);
  } finally { await srv.close(); }
});

test('M2 consent token binds a delayed ON to the displayed credential, not the later key', async () => {
  const srv = await launch();
  try {
    await srv.post('/api/ai/key', { provider: 'anthropic', key: 'FAKE-OLD-CONSENT' });
    await srv.post('/api/settings', { ai: { consent: false } });
    const shown = await (await srv.get('/api/settings')).json();
    assert.match(shown.consentToken, /^[0-9a-f-]{36}$/);
    const body = JSON.stringify({ ai: { consent: true }, consentToken: shown.consentToken });
    let slow;
    const pending = new Promise((resolve, reject) => {
      slow = http.request(srv.base + '/api/settings', { method: 'POST', headers: { origin: srv.base, 'content-type': 'application/json', 'X-TOODDAE-Root': srv.rootId(), 'content-length': Buffer.byteLength(body) } }, response => {
        let text = ''; response.on('data', chunk => { text += chunk; }); response.on('end', () => resolve({ status: response.statusCode, data: JSON.parse(text) }));
      });
      slow.on('error', reject); slow.write(body.slice(0, 1));
    });
    const rotated = await (await srv.post('/api/ai/key', { provider: 'anthropic', key: 'FAKE-NEW-CONSENT' })).json();
    assert.equal(rotated.settings.ai.consent, false);
    slow.end(body.slice(1)); const denied = await pending;
    assert.equal(denied.status, 409); assert.equal(denied.data.error, 'consent-changed');
    assert.equal((await (await srv.get('/api/settings')).json()).settings.ai.consent, false);
    const token = (await (await srv.get('/api/settings')).json()).consentToken;
    const accepted = await srv.post('/api/settings', { ai: { consent: true }, consentToken: token });
    assert.equal(accepted.status, 200); assert.equal((await accepted.json()).settings.ai.consent, true);
    const persisted = await fs.readFile(path.join(srv.root, 'vault/Set/Settings.md'), 'utf8');
    assert.ok(!persisted.includes('consentToken')); assert.ok(!persisted.includes(token));
  } finally { await srv.close(); }
});

test('M2 consent revision rejects stale ON after OFF, but an older same-connection OFF still revokes', async () => {
  const srv = await launch();
  try {
    await srv.post('/api/ai/key', { provider: 'anthropic', key: 'FAKE-SAME-CONNECTION' });
    const shown = await (await srv.get('/api/settings')).json();
    const on = await srv.post('/api/settings', { ai: { consent: true }, consentToken: shown.consentToken }); assert.equal(on.status, 200);
    const off = await srv.post('/api/settings', { ai: { consent: false }, consentToken: shown.consentToken }); assert.equal(off.status, 200);
    assert.equal((await off.json()).settings.ai.consent, false);
    const stale = await srv.post('/api/settings', { ai: { consent: true }, consentToken: shown.consentToken }); assert.equal(stale.status, 409);
    const current = await (await srv.get('/api/settings')).json();
    assert.equal(current.settings.ai.consent, false);
    await srv.post('/api/settings', { ai: { models: { anthropic: 'claude-opus-5-5' }, efforts: { anthropic: 'high' } } });
    const samePrivacy = await srv.post('/api/settings', { ai: { consent: true }, consentToken: current.consentToken }); assert.equal(samePrivacy.status, 200);
    assert.equal((await samePrivacy.json()).settings.ai.consent, true);
    const missing = await fetch(srv.base + '/api/settings', { method: 'POST', headers: { origin: srv.base, 'content-type': 'application/json', 'X-TOODDAE-Root': srv.rootId() }, body: JSON.stringify({ ai: { consent: true } }) });
    assert.equal(missing.status, 409); assert.equal((await missing.json()).error, 'consent-changed');
  } finally { await srv.close(); }
});

test('M2 consent cannot retarget a changed endpoint or combine an unshown provider with approval', async () => {
  const srv = await launch();
  try {
    await srv.post('/api/ai/key', { provider: 'anthropic', key: 'FAKE-DESTINATION' });
    const old = await (await srv.get('/api/settings')).json();
    const combined = await srv.post('/api/settings', { ai: { baseUrls: { anthropic: 'https://changed.invalid' }, consent: true }, consentToken: old.consentToken });
    assert.equal(combined.status, 409);
    assert.equal((await (await srv.get('/api/settings')).json()).settings.ai.baseUrls.anthropic, '');
    await srv.post('/api/settings', { ai: { baseUrls: { anthropic: 'https://changed.invalid' } } });
    assert.equal((await srv.post('/api/settings', { ai: { consent: false }, consentToken: old.consentToken })).status, 409);
    assert.equal((await srv.post('/api/settings', { ai: { consent: true }, consentToken: old.consentToken })).status, 409);
    assert.equal((await (await srv.get('/api/settings')).json()).settings.ai.consent, false);
  } finally { await srv.close(); }
});


test('R HTTP: note identities, search cursor, Undo and new route security gates', async () => {
  const srv = await launch();
  try {
    const date='2026-10-07', a=await (await srv.post('/api/write/create',{date,language:'ko'})).json();
    const b=await (await srv.post('/api/write/create',{date,language:'ja'})).json();
    assert.match(a.noteId,/^2026-10-07--/);assert.equal((await srv.get('/api/write/note?noteId='+a.noteId+'&date=2026-10-08')).status,400);
    const first=await (await srv.get('/api/write/notes?limit=1')).json();assert.equal(first.notes.length,1);assert.ok(first.nextCursor);
    const next=await (await srv.get('/api/write/notes?limit=1&cursor='+first.nextCursor)).json();assert.notEqual(next.notes[0].noteId,first.notes[0].noteId);
    assert.equal((await srv.get('/api/write/notes?q=different&cursor='+first.nextCursor)).status,400);
    const deleted=await (await srv.post('/api/write/delete',{noteId:a.noteId,date,base:a.hash})).json();assert.equal(deleted.undo.noteId,a.noteId);
    assert.equal((await srv.post('/api/write/restore',deleted.undo)).status,200);
    assert.equal((await (await srv.get('/api/write/note?noteId='+b.noteId)).json()).text,b.text);
    assert.equal((await (await srv.get('/api/write/history?noteId='+a.noteId)).json()).versions.length,1);
    for(const route of ['/api/write/create','/api/section/reorder']) {
      assert.equal((await srv.post(route,{}, {Origin:'https://invalid.example'})).status,403);
      assert.equal((await srv.post(route,{}, {'X-TOODDAE-Root':'old-root'})).status,409);
    }
    assert.equal((await srv.post('/api/write/create',{date,language:'xx'})).status,400);
    assert.equal((await srv.post('/api/write/save',{noteId:'../x',date,text:'x',base:a.hash})).status,400);
    assert.equal((await (await srv.get('/api/write/note?date='+date)).json()).exists,false,'date-only remains legacy');
  } finally {await srv.close();}
  const readonly=await launch(true);
  try{for(const route of ['/api/write/create','/api/section/reorder'])assert.equal((await readonly.post(route,{})).status,403);}
  finally{await readonly.close();}
});

test('R HTTP: section order base pair and progress have independent state contracts',async()=>{
  const srv=await launch();
  try{
    for(const name of ['A','B'])assert.equal((await srv.post('/api/section',{panel:'tasks',op:'add',name})).status,200);
    const before=await(await srv.get('/api/state')).json(); const spec=before.sectionOrder.tasks;
    const result=await srv.post('/api/section/reorder',{panel:'tasks',order:[...spec.order].reverse(),base:spec.base});assert.equal(result.status,200);
    const after=await(await srv.get('/api/state')).json();assert.deepEqual(after.sections.tasks,[...spec.order].reverse());assert.ok(Array.isArray(after.progress.total));assert.ok(Array.isArray(after.counts.tasks));
    assert.equal((await srv.post('/api/section/reorder',{panel:'tasks',order:spec.order,base:spec.base})).status,409);
    assert.equal((await srv.post('/api/section/reorder',{panel:'tasks',order:['unknown'],base:after.sectionOrder.tasks.base})).status,400);
  }finally{await srv.close();}
});

test('S Organize binds saved identity/base before and after provider; exposes truncation/shorter warnings',async()=>{
  const srv=await launch();let requests=0,release,started,hold=false,truncated=false;
  const mock=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;requests++;if(hold){started();await new Promise(r=>release=r);}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'# Small\n42'},finish_reason:truncated?'length':'stop'}]}));});
  await new Promise(r=>mock.listen(0,'127.0.0.1',r));
  try{
    await srv.post('/api/settings',{ai:{provider:'custom',models:{custom:'mock'},baseUrls:{custom:`http://127.0.0.1:${mock.address().port}`},consent:true}});await srv.post('/api/ai/test');
    const created=await(await srv.post('/api/write/create',{date:'2026-10-07',language:'en'})).json(),text='# Saved\n'+ 'Meaningful 42 JPY. '.repeat(30);
    const saved=await(await srv.post('/api/write/save',{noteId:created.noteId,base:created.hash,text})).json();const body={noteId:created.noteId,date:created.date,text,base:saved.hash};
    const before=requests;assert.equal((await srv.post('/api/write/organize',{...body,base:'0'.repeat(16)})).status,409);assert.equal((await srv.post('/api/write/organize',{...body,text:'wrong selected source'})).status,409);assert.equal(requests,before);
    truncated=true;const proposal=await(await srv.post('/api/write/organize',body)).json();assert.equal(proposal.noteId,created.noteId);assert.equal(proposal.base,saved.hash);assert.ok(proposal.warnings.includes('truncated'));assert.ok(proposal.warnings.includes('shorter'));assert.equal((await(await srv.get('/api/write/note?noteId='+created.noteId)).json()).text,text);
    hold=true;const seen=new Promise(r=>started=r),pending=srv.post('/api/write/organize',body);await seen;
    await fs.writeFile(path.join(srv.root,'vault','Write',created.noteId+'.md'),'# External newer\n');release();const stale=await pending;assert.equal(stale.status,409);assert.equal((await stale.json()).current.text,'# External newer\n');
  }finally{release?.();mock.closeAllConnections();await new Promise(r=>mock.close(r));await srv.close();}
});

test('S2 AI generation guards Apply and Undo across model/provider/effort/consent/Test; appearance and ordinary saves survive', async () => {
  const srv = await launch();
  const mock = http.createServer(async (req, res) => { for await (const chunk of req) {} res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: '# Proposed\n42' }, finish_reason: 'stop' }] })); });
  await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
  const settings = async () => (await srv.get('/api/settings')).json();
  const note = async () => (await srv.get('/api/write/note?date=2026-10-07')).json();
  const ready = async () => { await srv.post('/api/settings', { ai: { provider: 'deepseek', models: { deepseek: 'deepseek-flash' }, baseUrls: { deepseek: `http://127.0.0.1:${mock.address().port}` }, consent: true } }); assert.equal((await srv.post('/api/ai/test')).status, 200); return settings(); };
  try {
    await srv.post('/api/ai/key', { provider: 'deepseek', key: 'synthetic-generation-key' });
    await ready(); let current = await note();
    await srv.post('/api/write/save', { date: current.date, base: current.hash, text: '# Original\n42' });
    const changes = [
      () => srv.post('/api/settings', { ai: { models: { deepseek: 'other' } } }),
      () => srv.post('/api/settings', { ai: { provider: 'custom' } }),
      () => srv.post('/api/settings', { ai: { efforts: { deepseek: 'low' } } }),
      () => srv.post('/api/settings', { ai: { consent: false } }),
      () => srv.post('/api/ai/test'),
    ];
    for (const change of changes) {
      const before = await ready(); current = await note();
      const proposed = await (await srv.post('/api/write/organize', { date: current.date, text: current.text, base: current.hash })).json();
      assert.equal(proposed.aiGeneration, before.aiGeneration);
      assert.equal((await change()).status, 200);
      assert.ok((await settings()).aiGeneration > proposed.aiGeneration);
      for (const snapshot of ['organize', 'restore']) {
        const response = await srv.post('/api/write/save', { date: current.date, base: current.hash, text: 'STALE', snapshot, aiGeneration: proposed.aiGeneration });
        assert.equal(response.status, 409); assert.equal((await response.json()).error, 'ai-context-changed');
      }
      await ready();
      assert.equal((await srv.post('/api/write/save', { date: current.date, base: current.hash, text: 'REVIVED', snapshot: 'organize', aiGeneration: proposed.aiGeneration })).status, 409);
      assert.equal((await note()).text, current.text);
    }
    const before = await ready(); current = await note();
    const appearance = await srv.post('/api/settings', { appearance: { light: { accent: 'teal' } } });
    assert.equal(appearance.status, 200); assert.equal((await settings()).aiGeneration, before.aiGeneration);
    const applied = await srv.post('/api/write/save', { date: current.date, base: current.hash, text: '# Current proposal', snapshot: 'organize', aiGeneration: before.aiGeneration });
    assert.equal(applied.status, 200);
    await srv.post('/api/settings', { ai: { consent: false } }); current = await note();
    assert.equal((await srv.post('/api/write/save', { date: current.date, base: current.hash, text: '# Ordinary save' })).status, 200);
    current = await note(); const deleted = await (await srv.post('/api/write/delete', { date: current.date, base: current.hash })).json();
    assert.equal((await srv.post('/api/write/restore', deleted.undo)).status, 200);
    assert.equal((await note()).text, '# Ordinary save');
  } finally { mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve)); await srv.close(); }
});

test('S2 AI HTTP save rechecks generation at atomic write boundary after settings invalidation', async () => {
  const preload = String.raw`
import fs from 'node:fs/promises';
import path from 'node:path';
const original = fs.writeFile.bind(fs), marker = name => path.join(process.env.HOME, name);
globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '# Mock' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
fs.writeFile = async (file, data, ...args) => {
  const result = await original(file, data, ...args);
  if (String(file).endsWith('.tmp') && data === 'AI BOUNDARY') {
    await original(marker('write-held'), 'held');
    while (!(await fs.access(marker('release-write')).then(() => true, () => false))) await new Promise(resolve => setTimeout(resolve, 10));
  }
  return result;
};`;
  const srv = await launch(false, { preload });
  try {
    await srv.post('/api/settings', { ai: { provider: 'custom', models: { custom: 'mock' }, baseUrls: { custom: 'http://127.0.0.1:1' }, consent: true } });
    await srv.post('/api/ai/test');
    let note = await (await srv.get('/api/write/note?date=2026-10-07')).json();
    await srv.post('/api/write/save', { date: note.date, base: note.hash, text: 'original' });
    note = await (await srv.get('/api/write/note?date=2026-10-07')).json();
    const settings = await (await srv.get('/api/settings')).json();
    const pending = srv.post('/api/write/save', { date: note.date, base: note.hash, text: 'AI BOUNDARY', snapshot: 'organize', aiGeneration: settings.aiGeneration });
    let held = false;
    for (let i = 0; i < 200 && !held; i++) { held = await fs.access(path.join(srv.root, 'write-held')).then(() => true, () => false); if (!held) await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.equal(held, true);
    await srv.post('/api/settings', { ai: { models: { custom: 'changed' } } });
    await fs.writeFile(path.join(srv.root, 'release-write'), 'release');
    const response = await pending; assert.equal(response.status, 409); assert.equal((await response.json()).error, 'ai-context-changed');
    assert.equal((await (await srv.get('/api/write/note?date=2026-10-07')).json()).text, 'original');
    assert.deepEqual((await fs.readdir(path.join(srv.root, 'vault', 'Write'))).filter(name => name.endsWith('.tmp')), []);
  } finally { await fs.writeFile(path.join(srv.root, 'release-write'), 'release'); await srv.close(); }
});
