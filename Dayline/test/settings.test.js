// 設定 (Set/Settings.md) と API キーの置き場。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as V from '../lib/vault.js';
import { AiError, organize } from '../lib/ai.js';
import { SETTINGS_FILE, defaults, parse, readSettings, updateSettings, validatePatch } from '../lib/settings.js';
import { getKey, keyInfo, setKey } from '../lib/secrets.js';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'dl-set-'));
const rejects = (patch, re) => assert.throws(() => validatePatch(patch), (e) => e instanceof V.BadInput && re.test(e.message), JSON.stringify(patch));

test('defaults: タイムゾーンから国を推し、その国の平均の日の出・日の入りが入る', () => {
  const jp = defaults('Asia/Tokyo');
  assert.deepEqual(jp.auto, { enabled: false, country: 'JP', sunrise: '05:35', sunset: '17:45' });
  assert.deepEqual(jp.appearance, { light: { background: 'white', accent: 'amber' }, dark: { background: 'black', accent: 'violet' } });
  assert.equal(jp.ai.provider, 'anthropic');
  assert.equal(jp.ai.consent, false);
  const other = defaults('Africa/Nairobi');
  assert.deepEqual(other.auto, { enabled: false, country: '', sunrise: '06:00', sunset: '18:00' });
});

test('validatePatch: 正しい部分更新は通り、知らない項目・不正な値は BadInput', () => {
  const ok = { appearance: { dark: { accent: 'teal', background: 'midnight' } }, auto: { enabled: true, country: 'KR', sunrise: '06:25', sunset: '18:35' }, ai: { provider: 'openai', models: { openai: 'gpt-4.1-mini' }, baseUrls: { custom: 'http://localhost:11434/v1/' }, consent: true } };
  assert.equal(validatePatch(ok).ai.baseUrls.custom, 'http://localhost:11434/v1'); // 末尾の / は取る
  rejects({ extra: 1 }, /unknown key extra/);
  rejects({ appearance: { sepia: {} } }, /unknown key sepia/);
  rejects({ appearance: { dark: { accent: 'orange' } } }, /appearance\.dark\.accent/); // ダークに無い色
  rejects({ appearance: { light: { background: 'midnight' } } }, /appearance\.light\.background/); // モードに合わない背景
  rejects({ appearance: { dark: { accent: 'constructor' } } }, /appearance\.dark\.accent/);
  rejects({ auto: { sunrise: '6:00' } }, /auto\.sunrise/);
  rejects({ auto: { sunset: '24:00' } }, /auto\.sunset/);
  rejects({ auto: { enabled: 'yes' } }, /auto\.enabled/);
  rejects({ auto: { country: 'XX' } }, /auto\.country/);
  rejects({ ai: { provider: 'bing' } }, /ai\.provider/);
  rejects({ ai: { models: { openai: 'gpt 4 with spaces' } } }, /ai\.models\.openai/);
  rejects({ ai: { models: { openai: 'x'.repeat(101) } } }, /ai\.models\.openai/);
  rejects({ ai: { models: { bing: 'x' } } }, /unknown key bing/);
  rejects({ ai: { baseUrls: { custom: 'javascript:alert(1)' } } }, /http\(s\) only/);
  rejects({ ai: { baseUrls: { custom: 'ftp://example.com' } } }, /http\(s\) only/);
  rejects({ ai: { baseUrls: { custom: 'https://user:pass@example.com' } } }, /credentials/);
  rejects({ ai: { baseUrls: { custom: 'not a url' } } }, /not a URL/);
  rejects({ ai: { consent: 1 } }, /ai\.consent/);
  rejects(null, /object expected/);
  rejects([], /object expected/);
  rejects({ ai: 'anthropic' }, /object expected/);
});

