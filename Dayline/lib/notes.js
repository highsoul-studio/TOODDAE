// Write のノート: vault の Write/<noteId>.md。旧 date-only ファイルを移動せず、同日の UUID ノートを追加できる。
// 画面とファイルの食い違いは「内容のハッシュ」で見る: 画面は最後に読んだ/保存した版のハッシュ (base) を添えて保存し、
// ファイルが base と違っていたら (Obsidian 側で書き換えられた) 上書きせず、今の内容を付けて断る。
// 履歴 (AI で整える前・戻す前の版) は .dayline/history/ に置く。ドットのフォルダなので Obsidian にも、タスクの探索にも見えない。
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { BadInput, Conflict, absPath, createOnly, exclusive, readUtf8, writeIfUnchanged, safePath } from './vault.js';

export const WRITE_DIR = 'Write';
export const MAX_BYTES = 1_000_000; // 1 ノートは 1 MB まで
const KEEP_HISTORY = 30; // 1 ノートあたり、残す履歴の数
const REASONS = ['organize', 'restore', 'delete'];
const ID = new RegExp(`^\\d{14}-\\d{3}-(${REASONS.join('|')})$`);

// 保存しようとしたとき、ファイルが画面の見ていた版と違っていた。current = 今のファイルの内容 (画面が読み直せるように)
export class NoteConflict extends Conflict {
  constructor(current) {
    super('note changed');
    this.current = current;
  }
}

export const hashOf = (text) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);

