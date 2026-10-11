// API キーの置き場。vault の外 (~/.dayline/secrets.json、本人だけが読める 0600) に置く。vault は同期・共有されうるので、キーを入れない。
// 画面には「保存済みか・どこから来たか・末尾 4 文字」だけを返す。キーそのものは、サーバが AI を呼ぶ瞬間にだけ使う。
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BadInput, exclusive } from './vault.js';

// 環境変数 DAYLINE_HOME で置き場を変えられる (テストは一時フォルダを指す)
export const home = () => path.resolve(process.env.DAYLINE_HOME || path.join(os.homedir(), '.dayline'));
const file = () => path.join(home(), 'secrets.json');

// 保存したキーが無いとき、環境変数を使う
const ENV = { anthropic: ['ANTHROPIC_API_KEY'], openai: ['OPENAI_API_KEY'], gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], deepseek: ['DEEPSEEK_API_KEY'], custom: [] };
const KEY = /^[\x21-\x7e]{1,400}$/; // 印字できる ASCII だけ (空白・改行を含まない = ヘッダに差し込めない)

async function load() {
  try {
    const data = JSON.parse(await fs.readFile(file(), 'utf8'));
    return data && typeof data.keys === 'object' && data.keys ? data.keys : {};
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    return {}; // 壊れていたら、無いものとして扱う (次に保存するとき作り直す)
  }
}

export async function getKey(provider) {
  const stored = (await load())[provider];
  if (typeof stored === 'string' && stored) return { key: stored, source: 'file' };
  for (const name of ENV[provider] ?? []) if (process.env[name]) return { key: process.env[name], source: 'env' };
  return { key: '', source: null };
}

// 画面に出してよい情報だけ
export async function keyInfo(provider) {
  const { key, source } = await getKey(provider);
  return { hasKey: !!key, source, hint: key.length > 4 ? `…${key.slice(-4)}` : '' };
}

export async function setKey(provider, key) {
  if (!Object.hasOwn(ENV, provider)) throw new BadInput('bad provider');
  const clear = key === '';
  if (!clear && (typeof key !== 'string' || !KEY.test(key))) throw new BadInput('bad key');
  return exclusive(file(), async () => {
    const keys = await load();
    if (clear) delete keys[provider];
    else keys[provider] = key;
    await fs.mkdir(home(), { recursive: true, mode: 0o700 });
    const tmp = path.join(home(), `.secrets.${process.pid}.${randomUUID().slice(0, 8)}.tmp`);
    await fs.writeFile(tmp, `${JSON.stringify({ keys }, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(tmp, file());
    await fs.chmod(file(), 0o600);
  });
}
