// node --test で実行。パーサ・書き込み・バケット分けの主要経路だけを押さえる。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as V from '../lib/vault.js';

const TODAY = '2026-10-06';
const day = (offset) => {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

async function vault(files = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tm-'));
  for (const [rel, body] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), body);
  }
  return root;
}
const read = (root, rel) => fs.readFile(path.join(root, rel), 'utf8');

test('parseTasks: メタ情報・時刻・見出し・コードブロック・frontmatter', () => {
  const src = [
    '---', '- [ ] frontmatter 内は無視', '---',
    '## 今日のタスク',
    '- [ ] 14:00-14:15 レビュー ⏫ ⏳ 2026-10-07 📅 2026-10-09 #pr',
    '- [x] 終わった ✅ 2026-10-06',
    '- [ ] ',
    '```', '- [ ] コード内は無視', '```',
    '## ルーティン', '### コア業務', '- [ ] 朝会',
  ].join('\n');
  const t = V.parseTasks(src, 'Daily/2026-10-06.md', TODAY);
  assert.equal(t.length, 3);
  assert.deepEqual(
    { text: t[0].text, p: t[0].priority, s: t[0].scheduled, d: t[0].due, tags: t[0].tags, time: t[0].time, kind: t[0].kind },
    { text: '14:00-14:15 レビュー #pr', p: 'high', s: '2026-10-07', d: '2026-10-09', tags: ['pr'], time: { start: '14:00', end: '14:15' }, kind: 'task' },
  );
  assert.equal(t[1].done, true);
  assert.equal(t[1].doneDate, '2026-10-06');
  assert.equal(t[2].kind, 'routine');
  assert.equal(t[2].group, 'コア業務');
});

test('toggleRaw: 完了日の付け外し・キャンセルからの復帰・ブロックID', () => {
  assert.equal(V.toggleRaw('- [ ] a 📅 2026-10-08', TODAY), '- [x] a 📅 2026-10-08 ✅ 2026-10-06');
  assert.equal(V.toggleRaw('- [x] a ✅ 2026-10-06', TODAY), '- [ ] a');
  assert.equal(V.toggleRaw('- [-] a ❌ 2026-10-01', TODAY), '- [ ] a');
  assert.equal(V.toggleRaw('- [ ] a ^abc', TODAY), '- [x] a ✅ 2026-10-06 ^abc');
  assert.equal(V.toggleRaw('- [ ] a ✅ 2026-10-05', TODAY), '- [x] a ✅ 2026-10-06'); // Obsidian で外した後に ✅ が残った行も二重にならない
});

test('add/toggle/edit/cancel/reschedule: 行がずれても追従し、食い違えば Conflict', async () => {
  const root = await vault();
  const { file, raw } = await V.add(root, TODAY, { text: '見積り作成', priority: 'high', scheduled: TODAY });
  assert.equal(file, 'Daily/2026-10-06.md');
  assert.equal(raw, '- [ ] 見積り作成 ⏫ ⏳ 2026-10-06');
  let note = await read(root, file);
  assert.match(note, /date: 2026-10-06/); // テンプレートの {{date}} が展開される
  assert.ok(note.indexOf('見積り作成') < note.indexOf('## ルーティン')); // 今日のタスク節に入る

  const st = await V.buildState(root, TODAY);
  const ref = { file, line: st.tasks[0].line, raw };

  // Obsidian 側で先頭に行が増えた想定 → 完全一致の1件に追従する
  await fs.writeFile(path.join(root, file), `追記\n${note}`);
  const r1 = await V.toggle(root, TODAY, ref);
  assert.equal(r1.raw, '- [x] 見積り作成 ⏫ ⏳ 2026-10-06 ✅ 2026-10-06');

  // 同じ行が書き換わっていたら適用しない
  await assert.rejects(V.toggle(root, TODAY, ref), V.Conflict);

  const cur = { file, line: ref.line + 1, raw: r1.raw };
  const e = await V.edit(root, cur, { text: '見積り作成 v2', scheduled: '', due: '2026-10-09', priority: '' });
  assert.equal(e.raw, '- [x] 見積り作成 v2 📅 2026-10-09 ✅ 2026-10-06');
  const c = await V.cancel(root, TODAY, { ...cur, raw: e.raw });
  assert.equal(c.raw, '- [-] 見積り作成 v2 📅 2026-10-09 ❌ 2026-10-06');
  assert.equal((await V.reschedule(root, { ...cur, raw: c.raw }, '2026-10-08')).raw.includes('📅 2026-10-10'), true);
  assert.deepEqual((await fs.readdir(root + '/Daily')).filter((n) => n.startsWith('.')), []); // temp が残らない
});

test('add: 未来日は Inbox に ⏳ 付き、不正な入力は BadInput', async () => {
  const root = await vault();
  const r = await V.add(root, TODAY, { text: '来週の準備', scheduled: '2026-10-12' });
  assert.equal(r.file, 'Inbox.md');
  assert.match(await read(root, 'Inbox.md'), /- \[ \] 来週の準備 ⏳ 2026-10-12\n$/);
  await assert.rejects(V.add(root, TODAY, { text: '  ' }), V.BadInput);
  await assert.rejects(V.add(root, TODAY, { text: 'x', due: '2026-13-40' }), V.BadInput);
  await assert.rejects(V.toggle(root, TODAY, { file: '../x.md', line: 0, raw: '- [ ] a' }), V.BadInput);
  await assert.rejects(V.toggle(root, TODAY, { file: 'Inbox.md', line: 0, raw: '# Inbox' }), V.BadInput); // タスク行でない
});

test('buildState: 持ち越し・予定・インボックス・ルーティン・タイムライン・連続日数', async () => {
  const root = await vault({
    'Daily/2026-10-05.md': '## 今日のタスク\n- [ ] 昨日の残り\n- [x] 昨日終わった ✅ 2026-10-05\n## ルーティン\n- [x] 朝会\n- [x] 日報\n',
    'Daily/2026-10-06.md': '## 今日のタスク\n- [ ] 15:00 設計レビュー\n- [x] 済み ✅ 2026-10-06\n## ルーティン\n- [x] 朝会\n- [ ] 日報\n',
    'Daily/2026-10-07.md': '## 今日のタスク\n- [ ] 明日の件\n',
    'Inbox.md': '# Inbox\n- [ ] いつか\n- [ ] 期限あり 📅 2026-10-03\n- [ ] 来週 ⏳ 2026-10-12\n- [ ] 先送り ⏳ 2026-10-07 📅 2026-10-03\n',
    'Templates/Daily.md': '- [ ] テンプレ内は数えない\n',
  });
  const s = await V.buildState(root, TODAY);
  const texts = (l) => l.map((t) => t.text);
  assert.deepEqual(texts(s.tasks), ['15:00 設計レビュー', '期限あり', '昨日の残り', '済み']);
  assert.equal(s.tasks.find((t) => t.text === '期限あり').overdue, true);
  assert.equal(s.tasks.find((t) => t.text === '昨日の残り').carry, 1);
  assert.deepEqual(texts(s.upcoming), ['明日の件', '先送り', '来週']); // 先送り(⏳明日)は期限切れでも今日に出ない
  assert.equal(s.upcoming[1].overdue, true);
  assert.deepEqual(texts(s.inbox), ['いつか']);
  assert.deepEqual(s.counts, { tasks: [1, 4], routine: [1, 2] });
  assert.deepEqual(texts(s.timeline), ['15:00 設計レビュー']);
  assert.equal(s.streak, 0); // 75% では達成にならない。今日が未完了でも、直前までの完全達成だけを保つ
});

test('streak: 全対象の完了だけを数え、0件・キャンセルは成功にしない。今日の carry/Inbox も表示分母と一致する', async () => {
  const root = await vault({
    'Daily/2026-10-03.md': '## 今日のタスク\n',
    'Daily/2026-10-04.md': '## 今日のタスク\n- [x] 完了A\n- [-] 対象外\n## ルーティン\n- [x] 完了B\n',
    'Daily/2026-10-05.md': '## 今日のタスク\n- [x] 昨日完了\n## ルーティン\n- [x] 昨日ルーティン\n',
    'Daily/2026-10-06.md': '## 今日のタスク\n## ルーティン\n- [x] 今日ルーティン\n',
    'Inbox.md': '# Inbox\n- [x] 今日完了 ⏳ 2026-10-06 ✅ 2026-10-06\n- [ ] 今日未完了 📅 2026-10-06\n',
  });
  const s = await V.buildState(root, TODAY);
  assert.equal(s.history['2026-10-03'], undefined);
  assert.deepEqual(s.history['2026-10-04'], [2, 2]);
  assert.deepEqual(s.history[TODAY], [2, 3]);
  assert.deepEqual(s.counts, { tasks: [1, 2], routine: [1, 1] });
  assert.equal(s.streak, 2, '오늘은 진행 중이라 증가하지 않고 어제까지의 연속 기록만 유지');
});