test('updateSettings: ファイルが無ければ作り、重ねて保存し、人が書いた説明は残す。日の出と日の入りが同じなら断る', async () => {
  const root = await tmp();
  const first = await updateSettings(root, { appearance: { dark: { accent: 'blue' } } });
  assert.equal(first.appearance.dark.accent, 'blue');
  const file = path.join(root, SETTINGS_FILE);
  const text = await fs.readFile(file, 'utf8');
  assert.match(text, /^# TOODDAE settings/);
  assert.match(text, /```json\n\{[\s\S]*"accent": "blue"[\s\S]*\}\n```/);
  assert.ok(!/"(?:api[_-]?key|accessToken|refreshToken|secret)"\s*:/i.test(text), 'credential fields are never stored in settings; authModes are non-secret');
  // Obsidian で説明を足しても、json ブロック以外はそのまま
  await fs.writeFile(file, `${text}\nメモ: 夜は紫に戻したい\n`);
  const second = await updateSettings(root, { auto: { enabled: true, sunrise: '05:00', sunset: '19:00' } });
  assert.equal(second.appearance.dark.accent, 'blue'); // 前の更新が残っている
  assert.equal(second.auto.enabled, true);
  assert.match(await fs.readFile(file, 'utf8'), /メモ: 夜は紫に戻したい/);
  assert.deepEqual((await readSettings(root)).settings, second);
  await assert.rejects(updateSettings(root, { auto: { sunrise: '19:00' } }), (e) => e instanceof V.BadInput && /must differ/.test(e.message));
  assert.deepEqual((await readSettings(root)).settings, second, '断ったら何も変わらない');
});

test('updateSettings: 同時に何度呼んでも、全部の更新が残る (1 ファイルずつ順番に書く)', async () => {
  const root = await tmp();
  const patches = [
    { appearance: { light: { accent: 'violet' } } },
    { appearance: { light: { background: 'ivory' } } },
    { appearance: { dark: { accent: 'green' } } },
    { appearance: { dark: { background: 'forest' } } },
    { auto: { enabled: true } },
    { auto: { sunrise: '06:10' } },
    { ai: { provider: 'gemini' } },
    { ai: { models: { gemini: 'some-model' } } },
    { ai: { consent: true } },
  ];
  await Promise.all(patches.map((p) => updateSettings(root, p)));
  const { settings } = await readSettings(root);
  assert.equal(settings.appearance.light.accent, 'violet');
  assert.equal(settings.appearance.light.background, 'ivory');
  assert.equal(settings.appearance.dark.accent, 'green');
  assert.equal(settings.appearance.dark.background, 'forest');
  assert.equal(settings.auto.enabled, true);
  assert.equal(settings.auto.sunrise, '06:10');
  assert.deepEqual([settings.ai.provider, settings.ai.models.gemini, settings.ai.consent], ['gemini', 'some-model', true]);
});

test('parse: 壊れた json・不正な値・知らない項目があっても、動く設定を返し、直した所だけ警告する', () => {
  assert.equal(parse(null).exists, false);
  assert.deepEqual(parse('# 何もない\n').warnings, ['no json block']);
  const broken = parse('```json\n{ "appearance": \n```');
  assert.match(broken.warnings[0], /^json:/);
  assert.deepEqual(broken.settings.appearance, defaults().appearance);
  const mixed = parse('```json\n{ "version": 1, "future": true, "appearance": { "dark": { "accent": "teal", "background": "nope" } }, "auto": { "sunrise": "07:00", "sunset": "7pm", "enabled": true }, "ai": { "provider": "custom", "models": { "custom": "llama3" }, "baseUrls": { "custom": "http://localhost:11434/v1" } } }\n```');
  assert.equal(mixed.settings.appearance.dark.accent, 'teal'); // 通る値は使う
  assert.equal(mixed.settings.appearance.dark.background, 'black'); // 通らない値だけ既定
  assert.equal(mixed.settings.auto.sunrise, '07:00');
  assert.equal(mixed.settings.auto.enabled, true);
  assert.equal(mixed.settings.ai.provider, 'custom');
  assert.equal(mixed.settings.ai.models.custom, 'llama3');
  assert.deepEqual(mixed.warnings.map((w) => w.split(':')[0]), ['appearance.dark.background', 'auto.sunset']);
  // 日の出と日の入りが同じなら、2 つとも既定へ
  const same = parse('```json\n{ "auto": { "sunrise": "06:00", "sunset": "06:00" } }\n```');
  assert.equal(same.settings.auto.sunrise, defaults().auto.sunrise);
  assert.equal(same.warnings.length, 1);
});

test('CRLF のファイルは、CRLF のまま書き戻す', async () => {
  const root = await tmp();
  await fs.mkdir(path.join(root, 'Set'), { recursive: true });
  await fs.writeFile(path.join(root, SETTINGS_FILE), '# 設定\r\n\r\n```json\r\n{\r\n  "version": 1\r\n}\r\n```\r\n');
  await updateSettings(root, { ai: { consent: true } });
  const text = await fs.readFile(path.join(root, SETTINGS_FILE), 'utf8');
  assert.ok(text.includes('\r\n') && !/[^\r]\n/.test(text), '改行は CRLF だけ');
  assert.match(text, /"consent": true/);
});

test('Write/ と Set/ のノートは、タスクとして拾わない。タスクの API でも触らせない', async () => {
  const root = await tmp();
  for (const [rel, body] of Object.entries({
    'Daily/2026-10-06.md': '## 今日のタスク\n- [ ] 本物のタスク\n',
    'Write/2026-10-06.md': '- [ ] ノートの中のチェック\n',
    'Set/Settings.md': '- [ ] 設定の中のチェック\n',
  })) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), body);
  }
  const s = await V.buildState(root, '2026-10-06');
  assert.deepEqual(s.tasks.map((t) => t.text), ['本物のタスク']);
  assert.deepEqual(s.inbox, []);
  for (const file of ['Write/2026-10-06.md', 'Set/Settings.md']) {
    await assert.rejects(V.toggle(root, '2026-10-06', { file, line: 0, raw: '- [ ] x', kind: 'task' }), (e) => e instanceof V.BadInput && /not a task file/.test(e.message));
  }
});

