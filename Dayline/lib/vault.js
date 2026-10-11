// Obsidian vault はただの md フォルダなので、プラグインなしで直接読み書きする。
// タスク記法は Obsidian Tasks プラグインと互換 (- [ ] 内容 ⏳ 日付 📅 日付 ⏫ ✅ 日付)。
import fs from 'node:fs/promises';
import { lstatSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const DAILY_DIR = 'Daily';
export const TEMPLATE_FILE = 'Templates/Daily.md';
export const INBOX_FILE = 'Inbox.md';

const TASK_SECTION = '今日のタスク';
const ROUTINE_SECTION = 'ルーティン';
const ROUTINE_RE = /ルーティン|ルーチン|routine|checklist|チェックリスト|루틴|체크리스트/i;
// タスクを探さないフォルダ。Write = ノート (Do のタスクとは別の置き場)、Set = 設定
const SKIP_DIRS = new Set(['Templates', 'node_modules', 'Write', 'Set']);
const HISTORY_DAYS = 84;

export class Conflict extends Error {} // 画面が見ていた行と今のファイルが食い違う
export class BadInput extends Error {}

const PRIORITY = { '🔺': 'highest', '⏫': 'high', '🔼': 'medium', '🔽': 'low', '⏬': 'lowest' };
const PRIO_EMOJI = Object.fromEntries(Object.entries(PRIORITY).map(([e, p]) => [p, e]));
const PRIO_RANK = { highest: 0, high: 1, medium: 2, low: 4, lowest: 5 }; // 未設定は 3
const DATE_TOKENS = [['start', '🛫'], ['scheduled', '⏳'], ['due', '📅'], ['created', '➕'], ['doneDate', '✅'], ['cancelledDate', '❌']];

export const DEFAULT_TEMPLATE = `---
date: {{date}}
tags: [daily]
---

## 今日のタスク

## ルーティン

## メモ

`;

// ---------- 日付ユーティリティ ----------
const p2 = (n) => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const dateContext = (now = new Date()) => ({ today: localDate(now), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const addDays = (s, k) => {
  const t = new Date(`${s}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + k);
  return t.toISOString().slice(0, 10);
};
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && addDays(s, 0) === s;

// ---------- パーサ ----------
const TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)(.)(\]\s+)(.*)$/;
const HEAD_RE = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;
// 時刻: 14:00 (開始だけ) / 12:00-12:15 (範囲) / 〜12:00 (終了だけ = 締切の時刻)。区切りの 〜 は ~ ～ でもよい。
// グループ: 1,2 = 開始 / 3,4 = 範囲の終了 / 5,6 = 終了だけ。クライアントの TIME_SRC (public/app.js) と同じ形に保つ
const TIME_RE = /(?<![\w:/.=#])(?:([01]?\d|2[0-3]):([0-5]\d)(?:\s*[-–〜~～]\s*([01]?\d|2[0-3]):([0-5]\d))?|[〜~～]\s*([01]?\d|2[0-3]):([0-5]\d))(?![\d:])/;

function parseMeta(body) {
  let rest = body;
  const f = {};
  const block = rest.match(/\s\^([\w-]+)\s*$/);
  if (block) {
    f.block = block[1];
    rest = rest.slice(0, block.index);
  }
  for (const [key, emo] of DATE_TOKENS) {
    const re = new RegExp(`${emo}\\uFE0F?\\s*(\\d{4}-\\d{2}-\\d{2})`, 'u');
    const m = rest.match(re);
    if (m) {
      f[key] = m[1];
      rest = rest.replace(re, ' ');
    }
  }
  for (const [emo, name] of Object.entries(PRIORITY)) {
    const re = new RegExp(`${emo}\\uFE0F?`, 'u');
    if (re.test(rest)) {
      f.priority = name;
      rest = rest.replace(re, ' ');
    }
  }
  const rec = rest.match(/🔁\uFE0F?\s*(.*)$/u);
  if (rec) {
    f.recurrence = rec[1].trim();
    rest = rest.slice(0, rec.index);
  }
  return { text: rest.replace(/\s+/g, ' ').trim(), f };
}

function serialize(text, f) {
  const parts = [text];
  if (f.priority) parts.push(PRIO_EMOJI[f.priority]);
  if (f.recurrence) parts.push(`🔁 ${f.recurrence}`);
  for (const [key, emo] of DATE_TOKENS) if (f[key]) parts.push(`${emo} ${f[key]}`);
  if (f.block) parts.push(`^${f.block}`);
  return parts.join(' ');
}

// ---------- 繰り返し (Tasks の 🔁) ----------
// Tasks は Obsidian 上で完了したときだけ次回分を作る。Web から完了しても同じ結果になるよう
// every [N] day|weekday|week|month|year [when done] だけ再現し、それ以外は警告を返す。
const REC_RE = /^every\s+(?:(\d+)\s+)?(day|weekday|week|month|year)s?(\s+when done)?$/i;

function shiftDate(date, n, unit) {
  if (!(n > 0)) return null;
  if (unit === 'day' || unit === 'week') return addDays(date, n * (unit === 'week' ? 7 : 1));
  if (unit === 'weekday') {
    let d = date;
    for (let i = 0; i < n; i++) {
      do d = addDays(d, 1);
      while ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()));
    }
    return d;
  }
  const [y, m, day] = date.split('-').map(Number);
  if (day > 28) return null; // 月末まわりは Tasks (rrule) と挙動が食い違いやすいので対象外
  return new Date(Date.UTC(y, m - 1 + (unit === 'month' ? n : n * 12), day)).toISOString().slice(0, 10);
}

export function nextRecurrence(f, today) {
  const m = f.recurrence?.match(REC_RE);
  const old = f.due ?? f.scheduled ?? f.start; // 基準日。日付が無い繰り返しは Tasks も次回を作らない
  if (!m || !old) return null;
  const ref = shiftDate(m[3] ? today : old, Number(m[1] ?? 1), m[2].toLowerCase());
  if (!ref) return null;
  const delta = dayDiff(old, ref); // 他の日付も同じ幅だけずらす (相対関係を保つ)
  const g = { ...f };
  delete g.doneDate;
  delete g.cancelledDate;
  delete g.block;
  for (const k of ['start', 'scheduled', 'due']) if (g[k]) g[k] = addDays(g[k], delta);
  return g;
}

// ---------- ルーティンの繰り返し ----------
// 書き方は Tasks の 🔁 と同じ: every weekday / every week on Monday, Friday / every month on the 15th|last。
// 毎日 (既定) はトークンを付けない。Templates/Daily.md の行に書き、日次ノートを作るときに該当日の行だけ残す。
// 末尾に ` until YYYY-MM-DD` を付けると、その日まで (その日を含む) で終わる。例: every day until 2026-10-09
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']; // 添字+1 = ISO 曜日 (月=1)
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

export function parseRule(s) {
  const t = String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const u = t.match(/ until (\d{4}-\d{2}-\d{2})$/);
  if (!u) return parseBase(t);
  const r = validDate(u[1]) ? parseBase(t.slice(0, u.index)) : null;
  return r && { ...r, until: u[1] };
}

function parseBase(t) {
  if (t === 'every day') return { type: 'daily' };
  if (t === 'every weekday') return { type: 'weekday' };
  let m = t.match(/^every (?:week on )?([a-z]+(?:(?:, and |, | and )[a-z]+)*)$/);
  if (m) {
    const days = m[1].split(/, and |, | and /).map((d) => DAY_NAMES.findIndex((n) => n.toLowerCase() === d) + 1);
    return days.every((d) => d > 0) ? { type: 'weekly', days: [...new Set(days)].sort((a, b) => a - b) } : null;
  }
  m = t.match(/^every month on the (?:(\d{1,2})(?:st|nd|rd|th)|last)$/);
  return m ? { type: 'monthly', dom: m[1] ? Number(m[1]) : 'last' } : null;
}

export function formatRule(r) {
  const base = formatBase(r);
  return r.until ? `${base || 'every day'} until ${r.until}` : base; // 毎日は、終了日が無ければ何も付けない
}

function formatBase(r) {
  if (r.type === 'weekday') return 'every weekday';
  if (r.type === 'weekly') return `every week on ${r.days.map((d) => DAY_NAMES[d - 1]).join(', ')}`;
  if (r.type === 'monthly') return `every month on the ${r.dom === 'last' ? 'last' : ord(r.dom)}`;
  return ''; // daily
}

export function ruleMatches(r, date) {
  if (r.until && date > r.until) return false;
  const dow = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  if (r.type === 'daily') return true;
  if (r.type === 'weekday') return dow <= 5;
  if (r.type === 'weekly') return r.days.includes(dow);
  const [y, m, d] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d === (r.dom === 'last' ? last : Math.min(r.dom, last)); // 31日指定でも小さい月は月末に寄せる (取りこぼさない)
}

// 画面から来た {type, days?, dom?} を検証して正規化。once = 今日だけ (テンプレートには書かない)
export function normRepeat(r) {
  const t = r?.type;
  const until = r?.until ? checkDate(r.until) : null; // 終了日 (任意。その日を含む)
  const withUntil = (o) => (until ? { ...o, until } : o);
  if (t === 'once') return { type: t };
  if (t === 'daily' || t === 'weekday') return withUntil({ type: t });
  if (t === 'weekly') {
    const days = [...new Set((r.days ?? []).map(Number))].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
    if (!days.length) throw new BadInput('weekly needs days');
    return withUntil({ type: t, days });
  }
  if (t === 'monthly') {
    const dom = r.dom === 'last' ? 'last' : Number(r.dom);
    if (dom !== 'last' && !(Number.isInteger(dom) && dom >= 1 && dom <= 31)) throw new BadInput('bad day of month');
    return withUntil({ type: t, dom });
  }
  throw new BadInput('bad repeat');
}

// 開始が無いとき (start: null) は「〜12:00」= 終了だけの時刻。ルーティン以外では、締切の時刻として使える
export function parseTime(text) {
  const m = text.match(TIME_RE);
  if (!m) return null;
  const hm = (h, mm) => `${h.padStart(2, '0')}:${mm}`;
  if (m[5]) return { start: null, end: hm(m[5], m[6]) };
  return { start: hm(m[1], m[2]), end: m[3] ? hm(m[3], m[4]) : null };
}

// 日付が別の日なら、終了時刻が開始時刻より小さい overnight/multiday を許す。
// 日付なし・同日では、逆順や同時刻を「翌日」と推測しない。
export function validateTaskSpan(text, f, implicitStart = null) {
  validateDates(f);
  const startDate = f.scheduled ?? f.start ?? implicitStart;
  const endDate = f.due ?? startDate;
  if (startDate && endDate && endDate < startDate) throw new BadInput('due before start');
  const time = parseTime(text);
  if (time?.start && time.end && time.end <= time.start && !(startDate && f.due && f.due > startDate)) {
    throw new BadInput('end before start');
  }
}

export function validateRoutineTime(text, f = {}) {
  validateDates(f); // routine は日付を保存しないが、受け取った metadata 自体は calendar-valid でなければならない
  const time = parseTime(text);
  // 時刻は開始だけ・終了だけ(〜12:00)・両方・なしのどれでもよい。両方あるときだけ順序を見る
  if (time?.start && time.end && time.end <= time.start) throw new BadInput('end before start');
}

// 本文中の最初の時刻 (parseTime が拾うもの) を先頭へ移す。編集ダイアログは先頭の時刻を開始/終了の欄に出すので、AI などが文末に書いても欄に入るようにする。
export function leadTime(text) {
  const m = String(text ?? '').match(TIME_RE);
  if (!m || m.index === 0) return text;
  const rest = [text.slice(0, m.index).trimEnd(), text.slice(m.index + m[0].length).trimStart()].filter(Boolean).join(' ');
  return rest ? `${m[0]} ${rest}` : m[0];
}

function validateDates(f) {
  for (const key of ['start', 'scheduled', 'due', 'created', 'doneDate', 'cancelledDate']) if (f[key]) checkDate(f[key]);
}

// ---------- メモ ----------
// メモ = タスク行の直下にある、インデントされた続きの行 (Obsidian の Shift+Enter や入れ子の箇条書きと同じ形)。
// 空行・インデントの浅い行・チェックボックス行・コードフェンスのところで終わる。書くときはタスク行の内容位置に揃える。
const CHECKBOX_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[(.)\]/;
const ESC_CHECKBOX_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)\\\[(.)\]/;
const ESC_FENCE_RE = /^(\s*)\\(```|~~~)/;
const indentOf = (l) => l.length - l.trimStart().length;

function contCount(lines, i) {
  const base = indentOf(lines[i]);
  let n = 0;
  for (let k = i + 1; k < lines.length; k++) {
    const l = lines[k];
    if (l.trim() === '' || indentOf(l) <= base || CHECKBOX_RE.test(l) || FENCE_RE.test(l)) break;
    n++;
  }
  return n;
}

// タスク行の下にぶら下がる行 (入れ子の項目やメモ) の数。空行・コードフェンス・インデントが同じか浅い行で終わる。
// メモ (contCount) はその先頭部分。タスクを別の場所へ動かす・テンプレートから外すときは、これらも一緒に扱う。
function subCount(lines, i) {
  const base = indentOf(lines[i]);
  let n = 0;
  for (let k = i + 1; k < lines.length && lines[k].trim() !== '' && indentOf(lines[k]) > base && !FENCE_RE.test(lines[k]); k++) n++;
  return n;
}

const memoPad = (taskLine) => {
  const m = taskLine.match(/^(\s*)([-*+]|\d+[.)])\s/);
  return m ? `${m[1]}${' '.repeat(m[2].length + 1)}` : '  ';
};

// メモ行 → 画面用の文字列 (内容位置までのインデントと、書き込み時のエスケープを外す)
function memoText(taskLine, memoRaw) {
  const pad = memoPad(taskLine).length;
  return memoRaw.map((l) => l.slice(Math.min(pad, indentOf(l))).replace(ESC_CHECKBOX_RE, '$1[$2]').replace(ESC_FENCE_RE, '$1$2')).join('\n');
}

// 空行は「続きの行」として表せないので詰める (それ以外は切り詰めない)
const cleanMemo = (s) =>
  String(s ?? '')
    .split(/\r\n?|\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l !== '')
    .join('\n');

// 画面のメモ → 書き込む行。チェックボックスやコードフェンスに見える行は \ で逃がし、別物として解釈されないようにする
function memoLines(taskLine, memo) {
  if (memo != null && typeof memo !== 'string') throw new BadInput('bad memo');
  const pad = memoPad(taskLine);
  const text = cleanMemo(memo);
  return text ? text.split('\n').map((l) => pad + l.replace(CHECKBOX_RE, '$1\\[$2]').replace(/^(\s*)(```|~~~)/, '$1\\$2')) : [];
}

export function parseTasks(src, file, noteDate = null) {
  const out = [];
  const lines = src.split(/\r?\n/);
  let h2 = null;
  let h3 = null;
  let fence = null;
  let i = 0;
  if (lines[0]?.replace(/^\uFEFF/, '').trim() === '---') {
    const end = lines.findIndex((l, k) => k > 0 && l.trim() === '---');
    if (end > 0) i = end + 1; // frontmatter は読み飛ばす
  }
  for (; i < lines.length; i++) {
    const line = lines[i];
    const fm = line.match(FENCE_RE);
    if (fm) {
      fence = fence ? (fm[1] === fence ? null : fence) : fm[1];
      continue;
    }
    if (fence) continue;
    const h = line.match(HEAD_RE);
    if (h) {
      if (h[1].length <= 2) {
        h2 = h[2];
        h3 = null;
      } else if (h[1].length === 3) h3 = h[2];
      continue;
    }
    const m = line.match(TASK_RE);
    if (!m) continue;
    const st = m[2];
    const { text, f } = parseMeta(m[4]);
    if (!text) continue; // 中身が空のチェックボックスは無視
    const n = contCount(lines, i);
    out.push({
      id: `${file}:${i}`,
      file,
      line: i,
      raw: line,
      status: st,
      done: st === 'x' || st === 'X',
      cancelled: st === '-',
      text,
      ...f,
      ...(n ? { memo: memoText(line, lines.slice(i + 1, i + 1 + n)) } : {}),
      tags: [...text.matchAll(/(?:^|\s)#([^\s#]+)/g)].map((x) => x[1]),
      time: parseTime(text),
      section: h2,
      group: h3,
      kind: ROUTINE_RE.test(h2 ?? '') || ROUTINE_RE.test(h3 ?? '') ? 'routine' : 'task',
      date: noteDate,
    });
  }
  return out;
}

// ---------- ファイル操作 ----------
// 既存のパス要素でシンボリックリンクを許可しない。
function safePath(root, rel) {
  const base = path.resolve(root);
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep)) throw new BadInput('bad path');
  let part = base;
  for (const segment of path.relative(base, file).split(path.sep)) {
    part = path.join(part, segment);
    try { if (lstatSync(part).isSymbolicLink()) throw new BadInput('symlink path'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return file;
}
function absPath(root, rel) {
  if (typeof rel !== 'string') throw new BadInput('bad path');
  const base = path.resolve(root);
  const p = path.resolve(base, rel);
  if (!p.startsWith(base + path.sep) || !p.endsWith('.md') || rel.split('/').some((s) => s.startsWith('.'))) {
    throw new BadInput('bad path');
  }
  return safePath(root, rel);
}

async function walk(root, rel = '') {
  const out = [];
  for (const e of await fs.readdir(path.join(root, rel), { withFileTypes: true })) {
    if (e.name.startsWith('.') || (e.isDirectory() && SKIP_DIRS.has(e.name))) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(root, r)));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(r);
  }
  return out;
}

// 読み込み → 書き込みが重ならないよう、同じファイルへの操作は1つずつ順番に行う (素早い連続操作や複数タブで更新が消えないように)
const queues = new Map();
function exclusive(key, fn) {
  const run = (queues.get(key) ?? Promise.resolve()).then(fn);
  const tail = run.catch(() => {});
  queues.set(key, tail);
  tail.then(() => queues.get(key) === tail && queues.delete(key));
  return run;
}

// UTF-8 として読む。UTF-8 でないノートは、書き戻すと壊れるので触らない。BOM はそのまま保つ。
async function readUtf8(file) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await fs.readFile(file));
  } catch (e) {
    if (e instanceof TypeError) throw new BadInput('not utf-8');
    throw e;
  }
}

// temp に書いてから rename。Obsidian が書きかけを読まないようにする (ドットファイルは Obsidian に無視される)。
// rename の直前にもう一度 mtime/size を確かめ、読んだ後に Obsidian が保存していたら書かずに false を返す。
async function writeIfUnchanged(file, before, data, guard = () => {}) {
  const same = async () => {
    const now = await fs.stat(file);
    return now.mtimeMs === before.mtimeMs && now.ctimeMs === before.ctimeMs && now.size === before.size && now.ino === before.ino && now.dev === before.dev;
  };
  if (process.env.INPLACE === '1') {
    // rename が Obsidian に反映されない場合の逃げ道
    if (!(await same())) return false;
    guard();
    await fs.writeFile(file, data);
    return true;
  }
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`);
  await fs.writeFile(tmp, data);
  if (!(await same())) {
    await fs.rm(tmp, { force: true });
    return false;
  }
  try { guard(); } catch (error) { await fs.rm(tmp, { force: true }); throw error; }
  await fs.rename(tmp, file);
  return true;
}

// 読んでから書くまでの間に Obsidian が保存したら (mtime/size が変わる) やり直す。3回で諦めて Conflict。
function editFile(root, rel, fn) {
  const file = absPath(root, rel);
  return exclusive(file, async () => {
    for (let n = 0; n < 3; n++) {
      const before = await fs.stat(file);
      const src = await readUtf8(file);
      const eol = src.includes('\r\n') ? '\r\n' : '\n';
      const lines = src.split(/\r?\n/);
      const result = fn(lines);
      if (await writeIfUnchanged(file, before, lines.join(eol))) return result;
    }
    throw new Conflict();
  });
}

// 画面が見ていた行 (raw) と一致する行だけを対象にする。行がずれていたら、完全一致が1件のときだけ追従。
function locate(lines, ref) {
  const i = lines[ref.line] === ref.raw ? ref.line : lines.indexOf(ref.raw);
  if (i < 0 || (i !== ref.line && lines.lastIndexOf(ref.raw) !== i)) throw new Conflict();
  return i;
}

const missingIsConflict = (e) => {
  if (e.code === 'ENOENT') throw new Conflict();
  throw e;
};

// 行を書き換える。fn(今の行, メモ行) の戻り値 (配列可) で置き換え、メモ行はその直後に残る。memo を渡すとメモ行も置き換える (undefined = そのまま)。
function mutateLine(root, ref, fn, memo) {
  checkRef(ref);
  return editFile(root, ref.file, (lines) => {
    const i = locate(lines, ref);
    const n = contCount(lines, i);
    const out = [].concat(fn(lines[i], lines.slice(i + 1, i + 1 + n)));
    if (memo === undefined) lines.splice(i, 1, ...out);
    else lines.splice(i, 1 + n, ...out, ...memoLines(out.at(-1), memo));
    return out.at(-1);
  }).catch(missingIsConflict);
}

// 行を消す。whole なし: タスク行とメモ行だけ (入れ子のタスクはその場に残る。変換のとき、別の項目として作り直されないまま消えてしまわないように)。
// whole あり: ぶら下がる行ごと (別の場所へ運んだあとに元を消すとき)。
function removeBlock(root, ref, whole = false) {
  checkRef(ref);
  return editFile(root, ref.file, (lines) => {
    const i = locate(lines, ref);
    lines.splice(i, 1 + (whole ? subCount(lines, i) : contCount(lines, i)));
  }).catch(missingIsConflict);
}

// 今ファイルにある、タスク行の下の行 (そのまま)。別ファイルへ移すときに一緒に運ぶ。memoRaw = メモ / restRaw = 入れ子の項目など
async function blockOf(root, ref) {
  const lines = (await readUtf8(absPath(root, ref.file)).catch(missingIsConflict)).split(/\r?\n/);
  const i = locate(lines, ref);
  const n = contCount(lines, i);
  return { memoRaw: lines.slice(i + 1, i + 1 + n), restRaw: lines.slice(i + 1 + n, i + 1 + subCount(lines, i)) };
}

// 行を書き換えたうえで、同じファイル内の別セクションへ移す (メモ・入れ子の項目も一緒。memo を渡すとメモを置き換える)
function moveLine(root, ref, nextRaw, panel, section, memo) {
  checkRef(ref);
  return editFile(root, ref.file, (lines) => {
    const i = locate(lines, ref);
    const n = contCount(lines, i);
    const old = lines.splice(i, 1 + subCount(lines, i)).slice(1);
    insertIn(lines, panel, section, [nextRaw, ...(memo === undefined ? old : [...memoLines(nextRaw, memo), ...old.slice(n)])]);
    return nextRaw;
  }).catch(missingIsConflict);
}

function checkRef(ref) {
  if (!ref || typeof ref.file !== 'string' || !Number.isInteger(ref.line) || ref.line < 0 || typeof ref.raw !== 'string') {
    throw new BadInput('bad ref');
  }
  if (/^(?:Write|Set)\//.test(ref.file)) throw new BadInput('not a task file'); // ノートと設定は、タスクの API では触らせない
}

const cleanText = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
const cleanSection = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 60); // '' = セクションなし
const checkDate = (s) => {
  if (!validDate(s)) throw new BadInput('bad date');
  return s;
};
const checkPrio = (p) => {
  if (!PRIO_EMOJI[p]) throw new BadInput('bad priority');
  return p;
};

// ---------- セクション (見出し) ----------
// パネル = 日次ノートの ## 見出し。tasks = 「今日のタスク」, routine = 「ルーティン」系。セクション = その下の ### 見出し。
function panelHead(lines, panel) {
  return lines.findIndex((l) => {
    const m = l.match(HEAD_RE);
    if (!m) return false;
    return panel === 'tasks' ? m[1].length === 2 && m[2] === TASK_SECTION : m[1].length <= 2 && ROUTINE_RE.test(m[2]);
  });
}
const panelEnd = (lines, h) => {
  for (let k = h + 1; k < lines.length; k++) if (/^#{1,2}\s/.test(lines[k])) return k;
  return lines.length;
};
function sectionHead(lines, h, end, name) {
  for (let k = h + 1; k < end; k++) {
    const m = lines[k].match(HEAD_RE);
    if (m && m[1].length === 3 && m[2] === name) return k;
  }
  return -1;
}
const sectionEnd = (lines, s, end) => {
  for (let k = s + 1; k < end; k++) if (/^#{1,3}\s/.test(lines[k])) return k;
  return end;
};
export function sectionNames(lines, panel) {
  const h = panelHead(lines, panel);
  if (h < 0) return [];
  const names = [];
  for (let k = h + 1, end = panelEnd(lines, h); k < end; k++) {
    const m = lines[k].match(HEAD_RE);
    if (m && m[1].length === 3) names.push(m[2]);
  }
  return names;
}

function ensurePanel(lines, panel) {
  let h = panelHead(lines, panel);
  if (h < 0) {
    while (lines.length && lines.at(-1) === '') lines.pop();
    lines.push('', `## ${panel === 'tasks' ? TASK_SECTION : ROUTINE_SECTION}`, '');
    h = lines.length - 2;
  }
  return h;
}

function insertHeading(lines, panel, name) {
  const h = ensurePanel(lines, panel);
  let at = panelEnd(lines, h);
  while (at > h + 1 && lines[at - 1].trim() === '') at--; // 末尾の空行の手前
  lines.splice(at, 0, `### ${name}`);
}

// section '' = 見出しなし (最初の ### より前)。見出しが無ければ作る。line は文字列か、(タスク行 + メモ行の) 配列。
function insertIn(lines, panel, section, line) {
  const h = ensurePanel(lines, panel);
  let end = panelEnd(lines, h);
  let from = h + 1;
  let stop = end;
  if (section) {
    if (sectionHead(lines, h, end, section) < 0) {
      insertHeading(lines, panel, section);
      end = panelEnd(lines, h);
    }
    from = sectionHead(lines, h, end, section) + 1;
    stop = sectionEnd(lines, from - 1, end);
  } else {
    for (let k = h + 1; k < end; k++) {
      if (/^###\s/.test(lines[k])) {
        stop = k;
        break;
      }
    }
  }
  let at = from;
  for (let k = from; k < stop; k++) if (lines[k].trim() !== '') at = k + 1; // 節の最後の非空行の直後
  lines.splice(at, 0, ...[].concat(line));
}

// 戻り値: 変更したか。前提を満たさなければ BadInput。
function applySection(lines, panel, op, name, to) {
  const h = panelHead(lines, panel);
  if (op === 'add') {
    if (h >= 0 && sectionHead(lines, h, panelEnd(lines, h), name) >= 0) return false;
    insertHeading(lines, panel, name);
    return true;
  }
  if (h < 0) return false;
  const end = panelEnd(lines, h);
  const s = sectionHead(lines, h, end, name);
  if (s < 0) return false;
  if (op === 'rename') {
    if (to === name) return false;
    if (sectionHead(lines, h, end, to) >= 0) throw new BadInput('exists');
    lines[s] = `### ${to}`;
    return true;
  }
  let e = sectionEnd(lines, s, end);
  while (e > s + 1 && lines[e - 1].trim() === '') e--; // 末尾の空行は残す (次の見出しとの間隔を保つ)
  if (lines.slice(s + 1, e).some((l) => l.trim() !== '')) throw new BadInput('not empty'); // 項目が残っている節は消さない
  lines.splice(s, e - s);
  return true;
}

async function ensureTemplate(root) {
  const file = absPath(root, TEMPLATE_FILE);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, DEFAULT_TEMPLATE, { flag: 'wx' }).catch((e) => {
    if (e.code !== 'EEXIST') throw e;
  });
  return TEMPLATE_FILE;
}

// セクションの追加・改名・削除。テンプレートと今日のノートの両方に反映する (過去のノートは触らない)。
export async function sectionOp(root, today, { panel, op, name, to }, { reportChanges = false } = {}) {
  if (!['tasks', 'routine'].includes(panel) || !['add', 'rename', 'delete'].includes(op)) throw new BadInput('bad section op');
  const n = cleanSection(name);
  const m = op === 'rename' ? cleanSection(to) : '';
  if (!n || (op === 'rename' && !m)) throw new BadInput('empty');
  const files = [await ensureTemplate(root), await ensureDaily(root, today)];
  for (const f of files) applySection((await fs.readFile(absPath(root, f), 'utf8')).split(/\r?\n/), panel, op, n, m); // 先に両方で前提を確認
  let changed = false;
  for (const f of files) {
    const applied = await editFile(root, f, (lines) => applySection(lines, panel, op, n, m));
    changed = changed || applied;
  }
  return reportChanges ? { ok: true, changed } : { ok: true };
}

// 並べ替えは行を再生成しない。見出し直前の改行から次の見出し直前までを一塊にする。
const sourceHash = src => createHash('sha256').update(src, 'utf8').digest('hex');
function sectionBlocks(src, panel) {
  const heads = []; let offset = 0, fence = null, frontmatter = false, first = true;
  for (const raw of src.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? []) {
    if (!raw) continue;
    const line = raw.replace(/[\r\n]+$/, '').replace(first ? /^\uFEFF/ : /$^/, '');
    if (first && line.trim() === '---') { frontmatter = true; first = false; offset += raw.length; continue; }
    first = false;
    if (frontmatter) { if (line.trim() === '---') frontmatter = false; offset += raw.length; continue; }
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
    } else if (!fence) {
      const h = line.match(HEAD_RE);
      if (h) heads.push({ level: h[1].length, name: h[2], offset });
    }
    offset += raw.length;
  }
  if (fence || frontmatter) throw new BadInput('ambiguous section boundaries');
  const matches = heads.filter(h => panel === 'tasks' ? h.level === 2 && h.name === TASK_SECTION : h.level <= 2 && ROUTINE_RE.test(h.name));
  if (matches.length > 1) throw new BadInput('duplicate panel');
  if (!matches.length) return { names: [], reorder: () => src };
  const head = matches[0], end = heads.find(h => h.offset > head.offset && h.level <= 2)?.offset ?? src.length;
  const groups = heads.filter(h => h.offset > head.offset && h.offset < end && h.level === 3);
  const names = groups.map(h => h.name);
  if (new Set(names).size !== names.length) throw new BadInput('duplicate section');
  if (!groups.length) return { names, panelStart: head.offset, panelEnd: end, groups: [], reorder: () => src };
  const boundary = at => at > 0 && src[at - 1] === '\n' ? at - (src[at - 2] === '\r' ? 2 : 1) : at > 0 && src[at - 1] === '\r' ? at - 1 : at;
  const stop = end < src.length ? boundary(end) : end;
  const chunks = new Map(groups.map((h, i) => [h.name, src.slice(boundary(h.offset), i + 1 < groups.length ? boundary(groups[i + 1].offset) : stop)]));
  return { names, panelStart: head.offset, panelEnd: end, groups: groups.map((h,i)=>({name:h.name,start:h.offset,end:groups[i+1]?.offset??end})), reorder: order => src.slice(0, boundary(groups[0].offset)) + order.filter(n => chunks.has(n)).map(n => chunks.get(n)).join('') + src.slice(stop) };
}
async function sectionSource(root, rel) {
  const file = absPath(root, rel);
  try { const stat = await fs.stat(file); const src = await readUtf8(file); return { file, rel, stat, src, hash: sourceHash(src) }; }
  catch (e) { if (e.code === 'ENOENT') return { file, rel, stat: null, src: '', hash: sourceHash('') }; throw e; }
}
export async function sectionOrderState(root, today) {
  const daily = await sectionSource(root, `${DAILY_DIR}/${today}.md`), template = await sectionSource(root, TEMPLATE_FILE);
  return Object.fromEntries(['tasks', 'routine'].map(panel => {
    try {
      return [panel, { order: [...new Set([...sectionBlocks(daily.src, panel).names, ...sectionBlocks(template.src, panel).names])], base: { daily: daily.hash, template: template.hash } }];
    } catch (e) { if (!(e instanceof BadInput)) throw e; return [panel, { order: [], base: { daily: daily.hash, template: template.hash }, error: e.message }]; }
  }));
}
export async function reorderSections(root, today, { panel, order, base }) {
  checkDate(today);
  if (!['tasks', 'routine'].includes(panel) || !Array.isArray(order) || order.length > 200 || order.some(n => typeof n !== 'string' || !n || n.length > 500) || new Set(order).size !== order.length) throw new BadInput('bad section order');
  if (!base || typeof base.daily !== 'string' || typeof base.template !== 'string' || !/^[0-9a-f]{64}$/.test(base.daily) || !/^[0-9a-f]{64}$/.test(base.template)) throw new BadInput('bad section base');
  const dailyRel = `${DAILY_DIR}/${today}.md`, rels = [dailyRel, TEMPLATE_FILE].sort();
  const lock = index => index < rels.length ? exclusive(absPath(root, rels[index]), () => lock(index + 1)) : apply();
  const apply = async () => {
    const sources = await Promise.all(rels.map(rel => sectionSource(root, rel)));
    for (const source of sources) if (source.hash !== base[source.rel === dailyRel ? 'daily' : 'template']) throw new Conflict();
    const parsed = sources.map(source => sectionBlocks(source.src, panel));
    const names = [...new Set(parsed.flatMap(p => p.names))];
    if (names.length !== order.length || names.some(n => !order.includes(n))) throw new BadInput('section order must be a complete permutation');
    const changedFiles = [];
    try {
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i], next = parsed[i].reorder(order);
        if (source.src === next) continue;
        if (!source.stat || !(await writeIfUnchanged(source.file, source.stat, next))) throw new Conflict();
        changedFiles.push(source.rel);
      }
    } catch (e) {
      if (changedFiles.length || e.code === 'ENOENT') { const conflict = new Conflict(); conflict.changedFiles = changedFiles; throw conflict; }
      throw e;
    }
    return { ok: true, changed: changedFiles.length > 0 };
  };
  return lock(0);
}

// ---------- 変更操作 ----------
const doneToken = /\s*✅\uFE0F?\s*\d{4}-\d{2}-\d{2}/u;
const cancelToken = /\s*❌\uFE0F?\s*\d{4}-\d{2}-\d{2}/u;

function matchTask(raw) {
  const m = raw.match(TASK_RE);
  if (!m) throw new BadInput('not a task'); // 画面が持っている行がタスク行でない (想定外の入力)
  return m;
}

// 完了⇄未完了。完了日(✅)は Tasks プラグインと同じ位置・形式で付け外しする。
export function toggleRaw(raw, today) {
  const [, pre, st, mid, body] = matchTask(raw);
  if (st === 'x' || st === 'X') return `${pre} ${mid}${body.replace(doneToken, '')}`;
  if (st === '-') return `${pre} ${mid}${body.replace(cancelToken, '')}`;
  const block = body.match(/\s\^[\w-]+\s*$/);
  // Obsidian 標準のチェックボックス操作で外した行には ✅ が残っていることがある。二重に付けないよう先に外す
  const main = (block ? body.slice(0, block.index) : body).replace(doneToken, '');
  return `${pre}x${mid}${main.trimEnd()} ✅ ${today}${block ? block[0] : ''}`;
}

export async function toggle(root, today, ref) {
  const res = {};
  res.raw = await mutateLine(root, ref, (r, memoRaw) => {
    delete res.warn;
    delete res.next;
    const done = toggleRaw(r, today);
    if (ref.kind === 'routine') return done; // ルーティンの 🔁 は「どの日に出すか」。完了しても次回分は作らない
    const [, pre, st, mid, body] = matchTask(r);
    if ('xX-'.includes(st)) return done; // 再オープンは通常のトグルだけ
    const { text, f } = parseMeta(body);
    if (!f.recurrence) return done;
    const next = nextRecurrence(f, today);
    if (!next) {
      res.warn = 'recurrence'; // 規則を解釈できない: 次回分は作れない
      return done;
    }
    if (isDaily(ref.file) && !next.scheduled && !next.start) next.scheduled = next.due; // 日次ノートの行は日付が暗黙。⏳ が無いと、次回分が古いノートの日付のまま毎日「今日」に出てしまう
    res.next = next.due ?? next.scheduled ?? next.start;
    return [`${pre} ${mid}${serialize(text, next)}`, ...memoRaw, done]; // Tasks と同じく次回分は完了行の上 (メモは次回分へも引き継ぐ)
  });
  return res;
}

function rebuild(raw, { status, text, patch = {} }) {
  const [, pre, st, mid, body] = matchTask(raw);
  const meta = parseMeta(body);
  const f = { ...meta.f, ...patch };
  for (const k of Object.keys(f)) if (f[k] === '' || f[k] == null) delete f[k];
  return `${pre}${status ?? st}${mid}${serialize(text ?? meta.text, f)}`;
}

const isDaily = (file) => /^Daily\/\d{4}-\d{2}-\d{2}\.md$/.test(file);

// start / scheduled / due / priority / section / memo は undefined = そのまま、'' = 消す (section '' = セクションなし)。
export async function edit(root, ref, { text, start, scheduled, due, priority, section, memo }) {
  const t = cleanText(text);
  if (!t) throw new BadInput('empty');
  checkRef(ref);
  const patch = {};
  if (start !== undefined) patch.start = start ? checkDate(start) : '';
  if (scheduled !== undefined) patch.scheduled = scheduled ? checkDate(scheduled) : '';
  if (due !== undefined) patch.due = due ? checkDate(due) : '';
  if (priority !== undefined) patch.priority = priority ? checkPrio(priority) : '';
  const next = rebuild(ref.raw, { text: t, patch }); // 画面が見ていた行から組み立てる (実ファイルとの一致は mutateLine が確認)
  const g = parseMeta(matchTask(next)[4]).f;
  validateTaskSpan(parseMeta(matchTask(next)[4]).text, g, ref.file.match(/^Daily\/(\d{4}-\d{2}-\d{2})\.md$/)?.[1]);
  // 日付を両方消した = 「いつでも」。日次ノートの行は日付が暗黙なので、Inbox へ移す (先に追記してから元を消す)
  if ((patch.scheduled === '' || patch.start === '') && patch.due === '' && isDaily(ref.file) && matchTask(next)[2] === ' ') {
    const { memoRaw, restRaw } = await blockOf(root, ref);
    await appendInbox(root, [next, ...(memo === undefined ? memoRaw : memoLines(next, memo)), ...restRaw]);
    await removeBlock(root, ref, true);
    return { raw: next, moved: INBOX_FILE };
  }
  if (section !== undefined && isDaily(ref.file)) return { raw: await moveLine(root, ref, next, 'tasks', cleanSection(section), memo) };
  return { raw: await mutateLine(root, ref, () => next, memo) };
}

// ルーティン項目の編集。今日の行の本文・セクションと、Templates/Daily.md 側の定義 (本文・繰り返し・セクション) を更新する。
// repeat 省略 = 繰り返しは変えない / {type:'once'} = 今日だけ (テンプレートに書かない)。変更は明日以降の日次ノートから効く。
export async function editRoutine(root, ref, { text, repeat, section, memo }) {
  const parsed = parseMeta(cleanText(text));
  const t = parsed.text;
  if (!t) throw new BadInput('empty');
  validateRoutineTime(t, parsed.f);
  checkRef(ref);
  const rule = repeat == null ? null : normRepeat(repeat);
  const sec = section === undefined ? undefined : cleanSection(section);
  const old = parseMeta(matchTask(ref.raw)[4]);
  const textChanged = t !== old.text;
  const group = rule ? await groupAt(root, ref) : ''; // テンプレートに無い項目へ繰り返しを付けるとき、今のセクションで追加する
  let raw = ref.raw;
  if (sec !== undefined) raw = await moveLine(root, ref, rebuild(ref.raw, { text: t, patch: { recurrence: '' } }), 'routine', sec, memo);
  else if (textChanged || old.f.recurrence || memo !== undefined) {
    raw = await mutateLine(root, ref, (r) => rebuild(r, { text: t, patch: { recurrence: '' } }), memo); // ノート内の 🔁 は外す
  }
  if (rule?.type !== 'once' && (rule || textChanged || sec !== undefined || memo !== undefined)) await upsertTemplateRoutine(root, old.text, t, rule, sec, group, memo);
  return { raw };
}

async function groupAt(root, ref) {
  try {
    const src = await fs.readFile(absPath(root, ref.file), 'utf8');
    return parseTasks(src, ref.file).find((x) => x.line === ref.line && x.raw === ref.raw)?.group ?? '';
  } catch {
    return '';
  }
}

async function upsertTemplateRoutine(root, oldText, newText, rule, section, fallback = '', memo, { onlyNew = false } = {}) {
  const token = rule ? formatRule(rule) : undefined; // undefined = 今の規則を保つ
  await editFile(root, await ensureTemplate(root), (lines) => {
    const hit = parseTasks(lines.join('\n'), TEMPLATE_FILE).find((x) => x.kind === 'routine' && x.text === oldText);
    if (hit) {
      if (onlyNew) throw new BadInput('exists');
      const next = rebuild(hit.raw, { text: newText, patch: token === undefined ? {} : { recurrence: token } });
      const n = contCount(lines, hit.line);
      const old = lines.splice(hit.line, 1 + subCount(lines, hit.line)).slice(1); // 今のメモ・入れ子の項目
      const keep = memo === undefined ? old : [...memoLines(next, memo), ...old.slice(n)]; // メモは undefined = 今のまま
      if (section !== undefined && (hit.group ?? '') !== section) insertIn(lines, 'routine', section, [next, ...keep]);
      else lines.splice(hit.line, 0, next, ...keep);
    } else if (rule) {
      const raw = `- [ ] ${serialize(newText, token ? { recurrence: token } : {})}`;
      insertIn(lines, 'routine', section ?? fallback, [raw, ...memoLines(raw, memo)]); // テンプレートに無い項目は (今のセクションで) 追加
    }
  });
}

// whole なし: 定義とメモだけ (入れ子の項目は残す。変換で、別の項目として作り直されないまま消えてしまわないように) / whole あり: 入れ子の項目ごと
async function removeTemplateRoutine(root, text, whole = false) {
  await editFile(root, await ensureTemplate(root), (lines) => {
    const hit = parseTasks(lines.join('\n'), TEMPLATE_FILE).find((x) => x.kind === 'routine' && x.text === text);
    if (hit) lines.splice(hit.line, 1 + (whole ? subCount(lines, hit.line) : contCount(lines, hit.line)));
  });
}

// ルーティンの削除: 今日の行と Templates/Daily.md の定義を消す (明日以降の日次ノートに出なくなる)。過去の日のノートには触らない。
// メモ・入れ子の項目ごと消す。今日だけの項目 (テンプレートに無い) は今日の行だけ。キャンセル ([-]) ではなく本当に消すので、画面では確認を挟む。
export async function deleteRoutine(root, ref) {
  checkRef(ref);
  if (ref.kind !== 'routine' || !isDaily(ref.file)) throw new BadInput('not a routine');
  const text = parseMeta(matchTask(ref.raw)[4]).text;
  await removeTemplateRoutine(root, text, true); // 先にテンプレート: 途中で失敗しても、やり直せば今日の行も消える
  await removeBlock(root, ref, true);
  return { ok: true };
}

// ルーティンを新規追加。テンプレートに書き (once 以外)、今日が該当日なら今日のノートにも入れる。
export async function addRoutine(root, today, { text, repeat, section, memo }, { onlyNew = false } = {}) {
  const parsed = parseMeta(cleanText(text));
  const t = parsed.text; // 日付や 🔁 はルーティンでは使わない
  if (!t) throw new BadInput('empty');
  validateRoutineTime(t, parsed.f);
  const rule = normRepeat(repeat ?? { type: 'daily' });
  const sec = cleanSection(section);
  const raw = `- [ ] ${t}`;
  if (rule.type !== 'once') await upsertTemplateRoutine(root, t, t, rule, sec, '', memo, { onlyNew });
  if (rule.type !== 'once' && !ruleMatches(rule, today)) return { file: TEMPLATE_FILE, raw, later: true }; // 今日は出ない日
  const file = await ensureDaily(root, today); // テンプレート更新後に作られた場合は既に入っている
  await editFile(root, file, (lines) => {
    const exists = parseTasks(lines.join('\n'), file, today).some((x) => x.kind === 'routine' && x.text === t);
    if (exists && onlyNew && rule.type === 'once') throw new BadInput('exists');
    if (!exists) insertIn(lines, 'routine', sec, [raw, ...memoLines(raw, memo)]);
  });
  return { file, raw };
}

// 画面のダイアログからの保存。ref なし = 新規 / ref あり = 編集。from→to が違えば「タスク⇄ルーティン」の変換。
// 変換は先に新しい方を作ってから古い方を消す (失敗しても重複するだけで消えない)。
export async function saveItem(root, today, b, { onlyNew = false } = {}) {
  if (onlyNew && b.ref) throw new BadInput('new item expected');
  const to = b.to === 'routine' ? 'routine' : 'task';
  if (!b.ref) return to === 'routine' ? addRoutine(root, today, b, { onlyNew }) : add(root, today, b);
  checkRef(b.ref);
  const from = b.from === 'routine' ? 'routine' : 'task';
  if (from === to) return to === 'routine' ? editRoutine(root, b.ref, b) : edit(root, b.ref, b);
  const item = { ...b, memo: b.memo !== undefined ? b.memo : memoText(b.ref.raw, (await blockOf(root, b.ref)).memoRaw) }; // メモは画面から来なければ元の項目のものを引き継ぐ
  if (to === 'routine') {
    const r = await addRoutine(root, today, item);
    await removeBlock(root, b.ref);
    return { ...r, converted: true };
  }
  const old = parseMeta(matchTask(b.ref.raw)[4]).text;
  const r = await add(root, today, item);
  await removeBlock(root, b.ref);
  await removeTemplateRoutine(root, old); // 「ルーティンでなくなる」= 定義も外す
  return { ...r, converted: true };
}

export async function reschedule(root, ref, date) {
  const tomorrow = checkDate(date);
  return {
    raw: await mutateLine(root, ref, (r) => {
      const { text, f } = parseMeta(matchTask(r)[4]);
      const base = [addDays(tomorrow, -1), f.due, f.scheduled, f.start].filter(Boolean).sort().at(-1);
      const due = addDays(base, 1); // 既存の締切や開始日を手前へ動かさず、その翌日へ延ばす
      validateTaskSpan(text, { ...f, due }, ref.file.match(/^Daily\/(\d{4}-\d{2}-\d{2})\.md$/)?.[1]);
      const token = /(📅\uFE0F?\s*)\d{4}-\d{2}-\d{2}/u;
      if (token.test(r)) return r.replace(token, `$1${due}`); // due の値だけ。本文・start・順序・空白は byte-preserve
      const block = r.match(/(\s+\^[\w-]+\s*)$/);
      if (block) return `${r.slice(0, block.index)} 📅 ${due}${block[1]}`;
      const tail = r.match(/\s*$/)[0];
      return `${r.slice(0, r.length - tail.length)} 📅 ${due}${tail}`;
    }),
  };
}

function todayRaw(raw, date) {
  const { text, f } = parseMeta(matchTask(raw)[4]);
  const startKey = f.scheduled == null && f.start != null ? 'start' : 'scheduled';
  const patch = { [startKey]: date, ...(f.due && f.due < date ? { due: date } : {}) };
  validateTaskSpan(text, { ...f, ...patch });
  return rebuild(raw, { patch });
}
export async function moveToday(root, ref, today) {
  const date = checkDate(today);
  return { raw: await mutateLine(root, ref, raw => todayRaw(raw, date)) };
}

// AI の明示的な Today/section 移動。既存 UI の moveToday は日付だけを変える契約のまま。
export async function placeTaskInToday(root, today, ref, section = '') {
  checkDate(today); checkRef(ref);
  const target = `${DAILY_DIR}/${today}.md`, sec = cleanSection(section);
  const files = [...new Set([ref.file,target])].sort();
  const locked = i => i < files.length ? exclusive(absPath(root,files[i]),()=>locked(i+1)) : apply();
  const apply = async () => {
    const source = await sectionSource(root,ref.file), destination = ref.file===target ? source : await sectionSource(root,target);
    if(!source.stat||!destination.stat)throw new Conflict();
    const rawLines=source.src.match(/[^\n]*(?:\n|$)/g).filter(Boolean), lines=rawLines.map(l=>l.replace(/\r?\n$/,''));
    const index=locate(lines,ref), current=parseTasks(source.src,ref.file).find(t=>t.line===index&&t.raw===ref.raw);
    if(!current||current.kind!=='task'||current.done||current.cancelled)throw new Conflict();
    const nextRaw=todayRaw(ref.raw,today);
    if(ref.file===target&&(current.group??'')===sec&&nextRaw===ref.raw)return {file:target,raw:ref.raw,changed:false};
    const count=1+subCount(lines,index), start=rawLines.slice(0,index).join('').length, end=start+rawLines.slice(index,index+count).join('').length;
    const block=nextRaw+source.src.slice(start+ref.raw.length,end), remaining=source.src.slice(0,start)+source.src.slice(end);
    if(ref.file===target&&(current.group??'')===sec){
      const next=source.src.slice(0,start)+nextRaw+source.src.slice(start+ref.raw.length);
      if(!(await writeIfUnchanged(source.file,source.stat,next)))throw new Conflict();
      return {file:target,raw:nextRaw};
    }
    const targetSource=ref.file===target?remaining:destination.src, structure=sectionBlocks(targetSource,'tasks');
    if(structure.panelStart===undefined|| (sec&&!structure.names.includes(sec)))throw new BadInput('target section missing');
    const group=sec?structure.groups.find(g=>g.name===sec):null;
    const at=group?group.end:(structure.groups[0]?.start??structure.panelEnd);
    const eol=targetSource.includes('\r\n')?'\r\n':'\n';
    const inserted=(at&&targetSource[at-1]!=='\n'?eol:'')+block+(block.endsWith('\n')?'':eol);
    const next=targetSource.slice(0,at)+inserted+targetSource.slice(at);
    if(!(await writeIfUnchanged(destination.file,destination.stat,next)))throw new Conflict();
    // 二つ目が競合しても source を強制削除しない。呼出側は実際の partial を報告する。
    if(ref.file!==target&&!(await writeIfUnchanged(source.file,source.stat,remaining)))throw new Conflict();
    return {file:target,raw:nextRaw,moved:target};
  };
  return locked(0);
}

// Today/Postpone の server-issued Undo 専用。通常の edit validation を迂回する公開入力には使わない。
export async function restoreRaw(root, ref, raw) {
  if (typeof raw !== 'string' || /[\r\n]/.test(raw)) throw new BadInput('bad raw');
  matchTask(raw);
  return { raw: await mutateLine(root, ref, () => raw) };
}

// 削除はしない。Tasks プラグインの「キャンセル」状態 [-] にする (トグルで元に戻せる)。
export async function cancel(root, today, ref) {
  return { raw: await mutateLine(root, ref, (r) => rebuild(r, { status: '-', patch: { cancelledDate: today, doneDate: '' } })) };
}

// テンプレートのルーティン行に書かれた繰り返しを評価し、その日に該当しない行を落とす。残す行は 🔁 を外す
// (日次ノート内の 🔁 は Tasks プラグインの完了処理と干渉するため)。解釈できない規則はそのまま残す。
function pruneRoutines(body, date) {
  const eol = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(/\r?\n/);
  const drop = new Set();
  for (const t of parseTasks(body, TEMPLATE_FILE, date)) {
    const rule = t.kind === 'routine' && t.recurrence ? parseRule(t.recurrence) : null;
    if (!rule) continue;
    if (ruleMatches(rule, date)) lines[t.line] = rebuild(t.raw, { patch: { recurrence: '' } });
    else for (let k = 0, n = subCount(lines, t.line); k <= n; k++) drop.add(t.line + k); // メモ・入れ子の項目も一緒に落とす (単独のルーティンとして残らないように)
  }
  return lines.filter((_, i) => !drop.has(i)).join(eol);
}

export async function ensureDaily(root, date) {
  const rel = `${DAILY_DIR}/${date}.md`;
  const file = absPath(root, rel);
  try {
    await fs.access(file);
    return rel;
  } catch {}
  let tpl;
  try {
    tpl = await fs.readFile(absPath(root, TEMPLATE_FILE), 'utf8');
  } catch {
    tpl = DEFAULT_TEMPLATE;
  }
  const now = new Date();
  const [y, mo, d] = date.split('-');
  const fmt = (f) => f.replace(/YYYY|YY|MM|DD|HH|mm/g, (t) => ({ YYYY: y, YY: y.slice(2), MM: mo, DD: d, HH: p2(now.getHours()), mm: p2(now.getMinutes()) })[t]);
  const body = pruneRoutines(
    tpl.replace(/\{\{\s*(date|title|time)\s*(?::([^}]+?))?\s*\}\}/g, (_, k, f) =>
      f ? fmt(f) : k === 'time' ? `${p2(now.getHours())}:${p2(now.getMinutes())}` : date,
    ),
    date,
  );
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, { flag: 'wx' }).catch((e) => {
    if (e.code !== 'EEXIST') throw e; // 同時に Obsidian が作った場合は何もしない
  });
  return rel;
}

async function appendInbox(root, line) {
  await fs.writeFile(absPath(root, INBOX_FILE), '# Inbox\n\n', { flag: 'wx' }).catch((e) => {
    if (e.code !== 'EEXIST') throw e;
  });
  await editFile(root, INBOX_FILE, (lines) => {
    while (lines.length && lines.at(-1) === '') lines.pop();
    if (lines.at(-1)?.startsWith('#')) lines.push(''); // 見出し直後は空行を挟む
    lines.push(...[].concat(line), '');
  });
}

export async function add(root, today, { text, start, scheduled, due, priority, section, memo }) {
  const parsed = parseMeta(cleanText(text)); // 本文に直接 ⏳ 📅 ⏫ を書いても拾う
  if (!parsed.text) throw new BadInput('empty');
  const f = { ...parsed.f };
  if (start) f.start = checkDate(start);
  if (scheduled) f.scheduled = checkDate(scheduled);
  if (due) f.due = checkDate(due);
  if (priority) f.priority = checkPrio(priority);
  validateTaskSpan(parsed.text, f);
  const raw = `- [ ] ${serialize(parsed.text, f)}`;
  const block = [raw, ...memoLines(raw, memo)];
  // 今日以前から始めるもの → 今日のノート。日付なし・未来 → Inbox (未来日のデイリーノートは作らない)
  const startDate = f.scheduled ?? f.start;
  const toToday = startDate ? startDate <= today : !!f.due && f.due <= today;
  if (!toToday) {
    await appendInbox(root, block);
    return { file: INBOX_FILE, raw };
  }
  const file = await ensureDaily(root, today);
  await editFile(root, file, (lines) => insertIn(lines, 'tasks', cleanSection(section), block));
  return { file, raw };
}

// ---------- 画面用の状態 ----------
const when = (t) => t.scheduled ?? t.start ?? t.date ?? t.due ?? null; // 「いつやる予定か」
const eventDateTime = (t, today) => {
  if (!t.time) return null;
  const date = t.time.start ? (t.scheduled ?? t.start ?? t.date ?? t.due) : (t.due ?? t.scheduled ?? t.start ?? t.date);
  return `${date ?? today}T${t.time.start ?? t.time.end}`;
};
const compareEventTime = (a, b, today) => {
  const at = eventDateTime(a, today), bt = eventDateTime(b, today);
  return at && bt ? at.localeCompare(bt) : at ? -1 : bt ? 1 : 0;
};

function progressOn(all, date) {
  const result = { tasks: [0, 0], routine: [0, 0], total: [0, 0], earlyCompleted: 0 };
  for (const task of all) {
    if (task.cancelled) continue;
    let counts;
    if (task.kind === 'routine') {
      if (task.date !== date) continue;
      counts = result.routine;
      counts[1]++; if (task.done) counts[0]++;
      continue;
    }
    const start = when(task), completed = task.done ? (task.doneDate ?? start) : null;
    if (task.due && task.due > date) {
      if (task.done && task.doneDate === date) result.earlyCompleted++;
      continue;
    }
    if (task.done && completed && completed < date) continue;
    const active = (task.scheduled ?? task.start) <= date || (!task.scheduled && !task.start && start && start <= date);
    if (!(completed === date || active)) continue;
    counts = result.tasks; counts[1]++; if (task.done && completed === date) counts[0]++;
  }
  result.total = [result.tasks[0] + result.routine[0], result.tasks[1] + result.routine[1]];
  return result;
}
function countsOn(all, date) {
  const { total } = progressOn(all, date);
  return total[1] ? total : null;
}

function streakOf(all, today, memo) {
  const dates = [];
  for (const task of all) {
    if (task.kind === 'routine') {
      if (task.date) dates.push(task.date);
      continue;
    }
    const start = when(task);
    const completed = task.done ? (task.doneDate ?? start) : null;
    if (start) dates.push(start);
    if (completed) dates.push(completed);
  }
  const oldest = dates.filter((date) => date <= today).sort()[0];
  if (!oldest) return 0;
  const get = (date) => {
    if (!memo.has(date)) memo.set(date, countsOn(all, date));
    return memo.get(date);
  };
  const ok = (date) => {
    const counts = get(date);
    return counts && counts[1] > 0 && counts[0] === counts[1];
  };
  let d = ok(today) ? today : addDays(today, -1); // 今日はまだ途中かもしれないので、未達でも切らない
  let n = 0;
  while (d >= oldest && ok(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

function daySegment(t, today) {
  if (!t.time) return null;
  const startDate = t.scheduled ?? t.start ?? t.date ?? t.due;
  if (!startDate) return null;
  if (!t.time.start) {
    const deadline = t.due ?? startDate;
    return deadline === today ? { start: null, end: t.time.end, endOnly: true, startedPrevious: false, continuesNext: false } : null;
  }
  if (!t.time.end) return startDate === today ? { start: t.time.start, end: null, endOnly: false, startedPrevious: false, continuesNext: false } : null;
  const endDate = t.due ?? startDate;
  if (today < startDate || today > endDate || endDate < startDate) return null;
  if (startDate === endDate) {
    if (t.time.end <= t.time.start) return null; // 既存の不正な行を逆向き/最小幅で描かない
    return { start: t.time.start, end: t.time.end, endOnly: false, startedPrevious: false, continuesNext: false };
  }
  if (today === endDate && t.time.end === '00:00') return null; // 終了日の 00:00 は、その日の交差が 0 分
  return {
    start: today === startDate ? t.time.start : '00:00',
    end: today === endDate ? t.time.end : '24:00',
    endOnly: false,
    startedPrevious: today > startDate,
    continuesNext: today < endDate,
  };
}

async function templateRoutines(root) {
  const map = new Map();
  let src;
  try {
    src = await fs.readFile(absPath(root, TEMPLATE_FILE), 'utf8');
  } catch {
    return map;
  }
  for (const t of parseTasks(src, TEMPLATE_FILE)) {
    if (t.kind !== 'routine' || map.has(t.text)) continue;
    map.set(t.text, !t.recurrence ? { type: 'daily' } : (parseRule(t.recurrence) ?? { type: 'custom', raw: t.recurrence }));
  }
  return map;
}

// ponytail: 毎回 vault 全体を読み直す。数千ファイル級になったら mtime キャッシュにする。
export async function buildState(root, today) {
  const all = [];
  let todaySrc = '';
  for (const rel of await walk(root)) {
    let src;
    try {
      src = await fs.readFile(path.join(root, rel), 'utf8');
    } catch {
      continue;
    }
    const date = rel.match(/^Daily\/(\d{4}-\d{2}-\d{2})\.md$/)?.[1] ?? null;
    if (date === today) todaySrc = src;
    for (const t of parseTasks(src, rel, date)) {
      if (date && t.kind === 'routine' && t.recurrence) {
        const rule = parseRule(t.recurrence); // Obsidian 側のテンプレートで作られた日次ノートに残る 🔁 も尊重する
        if (rule && !ruleMatches(rule, date)) continue;
      }
      all.push(t);
    }
  }

  const tasks = [];
  const routine = [];
  const upcoming = [];
  const inbox = [];
  for (const t of all) {
    if (t.cancelled) continue;
    if (t.kind === 'routine') {
      if (t.date === today) routine.push(t);
      continue;
    }
    const w = when(t);
    if (t.done) {
      if ((t.doneDate ?? w) === today) tasks.push(t);
      continue;
    }
    t.overdue = !!t.due && t.due < today;
    if ((t.scheduled ?? t.start) > today) upcoming.push(t); // 明示的に先送りした分は、期限切れでも「今日」に出さない
    else if (w == null) inbox.push(t);
    else if (w <= today || (t.due && t.due <= today)) {
      t.carry = w < today ? dayDiff(w, today) : 0;
      tasks.push(t);
    } else upcoming.push(t);
  }

  const rank = (t) => PRIO_RANK[t.priority] ?? 3;
  tasks.sort(
    (a, b) =>
      a.done - b.done ||
      compareEventTime(a, b, today) ||
      !!b.overdue - !!a.overdue ||
      (b.carry ?? 0) - (a.carry ?? 0) ||
      rank(a) - rank(b) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );
  upcoming.sort(
    (a, b) =>
      when(a).localeCompare(when(b)) || compareEventTime(a, b, today) || a.file.localeCompare(b.file) || a.line - b.line,
  );

  const defs = await templateRoutines(root);
  const groups = [];
  for (const t of routine) {
    t.repeat = defs.get(t.text) ?? null; // null = テンプレートに無い (今日だけの項目)
    const g = t.group ?? '';
    (groups.find((x) => x.group === g) ?? groups[groups.push({ group: g, items: [] }) - 1]).items.push(t);
  }

  const hist = {};
  const countMemo = new Map();
  for (let offset = HISTORY_DAYS - 1; offset >= 0; offset--) {
    const date = addDays(today, -offset);
    const counts = countsOn(all, date);
    countMemo.set(date, counts);
    if (counts) hist[date] = counts;
  }
  const days = {};
  for (const [d, v] of Object.entries(hist)) if (d <= today && dayDiff(d, today) < HISTORY_DAYS) days[d] = v;
  const count = (list) => [list.filter((t) => t.done).length, list.length];
  const todayLines = todaySrc.split(/\r?\n/);

  return {
    today,
    todayFile: `${DAILY_DIR}/${today}`,
    counts: { tasks: count(tasks), routine: count(routine) },
    progress: progressOn(all, today),
    sectionOrder: await sectionOrderState(root, today),
    tasks,
    routine: groups,
    upcoming,
    inbox,
    sections: { tasks: sectionNames(todayLines, 'tasks'), routine: sectionNames(todayLines, 'routine') }, // 空のセクションも含む
    timeline: [...tasks, ...routine].flatMap((t) => {
      const segment = daySegment(t, today);
      return segment ? [{ ...t, segment }] : [];
    }),
    history: days,
    streak: streakOf(all, today, countMemo),
  };
}

// ノート (lib/notes.js) と設定 (lib/settings.js) が、同じ書き込みの安全装置 (1 ファイルずつ順番に / 読んだ後に変わっていたら書かない / temp → rename) を使えるようにする
// 無いときだけ作る。temp に書いてから link (同時に別の所が作っていたら何もせず false)。親フォルダも作る
async function createOnly(file, data, guard = () => {}) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`);
  await fs.writeFile(tmp, data);
  try {
    guard();
    await fs.link(tmp, file);
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw e;
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

export { exclusive, readUtf8, writeIfUnchanged, absPath, createOnly, safePath };
