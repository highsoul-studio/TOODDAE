// macOS の launchd に登録して、ログイン時の自動起動と「落ちたら自動で再起動」を有効にする。
// 画面の「接続状態 → 再接続」もこの仕組みに乗って再起動する。
//   node scripts/service.mjs install | uninstall | status | print
//   (npm run service:install / service:uninstall / service:status)
// install は ~/Library/LaunchAgents/com.dayline.server.plist を作り、launchctl で読み込む。uninstall で元に戻る。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  console.error('service:* は macOS (launchd) 専用です。ほかの OS では npm start で起動してください (落ちても自動で戻したいときは、systemd やタスクスケジューラで node server.js を管理)。');
  process.exit(1);
}

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = 'com.dayline.server';
const PLIST = path.join(os.homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
const LOGS = path.join(os.homedir(), 'Library/Logs/Dayline');
const DOMAIN = `gui/${process.getuid()}`;
const PORT = process.env.PORT || '4317';
const VAULT = process.env.VAULT; // 未指定なら設定しない (サーバが ~/.dayline/runtime.json の保存済みフォルダを使う)

const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plist = () => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${x(process.execPath)}</string><string>${x(path.join(APP, 'server.js'))}</string></array>
  <key>WorkingDirectory</key><string>${x(APP)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DAYLINE_SUPERVISED</key><string>1</string>
    <key>PORT</key><string>${x(PORT)}</string>
${VAULT ? `    <key>VAULT</key><string>${x(VAULT)}</string>\n` : ''}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>2</integer>
  <key>StandardOutPath</key><string>${x(path.join(LOGS, 'server.log'))}</string>
  <key>StandardErrorPath</key><string>${x(path.join(LOGS, 'server.log'))}</string>
</dict>
</plist>
`;

const launchctl = (...args) => {
  try {
    return execFileSync('launchctl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return null;
  }
};
const status = async () => {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/status`, { signal: AbortSignal.timeout(1500) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
};

const cmd = process.argv[2];
if (cmd === 'print') {
  console.log(plist());
} else if (cmd === 'install') {
  const before = await status();
  if (before && !before.supervised) {
    console.error(`ポート ${PORT} で手動起動中のサーバ (pid ${before.pid}) があります。先に止めてください:\n  kill ${before.pid}\nその後もう一度 npm run service:install を実行してください。`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(PLIST), { recursive: true });
  fs.mkdirSync(LOGS, { recursive: true });
  fs.writeFileSync(PLIST, plist());
  launchctl('bootout', `${DOMAIN}/${LABEL}`); // 既に入っていれば入れ直す
  if (launchctl('bootstrap', DOMAIN, PLIST) === null) {
    console.error(`launchctl bootstrap に失敗しました。plist: ${PLIST}`);
    process.exit(1);
  }
  launchctl('kickstart', '-k', `${DOMAIN}/${LABEL}`);
  for (let i = 0; i < 20; i++) {
    const s = await status();
    if (s) {
      console.log(`起動しました: http://localhost:${PORT}  (pid ${s.pid}, 自動再起動: ${s.supervised ? 'オン' : 'オフ'})`);
      console.log(`ログ: ${path.join(LOGS, 'server.log')}\n注意: node のパス (${process.execPath}) を変えた/消したときは、もう一度 install してください。`);
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error('起動を確認できませんでした。ログを確認してください: ' + path.join(LOGS, 'server.log'));
  process.exit(1);
} else if (cmd === 'uninstall') {
  launchctl('bootout', `${DOMAIN}/${LABEL}`);
  fs.rmSync(PLIST, { force: true });
  console.log('自動起動を解除しました (サーバは停止します)。');
} else if (cmd === 'status') {
  const s = await status();
  console.log(s ? `稼働中: pid ${s.pid}, 自動再起動 ${s.supervised ? 'オン' : 'オフ'}, vault ${s.vault.name}` : '停止中');
  console.log(fs.existsSync(PLIST) ? `登録済み: ${PLIST}` : '未登録');
} else {
  console.error('usage: node scripts/service.mjs install | uninstall | status | print');
  process.exit(2);
}