test('secrets: 0600 で保存し、画面向けには末尾 4 文字だけを返す。環境変数は保存したキーの次に使う', async () => {
  const dir = await tmp();
  process.env.DAYLINE_HOME = dir;
  const saved = { ...process.env };
  try {
    delete process.env.ANTHROPIC_API_KEY;
    assert.deepEqual(await keyInfo('anthropic'), { hasKey: false, source: null, hint: '' });
    await setKey('anthropic', 'sk-test-aaaaaaaaaaaaaaaaaaaaabcd');
    const info = await keyInfo('anthropic');
    assert.deepEqual(info, { hasKey: true, source: 'file', hint: '…abcd' });
    assert.ok(!JSON.stringify(info).includes('sk-test'), 'キーそのものは返さない');
    const stat = await fs.stat(path.join(dir, 'secrets.json'));
    assert.equal(stat.mode & 0o777, 0o600);
    assert.equal((await fs.stat(dir)).mode & 0o777, 0o700);
    assert.equal((await getKey('anthropic')).key, 'sk-test-aaaaaaaaaaaaaaaaaaaaabcd');
    // 環境変数: 保存したキーが優先
    process.env.ANTHROPIC_API_KEY = 'env-key-9999';
    assert.equal((await getKey('anthropic')).source, 'file');
    await setKey('anthropic', '');
    assert.deepEqual(await keyInfo('anthropic'), { hasKey: true, source: 'env', hint: '…9999' });
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal((await keyInfo('anthropic')).hasKey, false);
    // 不正なキー・プロバイダ
    for (const k of ['has space', 'new\nline', 'é', 'x'.repeat(401), 5, null]) await assert.rejects(setKey('openai', k), (e) => e instanceof V.BadInput, String(k).slice(0, 10));
    await assert.rejects(setKey('bing', 'abc'), (e) => e instanceof V.BadInput);
    // 同時に別のプロバイダへ保存しても、両方残る
    await Promise.all([setKey('openai', 'sk-open-aaaa'), setKey('gemini', 'g-key-bbbb')]);
    assert.equal((await getKey('openai')).key, 'sk-open-aaaa');
    assert.equal((await getKey('gemini')).key, 'g-key-bbbb');
  } finally {
    delete process.env.DAYLINE_HOME;
    Object.assign(process.env, saved);
    if (!('ANTHROPIC_API_KEY' in saved)) delete process.env.ANTHROPIC_API_KEY;
  }
});

