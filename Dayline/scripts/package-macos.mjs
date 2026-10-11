#!/usr/bin/env node
// この Mac の workspace と Node に結び付いた .app を生成する。
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defaults } from './launch.mjs';
const quote = s => "'" + String(s).replaceAll("'", "'\\''") + "'";
// ローカル生成用の ad-hoc 署名 (署名で増える _CodeSignature の quarantine を消すため、最後にもう一度 xattr -cr。封印には含まれず署名は有効のまま) (Apple Developer ID・公証は使わない)。macOS 以外では何もしない。失敗しても警告だけでパッケージ化は成功させる。
export async function signApp(app, { platform = process.platform, run = promisify(execFile), warn = console.warn } = {}) {
  if (platform !== 'darwin') return false;
  let ok = true;
  for (const [cmd, args] of [['xattr', ['-cr', app]], ['codesign', ['--force', '--deep', '-s', '-', app]], ['xattr', ['-cr', app]]]) {
    try { await run(cmd, args); } catch (e) { ok = false; warn(`warning: ${cmd} failed for ${path.basename(app)} (${String(e?.message ?? e).split('\n')[0]}); the app is still usable but macOS may show a first-open prompt`); }
  }
  return ok;
}
export async function packageMac({ output = path.join(path.dirname(defaults.app), 'TOODDAE.app'), ...options } = {}) {
  const config = { ...defaults, ...options };
  const { version } = JSON.parse(await fs.readFile(path.join(config.app, 'package.json'), 'utf8'));
  config.node = await fs.realpath(config.node);
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20+ required');
  const contents = path.join(output, 'Contents'), resources = path.join(contents, 'Resources'), executable = path.join(contents, 'MacOS', 'TOODDAE');
  await fs.mkdir(resources, { recursive: true }); await fs.mkdir(path.dirname(executable), { recursive: true });
  const cfg = path.join(resources, 'launcher.json');
  await fs.writeFile(cfg, JSON.stringify(config, null, 2) + '\n');
  await fs.writeFile(executable, `#!/bin/sh\n# 設定はこの .app 自身の位置から探す (/Applications などへ移動しても動く)。node と workspace の絶対パスだけは launcher.json に記録済みの場所を使う。\nres=$(cd "$(dirname "$0")/../Resources" && pwd)\nexec ${quote(config.node)} ${quote(path.join(config.app, 'scripts/launch.mjs'))} --config "$res/launcher.json" "$@"\n`, { mode: 0o755 });
  await fs.chmod(executable, 0o755);
  await fs.copyFile(path.join(config.app, 'design/app-icon/AppIcon.icns'), path.join(resources, 'AppIcon.icns')); // 作り方は design/app-icon/build.sh
  await fs.writeFile(path.join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleExecutable</key><string>TOODDAE</string><key>CFBundleIdentifier</key><string>com.highsoul.tooddae.local</string><key>CFBundleName</key><string>TOODDAE</string><key>CFBundleIconFile</key><string>AppIcon</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${version}</string><key>LSUIElement</key><true/></dict></plist>\n`);
  await fs.writeFile(path.join(resources, 'README.txt'), 'Local TOODDAE launcher. Requires the referenced workspace and installed Node.js 20+. No Node runtime is bundled. Regenerate after moving Node or the workspace. Opening starts/reuses the local background server and opens your browser. No login item or LaunchAgent is installed. Signed ad-hoc for local use only (not notarized): if macOS warns on first open, right-click > Open, or allow it in System Settings > Privacy & Security.\n');
  await signApp(output);
  return output;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(await packageMac());
