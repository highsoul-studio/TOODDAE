// 一時フォルダ・空きポートで実際の detached 起動を確認。ブラウザは開かない。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { launch, defaults } from '../scripts/launch.mjs';
import { packageMac } from '../scripts/package-macos.mjs';
const run = promisify(execFile);
async function freePort() { const s = http.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; await new Promise(r => s.close(r)); return port; }
async function stop(pid) {
  try { process.kill(pid, 'SIGTERM'); } catch {}
  for (let i = 0; i < 100; i++) { try { process.kill(pid, 0); } catch { return; } await new Promise(r => setTimeout(r, 25)); }
  throw Error('test server did not stop');
}
test('local app starts, reuses and restores persisted folder; no credentials inherited; bundle paths are quoted', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "tooddae-launch ' space-")));
  const config = { ...defaults, home: path.join(root, 'home'), defaultVault: path.join(root, 'default'), port: await freePort(), openBrowser: false };
  let pid;
  const secret = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = 'FAKE-PARENT-MUST-NOT-INHERIT';
  try {
    const first = await launch(config); pid = first.pid;
    const second = await launch(config); assert.equal(second.pid, pid); assert.equal(second.reused, true);
    const headers = { 'X-TOODDAE-Root': first.rootId, origin: first.url, 'content-type': 'application/json' };
    const settings = await (await fetch(first.url + '/api/settings', { headers })).json();
    assert.equal(settings.keys.anthropic.hasKey, false);
    assert.match(await fs.readFile(path.join(root, 'default/Write', new Date().toLocaleDateString('en-CA') + '.md'), 'utf8'), /TOODDAE/);
    const chosen = path.join(root, 'chosen'); await fs.mkdir(chosen);
    assert.equal((await fetch(first.url + '/api/folder/connect', { method: 'POST', headers, body: JSON.stringify({ path: chosen }) })).status, 200);
    await stop(pid); pid = null;
    const reopened = await launch(config); pid = reopened.pid;
    const status = await (await fetch(reopened.url + '/api/status')).json(); assert.equal(status.vault.path, chosen); assert.notEqual(status.rootId, first.rootId);
    const bundle = await packageMac({ ...config, output: path.join(root, 'TOODDAE.app') });
    const executable = path.join(bundle, 'Contents/MacOS/TOODDAE');
    assert.equal((await fs.stat(executable)).mode & 0o777, 0o755);
    assert.match(await fs.readFile(path.join(bundle, 'Contents/Info.plist'), 'utf8'), /<key>CFBundleIconFile<\/key><string>AppIcon<\/string>/);
    assert.equal((await fs.readFile(path.join(bundle, 'Contents/Resources/AppIcon.icns'))).subarray(0, 4).toString(), 'icns');
    const result = JSON.parse((await run(executable, ['--no-open'])).stdout); assert.equal(result.pid, pid);
    // .app を別の場所へ移動 (元は削除) しても、自身の launcher.json を使って同じサーバーを再利用できる
    const moved = path.join(root, 'moved dir', 'TOODDAE.app'); await fs.mkdir(path.dirname(moved));
    await run('/usr/bin/ditto', [bundle, moved]); await run('/usr/bin/xattr', ['-cr', moved]); await fs.rm(bundle, { recursive: true });
    const again = JSON.parse((await run(path.join(moved, 'Contents/MacOS/TOODDAE'), ['--no-open'])).stdout); assert.equal(again.pid, pid); assert.equal(again.reused, true);
    assert.equal(await fs.readFile(path.join(chosen, 'Write', '2026-10-06.md'), 'utf8').catch(() => ''), '', 'existing chosen folder receives no Welcome');
  } finally {
    if (secret === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = secret;
    if (pid) await stop(pid); await fs.rm(root, { recursive: true, force: true });
  }
});

test('launcher never replaces an unrelated occupied port; missing Node gives a useful failure', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tooddae-conflict-'));
  const fake = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"appId":"other"}'); });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  try {
    await assert.rejects(launch({ home: path.join(root, 'home'), port: fake.address().port, openBrowser: false }), /another app/);
    await assert.rejects(fs.stat(path.join(root, 'home')), { code: 'ENOENT' });
    await assert.rejects(launch({ home: path.join(root, 'home'), node: path.join(root, 'missing-node'), port: await freePort(), openBrowser: false }), /ENOENT/);
  } finally { fake.closeAllConnections(); await new Promise(r => fake.close(r)); await fs.rm(root, { recursive: true, force: true }); }
});