test('privacy destination changes reset consent, while model and effort changes keep it', async () => {
  const root = await tmp();
  await updateSettings(root, { ai: { consent: true } });
  const keep = async (patch, label) => assert.equal((await updateSettings(root, patch)).ai.consent, true, label);
  const changed = await updateSettings(root, { ai: { models: { anthropic: 'claude-opus-5-5' } } });
  assert.equal(changed.ai.consent, true, 'model is not a privacy destination');
  await keep({ ai: { efforts: { anthropic: 'high' } } }, 'effort is not a privacy destination');
  await updateSettings(root, { ai: { consent: true } });
  await keep({ ai: { models: { openai: 'gpt-4.1' } } }, '選んでいない側のモデルを変えても');
  await keep({ ai: { baseUrls: { openai: 'https://example.com/v1' } } }, '選んでいない側の接続先を変えても');
  await keep({ appearance: { dark: { accent: 'rose' } } }, '外観を変えても');
  assert.equal((await updateSettings(root, { ai: { baseUrls: { anthropic: 'https://proxy.example.com' } } })).ai.consent, false, '選んでいる接続先を変えたら外れる');
  await updateSettings(root, { ai: { consent: true } });
  assert.equal((await updateSettings(root, { ai: { provider: 'openai' } })).ai.consent, false, 'プロバイダを変えたら外れる');
  assert.equal((await updateSettings(root, { ai: { provider: 'gemini', consent: true } })).ai.consent, true, '同時に同意し直すなら、そのまま');
});

test('regression: custom destination consent survives persisted read and unrelated saves', async () => {
  const root = await tmp();
  await updateSettings(root, { ai: { provider: 'custom', baseUrls: { custom: 'http://127.0.0.1:1234/v1' }, models: { custom: 'fake' }, consent: true } });
  assert.equal((await readSettings(root)).settings.ai.consent, true);
  assert.equal((await updateSettings(root, { appearance: { dark: { accent: 'blue' } } })).ai.consent, true);
  assert.equal((await updateSettings(root, { ai: { baseUrls: { custom: 'http://127.0.0.1:1235/v1' } } })).ai.consent, false);
  for (const custom of ['https://example.com/v1?key=fake', 'https://example.com/#fake', 'http://example.com/v1']) rejects({ ai: { baseUrls: { custom } } }, /query|HTTPS/);
});

test('regression: symlinked settings cannot read or modify outside files', async () => {
  const root = await tmp(); const outside = await tmp();
  await fs.writeFile(path.join(outside, 'Settings.md'), 'FAKE outside');
  await fs.symlink(outside, path.join(root, 'Set'));
  await assert.rejects(readSettings(root), V.BadInput);
  await assert.rejects(updateSettings(root, { ai: { consent: true } }), V.BadInput);
  assert.equal(await fs.readFile(path.join(outside, 'Settings.md'), 'utf8'), 'FAKE outside');
});

test('DeepSeek defaults, strict settings roundtrip and private key storage', async () => {
  const root = await tmp(), old = process.env.DAYLINE_HOME;
  process.env.DAYLINE_HOME = path.join(root, 'private');
  try {
    assert.equal(defaults().ai.models.deepseek, 'deepseek-flash');
    assert.equal(defaults().ai.models.gemini, 'gemini-3.8-flash');
    assert.equal(defaults().ai.models.openai, 'gpt-6.1-sol');
    const vault = path.join(root, 'vault'); await fs.mkdir(vault);
    await updateSettings(vault, { ai: { provider: 'deepseek', models: { deepseek: 'deepseek-v4-pro' }, consent: true } });
    assert.equal((await readSettings(vault)).settings.ai.provider, 'deepseek');
    await setKey('deepseek', 'FAKE-DEEPSEEK-TEST');
    assert.equal((await getKey('deepseek')).key, 'FAKE-DEEPSEEK-TEST');
    assert.ok(!(await fs.readFile(path.join(vault, SETTINGS_FILE), 'utf8')).includes('FAKE-DEEPSEEK-TEST'));
  } finally { if (old === undefined) delete process.env.DAYLINE_HOME; else process.env.DAYLINE_HOME = old; await fs.rm(root, { recursive: true, force: true }); }
});