test('streak: 오늘 3/4 완료는 75%여도 성공일이 아니며 어제의 완전 달성만 유지한다', async () => {
  const root = await vault({
    'Daily/2026-10-05.md': '## 今日のタスク\n- [x] 어제 완료 ✅ 2026-10-05\n',
    'Daily/2026-10-06.md': [
      '## 今日のタスク',
      '- [x] 오늘 완료 A ✅ 2026-10-06',
      '- [x] 오늘 완료 B ✅ 2026-10-06',
      '- [x] 오늘 완료 C ✅ 2026-10-06',
      '- [ ] 오늘 미완료',
      '',
    ].join('\n'),
  });
  const state = await V.buildState(root, TODAY);
  assert.deepEqual(state.history[day(-1)], [1, 1]);
  assert.deepEqual(state.history[TODAY], [3, 4]);
  assert.equal(state.streak, 1, '오늘은 완전 달성이 아니므로 어제의 streak에 오늘을 더하지 않는다');
});

test('history: Inbox/carry eligibility는 날짜가 지나도 사라지지 않고 실제 완료일에만 done이 된다', async () => {
  const root = await vault({
    'Daily/2026-10-06.md': '## 今日のタスク\n- [ ] carry later ⏳ 2026-10-06\n- [x] done later ⏳ 2026-10-06 ✅ 2026-10-07\n## ルーティン\n- [x] routine done\n',
    'Inbox.md': '# Inbox\n- [ ] scheduled open ⏳ 2026-10-06\n- [x] early done ⏳ 2026-10-08 ✅ 2026-10-06\n',
  });
  const onSixth = await V.buildState(root, '2026-10-06');
  assert.deepEqual(onSixth.history['2026-10-06'], [2, 5]);
  const onSeventh = await V.buildState(root, '2026-10-07');
  assert.deepEqual(onSeventh.history['2026-10-06'], [2, 5], '다음 날에도 미완료 Inbox/carry가 과거 분모에서 빠지지 않는다');
  assert.deepEqual(onSeventh.history['2026-10-07'], [1, 3], 'carry 두 건 중 실제 오늘 완료한 한 건만 done');
  assert.equal(onSeventh.streak, 0);
});

test('streak: heatmap은 84일로 제한하지만 85일 이상 연속 기록과 empty/cancel boundary는 정확히 계산한다', async () => {
  const complete = {};
  for (let offset = 0; offset > -85; offset--) {
    const date = day(offset);
    complete[`Daily/${date}.md`] = `## 今日のタスク\n- [x] done ${date} ✅ ${date}\n`;
  }
  const long = await V.buildState(await vault(complete), TODAY);
  assert.equal(long.streak, 85);
  assert.equal(Object.keys(long.history).length, 84);

  for (const boundary of ['## 今日のタスク\n', `## 今日のタスク\n- [-] canceled ❌ ${day(-84)}\n`]) {
    const files = {};
    for (let offset = 0; offset > -86; offset--) {
      const date = day(offset);
      files[`Daily/${date}.md`] = `## 今日のタスク\n- [x] done ${date} ✅ ${date}\n`;
    }
    files[`Daily/${day(-84)}.md`] = boundary;
    assert.equal((await V.buildState(await vault(files), TODAY)).streak, 84);
  }
});

test('parseTime: 開始だけ / 範囲 / 終了だけ (〜12:00) と区切りの揺れ', () => {
  assert.deepEqual(V.parseTime('14:00 レビュー'), { start: '14:00', end: null });
  assert.deepEqual(V.parseTime('12:00-12:15 会議'), { start: '12:00', end: '12:15' });
  assert.deepEqual(V.parseTime('12:00 ～ 13:30'), { start: '12:00', end: '13:30' }); // 全角の ～ (Windows の IME) も区切り
  assert.deepEqual(V.parseTime('〜12:00 提出'), { start: null, end: '12:00' }); // 終了だけ = 締切の時刻
  assert.deepEqual(V.parseTime('~9:05 提出'), { start: null, end: '09:05' }); // 半角の ~ と 1 桁の時
  assert.deepEqual(V.parseTime('～23:59 提出'), { start: null, end: '23:59' });
  assert.deepEqual(V.parseTime('資料〜12:00まで'), { start: null, end: '12:00' }); // 文中でもよい
  assert.deepEqual(V.parseTime('メモ 12:00〜12:30 と 〜18:00'), { start: '12:00', end: '12:30' }); // 先に出てきた時刻が優先
  for (const none of ['時刻なし', '〜25:00 提出', '24:00 提出', '詳細 https://example.com/10:00', '比 1:2', '〜12 提出']) assert.equal(V.parseTime(none), null, none);
});

test('buildState: 終了だけの時刻 (〜12:00) のタスクも timeline に入り、時刻順 (開始があれば開始、終了だけなら終了) に並ぶ', async () => {
  const root = await vault({
    'Daily/2026-10-06.md': '## 今日のタスク\n- [ ] 時刻なし\n- [ ] 〜11:00 提出\n- [ ] 10:00 会議\n- [ ] 〜09:30 下書き\n- [ ] 12:00-13:00 昼\n',
  });
  const s = await V.buildState(root, TODAY);
  assert.deepEqual(s.tasks.map((t) => t.text), ['〜09:30 下書き', '10:00 会議', '〜11:00 提出', '12:00-13:00 昼', '時刻なし']);
  assert.deepEqual(s.timeline.map((t) => t.time), [
    { start: null, end: '09:30' },
    { start: '10:00', end: null },
    { start: null, end: '11:00' },
    { start: '12:00', end: '13:00' },
  ]);
});

test('buildState: timed tasks sort by their actual event date and clock before priority; completed and untimed stay grouped', async () => {
  const root = await vault({
    'Daily/2026-10-06.md': [
      '## 今日のタスク',
      '- [ ] 〜05:00 今日締切 📅 2026-10-06',
      '- [ ] 11:00 同刻低 🔽',
      '- [ ] 11:00 同刻高 🔺',
      '- [ ] 23:00-01:00 日またぎ 📅 2026-10-07',
      '- [ ] 〜05:00 明日締切 🔺 ⏳ 2026-10-06 📅 2026-10-07',
      '- [ ] 優先だけ 🔺',
      '- [x] 09:00 完了済み ✅ 2026-10-06',
    ].join('\n'),
    'Inbox.md': '# Inbox\n- [ ] 12:00 🛫 fallback 🛫 2026-10-06\n',
  });
  const s = await V.buildState(root, TODAY);
  assert.deepEqual(s.tasks.map((t) => t.text), [
    '〜05:00 今日締切',
    '11:00 同刻高',
    '11:00 同刻低',
    '12:00 🛫 fallback',
    '23:00-01:00 日またぎ',
    '〜05:00 明日締切',
    '優先だけ',
    '09:00 完了済み',
  ]);
});

test('buildState: upcoming keeps its date groups and sorts timed tasks by effective event datetime within each group', async () => {
  const root = await vault({
    'Inbox.md': [
      '# Inbox',
      '- [ ] 〜05:00 翌日締切 ⏳ 2026-10-07 📅 2026-10-08',
      '- [ ] 23:00-01:00 当日開始 ⏳ 2026-10-07 📅 2026-10-08',
      '- [ ] 08:00 朝開始 ⏳ 2026-10-07',
    ].join('\n'),
  });
  assert.deepEqual((await V.buildState(root, TODAY)).upcoming.map((t) => t.text), ['08:00 朝開始', '23:00-01:00 当日開始', '〜05:00 翌日締切']);
});

