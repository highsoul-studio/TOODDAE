// 設定: vault の Set/Settings.md に、人が読める md の中の json ブロックとして置く (Obsidian Sync などで他の PC にも付いていく)。
// API キーは入れない (lib/secrets.js が vault の外に置く)。読むときは寛容 (壊れた値は既定に戻して警告)、書くときは厳格 (知らない項目・不正な値は 400)。
import fs from 'node:fs/promises';
import { BadInput, Conflict, absPath, createOnly, exclusive, readUtf8, writeIfUnchanged } from './vault.js';
import { DEFAULT_APPEARANCE, MODES, isAccent, isBackground } from '../public/presets.js';
import { PROVIDERS, PROVIDER_INFO, AUTH_MODES } from '../public/providers.js';
import { countryFromTimeZone, isCountry, sunOf } from '../public/sun.js';

export const SETTINGS_FILE = 'Set/Settings.md';
export { PROVIDERS };
export const DEFAULT_MODELS = Object.fromEntries(PROVIDERS.map(p => [p, PROVIDER_INFO[p].models[0] || '']));

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MODEL = /^[A-Za-z0-9._:/@+-]{0,100}$/;
const FENCE = /```json[^\n]*\n([\s\S]*?)\n```/;

const mapOf = (fill) => Object.fromEntries(PROVIDERS.map((p) => [p, fill(p)]));

// タイムゾーンから国を推した、まっさらな設定
export function defaults(tz = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const country = countryFromTimeZone(tz);
  const sun = sunOf(country);
  return {
    version: 1,
    appearance: structuredClone(DEFAULT_APPEARANCE),
    auto: { enabled: false, country, sunrise: sun.sunrise, sunset: sun.sunset },
    ai: { provider: 'anthropic', models: { ...DEFAULT_MODELS }, baseUrls: mapOf(() => ''), efforts: mapOf(p => PROVIDER_INFO[p].defaultEffort), authModes: mapOf(() => 'apikey'), consent: false },
  };
}