test('effort settings: defaults, provider-specific validation, merge and legacy empty model migration', async () => {
  const base = defaults();
  assert.deepEqual(base.ai.efforts, { anthropic: 'medium', openai: 'medium', gemini: 'medium', deepseek: 'high', custom: '' });
  assert.deepEqual(Object.fromEntries(['anthropic', 'openai', 'gemini', 'deepseek'].map(p => [p, base.ai.models[p]])), { anthropic: 'claude-sonnet-5-5', openai: 'gpt-6.1-sol', gemini: 'gemini-3.8-flash', deepseek: 'deepseek-flash' });
  for (const patch of [{ deepseek: 'medium' }, { gemini: 'xhigh' }, { openai: 'ultra' }, { custom: 'high' }, { anthropic: null }, { unknown: 'high' }]) rejects({ ai: { efforts: patch } }, /ai\.efforts/);
  const old = parse('```json\n' + JSON.stringify({ ai: { provider: 'openai', models: { openai: '  ', gemini: 'my-manual-gemini', custom: 'legacy-custom-model' }, consent: true } }) + '\n```');
  assert.equal(old.settings.ai.models.openai, 'gpt-6.1-sol');
  assert.equal(old.settings.ai.models.gemini, 'my-manual-gemini');
  assert.equal(old.settings.ai.models.custom, 'legacy-custom-model');
  assert.equal(old.settings.ai.efforts.deepseek, 'high'); assert.deepEqual(old.warnings, []);
  const root = await tmp();
  try {
    await updateSettings(root, { ai: { provider: 'deepseek', consent: true } });
    await updateSettings(root, { ai: { efforts: { deepseek: 'max' } } });
    const stored = (await readSettings(root)).settings;
    assert.equal(stored.ai.efforts.deepseek, 'max'); assert.equal(stored.ai.efforts.openai, 'medium');
    assert.equal(stored.ai.consent, true, 'effort change does not silently change destination consent');
    const malformed = parse('```json\n{"ai":{"efforts":{"deepseek":"medium"}}}\n```');
    assert.ok(malformed.warnings.some(w => w.includes('ai.efforts.deepseek')));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('auth modes are explicit metadata, preserve API settings, and require renewed destination consent', async () => {
  const root = await tmp();
  try {
    assert.deepEqual(defaults().ai.authModes, { anthropic: 'apikey', openai: 'apikey', gemini: 'apikey', deepseek: 'apikey', custom: 'apikey' });
    rejects({ ai: { authModes: { gemini: 'chatgpt' } } }, /ai\.authModes/);
    rejects({ ai: { authModes: { openai: 'token' } } }, /ai\.authModes/);
    await updateSettings(root, { ai: { provider: 'openai', models: { openai: 'gpt-6.1-sol' }, baseUrls: { openai: 'https://example.invalid/v1' }, consent: true } });
    await updateSettings(root, { ai: { authModes: { openai: 'chatgpt' } } });
    const next = (await readSettings(root)).settings;
    assert.equal(next.ai.consent, false); assert.equal(next.ai.models.openai, 'gpt-6.1-sol'); assert.equal(next.ai.baseUrls.openai, 'https://example.invalid/v1');
    assert.equal(next.ai.authModes.openai, 'chatgpt');
    await updateSettings(root, { ai: { authModes: { openai: 'apikey' } } });
    assert.equal((await readSettings(root)).settings.ai.baseUrls.openai, 'https://example.invalid/v1');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