test('date/time span: 다음 날 overnight만 허용하고 Day line은 오늘과의 실제 교집합만 반환한다', async () => {
  const root = await vault({
    'Daily/2026-10-05.md': '## 今日のタスク\n- [ ] 23:00-01:00 前日開始 ⏳ 2026-10-05 📅 2026-10-06\n- [ ] 23:00-00:00 境界で終了 ⏳ 2026-10-05 📅 2026-10-06\n- [ ] 10:00-11:00 複数日 ⏳ 2026-10-05 📅 2026-10-07\n- [ ] 23:00-01:00 期限切れ ⏳ 2026-10-05 📅 2026-10-05\n',
    'Daily/2026-10-06.md': '## 今日のタスク\n- [ ] 23:00-01:00 翌日終了 ⏳ 2026-10-06 📅 2026-10-07\n- [ ] 23:59-00:00 一分だけ ⏳ 2026-10-06 📅 2026-10-07\n- [ ] 〜18:00 今日締切 📅 2026-10-06\n- [ ] 〜18:00 明日締切 📅 2026-10-07\n',
  });
  const timeline = Object.fromEntries((await V.buildState(root, TODAY)).timeline.map((x) => [x.text.replace(/^\S+\s+/, ''), x.segment]));
  assert.deepEqual(timeline['前日開始'], { start: '00:00', end: '01:00', endOnly: false, startedPrevious: true, continuesNext: false });
  assert.deepEqual(timeline['翌日終了'], { start: '23:00', end: '24:00', endOnly: false, startedPrevious: false, continuesNext: true });
  assert.deepEqual(timeline['複数日'], { start: '00:00', end: '24:00', endOnly: false, startedPrevious: true, continuesNext: true });
  assert.equal(timeline['期限切れ'], undefined);
  assert.equal(timeline['境界で終了'], undefined);
  assert.deepEqual(timeline['一分だけ'], { start: '23:59', end: '24:00', endOnly: false, startedPrevious: false, continuesNext: true });
  assert.deepEqual(timeline['今日締切'], { start: null, end: '18:00', endOnly: true, startedPrevious: false, continuesNext: false });
  assert.equal(timeline['明日締切'], undefined);
});

test('date/time validation: same-day・日付なしの逆順/同時刻を拒否し、翌日だけ許す', async () => {
  for (const text of ['23:00-01:00 逆順', '12:00-12:00 同時刻']) {
    const root = await vault();
    await assert.rejects(V.add(root, TODAY, { text, scheduled: TODAY, due: TODAY }), (e) => e instanceof V.BadInput && /end before start/.test(e.message));
    await assert.rejects(V.add(root, TODAY, { text }), (e) => e instanceof V.BadInput && /end before start/.test(e.message));
  }
  const root = await vault();
  assert.equal((await V.add(root, TODAY, { text: '23:00-01:00 overnight', scheduled: TODAY, due: '2026-10-07' })).file, `Daily/${TODAY}.md`);
  await assert.rejects(V.add(root, TODAY, { text: '10:00-11:00 due first', scheduled: '2026-10-07', due: TODAY }), (e) => e instanceof V.BadInput && /due before start/.test(e.message));
});

test('date/time validation: inline metadata의 invalid calendar date를 모든 mutation 전에 거부한다', async () => {
  const root = await vault({ 'Inbox.md': '# Inbox\n- [ ] keep\n' });
  const before = await read(root, 'Inbox.md');
  for (const text of [
    '23:00-01:00 invalid ⏳ 2026-10-06 📅 2026-13-40',
    'invalid start 🛫 2026-02-30',
    'invalid created ➕ 2026-00-10',
  ]) await assert.rejects(V.add(root, TODAY, { text }), (e) => e instanceof V.BadInput && /bad date/.test(e.message));
  const keep = (await V.buildState(root, TODAY)).inbox[0];
  await assert.rejects(V.edit(root, keep, { text: 'edited 📅 2026-02-30' }), V.BadInput);
  await assert.rejects(V.saveItem(root, TODAY, { from: 'task', to: 'routine', ref: keep, text: 'routine 🛫 2026-13-01', repeat: { type: 'daily' } }), V.BadInput);
  assert.equal(await read(root, 'Inbox.md'), before);
  await assert.rejects(fs.stat(path.join(root, 'Daily')));
  await assert.rejects(fs.stat(path.join(root, 'Templates')));
});

test('routine mutation: 날짜가 있는 역순 시간은 add/edit/convert 모두 파일 변경 전에 거부한다', async () => {
  const root = await vault({
    [`Daily/${TODAY}.md`]: '## 今日のタスク\n- [ ] 변환할 task ⏳ 2026-10-06\n## ルーティン\n- [ ] 기존 routine\n',
    'Templates/Daily.md': '## ルーティン\n- [ ] 기존 routine\n',
  });
  const snapshot = async () => [await read(root, `Daily/${TODAY}.md`), await read(root, 'Templates/Daily.md')];
  const before = await snapshot();
  let state = await V.buildState(root, TODAY);
  const routine = state.routine[0].items[0];
  state = await V.buildState(root, TODAY);
  const task = state.tasks.find((x) => x.text.includes('변환할 task'));
  await assert.rejects(V.addRoutine(root, TODAY, { text: '23:00-01:00 dated overnight ⏳ 2026-10-06 📅 2026-10-07' }), V.BadInput);
  await assert.rejects(V.addRoutine(root, TODAY, { text: '12:00-12:00 dated equal ⏳ 2026-10-06 📅 2026-10-07' }), V.BadInput);
  await assert.rejects(V.editRoutine(root, routine, { text: '23:00-01:00 dated edit ⏳ 2026-10-06 📅 2026-10-07' }), V.BadInput);
  await assert.rejects(V.saveItem(root, TODAY, { from: 'task', to: 'routine', ref: task, text: '23:00-01:00 dated convert ⏳ 2026-10-06 📅 2026-10-07', repeat: { type: 'daily' } }), V.BadInput);
  assert.deepEqual(await snapshot(), before);
});

test('postpone: scheduled를 보존하고 기존 due/start 중 가장 늦은 날의 다음 날로 due만 이동한다', async () => {
  const root = await vault({ 'Inbox.md': '# Inbox\n- [ ] 미래 일정 ⏳ 2026-10-12 📅 2026-10-15\n' });
  const task = (await V.buildState(root, TODAY)).upcoming[0];
  const result = await V.reschedule(root, task, '2026-10-07');
  assert.equal(result.raw, '- [ ] 미래 일정 ⏳ 2026-10-12 📅 2026-10-16');
});

test('postpone: due token만 patch하고 본문/start/meta 순서/공백/block ID는 그대로 둔다', async () => {
  const raw = '- [ ] Keep  spacing 📅 2026-10-09 ⏳  2026-10-06 ⏫ ^keep';
  const root = await vault({ 'Inbox.md': `# Inbox\n${raw}\n` });
  const task = (await V.buildState(root, TODAY)).tasks[0];
  assert.equal((await V.reschedule(root, task, '2026-10-07')).raw, '- [ ] Keep  spacing 📅 2026-10-10 ⏳  2026-10-06 ⏫ ^keep');

  const noDue = '- [ ] No  due ⏳  2026-10-06 ^block';
  const root2 = await vault({ 'Inbox.md': `# Inbox\n${noDue}\n` });
  const task2 = (await V.buildState(root2, TODAY)).tasks[0];
  assert.equal((await V.reschedule(root2, task2, '2026-10-07')).raw, '- [ ] No  due ⏳  2026-10-06 📅 2026-10-07 ^block');
});

test('postpone: daily file의 implicit start를 사용해 유효한 overnight를 연장한다', async () => {
  const root = await vault({ [`Daily/${TODAY}.md`]: '## 今日のタスク\n- [ ] 23:00-01:00 overnight 📅 2026-10-07\n' });
  const task = (await V.buildState(root, TODAY)).tasks[0];
  const result = await V.reschedule(root, task, '2026-10-07');
  assert.equal(result.raw, '- [ ] 23:00-01:00 overnight 📅 2026-10-08');
});

