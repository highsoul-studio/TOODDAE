// Write のノート: 読み書き、Obsidian との食い違い (ハッシュ)、履歴、一覧、日付・ID の検査。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as V from '../lib/vault.js';
import { NoteConflict, deleteNote, hashOf, listHistory, listNotes, readHistory, readNote, restoreHistory, splitTitle, writeNote } from '../lib/notes.js';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'dl-notes-'));
const D = '2026-10-06';
const fileOf = (root, d = D) => path.join(root, 'Write', `${d}.md`);
const badInput = (re) => (e) => e instanceof V.BadInput && re.test(e.message);

test('読む: 無い日は空 (ファイルは作らない)。書くと、ハッシュ付きで読める', async () => {
  const root = await tmp();
  const none = await readNote(root, D);
  assert.deepEqual([none.exists, none.text, none.hash], [false, '', hashOf('')]);
  const w = await writeNote(root, D, '今日のメモ\n- 一つ目\n', none.hash);
  assert.equal(w.changed, true);
  const now = await readNote(root, D);
  assert.deepEqual([now.exists, now.text, now.hash], [true, '今日のメモ\n- 一つ目\n', w.hash]);
  assert.equal(await fs.readFile(fileOf(root), 'utf8'), now.text);
  await assert.rejects(fs.stat(path.join(root, 'Write', 'x.tmp')));
  // 空のまま保存しても、ファイルは作られない
  const root2 = await tmp();
  const r = await writeNote(root2, D, '', hashOf(''));
  assert.equal(r.changed, false);
  await assert.rejects(fs.stat(path.join(root2, 'Write')));
});

test('Obsidian 側で書き換えられていたら、上書きせず、今の内容を付けて断る。読み直した版でなら保存できる', async () => {
  const root = await tmp();
  const a = await writeNote(root, D, 'v1', hashOf(''));
  await fs.writeFile(fileOf(root), 'Obsidian で書き換え');
  await assert.rejects(writeNote(root, D, '画面の編集', a.hash), (e) => e instanceof NoteConflict && e instanceof V.Conflict && e.current.text === 'Obsidian で書き換え' && e.current.hash === hashOf('Obsidian で書き換え'));
  assert.equal(await fs.readFile(fileOf(root), 'utf8'), 'Obsidian で書き換え', '断ったので変わらない');
  const reread = await readNote(root, D);
  await writeNote(root, D, '画面の編集', reread.hash);
  assert.equal(await fs.readFile(fileOf(root), 'utf8'), '画面の編集');
  // 同じ版 (base) から同時に 2 回書くと、1 つだけ通り、もう 1 つは食い違いになる
  const base = (await readNote(root, D)).hash;
  const results = await Promise.allSettled([writeNote(root, D, 'A', base), writeNote(root, D, 'B', base)]);
  assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
});

test('日付・ベース・サイズ・文字コードの検査', async () => {
  const root = await tmp();
  for (const d of ['../Daily/2026-10-06', '2026-13-40', '2026-02-30', '26-10-06', '', null, '2026-10-06/../x']) {
    await assert.rejects(readNote(root, d), badInput(/bad date/), String(d));
    await assert.rejects(writeNote(root, d, 'x', hashOf('')), badInput(/bad date/), String(d));
  }
  await assert.rejects(writeNote(root, D, 5, hashOf('')), badInput(/bad text/));
  await assert.rejects(writeNote(root, D, 'x', 'nope'), badInput(/bad base/));
  await assert.rejects(writeNote(root, D, 'x', undefined), badInput(/bad base/));
  await assert.rejects(writeNote(root, D, 'x'.repeat(1_000_001), hashOf('')), badInput(/too large/));
  await assert.rejects(writeNote(root, D, 'x', hashOf(''), { snapshot: '../x' }), badInput(/bad snapshot/));
  await fs.mkdir(path.join(root, 'Write'), { recursive: true });
  await fs.writeFile(fileOf(root), Buffer.from([0xff, 0xfe, 0x41])); // UTF-8 ではない
  await assert.rejects(readNote(root, D), badInput(/not utf-8/));
});