// ---------- 検査 ----------
const bad = (msg) => {
  throw new BadInput(msg);
};
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function only(obj, keys, where) {
  if (!isObj(obj)) bad(`${where}: object expected`);
  for (const k of Object.keys(obj)) if (!keys.includes(k)) bad(`${where}: unknown key ${k}`);
}
export function cleanBaseUrl(v) {
  if (typeof v !== 'string') bad('baseUrl: string expected');
  const s = v.trim();
  if (!s) return '';
  if (s.length > 200) bad('baseUrl: too long');
  let u;
  try {
    u = new URL(s);
  } catch {
    bad('baseUrl: not a URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') bad('baseUrl: http(s) only');
  if (u.username || u.password) bad('baseUrl: no credentials in the URL');
  if (u.search || u.hash) bad('baseUrl: no query or fragment');
  if (u.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) bad('baseUrl: HTTPS required except loopback');
  return s.replace(/\/+$/, '');
}

// 部分的な更新 (patch) を検査して、同じ形のまま返す。知らない項目・不正な値は BadInput
export function validatePatch(patch) {
  only(patch, ['appearance', 'auto', 'ai'], 'settings');
  const out = {};
  if (patch.appearance !== undefined) {
    only(patch.appearance, MODES, 'appearance');
    out.appearance = {};
    for (const [mode, v] of Object.entries(patch.appearance)) {
      only(v, ['background', 'accent'], `appearance.${mode}`);
      out.appearance[mode] = {};
      if (v.background !== undefined) isBackground(mode, v.background) ? (out.appearance[mode].background = v.background) : bad(`appearance.${mode}.background`);
      if (v.accent !== undefined) isAccent(mode, v.accent) ? (out.appearance[mode].accent = v.accent) : bad(`appearance.${mode}.accent`);
    }
  }
  if (patch.auto !== undefined) {
    only(patch.auto, ['enabled', 'country', 'sunrise', 'sunset'], 'auto');
    out.auto = {};
    const a = patch.auto;
    if (a.enabled !== undefined) typeof a.enabled === 'boolean' ? (out.auto.enabled = a.enabled) : bad('auto.enabled');
    if (a.country !== undefined) typeof a.country === 'string' && isCountry(a.country) ? (out.auto.country = a.country) : bad('auto.country');
    for (const k of ['sunrise', 'sunset']) if (a[k] !== undefined) typeof a[k] === 'string' && HHMM.test(a[k]) ? (out.auto[k] = a[k]) : bad(`auto.${k}`);
  }
  if (patch.ai !== undefined) {
    only(patch.ai, ['provider', 'models', 'baseUrls', 'efforts', 'authModes', 'consent'], 'ai');
    out.ai = {};
    const a = patch.ai;
    if (a.provider !== undefined) PROVIDERS.includes(a.provider) ? (out.ai.provider = a.provider) : bad('ai.provider');
    if (a.consent !== undefined) typeof a.consent === 'boolean' ? (out.ai.consent = a.consent) : bad('ai.consent');
    if (a.models !== undefined) {
      only(a.models, PROVIDERS, 'ai.models');
      out.ai.models = {};
      for (const [p, m] of Object.entries(a.models)) typeof m === 'string' && MODEL.test(m.trim()) ? (out.ai.models[p] = m.trim()) : bad(`ai.models.${p}`);
    }
    if (a.authModes !== undefined) {
      only(a.authModes, PROVIDERS, 'ai.authModes');
      out.ai.authModes = {};
      for (const [p, value] of Object.entries(a.authModes)) {
        if (!AUTH_MODES[p].includes(value)) bad(`ai.authModes.${p}`);
        out.ai.authModes[p] = value;
      }
    }
    if (a.efforts !== undefined) {
      only(a.efforts, PROVIDERS, 'ai.efforts');
      out.ai.efforts = {};
      for (const [p, value] of Object.entries(a.efforts)) {
        if (typeof value !== 'string' || !(PROVIDER_INFO[p].efforts.includes(value) || (p === 'custom' && value === ''))) bad(`ai.efforts.${p}`);
        out.ai.efforts[p] = value;
      }
    }
    if (a.baseUrls !== undefined) {
      only(a.baseUrls, PROVIDERS, 'ai.baseUrls');
      out.ai.baseUrls = {};
      for (const [p, u] of Object.entries(a.baseUrls)) out.ai.baseUrls[p] = cleanBaseUrl(u);
    }
  }
  return out;
}

// ノートの送り先 = 今選んでいるプロバイダと、その接続先。ここが変わったら、同意はもう一度取り直す
const destination = (s) => `${s.ai.provider}|${s.ai.baseUrls[s.ai.provider] || PROVIDER_INFO[s.ai.provider].baseUrl}|${s.ai.authModes[s.ai.provider]}`;

function merge(base, patch) {
  const next = structuredClone(base);
  for (const [mode, v] of Object.entries(patch.appearance ?? {})) Object.assign(next.appearance[mode], v);
  Object.assign(next.auto, patch.auto ?? {});
  const { models, baseUrls, efforts, authModes, ...rest } = patch.ai ?? {};
  Object.assign(next.ai, rest);
  Object.assign(next.ai.models, models ?? {});
  Object.assign(next.ai.baseUrls, baseUrls ?? {});
  Object.assign(next.ai.efforts, efforts ?? {});
  Object.assign(next.ai.authModes, authModes ?? {});
  if (next.auto.sunrise === next.auto.sunset) bad('auto: sunrise and sunset must differ');
  if (destination(next) !== destination(base) && patch.ai?.consent === undefined) next.ai.consent = false;
  return next;
}

export const previewSettings = (settings, patch) => merge(settings, validatePatch(patch));

// ---------- ファイル ----------
// 読む: 壊れた値は既定に戻し、理由を warnings に入れる (Obsidian で手編集されても画面は動く)
export function parse(text) {
  const base = defaults();
  const warnings = [];
  if (text == null) return { settings: base, warnings, exists: false };
  const m = text.match(FENCE);
  if (!m) return { settings: base, warnings: ['no json block'], exists: true };
  let raw;
  try {
    raw = JSON.parse(m[1]);
  } catch (e) {
    return { settings: base, warnings: [`json: ${e.message}`], exists: true };
  }
  if (!isObj(raw)) return { settings: base, warnings: ['json: object expected'], exists: true };
  let settings = base;
  // 項目ごとに 1 つずつ当てて、通らないものだけ捨てる
  const tryPatch = (patch, label) => {
    try {
      settings = merge(settings, validatePatch(patch));
    } catch (e) {
      warnings.push(`${label}: ${e.message}`);
    }
  };
  for (const mode of MODES) for (const k of ['background', 'accent']) if (raw.appearance?.[mode]?.[k] !== undefined) tryPatch({ appearance: { [mode]: { [k]: raw.appearance[mode][k] } } }, `appearance.${mode}.${k}`);
  for (const k of ['enabled', 'country']) if (raw.auto?.[k] !== undefined) tryPatch({ auto: { [k]: raw.auto[k] } }, `auto.${k}`);
  // 日の出と日の入りは、同時に当てる (片方ずつだと、途中で「同じ時刻」になって弾かれることがある)
  const sun = {};
  for (const k of ['sunrise', 'sunset']) {
    if (raw.auto?.[k] === undefined) continue;
    try {
      validatePatch({ auto: { [k]: raw.auto[k] } });
      sun[k] = raw.auto[k];
    } catch (e) {
      warnings.push(`auto.${k}: ${e.message}`);
    }
  }
  if (Object.keys(sun).length) tryPatch({ auto: sun }, 'auto.sunrise/sunset');
  for (const k of ['provider']) if (raw.ai?.[k] !== undefined) tryPatch({ ai: { [k]: raw.ai[k] } }, `ai.${k}`);
  for (const p of PROVIDERS) {
    if (raw.ai?.models?.[p] !== undefined) tryPatch({ ai: { models: { [p]: typeof raw.ai.models[p] === 'string' && !raw.ai.models[p].trim() ? DEFAULT_MODELS[p] : raw.ai.models[p] } } }, `ai.models.${p}`);
    if (raw.ai?.authModes?.[p] !== undefined) tryPatch({ ai: { authModes: { [p]: raw.ai.authModes[p] } } }, `ai.authModes.${p}`);
    if (raw.ai?.efforts?.[p] !== undefined) tryPatch({ ai: { efforts: { [p]: raw.ai.efforts[p] } } }, `ai.efforts.${p}`);
    if (raw.ai?.baseUrls?.[p] !== undefined) tryPatch({ ai: { baseUrls: { [p]: raw.ai.baseUrls[p] } } }, `ai.baseUrls.${p}`);
  }
  if (raw.ai?.consent !== undefined) tryPatch({ ai: { consent: raw.ai.consent } }, 'ai.consent');
  return { settings, warnings, exists: true };
}

const HEAD = `# TOODDAE settings

These settings are edited from **Set** in TOODDAE, and are safe to edit here too — keep the JSON valid (unknown keys are dropped when TOODDAE saves).
API keys are never stored in the vault.
`;
function render(settings, old) {
  const body = JSON.stringify(settings, null, 2);
  if (old != null && FENCE.test(old)) {
    const eol = old.includes('\r\n') ? '\r\n' : '\n';
    return old.replace(FENCE, () => `\`\`\`json${eol}${body.replaceAll('\n', eol)}${eol}\`\`\``);
  }
  return `${HEAD}\n\`\`\`json\n${body}\n\`\`\`\n`;
}

export async function readSettings(root) {
  const file = absPath(root, SETTINGS_FILE);
  try {
    return parse(await readUtf8(file));
  } catch (e) {
    if (e.code === 'ENOENT') return parse(null);
    if (e instanceof BadInput) return { settings: defaults(), warnings: ['file is not valid UTF-8'], exists: true };
    throw e;
  }
}

// 書く: 検査してから、今の設定に重ねて保存。ファイルの JSON 以外の部分 (人が書いた説明) はそのまま残す。
export async function updateSettings(root, patch) {
  const checked = validatePatch(patch);
  const file = absPath(root, SETTINGS_FILE);
  return exclusive(file, async () => {
    for (let n = 0; n < 3; n++) {
      let before = null;
      let text = null;
      try {
        before = await fs.stat(file);
        text = await readUtf8(file);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      const next = merge(parse(text).settings, checked);
      const out = render(next, text);
      if (before === null) {
        if (await createOnly(file, out)) return next; // 無いときだけ作る (同時に Obsidian が作っていたら、やり直し)
      } else if (await writeIfUnchanged(file, before, out)) return next;
    }
    throw new Conflict();
  });
}

// index.html に埋め込む、描画の前に要る分だけ (外観と自動切り替え)
export const bootPayload = (settings) => ({ appearance: settings.appearance, auto: settings.auto });