test('Today/Postpone Undo: original raw line을 exact restore하고 stale/arbitrary restore를 거부한다', async () => {
  const original = '- [ ]   Exact  spacing  📅 2026-10-05   ⏫   ⏳  2026-10-08 ^keep';
  const root = await vault({ 'Inbox.md': `# Inbox\n\n${original}\n  memo stays\n  - [ ] nested stays\n` });
  const before = await read(root, 'Inbox.md');
  const task = (await V.buildState(root, TODAY)).upcoming.find((x) => x.text.includes('Exact spacing'));
  const moved = await V.moveToday(root, task, TODAY);
  assert.match(moved.raw, new RegExp(`⏳ ${TODAY}.*📅 ${TODAY}|📅 ${TODAY}.*⏳ ${TODAY}`));
  await V.restoreRaw(root, { file: task.file, line: task.line, raw: moved.raw }, original);
  assert.equal(await read(root, 'Inbox.md'), before);
  await assert.rejects(V.restoreRaw(root, { file: task.file, line: task.line, raw: moved.raw }, original), V.Conflict, '현재 줄이 달라진 stale undo');
  await assert.rejects(V.restoreRaw(root, { file: task.file, line: task.line, raw: original }, '- [ ] injected\n- [ ] second'), V.BadInput);
});

test('toggle: 繰り返し(🔁)は完了して次回分を上に作る。解釈できない規則は警告だけ', async () => {
  const mk = (body) => vault({ 'Inbox.md': `# Inbox\n${body}\n` });
  const run = async (body) => {
    const root = await mk(body);
    const res = await V.toggle(root, TODAY, { file: 'Inbox.md', line: 1, raw: body });
    return { res, lines: (await read(root, 'Inbox.md')).split('\n').slice(1, -1) };
  };

  let r = await run('- [ ] 週報 🔁 every week 📅 2026-10-06');
  assert.deepEqual(r.lines, ['- [ ] 週報 🔁 every week 📅 2026-10-13', '- [x] 週報 🔁 every week 📅 2026-10-06 ✅ 2026-10-06']);
  assert.equal(r.res.next, '2026-10-13');

  // when done: 完了日(今日)基準。期間(⏳→📅 の2日差)は保たれる
  r = await run('- [ ] 掃除 🔁 every 3 days when done ⏳ 2026-10-01 📅 2026-10-03');
  assert.equal(r.lines[0], '- [ ] 掃除 🔁 every 3 days when done ⏳ 2026-10-07 📅 2026-10-09');

  r = await run('- [ ] 平日の確認 🔁 every weekday 📅 2026-10-09'); // 金 → 月
  assert.equal(r.res.next, '2026-10-12');

  for (const body of ['- [ ] 月末 🔁 every month 📅 2026-01-31', '- [ ] 謎 🔁 every Monday and Friday 📅 2026-10-06', '- [ ] 日付なし 🔁 every day']) {
    r = await run(body);
    assert.equal(r.res.warn, 'recurrence');
    assert.equal(r.lines.length, 1); // 次回分は作らず、完了だけ
    assert.match(r.lines[0], /^- \[x\]/);
  }
});

test('add: 日付で置き場所が決まる (なし/未来 → Inbox, 今日以前 → 今日のノート)', async () => {
  const root = await vault();
  assert.equal((await V.add(root, TODAY, { text: '日付なし' })).file, 'Inbox.md');
  assert.equal((await V.add(root, TODAY, { text: '未来の締切', due: '2026-10-20' })).file, 'Inbox.md');
  assert.equal((await V.add(root, TODAY, { text: '今日', scheduled: TODAY, due: TODAY })).file, 'Daily/2026-10-06.md');
  assert.equal((await V.add(root, TODAY, { text: '期限切れ', due: '2026-10-01' })).file, 'Daily/2026-10-06.md');
  await assert.rejects(V.add(root, TODAY, { text: 'x', scheduled: '2026-10-09', due: '2026-10-08' }), V.BadInput);
});

test('add: Tasks start (🛫) 날짜도 scheduled와 같은 배치/검증 계약을 따른다', async () => {
  const root = await vault();
  assert.equal((await V.add(root, TODAY, { text: `오늘 시작 🛫 ${TODAY}` })).file, `Daily/${TODAY}.md`);
  assert.equal((await V.add(root, TODAY, { text: `미래 시작 🛫 2026-10-08` })).file, 'Inbox.md');
  await assert.rejects(V.add(root, TODAY, { text: '23:00-01:00 역순', start: TODAY, due: TODAY }), V.BadInput);
});

test('edit: 未指定は据え置き・日付を両方消すと日次ノートから Inbox へ移す', async () => {
  const root = await vault();
  const { file, raw } = await V.add(root, TODAY, { text: '見積り', scheduled: TODAY, due: TODAY });
  const line = (await V.buildState(root, TODAY)).tasks[0].line;
  const r1 = await V.edit(root, { file, line, raw }, { text: '見積り v2' }); // 日付は触らない
  assert.equal(r1.raw, '- [ ] 見積り v2 ⏳ 2026-10-06 📅 2026-10-06');
  const r2 = await V.edit(root, { file, line, raw: r1.raw }, { text: '見積り v2', scheduled: '', due: '' });
  assert.equal(r2.moved, 'Inbox.md');
  assert.equal(r2.raw, '- [ ] 見積り v2');
  assert.match(await read(root, 'Inbox.md'), /- \[ \] 見積り v2\n/);
  assert.doesNotMatch(await read(root, file), /見積り/);
  await assert.rejects(V.edit(root, { file: 'Inbox.md', line: 2, raw: r2.raw }, { text: 'x', scheduled: '2026-10-09', due: '2026-10-08' }), V.BadInput);
});

test('繰り返し規則: 解釈・整形・該当日', () => {
  assert.deepEqual(V.parseRule('every week on Monday, Friday'), { type: 'weekly', days: [1, 5] });
  assert.deepEqual(V.parseRule('every Friday'), { type: 'weekly', days: [5] });
  assert.deepEqual(V.parseRule('every weekday'), { type: 'weekday' });
  assert.deepEqual(V.parseRule('every month on the 15th'), { type: 'monthly', dom: 15 });
  assert.deepEqual(V.parseRule('every month on the last'), { type: 'monthly', dom: 'last' });
  assert.equal(V.parseRule('every 2 weeks'), null);
  assert.equal(V.parseRule('every week'), null);
  assert.equal(V.formatRule({ type: 'weekly', days: [1, 5] }), 'every week on Monday, Friday');
  assert.equal(V.formatRule({ type: 'monthly', dom: 22 }), 'every month on the 22nd');
  assert.equal(V.formatRule({ type: 'monthly', dom: 11 }), 'every month on the 11th');
  assert.equal(V.formatRule({ type: 'daily' }), '');
  // 2026-10-06 は火曜
  assert.equal(V.ruleMatches({ type: 'weekly', days: [2] }, TODAY), true);
  assert.equal(V.ruleMatches({ type: 'weekly', days: [1, 5] }, TODAY), false);
  assert.equal(V.ruleMatches({ type: 'weekday' }, '2026-10-10'), false); // 土
  assert.equal(V.ruleMatches({ type: 'monthly', dom: 31 }, '2026-11-30'), true); // 小さい月は月末に寄せる
  assert.equal(V.ruleMatches({ type: 'monthly', dom: 'last' }, '2026-02-28'), true);
});

