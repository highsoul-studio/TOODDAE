#!/usr/bin/env node
// Dayline の操作用ヘルパー。動いているローカルサーバの API を叩く (手でファイルを書き換えない = ロック・行の食い違い検査・メモ/入れ子の扱いが効く)。
//   node scripts/dl.mjs state                  今日の状態を一覧 (項目ごとに id)
//   node scripts/dl.mjs find <text>            本文に <text> を含む項目を JSON で (ref 付き)
//   node scripts/dl.mjs get <path>             GET  例: /api/state
//   node scripts/dl.mjs post <path> '<json>'   POST 例: /api/save (Origin / JSON ヘッダは自動)
//   node scripts/dl.mjs backup [label]         今日のノート・Templates/Daily.md・Inbox.md を <BACKUP_DIR>/<日時>/ へコピー
// 環境変数: PORT (既定 4317) / VAULT (既定 ~/TASK-Manager)。別の vault で試すときは両方指定する。
//          BACKUP_DIR (既定 ~/.dayline/backups。プロジェクトの外: フォルダごと配布・共有しても自分のノートが混ざらない)
// スクリプトから使うなら: import { api, state, items, refOf, backup } from './dl.mjs'
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = process.env.PORT || '4317';
let runtimeRoot, runtimeVault;
const BASE = `http://127.0.0.1:${PORT}`;
const BACKUPS = path.resolve(process.env.BACKUP_DIR || path.join(os.homedir(), '.dayline', 'backups'));

export async function api(method, p, body) {
  if (!runtimeRoot) {
    const response = await fetch(BASE + '/api/status');
    const current = await response.json();
    if (!response.ok || current.appId !== 'tooddae' || !current.ready) throw new Error('TOODDAE is not ready');
    runtimeRoot = current.rootId; runtimeVault = current.vault.path;
  }
  const post = method === 'POST';
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
    method,
    headers: { 'X-TOODDAE-Root': runtimeRoot, ...(post ? { 'content-type': 'application/json', origin: BASE } : {}) }, // サーバは同一オリジンの JSON だけ受け付ける
    body: post ? JSON.stringify(body ?? {}) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`${method} ${p} → ${r.status} ${JSON.stringify(data)}`), { status: r.status });
  return data;
}

export const state = () => api('GET', '/api/state');
export const refOf = (t) => ({ file: t.file, line: t.line, raw: t.raw, kind: t.kind }); // 書き込み系 API が要る「画面が見ていた行」

// 画面の全項目を 1 つの配列に (panel = tasks | routine | upcoming | inbox)
export function items(s) {
  const tag = (list, panel) => list.map((t) => ({ ...t, panel }));
  return [...tag(s.tasks, 'tasks'), ...tag(s.routine.flatMap((g) => g.items), 'routine'), ...tag(s.upcoming, 'upcoming'), ...tag(s.inbox, 'inbox')];
}

const stamp = () => new Date().toLocaleString('sv').replace(/[-: ]/g, '').replace(/^(\d{8})(\d{6})$/, '$1-$2'); // 20261006-153000

// 変更前の控え。vault の外にも Dayline の外にも置く (Obsidian の同期や検索に混ざらず、プロジェクトを配布しても漏れない)。戻すとき: cp -R <BACKUP_DIR>/<日時>/. <vault>/
export function backup(today, label = '') {
  if (!runtimeVault && !process.env.VAULT) throw new Error('Read server state before backup');
  const dir = path.join(BACKUPS, `${stamp()}${label ? `-${label}` : ''}`);
  for (const rel of [`Daily/${today}.md`, 'Templates/Daily.md', 'Inbox.md']) {
    const from = path.join(runtimeVault || path.resolve(process.env.VAULT || '.'), rel);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(from, path.join(dir, rel));
  }
  return dir;
}

const line = (t) => {
  const bits = [t.done ? '[x]' : t.cancelled ? '[-]' : '[ ]', t.text];
  if (t.priority) bits.push(`prio=${t.priority}`);
  if (t.repeat) bits.push(`repeat=${JSON.stringify(t.repeat)}`);
  if (t.scheduled || t.due) bits.push(`⏳${t.scheduled ?? '-'} 📅${t.due ?? '-'}`);
  if (t.memo) bits.push(`memo=${JSON.stringify(t.memo.slice(0, 40))}`);
  return `${bits.join('  ')}   id=${t.id}`;
};

async function main([cmd, a, b]) {
  if (cmd === 'state') {
    const s = await state();
    console.log(`${s.today}  sections: tasks=${JSON.stringify(s.sections.tasks)} routine=${JSON.stringify(s.sections.routine)}  streak=${s.streak}`);
    const bySection = (list) => {
      const g = new Map();
      for (const t of list) g.set(t.group ?? '', [...(g.get(t.group ?? '') ?? []), t]);
      return g;
    };
    console.log('\nTASKS');
    for (const [name, list] of bySection(s.tasks)) console.log(`  ${name ? `## ${name}` : '(no section)'}\n${list.map((t) => `    ${line(t)}`).join('\n')}`);
    console.log('\nROUTINE');
    for (const g of s.routine) console.log(`  ## ${g.group || '(no section)'}\n${g.items.map((t) => `    ${line(t)}`).join('\n')}`);
    console.log(`\nUPCOMING\n${s.upcoming.map((t) => `  ${line(t)}`).join('\n') || '  -'}\n\nINBOX\n${s.inbox.map((t) => `  ${line(t)}`).join('\n') || '  -'}`);
  } else if (cmd === 'find') {
    console.log(JSON.stringify(items(await state()).filter((t) => t.text.includes(a ?? '')).map((t) => ({ panel: t.panel, text: t.text, group: t.group ?? '', repeat: t.repeat, ref: refOf(t) })), null, 1));
  } else if (cmd === 'get') {
    console.log(JSON.stringify(await api('GET', a), null, 1));
  } else if (cmd === 'post') {
    console.log(JSON.stringify(await api('POST', a, JSON.parse(b ?? '{}')), null, 1));
  } else if (cmd === 'backup') {
    console.log(backup((await state()).today, a));
  } else {
    console.error('usage: node scripts/dl.mjs state | find <text> | get <path> | post <path> <json> | backup [label]');
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch((e) => (console.error(e.message), process.exit(1)));