test('履歴: snapshot を付けた保存は、書き換える前の版を残す。戻すと、今の版も残る (取り消せる)。ID は検査する', async () => {
  const root = await tmp();
  const a = await writeNote(root, D, '元のメモ', hashOf(''));
  const b = await writeNote(root, D, '# 整えた版', a.hash, { snapshot: 'organize' });
  assert.equal(await fs.readFile(fileOf(root), 'utf8'), '# 整えた版');
  const hist = await listHistory(root, D);
  assert.equal(hist.length, 1);
  assert.equal(hist[0].reason, 'organize');
  assert.match(hist[0].at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(await readHistory(root, D, hist[0].id), '元のメモ');
  // 戻す
  const back = await restoreHistory(root, D, hist[0].id, b.hash);
  assert.equal(await fs.readFile(fileOf(root), 'utf8'), '元のメモ');
  const hist2 = await listHistory(root, D);
  assert.deepEqual(hist2.map((h) => h.reason), ['restore', 'organize']); // 新しい順
  assert.equal(await readHistory(root, D, hist2[0].id), '# 整えた版', '戻す前の版も残る');
  assert.equal(back.hash, hashOf('元のメモ'));
  // 履歴は Obsidian に見えない場所 (ドットのフォルダ) で、タスクの探索にも出ない
  assert.ok(hist.length && (await fs.readdir(path.join(root, '.dayline', 'history', D))).length === 2);
  for (const id of ['../../Write/2026-10-06', '20261006120000-000-organize.md/../x', '', null, 'x', '20261006120000-000-edit']) await assert.rejects(readHistory(root, D, id), badInput(/bad id/), String(id));
  await assert.rejects(readHistory(root, D, '20200101000000-000-organize'), badInput(/no such version/));
  assert.deepEqual(await listHistory(root, '2026-01-01'), []);
  // 空のノートや新規作成のときは、履歴を作らない
  const root2 = await tmp();
  await writeNote(root2, D, 'はじめて', hashOf(''), { snapshot: 'organize' });
  assert.deepEqual(await listHistory(root2, D), []);
});

test('履歴は 1 日 30 件まで (古いものから消す)', async () => {
  const root = await tmp();
  let base = (await writeNote(root, D, 'v0', hashOf(''))).hash;
  for (let i = 1; i <= 33; i++) base = (await writeNote(root, D, `v${i}`, base, { snapshot: 'organize' })).hash;
  const hist = await listHistory(root, D);
  assert.equal(hist.length, 30);
  assert.equal(await readHistory(root, D, hist[0].id), 'v32'); // 一番新しい履歴 = 33 回目の保存の直前の版
  assert.equal(await readHistory(root, D, hist.at(-1).id), 'v3');
});

test('一覧: 新しい日から。日付名でないファイル・空のノートは出さない。抜粋は見出しや記号を外した最初の行', async () => {
  const root = await tmp();
  assert.deepEqual(await listNotes(root), []);
  await fs.mkdir(path.join(root, 'Write'), { recursive: true });
  const put = (name, body) => fs.writeFile(path.join(root, 'Write', name), body);
  await put('2026-10-04.md', '# 週末の振り返り\n本文');
  await put('2026-10-06.md', '\n\n- [ ] **買い物** を忘れない\n続き');
  await put('2026-10-05.md', '   \n'); // 空白だけ
  await put('Ideas.md', 'これは日付名ではない');
  await put('2026-10-07.txt', 'md ではない');
  await fs.mkdir(path.join(root, 'Write', '2026-10-08.md')); // フォルダ
  await put('2026-10-02.md', `${'あ'.repeat(200)}`);
  const list = await listNotes(root);
  assert.deepEqual(list.map((n) => n.date), ['2026-10-06', '2026-10-04', '2026-10-02']);
  assert.equal(list[0].excerpt, '買い物 を忘れない');
  assert.deepEqual([list[1].title, list[1].excerpt], ['週末の振り返り', '本文']);
  assert.equal([...list[2].excerpt].length, 80);
  assert.ok(list[2].excerpt.endsWith('…'));
  assert.equal((await listNotes(root, { limit: 1 })).length, 1);
});

test('title: 첫 Markdown H1만 제목으로 분리하고 H1이 없으면 본문을 그대로 둔다', () => {
  assert.deepEqual(splitTitle('# 제목\n\n첫 줄\n\n둘째 줄'), { title: '제목', body: '첫 줄\n\n둘째 줄' });
  assert.deepEqual(splitTitle('첫 줄\n\n# 중간 H1'), { title: '', body: '첫 줄\n\n# 중간 H1' });
});

test('regression: symlinked Write, Set and history cannot escape the vault', async () => {
  const root = await tmp(); const outside = await tmp();
  await fs.writeFile(path.join(outside, D + '.md'), 'FAKE-OUTSIDE');
  await fs.symlink(outside, path.join(root, 'Write'));
  await assert.rejects(readNote(root, D), badInput(/symlink/));
  await assert.rejects(writeNote(root, D, 'changed', hashOf('FAKE-OUTSIDE')), badInput(/symlink/));
  assert.equal(await fs.readFile(path.join(outside, D + '.md'), 'utf8'), 'FAKE-OUTSIDE');
  await fs.symlink(outside, path.join(root, '.dayline'));
  await assert.rejects(listHistory(root, D), badInput(/symlink/));
});

test('regression: same-millisecond snapshots do not overwrite history', async () => {
  const root = await tmp(); const RealDate = globalThis.Date;
  try {
    globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-10-06T12:00:00.123Z'])); } };
    let saved = await writeNote(root, D, 'fake-v1', hashOf(''));
    saved = await writeNote(root, D, 'fake-v2', saved.hash, { snapshot: 'organize' });
    saved = await writeNote(root, D, 'fake-v3', saved.hash, { snapshot: 'organize' });
    const history = await listHistory(root, D);
    assert.equal(history.length, 2);
    assert.deepEqual((await Promise.all(history.map(h => readHistory(root, D, h.id)))).sort(), ['fake-v1', 'fake-v2']);
  } finally { globalThis.Date = RealDate; }
});

test('delete archives exact bytes, disappears from notes, and Undo restores with a fresh opaque hash', async () => {
  const root = await tmp();
  try {
    const original = '\uFEFF# Title\r\n\r\n- [ ] task\r\n値 ¥100 | x\r\n';
    const saved = await writeNote(root, D, original, hashOf(''));
    const deleted = await deleteNote(root, D, saved.hash);
    assert.deepEqual([deleted.date, deleted.exists, deleted.changed], [D, false, true]);
    await assert.rejects(fs.stat(fileOf(root)), { code: 'ENOENT' });
    assert.deepEqual(await listNotes(root), []);
    assert.equal((await listHistory(root, D))[0].reason, 'delete');
    assert.equal(await readHistory(root, D, deleted.undo.id), original);
    assert.deepEqual(await fs.readFile(path.join(root, '.dayline/history', D, deleted.undo.id + '.md')), Buffer.from(original));
    assert.equal((await readNote(root, D)).hash, deleted.undo.base);
    await assert.rejects(writeNote(root, D, 'STALE AUTOSAVE', saved.hash), e => e instanceof NoteConflict && !e.current.exists);
    const restored = await restoreHistory(root, D, deleted.undo.id, deleted.undo.base);
    assert.equal((await readNote(root, D)).text, original); assert.notEqual(restored.hash, saved.hash);
    await assert.rejects(deleteNote(root, D, saved.hash), e => e instanceof NoteConflict);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('missing/empty note deletion and concurrent autosave/Undo cannot resurrect or overwrite unseen content', async () => {
  const root = await tmp();
  try {
    await assert.rejects(deleteNote(root, D, hashOf('')), e => e instanceof NoteConflict && !e.current.exists);
    assert.deepEqual(await listHistory(root, D), []);
    await fs.mkdir(path.join(root, 'Write')); await fs.writeFile(fileOf(root), '');
    const before = await readNote(root, D);
    const attempts = await Promise.allSettled([deleteNote(root, D, before.hash), writeNote(root, D, 'old empty-tab draft', before.hash)]);
    assert.equal(attempts[0].status, 'fulfilled'); assert.equal(attempts[1].status, 'rejected');
    const deleted = attempts[0].value;
    assert.notEqual(deleted.hash, before.hash);
    await restoreHistory(root, D, deleted.undo.id, deleted.undo.base);
    assert.equal((await readNote(root, D)).exists, true, 'Undo preserves existence of an empty file');
    const second = await deleteNote(root, D, (await readNote(root, D)).hash);
    const newNote = await writeNote(root, D, 'NEW NOTE', second.hash);
    await assert.rejects(restoreHistory(root, D, second.undo.id, second.undo.base), e => e instanceof NoteConflict && e.current.text === 'NEW NOTE');
    assert.equal((await readNote(root, D)).hash, newNote.hash);
    const reversed = await Promise.allSettled([writeNote(root, D, 'newer autosave', newNote.hash), deleteNote(root, D, newNote.hash)]);
    assert.equal(reversed[0].status, 'fulfilled'); assert.equal(reversed[1].status, 'rejected');
    assert.equal((await readNote(root, D)).text, 'newer autosave');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('delete validates base/date/symlinks and preserves files when move fails', async () => {
  const root = await tmp(), outside = await tmp(); const rename = fs.rename;
  try {
    await assert.rejects(deleteNote(root, '../outside', hashOf('')), badInput(/bad date/));
    await assert.rejects(deleteNote(root, D, 'invalid'), badInput(/bad base/));
    await fs.mkdir(path.join(root, 'Write')); await fs.writeFile(path.join(outside, 'original.md'), 'outside');
    await fs.symlink(path.join(outside, 'original.md'), fileOf(root));
    await assert.rejects(deleteNote(root, D, hashOf('outside')), badInput(/symlink/));
    await fs.unlink(fileOf(root));
    const saved = await writeNote(root, D, 'preserve me', hashOf(''));
    fs.rename = async (from, to) => { if (from === fileOf(root)) throw Object.assign(Error('denied'), { code: 'EACCES' }); return rename(from, to); };
    await assert.rejects(deleteNote(root, D, saved.hash), { code: 'EACCES' });
    assert.equal(await fs.readFile(fileOf(root), 'utf8'), 'preserve me');
  } finally { fs.rename = rename; await fs.rm(root, { recursive: true, force: true }); await fs.rm(outside, { recursive: true, force: true }); }
});

test('external edit at the atomic move boundary is preserved in history and restored without overwriting a replacement', async () => {
  const root = await tmp(); const rename = fs.rename;
  try {
    const saved = await writeNote(root, D, 'first', hashOf(''));
    fs.rename = async (from, to) => { if (from === fileOf(root)) await fs.writeFile(from, 'EXTERNAL LATEST'); return rename(from, to); };
    await assert.rejects(deleteNote(root, D, saved.hash), e => e instanceof NoteConflict && e.current.text === 'EXTERNAL LATEST');
    assert.equal(await fs.readFile(fileOf(root), 'utf8'), 'EXTERNAL LATEST');
    assert.equal(await readHistory(root, D, (await listHistory(root, D))[0].id), 'EXTERNAL LATEST');
  } finally { fs.rename = rename; await fs.rm(root, { recursive: true, force: true }); }
});

test('delete generation read is consistent when empty bytes were captured before the move', async () => {
  const root = await tmp(), readFile = fs.readFile; let unblock, captured;
  try {
    await fs.mkdir(path.join(root, 'Write')); await fs.writeFile(fileOf(root), '');
    const old = await readNote(root, D);
    const paused = new Promise(r => { captured = r; }); let first = true;
    fs.readFile = async (...args) => {
      const bytes = await readFile(...args);
      if (first && args[0] === fileOf(root)) { first = false; captured(); await new Promise(r => { unblock = r; }); }
      return bytes;
    };
    const pending = readNote(root, D); await paused;
    const removed = await deleteNote(root, D, old.hash); unblock();
    const result = await pending;
    assert.equal(result.exists, false); assert.equal(result.hash, removed.hash);
    await assert.rejects(writeNote(root, D, 'stale empty draft', old.hash), e => e instanceof NoteConflict);
  } finally { unblock?.(); fs.readFile = readFile; await fs.rm(root, { recursive: true, force: true }); }
});

test('Undo of deletion never overwrites an externally recreated empty file', async () => {
  const root = await tmp();
  try {
    const original = await writeNote(root, D, 'OLD CONTENT', hashOf(''));
    const removed = await deleteNote(root, D, original.hash);
    await fs.writeFile(fileOf(root), '');
    const replacement = await readNote(root, D);
    assert.notEqual(replacement.hash, removed.undo.base);
    await assert.rejects(restoreHistory(root, D, removed.undo.id, removed.undo.base), e => e instanceof NoteConflict && e.current.exists && e.current.text === '');
    assert.equal(await fs.readFile(fileOf(root), 'utf8'), '');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('S2 AI note guard rechecks after held lock and immediately before atomic replacement; ordinary saves and Undo remain independent', async () => {
  const root = await tmp();
  try {
    const original = await writeNote(root, D, 'original', hashOf(''));
    let release, entered, valid = true;
    const held = new Promise(resolve => { entered = resolve; });
    const lock = V.exclusive(fileOf(root), async () => { entered(); await new Promise(resolve => { release = resolve; }); });
    await held;
    const guard = () => { if (!valid) throw new Error('stale-generation'); };
    const pending = writeNote(root, D, 'old proposal', original.hash, { snapshot: 'organize', guard });
    const rejected = assert.rejects(pending, /stale-generation/);
    valid = false; release(); await lock; await rejected;
    assert.equal((await readNote(root, D)).text, 'original');
    let checks = 0;
    await assert.rejects(writeNote(root, D, 'late stale', original.hash, { guard: () => { if (++checks === 3) throw new Error('late-generation'); } }), /late-generation/);
    assert.equal(checks, 3); assert.equal((await readNote(root, D)).text, 'original');
    assert.deepEqual((await fs.readdir(path.dirname(fileOf(root)))).filter(name => name.endsWith('.tmp')), []);
    const absent = '2026-10-05'; checks = 0;
    await assert.rejects(writeNote(root, absent, 'stale create', hashOf(''), { guard: () => { if (++checks === 3) throw new Error('late-generation'); } }), /late-generation/);
    assert.equal((await readNote(root, absent)).exists, false);
    const saved = await writeNote(root, D, 'ordinary autosave', original.hash);
    const deleted = await deleteNote(root, D, saved.hash);
    await restoreHistory(root, D, deleted.undo.id, deleted.undo.base);
    assert.equal((await readNote(root, D)).text, 'ordinary autosave');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