test('ルーティン: テンプレートの繰り返しで日次ノートの行が決まり、編集でテンプレートも更新される', async () => {
  const tpl = '## 今日のタスク\n\n## ルーティン\n### G\n- [ ] 毎日\n- [ ] 月曜だけ 🔁 every week on Monday\n- [ ] 火曜だけ 🔁 every week on Tuesday\n- [ ] 平日 🔁 every weekday\n';
  const root = await vault({ 'Templates/Daily.md': tpl });
  const file = await V.ensureDaily(root, TODAY); // 火曜
  const note = await read(root, file);
  assert.match(note, /- \[ \] 毎日\n/);
  assert.match(note, /- \[ \] 火曜だけ\n/); // 🔁 は外れる
  assert.match(note, /- \[ \] 平日\n/);
  assert.doesNotMatch(note, /月曜だけ|🔁/);

  let items = (await V.buildState(root, TODAY)).routine.flatMap((g) => g.items);
  assert.deepEqual(items.map((t) => [t.text, t.repeat.type]), [['毎日', 'daily'], ['火曜だけ', 'weekly'], ['平日', 'weekday']]);

  // 名前変更 + 毎週 月・金 へ。テンプレートが更新され、今日の行は名前だけ変わる
  const tue = items[1];
  const r = await V.editRoutine(root, { file, line: tue.line, raw: tue.raw }, { text: '月金だけ', repeat: { type: 'weekly', days: [1, 5] } });
  assert.equal(r.raw, '- [ ] 月金だけ');
  assert.match(await read(root, 'Templates/Daily.md'), /- \[ \] 月金だけ 🔁 every week on Monday, Friday\n/);
  assert.match(await read(root, file), /- \[ \] 月金だけ\n/);

  // テンプレートに無い今日だけの項目: once なら何もしない / 繰り返しを付けるとテンプレートの ルーティン節の末尾に追加
  await fs.appendFile(path.join(root, file), '- [ ] 臨時\n');
  items = (await V.buildState(root, TODAY)).routine.flatMap((g) => g.items);
  const tmp = items.find((t) => t.text === '臨時');
  assert.equal(tmp.repeat, null);
  const before = await read(root, 'Templates/Daily.md');
  await V.editRoutine(root, { file, line: tmp.line, raw: tmp.raw }, { text: '臨時', repeat: { type: 'once' } });
  assert.equal(await read(root, 'Templates/Daily.md'), before);
  await V.editRoutine(root, { file, line: tmp.line, raw: tmp.raw }, { text: '臨時', repeat: { type: 'weekly', days: [3] } });
  assert.match(await read(root, 'Templates/Daily.md'), /- \[ \] 平日 🔁 every weekday\n- \[ \] 臨時 🔁 every week on Wednesday\n/);
  await assert.rejects(V.editRoutine(root, { file, line: tmp.line, raw: tmp.raw }, { text: '臨時', repeat: { type: 'weekly', days: [] } }), V.BadInput);

  // 次の月曜: 月曜だけ + 月金だけ が出る。火曜だけ(改名済)・臨時(水のみ)は出ない
  const mon = await read(root, await V.ensureDaily(root, '2026-10-12'));
  assert.match(mon, /月曜だけ/);
  assert.match(mon, /月金だけ/);
  assert.doesNotMatch(mon, /火曜だけ|臨時/);
});

test('ルーティン: Obsidian が作った日次ノートに残る 🔁 も尊重し、完了しても次回分は作らない', async () => {
  const note = '## ルーティン\n- [ ] 月曜 🔁 every week on Monday\n- [ ] 火曜 🔁 every week on Tuesday\n';
  const root = await vault({ 'Daily/2026-10-06.md': note });
  const s = await V.buildState(root, TODAY);
  const items = s.routine.flatMap((g) => g.items);
  assert.deepEqual(items.map((t) => t.text), ['火曜']);
  assert.deepEqual(s.counts.routine, [0, 1]);
  const res = await V.toggle(root, TODAY, { file: 'Daily/2026-10-06.md', line: 2, raw: '- [ ] 火曜 🔁 every week on Tuesday', kind: 'routine' });
  assert.equal(res.warn, undefined);
  assert.equal(res.next, undefined);
  assert.equal((await read(root, 'Daily/2026-10-06.md')).split('\n').filter((l) => l.includes('火曜')).length, 1);
});