export function checkDate(d) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new BadInput('bad date');
  const t = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== d) throw new BadInput('bad date');
  return d;
}
const NOTE_ID = /^\d{4}-\d{2}-\d{2}(?:--[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$/;
export function noteIdentity(value) {
  const object = value && typeof value === 'object';
  const noteId = object ? (value.noteId ?? value.date) : value;
  if (typeof noteId !== 'string' || !NOTE_ID.test(noteId)) throw new BadInput('bad date or noteId');
  const date = checkDate(noteId.slice(0, 10));
  if (object && value.date != null && checkDate(value.date) !== date) throw new BadInput('note date mismatch');
  return { noteId, date };
}
const noteFile = (root, value) => absPath(root, `${WRITE_DIR}/${noteIdentity(value).noteId}.md`);
const histDir = (root, value) => safePath(root, `.dayline/history/${noteIdentity(value).noteId}`);
const TITLES = { ko: '새로운 노트', en: 'New note', ja: '新しいノート', zh: '新笔记' };
// 一覧は ID の降順。新しいノートが必ず先頭に来るよう、先頭 8 桁を最大値 (旧ノートの乱数 ID より上) にし、続く桁に時刻 (ms。同じ ms でも増やす) を置く。v4 の形は保つ。
let lastStamp = 0;
const newUuid = () => {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  const t = lastStamp.toString(16).padStart(12, '0');
  return `ffffffff-${t.slice(0, 4)}-4${t.slice(4, 7)}-8${t.slice(7, 10)}-${t.slice(10)}${randomBytes(5).toString('hex')}`;
};
export async function createNote(root, date, language = 'ko') {
  checkDate(date);
  if (!Object.hasOwn(TITLES, language)) throw new BadInput('bad language');
  const text = `# ${TITLES[language]}\n\n`;
  for (let n = 0; n < 3; n++) {
    const noteId = `${date}--${newUuid()}`;
    if (await createOnly(noteFile(root, noteId), text)) return readNote(root, noteId);
  }
  throw new Conflict();
}

// 削除前の空ノートも旧タブから復活させない。再起動時は HTTP の rootId が旧リクエストを拒否する。
const deletedVersions = new Map();
const noteHash = (file, text, exists, generation = deletedVersions.get(file)) => hashOf(`${path.basename(file).includes('--') ? `${path.basename(file)}\0${exists ? 'present' : 'absent'}\0` : ''}${generation ? `${generation}\0${exists ? 'present' : 'absent'}\0` : ''}${text}`);


export async function readNote(root, date) {
  const identity = noteIdentity(date);
  const file = noteFile(root, date);
  for (let n = 0; n < 3; n++) {
    const generation = deletedVersions.get(file);
    let data;
    try {
      const st = await fs.stat(file);
      if (st.size > MAX_BYTES) throw new BadInput('too large');
      data = { ...identity, exists: true, text: await readUtf8(file), mtime: st.mtimeMs };
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      data = { ...identity, exists: false, text: '', mtime: 0 };
    }
    // 読み取り中に削除が完了した場合、古い bytes に新しい generation を付けない。
    if (generation !== deletedVersions.get(file)) continue;
    return { ...data, hash: noteHash(file, data.text, data.exists, generation) };
  }
  throw new Conflict();
}

async function saveHistory(root, date, text, reason) {
  date = noteIdentity(date).noteId;
  const dir = histDir(root, date);
  await fs.mkdir(dir, { recursive: true });
  const now = new Date();
  let id;
  for (;;) {
    id = `${now.toISOString().replace(/\D/g, '').slice(0, 14)}-${String(now.getUTCMilliseconds()).padStart(3, '0')}-${reason}`;
    try { await fs.writeFile(safePath(root, `.dayline/history/${date}/${id}.md`), text, { flag: 'wx' }); break; }
    catch (e) { if (e.code !== 'EEXIST') throw e; now.setTime(now.getTime() + 1); }
  }
  const all = (await fs.readdir(dir)).filter((n) => ID.test(n.replace(/\.md$/, ''))).sort();
  for (const n of all.slice(0, Math.max(0, all.length - KEEP_HISTORY))) await fs.rm(path.join(dir, n), { force: true });
  return id;
}

// 保存。base = 画面が最後に読んだ/保存した版のハッシュ。snapshot ('organize' | 'restore') を付けると、書き換える前の版を履歴に残す
export async function writeNote(root, date, text, base, { snapshot = '', createEmpty = false, guard = () => {} } = {}) {
  date = noteIdentity(date).noteId;
  if (typeof text !== 'string') throw new BadInput('bad text');
  if (Buffer.byteLength(text) > MAX_BYTES) throw new BadInput('too large');
  if (typeof base !== 'string' || !/^[0-9a-f]{16}$/.test(base)) throw new BadInput('bad base');
  if (snapshot && !['organize', 'restore'].includes(snapshot)) throw new BadInput('bad snapshot');
  const file = noteFile(root, date);
  return exclusive(file, async () => {
    guard();
    for (let n = 0; n < 3; n++) {
      let before = null;
      let cur = '';
      try {
        before = await fs.stat(file);
        if (before.size > MAX_BYTES) throw new BadInput('too large');
        cur = await readUtf8(file);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      if (noteHash(file, cur, before !== null) !== base) throw new NoteConflict({ text: cur, hash: noteHash(file, cur, before !== null), exists: before !== null });
      if (cur === text && (before !== null || !createEmpty)) return { hash: noteHash(file, text, before !== null), mtime: before?.mtimeMs ?? 0, changed: false };
      guard();
      if (snapshot && before && cur) await saveHistory(root, date, cur, snapshot);
      if (before === null) {
        if (!text && !createEmpty) return { hash: noteHash(file, '', false), mtime: 0, changed: false }; // 空のノートのためにファイルは作らない
        if (!(await createOnly(file, text, guard))) continue;
      } else if (!(await writeIfUnchanged(file, before, text, guard))) continue;
      const st = await fs.stat(file);
      return { hash: noteHash(file, text, true), mtime: st.mtimeMs, changed: true };
    }
    throw new Conflict();
  });
}

// 最新版を履歴へ移す。unlink ではなく rename なので、外部編集との競合時も bytes が残る。
export async function deleteNote(root, date, base) {
  date = noteIdentity(date).noteId;
  if (typeof base !== 'string' || !/^[0-9a-f]{16}$/.test(base)) throw new BadInput('bad base');
  const file = noteFile(root, date);
  return exclusive(file, async () => {
    const current = await readNote(root, date);
    if (!current.exists || current.hash !== base) throw new NoteConflict(current);
    const id = await saveHistory(root, date, current.text, 'delete');
    const beforeMove = await readNote(root, date);
    if (!beforeMove.exists || beforeMove.hash !== base) throw new NoteConflict(beforeMove);
    const archived = safePath(root, `.dayline/history/${date}/${id}.md`);
    await fs.rename(noteFile(root, date), archived);
    deletedVersions.set(file, randomUUID());
    const bytes = await fs.readFile(archived);
    if (!bytes.equals(Buffer.from(current.text, 'utf8'))) {
      // 直前の外部編集は履歴に残し、元の場所が空いていればその bytes を戻す。
      await createOnly(noteFile(root, date), bytes);
      throw new NoteConflict({ ...await readNote(root, date), recoveryId: id });
    }
    const after = await readNote(root, date);
    if (after.exists) throw new NoteConflict({ ...after, recoveryId: id });
    return { ...noteIdentity(date), exists: false, hash: after.hash, changed: true, undo: { ...noteIdentity(date), id, base: after.hash } };
  });
}

// ---------- 一覧 ----------
const excerptOf = (text) => {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw
      .replace(/^\s*#+\s*/, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?/, '')
      .replace(/[*_`~]/g, '')
      .trim();
    if (line) return line.length > 80 ? `${line.slice(0, 79)}…` : line;
  }
  return '';
};

export function splitTitle(text) {
  const m = String(text).match(/^# ([^\r\n]*)(?:\r\n|\n|$)/);
  return m ? { title: m[1].trim(), body: text.slice(m[0].length).replace(/^\r?\n/, '') } : { title: '', body: text };
}

// 検索結果でなく「調べた位置」を cursor にする。空ページでも古いノートへ続けられる。
export async function searchNotes(root, { q = '', limit = 120, cursor = '' } = {}) {
  if (typeof q !== 'string' || [...q].length > 200) throw new BadInput('bad query');
  limit = Number(limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 120) throw new BadInput('bad limit');
  const query = q.normalize('NFC').toLowerCase();
  const scope = hashOf(`${path.resolve(root)}\0${query}`);
  let after = '';
  if (cursor) {
    try {
      if (typeof cursor !== 'string' || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (decoded.scope !== scope || typeof decoded.after !== 'string') throw new Error();
      after = noteIdentity(decoded.after).noteId;
    } catch { throw new BadInput('bad cursor'); }
  }
  let names;
  try { names = await fs.readdir(safePath(root, WRITE_DIR)); }
  catch (e) { if (e.code === 'ENOENT') return { notes: [], nextCursor: null }; throw e; }
  const ids = names.filter(n => {
    if (!n.endsWith('.md')) return false;
    try { noteIdentity(n.slice(0, -3)); return true; } catch { return false; }
  }).map(n => n.slice(0, -3)).sort().reverse().filter(id => !after || id < after);
  const notes = []; let scanned = 0, bytes = 0, last = after, index = 0;
  for (; index < ids.length; index++) {
    if (scanned >= 200 || bytes >= 20 * 1024 * 1024 || notes.length >= limit) break;
    const noteId = ids[index]; scanned++; last = noteId;
    try {
      const size = (await fs.stat(noteFile(root, noteId))).size;
      if (size > MAX_BYTES) continue;
      // 1MB 上限のため、超えるファイルは次ページの先頭へ残す。
      if (bytes + size > 20 * 1024 * 1024) { last = index ? ids[index - 1] : after; break; }
      bytes += size;
      const { exists, text, mtime, date } = await readNote(root, noteId);
      if (!exists || !text.trim() || (query && !`${date}\n${text}`.normalize('NFC').toLowerCase().includes(query))) continue;
      const { title, body } = splitTitle(text);
      notes.push({ noteId, date, title, excerpt: excerptOf(body), chars: [...text].length, mtime });
    } catch { /* 読めない/不正な既存ノートは書き換えずにスキップ。 */ }
  }
  return { notes, nextCursor: index < ids.length && last ? Buffer.from(JSON.stringify({ scope, after: last })).toString('base64url') : null };
}
export async function listNotes(root, options = {}) { return (await searchNotes(root, options)).notes; }

// ---------- 履歴 ----------
export async function listHistory(root, date) {
  date = noteIdentity(date).noteId;
  let names;
  try {
    names = await fs.readdir(histDir(root, date));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  return names
    .map((n) => n.replace(/\.md$/, ''))
    .filter((id) => ID.test(id))
    .sort()
    .reverse()
    .map((id) => {
      const [stamp, ms, reason] = id.split('-');
      const at = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}.${ms}Z`;
      return { id, at, reason };
    });
}

export async function readHistory(root, date, id) {
  date = noteIdentity(date).noteId;
  if (typeof id !== 'string' || !ID.test(id)) throw new BadInput('bad id');
  try {
    return await readUtf8(safePath(root, `.dayline/history/${date}/${id}.md`));
  } catch (e) {
    if (e.code === 'ENOENT') throw new BadInput('no such version');
    throw e;
  }
}

// 履歴の版へ戻す。今の版も履歴に残るので、戻したことを取り消せる
export async function restoreHistory(root, date, id, base) {
  date = noteIdentity(date).noteId;
  return writeNote(root, date, await readHistory(root, date, id), base, { snapshot: 'restore', createEmpty: true });
}
