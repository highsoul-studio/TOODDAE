#!/usr/bin/env node
// 既存の Node を使うローカル launcher。ログイン項目やサービスは登録しない。
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.dirname(app);
export const defaults = { app, node: process.execPath, home: path.join(workspace, 'runtime/demo-home'), defaultVault: path.join(workspace, 'runtime/default'), port: 44318 };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function inspect(base, timeout = 700) {
  try {
    const r = await fetch(base + '/api/status', { signal: AbortSignal.timeout(timeout), redirect: 'error' });
    if (!r.ok) return { occupied: true };
    return await r.json();
  } catch (e) {
    if (e.cause?.code === 'ECONNREFUSED') return null;
    return { occupied: true };
  }
}
// 応答が遅いだけの自分のサーバーを「別アプリが使用中」と誤判定しない。無応答・非 HTTP のときだけ、少し待って再確認してから占有扱いにする。
async function settle(base) {
  let s = await inspect(base);
  for (let i = 0; i < 2 && s?.occupied; i++) { await delay(300); s = await inspect(base, 2500); }
  return s;
}
export async function launch(options = {}) {
  const config = { ...defaults, ...options };
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 || config.port === 4317) throw new Error('Choose a local app port other than 4317');
  config.app = await fs.realpath(config.app);
  const version = JSON.parse(await fs.readFile(path.join(config.app, 'package.json'), 'utf8')).version;
  const base = `http://127.0.0.1:${config.port}`;
  const matches = s => s?.appId === 'tooddae' && s.app === config.app && s.runtimeHome === path.resolve(config.home) && s.version === version;
  const conflict = s => new Error(`Port ${config.port} is already used by another app or version${s?.app ? ` (${s.app}${Number.isInteger(s.pid) ? `, PID ${s.pid}` : ''})` : ''}. Quit it, then open TOODDAE again.`);
  let current = await settle(base), spawned = false;
  if (current && !matches(current)) throw conflict(current);
  if (!current) {
    const { stdout } = await promisify(execFile)(config.node, ['--version']);
    if (!/^v(\d+)/.test(stdout) || Number(stdout.match(/^v(\d+)/)[1]) < 20) throw new Error('Node.js 20 or later is required');
    await fs.mkdir(config.home, { recursive: true, mode: 0o700 });
    if ((await fs.lstat(config.home)).isSymbolicLink()) throw new Error('Runtime home must not be a symlink');
    await fs.chmod(config.home, 0o700);
    const logPath = path.join(config.home, 'server.log');
    try { if ((await fs.lstat(logPath)).isSymbolicLink()) throw new Error('Log must not be a symlink'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const log = await fs.open(logPath, 'a', 0o600);
    try {
      // キーや VAULT を親の shell から暗黙に継承しない。
      const child = spawn(config.node, [path.join(config.app, 'server.js')], {
        cwd: config.app, detached: true, stdio: ['ignore', log.fd, log.fd],
        env: { PATH: process.env.PATH || '', HOME: config.home, DAYLINE_HOME: config.home, DAYLINE_DEFAULT_VAULT: config.defaultVault, PORT: String(config.port) },
      });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      child.unref(); spawned = true;
    } finally { await log.close(); }
  }
  const end = Date.now() + (config.timeoutMs ?? 10000);
  do {
    current = await inspect(base, 2500);
    // 起動直後に自分で spawn した場合、一時的な無応答は待つ (期限までに ready にならなければ下で失敗にする)。
    if (current && !matches(current) && !(spawned && current.occupied)) throw conflict(current);
    if (current?.ready) {
      if (config.openBrowser !== false) await promisify(execFile)('/usr/bin/open', [base]);
      return { url: base, reused: !spawned, pid: current.pid, rootId: current.rootId };
    }
    await delay(100);
  } while (Date.now() < end);
  throw new Error('TOODDAE did not become ready; check the local server.log');
}
async function main() {
  const args = process.argv.slice(2), fileIndex = args.indexOf('--config');
  const config = fileIndex >= 0 ? JSON.parse(await fs.readFile(args[fileIndex + 1], 'utf8')) : {};
  if (args.includes('--no-open')) config.openBrowser = false;
  console.log(JSON.stringify(await launch(config)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(async e => {
  console.error(e.message);
  if (process.platform === 'darwin' && !process.argv.includes('--no-open')) {
    // エラー文字列は argv で渡す。AppleScript のコードに差し込まない。
    await promisify(execFile)('/usr/bin/osascript', ['-e', 'on run argv\ndisplay alert "TOODDAE" message (item 1 of argv)\nend run', e.message]).catch(() => {});
  }
  process.exitCode = 1;
});