test('セクション: 追加・改名・削除はテンプレートと今日のノートに効き、項目が残る節は消せない', async () => {
  const tpl = '## 今日のタスク\n\n## ルーティン\n### G1\n- [ ] a\n### G2\n- [ ] b\n';
  const root = await vault({ 'Templates/Daily.md': tpl });
  const file = await V.ensureDaily(root, TODAY);
  await V.sectionOp(root, TODAY, { panel: 'tasks', op: 'add', name: '重要' });
  await V.sectionOp(root, TODAY, { panel: 'tasks', op: 'add', name: '重要' }); // 二重追加は何もしない
  let s = await V.buildState(root, TODAY);
  assert.deepEqual(s.sections, { tasks: ['重要'], routine: ['G1', 'G2'] }); // 空のセクションも見える
  assert.match(await read(root, 'Templates/Daily.md'), /## 今日のタスク\n\n?### 重要/);

  await V.sectionOp(root, TODAY, { panel: 'routine', op: 'rename', name: 'G1', to: '朝' });
  assert.deepEqual((await V.buildState(root, TODAY)).sections.routine, ['朝', 'G2']);
  assert.match(await read(root, 'Templates/Daily.md'), /### 朝\n- \[ \] a/);
  assert.match(await read(root, file), /### 朝\n- \[ \] a/);
  await assert.rejects(V.sectionOp(root, TODAY, { panel: 'routine', op: 'rename', name: '朝', to: 'G2' }), V.BadInput); // 同名
  await assert.rejects(V.sectionOp(root, TODAY, { panel: 'routine', op: 'delete', name: 'G2' }), V.BadInput); // 項目あり
  await V.sectionOp(root, TODAY, { panel: 'tasks', op: 'delete', name: '重要' });
  assert.deepEqual((await V.buildState(root, TODAY)).sections.tasks, []);
  assert.doesNotMatch(await read(root, file), /重要/);
  assert.match(await read(root, file), /## 今日のタスク\n+## ルーティン/); // 節を消しても次の見出しとの間隔は保たれる
  assert.match(await read(root, file), /\n\n## ルーティン/);
  await assert.rejects(V.sectionOp(root, TODAY, { panel: 'x', op: 'add', name: 'n' }), V.BadInput);
});

test('add/edit: セクション指定で入る場所が決まり、編集で別セクションへ移せる', async () => {
  const tpl = '## 今日のタスク\n### 仕事\n### 私用\n\n## ルーティン\n\n## メモ\n';
  const root = await vault({ 'Templates/Daily.md': tpl });
  const file = await V.ensureDaily(root, TODAY);
  const a = await V.add(root, TODAY, { text: '見出しなし', scheduled: TODAY });
  const b = await V.add(root, TODAY, { text: '仕事の件', scheduled: TODAY, section: '仕事' });
  await V.add(root, TODAY, { text: '私用の件', scheduled: TODAY, section: '私用' });
  let items = (await V.buildState(root, TODAY)).tasks;
  assert.deepEqual(items.map((t) => [t.text, t.group ?? '']).sort(), [['仕事の件', '仕事'], ['私用の件', '私用'], ['見出しなし', '']].sort());
  const note = await read(root, file);
  assert.ok(note.indexOf('見出しなし') < note.indexOf('### 仕事')); // 見出しなしは最初の ### より前

  const t = items.find((x) => x.text === '仕事の件');
  const r = await V.edit(root, { file, line: t.line, raw: t.raw }, { text: '仕事の件', section: '私用' });
  assert.equal(r.raw, t.raw);
  items = (await V.buildState(root, TODAY)).tasks;
  assert.equal(items.find((x) => x.text === '仕事の件').group, '私用');
  assert.ok(a.raw && b.raw);
});

test('ルーティン保存: 追加・今日は出ない日・タスクとの相互変換', async () => {
  const tpl = '## 今日のタスク\n\n## ルーティン\n### G\n- [ ] 既存\n';
  const root = await vault({ 'Templates/Daily.md': tpl });
  const file = await V.ensureDaily(root, TODAY); // 火曜

  // 新規ルーティン (毎日): テンプレートと今日のノートの両方に入る
  let r = await V.saveItem(root, TODAY, { to: 'routine', text: '毎日の新規', repeat: { type: 'daily' }, section: 'G' });
  assert.equal(r.file, file);
  assert.match(await read(root, 'Templates/Daily.md'), /### G\n- \[ \] 既存\n- \[ \] 毎日の新規\n/);
  assert.match(await read(root, file), /- \[ \] 毎日の新規\n/);
  // 同じ名前をもう一度追加しても二重にならない
  await V.saveItem(root, TODAY, { to: 'routine', text: '毎日の新規', repeat: { type: 'daily' }, section: 'G' });
  assert.equal((await read(root, file)).match(/毎日の新規/g).length, 1);

  // 月曜だけ: 今日(火)は出ず、テンプレートにだけ入る
  r = await V.saveItem(root, TODAY, { to: 'routine', text: '月曜の新規', repeat: { type: 'weekly', days: [1] } });
  assert.equal(r.later, true);
  assert.doesNotMatch(await read(root, file), /月曜の新規/);
  assert.match(await read(root, 'Templates/Daily.md'), /月曜の新規 🔁 every week on Monday/);

  // タスク → ルーティン: 元の行は消え、テンプレートに入る
  const added = await V.add(root, TODAY, { text: '変換する', scheduled: TODAY, due: TODAY });
  let t = (await V.buildState(root, TODAY)).tasks.find((x) => x.text === '変換する');
  await V.saveItem(root, TODAY, { from: 'task', to: 'routine', ref: { file, line: t.line, raw: t.raw }, text: '変換する', repeat: { type: 'weekday' } });
  const s1 = await V.buildState(root, TODAY);
  assert.equal(s1.tasks.find((x) => x.text === '変換する'), undefined);
  assert.equal(s1.routine.flatMap((g) => g.items).find((x) => x.text === '変換する').repeat.type, 'weekday');
  assert.ok(added.raw);

  // ルーティン → タスク: テンプレートの定義も消える
  const rt = s1.routine.flatMap((g) => g.items).find((x) => x.text === '既存');
  await V.saveItem(root, TODAY, { from: 'routine', to: 'task', ref: { file, line: rt.line, raw: rt.raw }, text: '既存', scheduled: TODAY, due: TODAY });
  const s2 = await V.buildState(root, TODAY);
  assert.ok(s2.tasks.some((x) => x.text === '既存'));
  assert.equal(s2.routine.flatMap((g) => g.items).some((x) => x.text === '既存'), false);
  assert.doesNotMatch(await read(root, 'Templates/Daily.md'), /- \[ \] 既存/);
});

test('parseTasks: メモはタスク直下のインデント行。空行・チェックボックス・フェンス・浅いインデントで終わる', () => {
  const src = [
    '## 今日のタスク',
    '- [ ] A',
    '  一行目',
    '  - 箇条書きも',
    '    - 入れ子',
    '',
    '  空行のあとはメモではない',
    '- [ ] B',
    '  b のメモ',
    '  - [ ] 子タスク',
    '    子のメモ',
    '- [ ] C',
    '  c のメモ',
    '```',
    '  - [ ] フェンス内は無視',
    '```',
    '- [ ] D',
    '浅い行はメモではない',
    '1. [ ] 番号付き',
    '   番号のメモ',
  ].join('\n');
  const t = V.parseTasks(src, 'Daily/2026-10-06.md', TODAY);
  assert.deepEqual(t.map((x) => [x.text, x.memo]), [
    ['A', '一行目\n- 箇条書きも\n  - 入れ子'],
    ['B', 'b のメモ'],
    ['子タスク', '子のメモ'],
    ['C', 'c のメモ'],
    ['D', undefined],
    ['番号付き', '番号のメモ'],
  ]);
});

test('メモ: 追加・編集・消去。チェックボックス/フェンス風の行は逃がして別物にしない', async () => {
  const root = await vault();
  const { file } = await V.add(root, TODAY, { text: 'メモ付き', scheduled: TODAY, due: TODAY, memo: '手順1\n\n- 資料A\n- [ ] 買う\n```js\nx\n```' });
  const lines = (await read(root, file)).split('\n');
  const i = lines.indexOf('- [ ] メモ付き ⏳ 2026-10-06 📅 2026-10-06');
  assert.deepEqual(lines.slice(i + 1, i + 7), ['  手順1', '  - 資料A', '  - \\[ ] 買う', '  \\```js', '  x', '  \\```']); // 空行は詰まる
  let s = await V.buildState(root, TODAY);
  assert.equal(s.tasks.length, 1); // 「買う」が別タスクにならず、フェンスが後続を飲み込まない
  assert.equal(s.tasks[0].memo, '手順1\n- 資料A\n- [ ] 買う\n```js\nx\n```'); // 画面には元の形で戻る

  const ref = (t) => ({ file, line: t.line, raw: t.raw });
  let t = s.tasks[0];
  assert.equal((await V.edit(root, ref(t), { text: 'メモ付き', memo: '新しいメモ\n二行目' })).raw, t.raw);
  t = (await V.buildState(root, TODAY)).tasks[0];
  assert.equal(t.memo, '新しいメモ\n二行目');
  assert.doesNotMatch(await read(root, file), /資料A/); // 古いメモ行は残らない

  await V.edit(root, ref(t), { text: 'メモ付き v2' }); // memo 未指定 = そのまま
  t = (await V.buildState(root, TODAY)).tasks[0];
  assert.deepEqual([t.text, t.memo], ['メモ付き v2', '新しいメモ\n二行目']);

  await V.edit(root, ref(t), { text: 'メモ付き v2', memo: Array.from({ length: 80 }, (_, k) => `l${k}`).join('\n') });
  t = (await V.buildState(root, TODAY)).tasks[0];
  assert.equal(t.memo.split('\n').length, 80); // 長いメモも黙って切り詰めない

  await V.edit(root, ref(t), { text: 'メモ付き v2', memo: '' }); // '' = 消す
  s = await V.buildState(root, TODAY);
  assert.equal(s.tasks[0].memo, undefined);
  assert.doesNotMatch(await read(root, file), /l0|二行目/);
  await assert.rejects(V.add(root, TODAY, { text: 'x', scheduled: TODAY, memo: { a: 1 } }), V.BadInput);
});

test('メモ: 完了・セクション移動・Inbox 移動・繰り返しでタスクと一緒に運ばれる', async () => {
  const tpl = '## 今日のタスク\n### 仕事\n### 私用\n\n## ルーティン\n\n## メモ\n';
  const root = await vault({ 'Templates/Daily.md': tpl, 'Inbox.md': '# Inbox\n- [ ] 週報 🔁 every week 📅 2026-10-06\n  週報のメモ\n' });
  const file = await V.ensureDaily(root, TODAY);
  await V.add(root, TODAY, { text: '仕事の件', scheduled: TODAY, section: '仕事', memo: 'a\nb' });
  await V.add(root, TODAY, { text: '私用の件', scheduled: TODAY, section: '私用', memo: 'c' });
  const find = async (text) => (await V.buildState(root, TODAY)).tasks.find((x) => x.text === text);

  let t = await find('仕事の件');
  await V.toggle(root, TODAY, { file, line: t.line, raw: t.raw }); // 完了してもメモはそのまま
  t = await find('仕事の件');
  assert.deepEqual([t.done, t.memo], [true, 'a\nb']);

  await V.edit(root, { file, line: t.line, raw: t.raw }, { text: '仕事の件', section: '私用' }); // 別セクションへ: メモも付いてくる
  const note = (await read(root, file)).split('\n');
  const a = note.findIndex((l) => l.startsWith('- [x] 仕事の件'));
  assert.deepEqual(note.slice(a, a + 3), [note[a], '  a', '  b']);
  assert.ok(a > note.indexOf('  c')); // 私用の件とそのメモの後ろ
  assert.equal(note.filter((l) => l === '  a').length, 1);

  t = await find('私用の件'); // 日付を両方消す → Inbox へ。メモも一緒
  assert.equal((await V.edit(root, { file, line: t.line, raw: t.raw }, { text: '私用の件', scheduled: '', due: '' })).moved, 'Inbox.md');
  assert.match(await read(root, 'Inbox.md'), /- \[ \] 私用の件\n  c\n/);
  assert.doesNotMatch(await read(root, file), /私用の件|\n {2}c\n/);

  const res = await V.toggle(root, TODAY, { file: 'Inbox.md', line: 1, raw: '- [ ] 週報 🔁 every week 📅 2026-10-06' }); // 繰り返し: 次回分へメモも引き継ぐ
  assert.equal(res.next, '2026-10-13');
  assert.deepEqual((await read(root, 'Inbox.md')).split('\n').slice(1, 5), [
    '- [ ] 週報 🔁 every week 📅 2026-10-13',
    '  週報のメモ',
    '- [x] 週報 🔁 every week 📅 2026-10-06 ✅ 2026-10-06',
    '  週報のメモ',
  ]);
});

test('メモ: ルーティンはテンプレートと今日のノートの両方に書かれ、該当しない日は行ごと落ち、変換でも引き継ぐ', async () => {
  const tpl = '## 今日のタスク\n\n## ルーティン\n### G\n- [ ] 毎日\n  毎日のメモ\n- [ ] 月曜だけ 🔁 every week on Monday\n  月曜のメモ\n- [ ] 平日 🔁 every weekday\n';
  const root = await vault({ 'Templates/Daily.md': tpl });
  const file = await V.ensureDaily(root, TODAY); // 火曜
  const note = await read(root, file);
  assert.match(note, /- \[ \] 毎日\n  毎日のメモ\n/);
  assert.doesNotMatch(note, /月曜/); // メモごと落ちる (前の項目に付いてしまわない)
  assert.match(note, /- \[ \] 平日\n/);

  let items = (await V.buildState(root, TODAY)).routine.flatMap((g) => g.items);
  const daily = items.find((x) => x.text === '毎日');
  assert.equal(daily.memo, '毎日のメモ');
  await V.editRoutine(root, { file, line: daily.line, raw: daily.raw, kind: 'routine' }, { text: '毎日', memo: '更新\n二行目' });
  assert.match(await read(root, 'Templates/Daily.md'), /- \[ \] 毎日\n  更新\n  二行目\n- \[ \] 月曜だけ/); // テンプレートも更新 → 明日以降に効く
  assert.match(await read(root, file), /- \[ \] 毎日\n  更新\n  二行目\n/);
  assert.match(await read(root, await V.ensureDaily(root, '2026-10-07')), /- \[ \] 毎日\n  更新\n  二行目\n/);

  items = (await V.buildState(root, TODAY)).routine.flatMap((g) => g.items); // ルーティン → タスク: メモは引き継ぎ、テンプレートからはメモごと消える
  const d = items.find((x) => x.text === '毎日');
  await V.saveItem(root, TODAY, { from: 'routine', to: 'task', ref: { file, line: d.line, raw: d.raw }, text: '毎日', scheduled: TODAY, due: TODAY });
  let s = await V.buildState(root, TODAY);
  assert.equal(s.tasks.find((x) => x.text === '毎日').memo, '更新\n二行目');
  assert.equal(s.routine.flatMap((g) => g.items).some((x) => x.text === '毎日'), false);
  assert.doesNotMatch(await read(root, 'Templates/Daily.md'), /毎日|更新/);
  assert.equal((await read(root, file)).match(/更新/g).length, 1); // 元のルーティン行のメモは残らない

  const t = s.tasks.find((x) => x.text === '毎日'); // タスク → ルーティン: メモも一緒にテンプレートへ
  await V.saveItem(root, TODAY, { from: 'task', to: 'routine', ref: { file, line: t.line, raw: t.raw }, text: '毎日', repeat: { type: 'daily' } });
  assert.match(await read(root, 'Templates/Daily.md'), /- \[ \] 毎日\n  更新\n  二行目\n/);
  s = await V.buildState(root, TODAY);
  assert.equal(s.routine.flatMap((g) => g.items).find((x) => x.text === '毎日').memo, '更新\n二行目');
  assert.equal(s.tasks.some((x) => x.text === '毎日'), false);
  assert.equal((await read(root, file)).match(/更新/g).length, 1);
});

test('同じファイルへの同時操作は順番に処理され、更新が消えない / UTF-8 でないノートは触らない', async () => {
  const root = await vault();
  for (const n of ['a', 'b', 'c']) await V.add(root, TODAY, { text: n, scheduled: TODAY });
  const ts = (await V.buildState(root, TODAY)).tasks;
  const res = await Promise.allSettled(ts.map((t) => V.toggle(root, TODAY, { file: t.file, line: t.line, raw: t.raw })));
  assert.deepEqual(res.map((r) => r.status), ['fulfilled', 'fulfilled', 'fulfilled']);
  assert.equal((await V.buildState(root, TODAY)).tasks.filter((t) => t.done).length, 3);
  assert.deepEqual((await fs.readdir(root + '/Daily')).filter((n) => n.startsWith('.')), []); // temp が残らない

  const sjis = Buffer.concat([Buffer.from('# Inbox\n- [ ] '), Buffer.from([0x93, 0xfa, 0x96, 0x7b]), Buffer.from('\n')]); // Shift_JIS の「日本」
  await fs.writeFile(path.join(root, 'Inbox.md'), sjis);
  await assert.rejects(V.toggle(root, TODAY, { file: 'Inbox.md', line: 1, raw: '- [ ] x' }), V.BadInput);
  assert.deepEqual(await fs.readFile(path.join(root, 'Inbox.md')), sjis); // 1バイトも変わらない
});

test('入れ子の項目: セクション移動・Inbox 移動・テンプレートからの除外でも、親と一緒に動く', async () => {
  const tpl = '## 今日のタスク\n### 仕事\n### 私用\n\n## ルーティン\n### G\n- [ ] 親ルーティン 🔁 every week on Monday\n  - [ ] 子1\n  - [ ] 子2\n- [ ] 毎日\n';
  const root = await vault({ 'Templates/Daily.md': tpl });
  const file = await V.ensureDaily(root, TODAY); // 火曜: 月曜だけの親は、入れ子の子ごと落ちる
  assert.doesNotMatch(await read(root, file), /親ルーティン|子1|子2/);
  assert.match(await read(root, file), /- \[ \] 毎日/);
  assert.match(await read(root, await V.ensureDaily(root, '2026-10-12')), /親ルーティン\n  - \[ \] 子1\n  - \[ \] 子2/); // 月曜は子も出る

  await V.add(root, TODAY, { text: '親', scheduled: TODAY, section: '仕事' });
  await fs.writeFile(path.join(root, file), (await read(root, file)).replace('- [ ] 親 ⏳ 2026-10-06\n', '- [ ] 親 ⏳ 2026-10-06\n  メモ行\n  - [ ] 子A\n    - 孫\n'));
  const find = async () => (await V.buildState(root, TODAY)).tasks.find((x) => x.text === '親');
  let p = await find();
  await V.edit(root, { file, line: p.line, raw: p.raw }, { text: '親', section: '私用' });
  const lines = (await read(root, file)).split('\n');
  const i = lines.findIndex((l) => l.startsWith('- [ ] 親'));
  assert.deepEqual(lines.slice(i, i + 4), [lines[i], '  メモ行', '  - [ ] 子A', '    - 孫']);
  assert.ok(i > lines.indexOf('### 私用'));
  assert.equal(lines.filter((l) => l.includes('子A')).length, 1);

  p = await find(); // 日付を両方消すと Inbox へ。メモも入れ子も一緒
  assert.equal((await V.edit(root, { file, line: p.line, raw: p.raw }, { text: '親', scheduled: '', due: '' })).moved, 'Inbox.md');
  assert.match(await read(root, 'Inbox.md'), /- \[ \] 親\n  メモ行\n  - \[ \] 子A\n    - 孫\n/);
  assert.doesNotMatch(await read(root, file), /子A|メモ行|孫/);
});

test('繰り返し(日次ノート): 📅 だけの行は次回分に ⏳ を付け、毎日「今日」に出ない', async () => {
  const root = await vault({ 'Daily/2026-10-06.md': '## 今日のタスク\n- [ ] 週報 🔁 every week 📅 2026-10-06\n' });
  const res = await V.toggle(root, TODAY, { file: 'Daily/2026-10-06.md', line: 1, raw: '- [ ] 週報 🔁 every week 📅 2026-10-06' });
  assert.equal(res.next, '2026-10-13');
  const s = await V.buildState(root, TODAY);
  assert.deepEqual(s.upcoming.map((t) => [t.text, t.scheduled]), [['週報', '2026-10-13']]);
});

test('履歴: 先送り (⏳ がその日より後) の行は、その日の分母に入れない', async () => {
  const root = await vault({ 'Daily/2026-10-05.md': '## 今日のタスク\n- [x] 済み ✅ 2026-10-05\n- [ ] 先送り ⏳ 2026-10-06\n## ルーティン\n- [x] 朝会\n' });
  assert.deepEqual((await V.buildState(root, TODAY)).history['2026-10-05'], [2, 2]);
});

test('見出し: 末尾の # は、空白で区切られた閉じ記号のときだけ外す', async () => {
  const t = V.parseTasks('## ルーティン\n### C#\n- [ ] a\n### Title ##\n- [ ] b\n', 'Templates/Daily.md');
  assert.deepEqual(t.map((x) => x.group), ['C#', 'Title']);
  const root = await vault({ 'Templates/Daily.md': '## 今日のタスク\n\n## ルーティン\n### C#\n- [ ] a\n' });
  await V.sectionOp(root, TODAY, { panel: 'routine', op: 'add', name: 'C#' }); // 既にあるので増えない
  assert.equal((await read(root, 'Templates/Daily.md')).match(/### C#/g).length, 1);
});

test('ルーティンの削除: 今日の行とテンプレートの定義が消え、明日以降に出ず、過去の日は残る', async () => {
  const tpl = '## 今日のタスク\n\n## ルーティン\n### G\n- [ ] 消す\n  メモ\n  - [ ] 入れ子\n- [ ] 残す\n';
  const root = await vault({ 'Templates/Daily.md': tpl, 'Daily/2026-10-05.md': '## ルーティン\n### G\n- [x] 消す ✅ 2026-10-05\n- [ ] 残す\n' });
  const file = await V.ensureDaily(root, TODAY);
  const find = async (text) => (await V.buildState(root, TODAY)).routine.flatMap((g) => g.items).find((x) => x.text === text);
  const t = await find('消す');
  assert.equal(t.memo, 'メモ');
  await V.deleteRoutine(root, { file, line: t.line, raw: t.raw, kind: 'routine' });
  assert.doesNotMatch(await read(root, file), /消す|メモ|入れ子/); // 今日: 行・メモ・入れ子が消える ([-] も残さない)
  assert.doesNotMatch(await read(root, 'Templates/Daily.md'), /消す|メモ|入れ子/);
  assert.match(await read(root, 'Templates/Daily.md'), /- \[ \] 残す/);
  assert.match(await read(root, file), /- \[ \] 残す/);
  assert.doesNotMatch(await read(root, await V.ensureDaily(root, '2026-10-07')), /消す/); // 明日以降は出ない
  assert.match(await read(root, 'Daily/2026-10-05.md'), /- \[x\] 消す ✅ 2026-10-05/); // 過去の日は残る

  // テンプレートに無い今日だけの項目: 今日の行だけ消え、テンプレートは変わらない
  await fs.appendFile(path.join(root, file), '- [ ] 臨時\n');
  const tpl0 = await read(root, 'Templates/Daily.md');
  const tmp = await find('臨時');
  await V.deleteRoutine(root, { file, line: tmp.line, raw: tmp.raw, kind: 'routine' });
  assert.doesNotMatch(await read(root, file), /臨時/);
  assert.equal(await read(root, 'Templates/Daily.md'), tpl0);

  const keep = await find('残す'); // ルーティンでない指定・日次ノート以外は拒否
  await assert.rejects(V.deleteRoutine(root, { file, line: keep.line, raw: keep.raw, kind: 'task' }), V.BadInput);
  await assert.rejects(V.deleteRoutine(root, { file: 'Inbox.md', line: 0, raw: '- [ ] x', kind: 'routine' }), V.BadInput);
});

test('ルーティンの終了日: until で期限が付き、その日を含み、過ぎると出ない', async () => {
  assert.deepEqual(V.parseRule('every day until 2026-10-09'), { type: 'daily', until: '2026-10-09' });
  assert.deepEqual(V.parseRule('every weekday until 2026-10-09'), { type: 'weekday', until: '2026-10-09' });
  assert.deepEqual(V.parseRule('every week on Monday, Friday until 2026-10-30'), { type: 'weekly', days: [1, 5], until: '2026-10-30' });
  assert.equal(V.parseRule('every day until 2026-13-40'), null);
  assert.equal(V.parseRule('every 2 weeks until 2026-10-09'), null);
  assert.equal(V.formatRule({ type: 'daily', until: '2026-10-09' }), 'every day until 2026-10-09');
  assert.equal(V.formatRule({ type: 'weekday', until: '2026-10-09' }), 'every weekday until 2026-10-09');
  assert.equal(V.formatRule({ type: 'daily' }), ''); // 終了日が無い毎日は、今までどおり何も付けない
  assert.equal(V.ruleMatches({ type: 'daily', until: '2026-10-09' }, '2026-10-09'), true); // その日を含む
  assert.equal(V.ruleMatches({ type: 'daily', until: '2026-10-09' }, '2026-10-10'), false);

  const root = await vault({ 'Templates/Daily.md': '## 今日のタスク\n\n## ルーティン\n### G\n- [ ] 掃除\n- [ ] 毎日\n' });
  const file = await V.ensureDaily(root, TODAY);
  const items = async () => (await V.buildState(root, TODAY)).routine.flatMap((g) => g.items);
  const t = (await items()).find((x) => x.text === '掃除');
  await V.saveItem(root, TODAY, { from: 'routine', to: 'routine', ref: { file, line: t.line, raw: t.raw }, text: '11:00-12:00 掃除', repeat: { type: 'daily', until: '2026-10-09' } });
  assert.match(await read(root, 'Templates/Daily.md'), /- \[ \] 11:00-12:00 掃除 🔁 every day until 2026-10-09\n/);
  const item = (await items()).find((x) => x.text === '11:00-12:00 掃除');
  assert.deepEqual(item.repeat, { type: 'daily', until: '2026-10-09' });
  assert.deepEqual(item.time, { start: '11:00', end: '12:00' });
  assert.deepEqual((await V.buildState(root, TODAY)).timeline.map((x) => x.text), ['11:00-12:00 掃除']); // Day line に出る
  assert.match(await read(root, await V.ensureDaily(root, '2026-10-09')), /11:00-12:00 掃除/); // 最終日 (金) は出る
  const sat = await read(root, await V.ensureDaily(root, '2026-10-10'));
  assert.doesNotMatch(sat, /掃除/); // 土曜からは出ない
  assert.match(sat, /- \[ \] 毎日/); // ほかの項目は影響なし

  // 終了日を外す = 続く。不正な日付は拒否
  await V.saveItem(root, TODAY, { from: 'routine', to: 'routine', ref: { file, line: item.line, raw: item.raw }, text: '11:00-12:00 掃除', repeat: { type: 'daily' } });
  assert.match(await read(root, 'Templates/Daily.md'), /- \[ \] 11:00-12:00 掃除\n/);
  await assert.rejects(V.saveItem(root, TODAY, { to: 'routine', text: 'x', repeat: { type: 'daily', until: '2026/10/09' } }), V.BadInput);
});

test('routines accept a start, an end only (〜), both, or no time; only a reversed range is rejected', async () => {
  const root = await vault({ [`Daily/${TODAY}.md`]: '## 今日のタスク\n## ルーティン\n', 'Templates/Daily.md': '## ルーティン\n' });
  for (const text of ['09:00 start only', '〜12:00 end only', '09:00-10:30 both', 'no time at all']) await V.addRoutine(root, TODAY, { text, repeat: { type: 'daily' } });
  await assert.rejects(V.addRoutine(root, TODAY, { text: '10:00-09:00 reversed', repeat: { type: 'daily' } }), (e) => e instanceof V.BadInput && /end before start/.test(e.message));
  const items = (await V.buildState(root, TODAY)).routine.flatMap((g) => g.items);
  assert.deepEqual(items.map((x) => [x.text, x.time?.start ?? null, x.time?.end ?? null]).sort(), [['09:00 start only', '09:00', null], ['09:00-10:30 both', '09:00', '10:30'], ['no time at all', null, null], ['〜12:00 end only', null, '12:00']].sort());
});

test('leadTime moves the first time token to the front and leaves other text alone', () => {
  assert.equal(V.leadTime('약 먹기 〜13:00'), '〜13:00 약 먹기');
  assert.equal(V.leadTime('회의 10:00-11:00 준비'), '10:00-11:00 회의 준비');
  assert.equal(V.leadTime('14:00 already first'), '14:00 already first');
  assert.equal(V.leadTime('no time here'), 'no time here');
  assert.equal(V.leadTime('see http://a/b:80 later'), 'see http://a/b:80 later');
});

test('template なしの既存フォルダに接続しても、他人の例の routine は作られない (空のテンプレートで始まる)', async () => {
  const root = await vault(); // Templates/Daily.md が無い、ふつうの既存フォルダ
  const rel = await V.ensureDaily(root, TODAY);
  const note = await read(root, rel);
  assert.deepEqual(note.split('\n').filter((l) => /^\s*[-*+]\s+\[.\]/.test(l)), []); // チェックボックスは 1 つも無い
  for (const personal of ['GPS(KPI', '18期1Q', 'Sprint', 'オフィス掃除', 'ウォーターサーバー', 'コア業務']) assert.ok(!note.includes(personal), personal);
  await V.addRoutine(root, TODAY, { text: '朝ストレッチ', repeat: { type: 'daily' } }); // 初めての routine で Templates/Daily.md が作られる
  const tpl = await read(root, 'Templates/Daily.md');
  assert.deepEqual(tpl.split('\n').filter((l) => /^\s*[-*+]\s+\[.\]/.test(l)), ['- [ ] 朝ストレッチ']); // 本人が足した 1 件だけ (毎日は 🔁 を付けずに保存される)
  for (const personal of ['GPS(KPI', '18期1Q', 'Sprint', 'オフィス掃除', 'ウォーターサーバー', 'コア業務']) assert.ok(!tpl.includes(personal), personal);
});
