// フォルダ選択と端末固有の設定。ノートや秘密は runtime.json に入れない。
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { home } from './secrets.js';

export class RuntimeError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
export const WELCOME = `# Welcome to TOODDAE 👋

Keep today's tasks and thoughts together, one small step at a time.

## ✅ Do — Make room for what matters

Add a task with the quick input, then choose a date and time if you need them. Check off completed tasks and use repeat settings for routines.

## ✍️ Write — Capture your thoughts

Choose a date to read your notes, then select Edit to write. Your changes save automatically. Keep a daily journal, meeting notes, lessons learned, or ideas in your own words.

## ⚙️ Set — Make it yours

Adjust the theme and appearance, and set up your AI connection.

1. Choose a **Provider** and **Model**, and configure a custom API address only if needed.
2. If the provider needs an API key, enter it and select **Save**. Keys are stored outside your notes folder.
3. Review the destination, give **consent**, and run **Test connection**.
4. After a successful test, **Organize** becomes available in Write. Test again after restarting the server or changing the connection settings.
5. Compare the AI proposal with the original, then select **Apply** if you want to save it. Receiving a proposal does not change the original note.

Model suggestions may be retrieved automatically from the selected provider's official API using your saved settings and key. No note content is included in these model-list requests. Custom or changed API addresses require a manual Refresh and saved consent. Built-in suggestions are labeled separately from live results, and a model list does not replace the connection test.

Test connection sends only a short ping. Your selected note is sent to AI only when you choose Organize.

## 📁 Your files, your folder

Click the current folder name to open it in Finder on macOS. Use the edit button beside the folder status to connect another local folder. A Google Drive folder mounted on your computer can also be selected; check the Drive app for its sync status.

Your first notes folder is named **default**. Save your work before switching folders, and check any drafts left open in other tabs.

## 🌱 Start small

Write down one thing to do today and one thought you would like to keep.
`;

async function canonical(value) {
  try { return await fs.realpath(value); }
  catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const parent = path.dirname(value);
    if (parent === value) throw e;
    return path.join(await canonical(parent), path.basename(value));
  }
}
export async function validateFolder(value, { writable = true } = {}) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) throw new RuntimeError('folder-unavailable', 400);
  try {
    const root = await fs.realpath(value);
    if (!(await fs.stat(root)).isDirectory()) throw new Error('not directory');
    const privateHome = await canonical(home());
    if (privateHome === root || privateHome.startsWith(root.endsWith(path.sep) ? root : root + path.sep)) throw new Error('home inside vault');
    await fs.access(root, fs.constants.R_OK | (writable ? fs.constants.W_OK : 0));
    return root;
  } catch { throw new RuntimeError('folder-unavailable', 400); }
}
export async function privateHome() {
  await fs.mkdir(home(), { recursive: true, mode: 0o700 });
  if ((await fs.lstat(home())).isSymbolicLink()) throw new RuntimeError('folder-unavailable', 503);
  await fs.chmod(home(), 0o700);
  return home();
}
export async function initialFolder() {
  if (process.env.VAULT) return { root: path.resolve(process.env.VAULT), create: false };
  try {
    const data = JSON.parse(await fs.readFile(path.join(home(), 'runtime.json'), 'utf8'));
    if (data.version !== 1 || typeof data.vaultPath !== 'string' || !path.isAbsolute(data.vaultPath)) throw new Error('invalid runtime');
    return { root: data.vaultPath, create: false };
  } catch (e) {
    if (e.code !== 'ENOENT') return { root: '', create: false };
  }
  return { root: path.resolve(process.env.DAYLINE_DEFAULT_VAULT || path.join(os.homedir(), 'TOODDAE', 'default')), create: true };
}
export async function persistFolder(root) {
  await privateHome();
  const target = path.join(home(), 'runtime.json'), tmp = path.join(home(), `.runtime-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(tmp, JSON.stringify({ version: 1, vaultPath: root }) + '\n', { mode: 0o600, flag: 'wx' });
    await fs.rename(tmp, target);
  } finally { await fs.rm(tmp, { force: true }); }
}
export async function seedDefault(root, today) {
  await fs.mkdir(path.dirname(root), { recursive: true });
  try { await fs.mkdir(root); } catch (e) { if (e.code === 'EEXIST') return false; throw e; }
  await validateFolder(root);
  await fs.mkdir(path.join(root, 'Write'));
  await fs.mkdir(path.join(root, 'Templates'));
  await fs.writeFile(path.join(root, 'Write', `${today}.md`), WELCOME, { flag: 'wx' });
  await fs.writeFile(path.join(root, 'Templates', 'Daily.md'), '---\ndate: {{date}}\ntags: [daily]\n---\n\n## 今日のタスク\n\n## ルーティン\n\n## メモ\n', { flag: 'wx' });
  return true;
}
const runFile = promisify(execFile);
export async function chooseFolder({ platform = process.platform, run = runFile } = {}) {
  if (platform !== 'darwin') return { manual: true };
  try {
    const { stdout } = await run('/usr/bin/osascript', ['-e', 'POSIX path of (choose folder with prompt "TOODDAE: Choose a notes folder")'], { timeout: 120000, maxBuffer: 16384 });
    return { path: stdout.trimEnd() };
  } catch (e) {
    if (String(e.stderr).includes('(-128)')) return { cancelled: true };
    throw new RuntimeError('folder-unavailable', 503);
  }
}

// 現在の root だけを Finder で開く。引数は shell のコードとして扱わない。
export async function revealFolder(root, { platform = process.platform, run = runFile } = {}) {
  if (platform !== 'darwin') throw new RuntimeError('unsupported-platform', 400);
  try {
    await run('/usr/bin/open', ['-a', 'Finder', root], { timeout: 10000, maxBuffer: 16384 });
    return { ok: true };
  } catch { throw new RuntimeError('reveal-failed', 503); }
}

// 分類は接続時だけ。パス/OS の手掛かりであり、同期成功や特定サービスの証明ではない。
export async function classifyFolder(folder, { platform = process.platform, hostHome = os.userInfo().homedir, resolve = fs.realpath, run = runFile } = {}) {
  try {
    const paths = platform === 'win32' ? path.win32 : path;
    if (!paths.isAbsolute(folder)) return 'unknown';
    const root = await resolve(folder);
    if (platform === 'win32') {
      if (/^\\\\[^\\?][^\\]*\\[^\\]+(?:\\|$)/.test(root)) return 'drive';
      const match = paths.parse(root).root.match(/^([a-z]):\\$/i);
      if (!match) return 'unknown';
      // 任意の選択パスはコードに入れない。検査済みの A-Z 一文字だけを使用する。
      const letter = match[1].toUpperCase();
      const script = `[System.IO.DriveInfo]::new('${letter}:\\').DriveType.ToString()`;
      const { stdout } = await run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { timeout: 2000, maxBuffer: 1024, windowsHide: true });
      return stdout.trim() === 'Network' ? 'drive' : stdout.trim() === 'Fixed' ? 'local' : 'unknown';
    }
    if (platform !== 'darwin') return 'unknown';
    const realHome = await resolve(hostHome);
    const within = base => root === base || root.startsWith(base + path.sep);
    if ([path.join(realHome, 'Library/CloudStorage'), path.join(realHome, 'Library/Mobile Documents'), '/Volumes/GoogleDrive'].some(within)) return 'drive';
    if (within('/Volumes') || [path.join(realHome, 'Desktop'), path.join(realHome, 'Documents')].some(within)) return 'unknown';
    return 'local';
  } catch { return 'unknown'; }
}