test('simultaneous launches converge on one listening server and missing persisted folder can recover', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tooddae-dual-')));
  const config = { ...defaults, home: path.join(root, 'home'), defaultVault: path.join(root, 'default'), port: await freePort(), openBrowser: false };
  let pid;
  try {
    const both = await Promise.all([launch(config), launch(config)]); pid = both[0].pid;
    assert.equal(both[1].pid, pid);
    const status = await (await fetch(both[0].url + '/api/status')).json();
    assert.equal(status.vault.name, 'default');
    await stop(pid); pid = null;
    const missing = path.join(root, 'never-created');
    await fs.writeFile(path.join(config.home, 'runtime.json'), JSON.stringify({ version: 1, vaultPath: missing }));
    const next = await launch(config); pid = next.pid;
    const recovered = await (await fetch(next.url + '/api/status')).json();
    assert.equal(recovered.ready, true); assert.equal(recovered.folderError, 'folder-unavailable');
    assert.equal((await fetch(next.url + '/')).status, 200);
    await assert.rejects(fs.stat(missing), { code: 'ENOENT' });
  } finally { if (pid) await stop(pid); await fs.rm(root, { recursive: true, force: true }); }
});

test('signApp: ad-hoc signs only on macOS, clears xattrs before and after, and never fails packaging', async () => {
  const { signApp } = await import('../scripts/package-macos.mjs');
  const app = '/tmp/Example.app', calls = [], warnings = [];
  const run = async (cmd, args) => { calls.push([cmd, ...args]); };
  assert.equal(await signApp(app, { platform: 'linux', run, warn: m => warnings.push(m) }), false);
  assert.deepEqual(calls, [], 'no commands outside macOS');
  assert.equal(await signApp(app, { platform: 'darwin', run, warn: m => warnings.push(m) }), true);
  assert.deepEqual(calls, [['xattr', '-cr', app], ['codesign', '--force', '--deep', '-s', '-', app], ['xattr', '-cr', app]], 'clear, sign, then clear what signing added');
  const failing = async () => { throw new Error('boom\nsecond line'); };
  assert.equal(await signApp(app, { platform: 'darwin', run: failing, warn: m => warnings.push(m) }), false);
  assert.equal(warnings.length, 3, 'each failed step warns instead of throwing');
  assert.ok(warnings.every(w => w.startsWith('warning:') && !w.includes('second line')));
});

test('port conflict with another TOODDAE copy names its folder and PID so it can be quit', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tooddae-conflict-pid-'));
  const fake = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ appId: 'tooddae', app: '/old/copy/Dayline', pid: 4242, version: '0.0.1' })); });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  try {
    await assert.rejects(launch({ home: path.join(root, 'home'), port: fake.address().port, openBrowser: false }), /already used by another app or version \(\/old\/copy\/Dayline, PID 4242\)\. Quit it/);
  } finally { fake.closeAllConnections(); await new Promise(r => fake.close(r)); await fs.rm(root, { recursive: true, force: true }); }
});

test('a slow status response from our own server is not reported as a port conflict', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tooddae-slow-'));
  const app = await fs.realpath(defaults.app), home = path.join(root, 'home');
  const { version } = JSON.parse(await fs.readFile(path.join(app, 'package.json'), 'utf8'));
  let hits = 0;
  const fake = http.createServer((_req, res) => {
    const body = JSON.stringify({ appId: 'tooddae', app, runtimeHome: path.resolve(home), version, ready: true, pid: 1, rootId: 'r' });
    setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(body); }, hits++ === 0 ? 1200 : 0);   // first reply is slower than the 700 ms probe
  });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  try {
    const result = await launch({ home, port: fake.address().port, openBrowser: false });
    assert.equal(result.reused, true);
  } finally { fake.closeAllConnections(); await new Promise(r => fake.close(r)); await fs.rm(root, { recursive: true, force: true }); }
});

test('start-demo --detach returns once the server is ready and does not hold the caller\'s stdout pipe', async () => {
  // start-demo.mjs だけ一時 workspace にコピーし、Dayline は symlink で参照する。runtime/ は一時側にでき、チェックアウトを汚さない
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tooddae-demo-')));
  await fs.mkdir(path.join(root, 'scripts'));
  await fs.copyFile(path.join(defaults.app, '..', 'scripts', 'start-demo.mjs'), path.join(root, 'scripts', 'start-demo.mjs'));
  await fs.symlink(defaults.app, path.join(root, 'Dayline'));
  const port = await freePort(); let pid;
  try {
    // execFile は子の stdout パイプが全部閉じるまで解決しない。サーバーがパイプを持ったまま残ると timeout で失敗する
    const { stdout } = await run(process.execPath, [path.join(root, 'scripts', 'start-demo.mjs'), '--detach'], { env: { PATH: process.env.PATH, DAYLINE_DEMO_PORT: String(port) }, timeout: 10000 });
    assert.match(stdout, new RegExp(`http://127\\.0\\.0\\.1:${port}`));
    const status = await (await fetch(`http://127.0.0.1:${port}/api/status`)).json();
    pid = status.pid;
    assert.equal(status.ready, true);
    assert.equal(status.runtimeHome, path.join(root, 'runtime', 'demo-home'));
    assert.match(stdout, new RegExp(`PID ${pid}\\b`), 'prints the PID so the caller can stop it');
  } finally { if (pid) await stop(pid); await fs.rm(root, { recursive: true, force: true }); }
});
