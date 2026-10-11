// 一時 vault の組み立てと読み出し。テストはここの一時 vault だけを使い、実際の vault (~/TASK-Manager) には絶対に触れない。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as V from '../../../lib/vault.js';

export class Vault {
  constructor(root) {
    const real = path.join(os.homedir(), 'TASK-Manager');
    const tmp = fs.realpathSync(os.tmpdir());
    if (!(fs.realpathSync(root) === tmp || fs.realpathSync(root).startsWith(tmp + path.sep)) || path.resolve(root) === real) throw new Error(`一時 vault 以外は使えません: ${root}`);
    this.root = root;
    // 書き換えると、サーバの監視 (fs.watch → SSE) が少し遅れて「変更あり」を送り、開いているページは作り直される。
    // dirty = まだその通知を待っていない書き込みがある。settle は fixtures.js がサーバにつないで差し込む (待つ: 通知が来て、静かになるまで)
    this.dirty = false;
    this.settle = async () => {};
  }

  get today() {
    return V.localDate();
  }

  day(n) {
    const d = new Date(`${this.today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  write(rel, body) {
    fs.mkdirSync(path.dirname(path.join(this.root, rel)), { recursive: true });
    fs.writeFileSync(path.join(this.root, rel), body);
    this.dirty = true;
  }

  read(rel) {
    return fs.readFileSync(path.join(this.root, rel), 'utf8');
  }

  exists(rel) { return fs.existsSync(path.join(this.root, rel)); }

  note(date = this.today) {
    return this.read(`Daily/${date}.md`);
  }

  template() {
    return this.read('Templates/Daily.md');
  }

  inbox() {
    return this.read('Inbox.md');
  }

  // Obsidian 側の編集に相当 (サーバの watcher → SSE で画面に届く)
  editNote(fn, date = this.today) {
    this.write(`Daily/${date}.md`, fn(this.note(date)));
  }

  // その日のノートをテンプレートから作る (未来の日の見え方を確かめるとき)
  async ensureDaily(date) {
    const file = await V.ensureDaily(this.root, date);
    this.dirty = true;
    return this.read(file);
  }

  // 毎テストの前に初期状態へ戻す。日付は今日からの相対 (いつ実行しても同じ構成になる)
  reset() {
    for (const dir of ['Write', 'Set', '.dayline', '.test-home']) fs.rmSync(path.join(this.root, dir), { recursive: true, force: true });
    const T = this.today;
    this.write('Templates/Daily.md', '---\ndate: {{date}}\ntags: [daily]\n---\n\n## 今日のタスク\n### 仕事\n\n## ルーティン\n### G\n- [ ] 朝会\n- [ ] 日報\n- [ ] GPS(KPI・KGI)の明確化\n- [ ] 掃除\n\n## メモ\n\n');
    this.write(`Daily/${T}.md`, [
      '---', `date: ${T}`, 'tags: [daily]', '---', '',
      '## 今日のタスク',
      `- [ ] 10:00-10:30 時刻付きのタスク ⏳ ${T} 📅 ${T}`,
      `- [ ] メモ付きのタスク ⏫ ⏳ ${T} 📅 ${T}`,
      '  一行目のメモ', '  二行目のメモ https://example.com/very/long/url/that/should/be/truncated/in/the/list', '  三行目のメモ', '  四行目 (一覧では非表示)', '  五行目 (一覧では非表示)',
      `- [ ] とても長いタイトルのタスクで二行以上に折り返すことを確認するための文章です。ここまで長ければ確実に折り返すはずですよね、たぶん。 ⏳ ${T}`, '  メモあり',
      `- [ ] 折り返さない短いタイトル ⏳ ${T}`,
      `- [x] 完了済みのタスク \`code\` 付き ✅ ${T}`, '  完了のメモ',
      '### 仕事', '',
      '## ルーティン', '### G', '- [ ] 朝会', '  ルーティンのメモ', '- [ ] 日報', '- [ ] GPS(KPI・KGI)の明確化', '- [ ] 掃除', '',
      '## メモ', '', '',
    ].join('\n'));
    this.write(`Daily/${this.day(-1)}.md`, `## ルーティン\n### G\n- [x] GPS(KPI・KGI)の明確化 ✅ ${this.day(-1)}\n- [x] 掃除 ✅ ${this.day(-1)}\n`);
    this.write('Inbox.md', `# Inbox\n\n- [ ] いつかやる\n  Inbox のメモ\n- [ ] 明日の件 ⏳ ${this.day(1)}\n- [ ] 明後日の件 ⏳ ${this.day(2)}\n- [ ] 来週の準備 ⏳ ${this.day(6)}\n  来週のメモ\n- [ ] 10日先の件 ⏳ ${this.day(10)}\n`);
    for (const f of fs.readdirSync(path.join(this.root, 'Daily'))) if (f !== `${T}.md` && f !== `${this.day(-1)}.md`) fs.rmSync(path.join(this.root, 'Daily', f)); // 前のテストが作った未来のノートを消す
  }
}
