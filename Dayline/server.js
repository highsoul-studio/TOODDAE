// ローカル専用サーバ。127.0.0.1 にだけ bind し、vault の md を直接読み書きする。
import http from 'node:http';
import fs from 'node:fs/promises';
import { watch, openSync, closeSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as V from './lib/vault.js';
import { AiError, completionFor, listModels, organize, ping } from './lib/ai.js';
import { NoteConflict, createNote, deleteNote, listHistory, noteIdentity, searchNotes, readNote, restoreHistory, writeNote } from './lib/notes.js';
import { home, getKey, keyInfo, setKey } from './lib/secrets.js';
import { PROVIDERS, SETTINGS_FILE, bootPayload, readSettings, updateSettings, previewSettings, validatePatch } from './lib/settings.js';
import { PROVIDER_INFO } from './public/providers.js';
import * as subscriptions from './lib/subscriptions.js';
import { consentIdentity, consentState, rememberConsent } from './lib/consents.js';
import { assistantItems, assistantSections, requestCache, runAssistant, validateAssistantRequest } from './lib/assistant.js';
import { RuntimeError, chooseFolder, classifyFolder, revealFolder, initialFolder, persistFolder, privateHome, seedDefault, validateFolder } from './lib/runtime.js';

if (Number(process.versions.node.split('.')[0]) < 20) {
  console.error(`Node.js 20 以上が必要です (今は ${process.versions.node})。https://nodejs.org か nvm / mise などで入れてください`);
  process.exit(1);
}

const APP = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4317;
const initial = await initialFolder();
const context = (root, legacyConsentAllowed = false) => ({ root, legacyConsentAllowed, consentRevision: 0, consentTokens: new Map(), kind: 'unknown', authRevision: 0, rootId: randomUUID(), watcher: null, timer: null, ensured: '', error: null, ai: { revision: 0, fingerprint: '', proof: null, test: 0 } });
let active = context(initial.root, true), switching = true, operations = 0, ready = false, pickerBusy = false;
const READONLY = process.env.READONLY === '1';
const SUPERVISED = process.env.DAYLINE_SUPERVISED === '1'; // launchd などが落ちたら再起動してくれる環境
const PUB = path.join(APP, 'public');
const STARTED = Date.now();
const CAPABILITIES = { assistant: true, notesDelete: true, subscriptionAuth: true };
const assistantRequests = requestCache();
const VERSION = JSON.parse(readFileSync(path.join(APP, 'package.json'), 'utf8')).version;
const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
// 外部への通信・インラインスクリプトを禁止 (md の中身が万一 HTML として解釈されても動かさない)
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': CSP });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

// 本文の上限 (バイト)。ノートの保存と整形だけ大きい
const LIMITS = { '/api/write/save': 1_300_000, '/api/write/organize': 400_000 };
async function readJson(req, limit = 65536) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limit) throw new V.BadInput('too large');
    chunks.push(c);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new V.BadInput('object expected');
    return value;
  } catch {
    throw new V.BadInput('bad json');
  }
}

const rowUndos = new Map();
function rememberRowUndo(ctx, ref, result) {
  const token = randomUUID();
  while (rowUndos.size >= 200) rowUndos.delete(rowUndos.keys().next().value);
  rowUndos.set(token, { rootId: ctx.rootId, ref: { file: ref.file, line: ref.line, raw: result.raw }, raw: ref.raw });
  setTimeout(() => rowUndos.delete(token), 10 * 60_000).unref();
  return { ...result, undo: token };
}
async function restoreRowUndo(ctx, body) {
  if (typeof body.undo !== 'string' || !/^[0-9a-f-]{36}$/.test(body.undo)) throw new V.BadInput('bad undo');
  const saved = rowUndos.get(body.undo);
  if (!saved || saved.rootId !== ctx.rootId) throw new V.BadInput('bad undo');
  const result = await V.restoreRaw(ctx.root, saved.ref, saved.raw);
  rowUndos.delete(body.undo);
  return result;
}
const invalidateAI = (ctx) => { ctx.ai.proof = null; ctx.ai.revision++; };
const authFailed = error => ['auth', 'invalid_grant', 'not-connected', 'account-changed', 'scope-required', 'credential-reflection'].includes(error?.code) || [401, 403].includes(error?.providerStatus);
async function connectionFor(ctx, settings, { refresh = true } = {}) {
  const p = settings.ai.provider, mode = settings.ai.authModes[p];
  let key = '', identity = '', credentialReady = false, authError = null;
  if (mode === 'apikey') {
    key = (await getKey(p)).key; identity = key;
    credentialReady = !PROVIDER_INFO[p].needsKey || !!key;
  } else if (READONLY) {
    identity = 'read-only'; authError = 'read-only';
  } else {
    try {
      if (refresh) { identity = (await subscriptions.credentialInternal(p, mode)).identity; credentialReady = true; }
      else {
        const info = await subscriptions.status(p, mode);
        if (!info.connected) throw new subscriptions.SubscriptionError(info.reason || 'not-connected', 403);
        identity = p === 'openai' ? `openai:${info.accountId}:${info.credentialVersion}` : `claude:${info.accountId || 'connected'}`;
        credentialReady = true;
      }
    }
    catch (e) { authError = e.code || 'not-connected'; identity = `unavailable:${authError}`; }
  }
  const rawBase = mode === 'apikey' ? settings.ai.baseUrls[p] || PROVIDER_INFO[p].baseUrl : PROVIDER_INFO[p].baseUrl;
  const base = rawBase ? new URL(rawBase).href.replace(/\/+$/, '') : '';
  const privacy = consentIdentity({ root: ctx.root, provider: p, base, mode, credential: identity });
  return { key, mode, identity, credentialReady, authError, base, privacy };
}
// 表示した接続と同意 revision に結び付く opaque token。秘密や credential hash は返さない。
function consentTokenFor(ctx, privacyKey, revision) {
  for (const [token, entry] of ctx.consentTokens) if (entry.key === privacyKey && entry.revision === revision) return token;
  const token = randomUUID();
  ctx.consentTokens.set(token, { key: privacyKey, revision });
  while (ctx.consentTokens.size > 64) ctx.consentTokens.delete(ctx.consentTokens.keys().next().value);
  return token;
}
function checkConsentToken(ctx, token, current, target, granted) {
  const entry = typeof token === 'string' ? ctx.consentTokens.get(token) : null;
  // OFF は同じ接続の古い token でも許可する。古い ON が後から復活させることは許可しない。
  if (!entry || entry.key !== current.privacy.key || entry.key !== target.privacy.key || (granted && entry.revision !== ctx.consentRevision)) throw new RuntimeError('consent-changed');
}
async function aiSnapshot(ctx, { refresh = true } = {}) {
  const consentRevision = ctx.consentRevision;
  const data = await readSettings(ctx.root);
  const { settings, exists, warnings } = data, p = settings.ai.provider;
  const connection = await connectionFor(ctx, settings, { refresh });
  const { key, mode, identity, credentialReady, authError, base, privacy } = connection;
  const remembered = await consentState(privacy);
  ctx.ai.legacyConsentKey ??= privacy.key;
  const legacy = ctx.legacyConsentAllowed && !remembered.migrated && ctx.ai.legacyConsentKey === privacy.key;
  settings.ai.consent = credentialReady && remembered.valid && settings.ai.consent && (remembered.grant === true || legacy);
  if (!remembered.valid) warnings.push('consent-store-invalid');
  const fingerprint = createHash('sha256').update(JSON.stringify([ctx.rootId, p, settings.ai.models[p], settings.ai.efforts[p], mode, base, identity, settings.ai.consent, exists, warnings])).digest('hex');
  if (fingerprint !== ctx.ai.fingerprint) { if (ctx.ai.fingerprint) ctx.authRevision++; invalidateAI(ctx); ctx.ai.fingerprint = fingerprint; }
  const configured = exists && !warnings.length && !!settings.ai.models[p] && !!base && credentialReady;
  return { ...data, ...connection, consentToken: consentTokenFor(ctx, privacy.key, consentRevision), credentialIdentity: mode === 'apikey' ? null : identity, fingerprint, aiGeneration: ctx.ai.revision, configured, ready: configured && settings.ai.consent && ctx.ai.proof === fingerprint };
}
async function rememberCurrent(ctx) {
  const before = await aiSnapshot(ctx);
  await rememberConsent(before.privacy, before.credentialReady && before.settings.ai.consent);
  return before;
}
const privacyQueue = (ctx, run) => V.exclusive(`privacy:${ctx.root}`, run);

const vaultPayload = (ctx) => ({ name: path.basename(ctx.root), path: ctx.root, kind: ctx.kind, readonly: READONLY });
async function settingsPayload(ctx) {
  const a = await aiSnapshot(ctx);
  const auth = {};
  for (const p of ['openai', 'anthropic']) {
    const mode = a.settings.ai.authModes[p];
    auth[p] = READONLY ? { available: false, connected: false, accounts: [], reason: 'read-only' } : mode === 'apikey' ? { available: true, connected: false, accounts: [] } : { ...await subscriptions.status(p, mode), accounts: await subscriptions.publicAccounts(p) };
  }
  const keys = Object.fromEntries(await Promise.all(PROVIDERS.map(async (p) => [p, await keyInfo(p)])));
  return { aiGeneration: a.aiGeneration, consentToken: a.consentToken, subscriptions: auth, authError: a.authError, settings: a.settings, warnings: a.warnings, exists: a.exists, file: SETTINGS_FILE, keys, aiConfigured: a.configured, aiReady: a.ready, assistantReady: a.ready && ['openai', 'anthropic', 'deepseek', 'gemini'].includes(a.settings.ai.provider), readonly: READONLY, rootId: ctx.rootId, tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
}
// 全ての操作は受付時の context だけを使う。途中で active.root を読み直さない。
const ACTIONS = {
  '/api/assistant/run': async (c, b) => {
    validateAssistantRequest(b);
    const a = await aiSnapshot(c), revision = c.ai.revision;
    if (!a.settings.ai.consent) throw new AiError('no-consent');
    if (!a.ready) throw new AiError('test-required');
    if (!['openai', 'anthropic', 'deepseek', 'gemini'].includes(a.settings.ai.provider)) throw new AiError('unsupported-provider');
    const { today, timezone } = V.dateContext();
    return assistantRequests(b.requestId, [c.rootId, a.fingerprint], b.message, async () => {
      const guard = async () => {
        if (READONLY) throw new RuntimeError('read-only', 403);
        if (active !== c || switching) throw new RuntimeError('root-changed');
        await available(c);
        const current = await aiSnapshot(c);
        if (revision !== c.ai.revision || current.fingerprint !== a.fingerprint || !current.ready) throw new AiError('settings-changed');
      };
      const sections = await assistantSections(c.root, today), items = await assistantItems(c.root, today);
      const result = await runAssistant({ root: c.root, today, timezone, message: b.message, settings: a.settings, key: a.key, guard, sections, items, ...(a.mode === 'apikey' ? {} : { turn: args => subscriptions.turn({ ...args, expectedIdentity: a.credentialIdentity }) }) });
      if (authFailed(result.error)) { invalidateAI(c); broadcast('ai-status', { rootId: c.rootId }); }
      return { ...result, requestId: b.requestId };
    });
  },
  '/api/toggle': (c, b, today) => V.toggle(c.root, today, b),
  '/api/cancel': (c, b, today) => V.cancel(c.root, today, b),
  '/api/edit': (c, b) => V.edit(c.root, b.ref, b),
  '/api/reschedule': async (c, b) => rememberRowUndo(c, b.ref, await V.reschedule(c.root, b.ref, b.date)),
  '/api/today': async (c, b, today) => rememberRowUndo(c, b.ref, await V.moveToday(c.root, b.ref, today)),
  '/api/undo-row': (c, b) => restoreRowUndo(c, b),
  '/api/add': (c, b, today) => V.add(c.root, today, b),
  '/api/save': (c, b, today) => V.saveItem(c.root, today, b),
  '/api/delete-routine': (c, b) => V.deleteRoutine(c.root, b),
  '/api/section': (c, b, today) => V.sectionOp(c.root, today, b),
  '/api/section/reorder': (c, b, today) => V.reorderSections(c.root, today, b),
  '/api/settings': (c, b) => {
    const { consentToken, ...patch } = b;
    const checked = validatePatch(patch);
    if (checked.ai) { c.authRevision++; invalidateAI(c); }
    return privacyQueue(c, async () => {
      if (!checked.ai) { await updateSettings(c.root, checked); return settingsPayload(c); }
      const before = await aiSnapshot(c);
      const draft = previewSettings(before.settings, checked), target = await connectionFor(c, draft);
      const explicit = checked.ai.consent !== undefined;
      if (explicit) checkConsentToken(c, consentToken, before, target, checked.ai.consent);
      if (explicit || before.privacy.key !== target.privacy.key) c.consentRevision++;
      const revision = c.consentRevision;
      await rememberConsent(before.privacy, before.credentialReady && before.settings.ai.consent);
      const prior = await consentState(target.privacy);
      if (!prior.valid) throw new V.BadInput('consent-store-invalid');
      const consent = target.credentialReady && (explicit ? checked.ai.consent : prior.grant === true);
      await rememberConsent(target.privacy, consent, { revokeScope: checked.ai.consent === false });
      await updateSettings(c.root, { ...checked, ai: { ...checked.ai, consent } });
      const current = await connectionFor(c, (await readSettings(c.root)).settings);
      if (explicit && (revision !== c.consentRevision || current.privacy.key !== target.privacy.key)) throw new RuntimeError('consent-changed');
      return settingsPayload(c);
    });
  },
  '/api/ai/key': (c, b) => {
    if (!PROVIDERS.includes(b.provider)) throw new V.BadInput('bad provider');
    c.consentRevision++; c.authRevision++; invalidateAI(c);
    return privacyQueue(c, async () => {
      await rememberCurrent(c);
      await setKey(b.provider, b.key ?? '');
      const { settings } = await readSettings(c.root), target = await connectionFor(c, settings);
      const prior = await consentState(target.privacy);
      if (!prior.valid) throw new V.BadInput('consent-store-invalid');
      await updateSettings(c.root, { ai: { consent: target.credentialReady && prior.grant === true } });
      return settingsPayload(c);
    });
  },
  '/api/write/create': (c, b) => {
    if (Object.keys(b).some(k => !['date', 'language'].includes(k))) throw new V.BadInput('date and language expected');
    return createNote(c.root, b.date, b.language);
  },
  '/api/write/save': async (c, b) => {
    let guard;
    if (b.aiGeneration !== undefined) {
      if (!Number.isSafeInteger(b.aiGeneration) || b.aiGeneration < 0 || !['organize', 'restore'].includes(b.snapshot)) throw new V.BadInput('bad AI generation');
      const a = await aiSnapshot(c);
      guard = () => {
        if (active !== c || switching) throw new RuntimeError('root-changed');
        if (c.ai.revision !== b.aiGeneration || !a.ready || c.ai.proof !== a.fingerprint) throw new RuntimeError('ai-context-changed');
      };
      guard();
    }
    return writeNote(c.root, b, b.text, b.base, { snapshot: b.snapshot ?? '', guard });
  },
  '/api/write/delete': (c, b) => {
    if (Object.keys(b).some(k => !['noteId', 'date', 'base'].includes(k))) throw new V.BadInput('date and base expected');
    return deleteNote(c.root, b, b.base);
  },
  '/api/write/restore': (c, b) => restoreHistory(c.root, b, b.id, b.base),
  '/api/runtime/reveal': async (c, b) => {
    if (Object.keys(b).length) throw new V.BadInput('empty object expected');
    return revealFolder(c.root);
  },
  '/api/ai/models': async (c, b) => {
    if (Object.keys(b).some(k => k !== 'manual') || (b.manual !== undefined && typeof b.manual !== 'boolean')) throw new V.BadInput('manual boolean expected');
    const a = await aiSnapshot(c), revision = c.ai.revision;
    const result = a.mode === 'apikey' ? await listModels({ settings: a.settings, key: a.key, saved: a.exists && !a.warnings.length, manual: b.manual === true }) : { provider: a.settings.ai.provider, ...await subscriptions.models({ settings: a.settings, expectedIdentity: a.credentialIdentity, signal: AbortSignal.timeout(12000) }) };
    const after = await aiSnapshot(c);
    if (revision !== c.ai.revision || after.fingerprint !== a.fingerprint) throw new AiError('settings-changed');
    return result;
  },
  '/api/write/organize': async (c, b) => {
    const a = await aiSnapshot(c);
    if (!a.settings.ai.consent) throw new AiError('no-consent');
    if (!a.ready) throw new AiError('test-required');
    const revision = c.ai.revision, identity = noteIdentity(b), date = identity.date;
    const selected = await readNote(c.root, identity);
    if (typeof b.base !== 'string' || b.base !== selected.hash || (b.text !== undefined && b.text !== selected.text)) throw new NoteConflict(selected);
    const text = selected.text;
    if (revision !== c.ai.revision) throw new AiError('test-required');
    const result = await organize({ text, date, settings: a.settings, key: a.key, completeImpl: completionFor(a.settings, a.credentialIdentity), additionalInstructions: b.additionalInstructions });
    const after = await aiSnapshot(c);
    if (revision !== c.ai.revision || !after.ready) throw new AiError('test-required');
    const latest = await readNote(c.root, identity);
    if (latest.hash !== b.base) throw new NoteConflict(latest);
    return { ...result, ...identity, base: b.base, aiGeneration: a.aiGeneration };
  },
  '/api/ai/test': async (c) => {
    invalidateAI(c);
    const testId = ++c.ai.test;
    const a = await aiSnapshot(c), ticket = c.ai.revision;
    if (!a.settings.ai.consent) throw new AiError('no-consent');
    if (!a.configured) throw new AiError('not-configured');
    const result = await ping({ settings: a.settings, key: a.key, completeImpl: completionFor(a.settings, a.credentialIdentity) });
    const after = await aiSnapshot(c);
    if (testId !== c.ai.test || ticket !== c.ai.revision || after.fingerprint !== a.fingerprint) throw new AiError('test-required');
    c.ai.proof = a.fingerprint;
    broadcast('ai-status', { rootId: c.rootId });
    return { ...result, aiReady: true, aiGeneration: after.aiGeneration };
  },
};
const authProvider = b => {
  if (!['openai', 'anthropic'].includes(b.provider)) throw new V.BadInput('bad auth provider');
  return b.provider;
};
const ADMIN = {
  '/api/auth/start': async (c, b) => {
    if (Object.keys(b).some(k => !['provider', 'accountId'].includes(k))) throw new V.BadInput('bad auth request');
    if (b.accountId !== undefined && (b.provider !== 'openai' || typeof b.accountId !== 'string' || (b.accountId !== '' && !/^[0-9a-f]{64}$/.test(b.accountId)))) throw new V.BadInput('bad account');
    c.consentRevision++; c.authRevision++; invalidateAI(c); await privacyQueue(c, () => rememberCurrent(c));
    return subscriptions.startLogin(authProvider(b), { accountId: b.accountId, rootId: c.rootId, connectionRevision: c.authRevision, redirectUri: `http://127.0.0.1:${PORT}/auth/callback` });
  },
  '/api/auth/select': async (c, b) => {
    if (Object.keys(b).some(k => !['provider', 'accountId'].includes(k))) throw new V.BadInput('bad auth request');
    if (typeof b.accountId !== 'string' || !/^[0-9a-f]{64}$/.test(b.accountId)) throw new V.BadInput('bad account');
    c.consentRevision++; c.authRevision++; invalidateAI(c); await privacyQueue(c, () => rememberCurrent(c)); await subscriptions.select(authProvider(b), b.accountId); c.consentRevision++;
    return settingsPayload(c);
  },
  '/api/auth/disconnect': async (c, b) => {
    if (Object.keys(b).some(k => k !== 'provider')) throw new V.BadInput('bad auth request');
    c.consentRevision++; c.authRevision++; invalidateAI(c); await privacyQueue(c, () => rememberCurrent(c)); const operation = await subscriptions.disconnect(authProvider(b)); c.consentRevision++;
    return { ...await settingsPayload(c), operation };
  },
  '/api/restart': () => {
    setTimeout(restart, 200);
    return { ok: true, supervised: SUPERVISED };
  },
  '/api/folder/choose': async () => {
    if (pickerBusy) throw new RuntimeError('busy');
    pickerBusy = true;
    try { return await chooseFolder(); } finally { pickerBusy = false; }
  },
};
async function state(ctx) {
  const s = await V.buildState(ctx.root, V.localDate());
  return { ...s, rootId: ctx.rootId, vault: vaultPayload(ctx) };
}
const clients = new Set();
const status = () => ({
  appId: 'tooddae', capabilities: CAPABILITIES, rootId: active.rootId, runtimeHome: home(), ready,
  folderError: active.error, pid: process.pid, app: APP, startedAt: STARTED,
  now: Date.now(), version: VERSION, port: PORT, supervised: SUPERVISED,
  clients: clients.size, vault: vaultPayload(active),
});
function broadcast(event, data) {
  for (const res of clients) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function events(req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  res.write(`retry: 2000\n\nevent: context\ndata: ${JSON.stringify({ rootId: active.rootId })}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
}
function checkContext(req, ctx) {
  if (ctx !== active || req.headers['x-tooddae-root'] !== ctx.rootId) throw new RuntimeError('root-changed');
  if (switching) throw new RuntimeError('busy');
}
async function available(ctx) {
  try {
    if (!ctx.root || await validateFolder(ctx.root, { writable: !READONLY }) !== ctx.root) throw new Error('changed root');
  } catch { ctx.error = 'folder-unavailable'; throw new RuntimeError('folder-unavailable', 503); }
  ctx.error = null;
}
function watchContext(ctx) {
  const changed = new Set();
  const watcher = watch(ctx.root, { recursive: true }, (_event, name) => {
    if (ctx !== active || !name || !name.endsWith('.md') || name.split(path.sep).some(s => s.startsWith('.'))) return;
    changed.add(name.split(path.sep).join('/'));
    clearTimeout(ctx.timer);
    ctx.timer = setTimeout(() => {
      if (ctx !== active) return;
      const files = [...changed].slice(0, 50); changed.clear();
      broadcast('change', { rootId: ctx.rootId, t: Date.now(), files });
      if (files.includes(SETTINGS_FILE)) aiSnapshot(ctx).then(() => broadcast('ai-status', { rootId: ctx.rootId })).catch(() => invalidateAI(ctx));
    }, 120);
  });
  watcher.on('error', () => { ctx.error = 'folder-unavailable'; if (ctx === active) broadcast('folder-error', { rootId: ctx.rootId }); });
  return watcher;
}
async function ensure(ctx) {
  if (READONLY || switching || ctx !== active || ctx.error) return;
  const today = V.localDate();
  if (today === ctx.ensured) return;
  ctx.ensured = today; operations++;
  try { await available(ctx); await V.ensureDaily(ctx.root, today); }
  catch { ctx.ensured = ''; ctx.error = 'folder-unavailable'; }
  finally { operations--; }
}
async function connectFolder(ctx, body) {
  if (operations) throw new RuntimeError('busy');
  switching = true;
  let next;
  try {
    const root = await validateFolder(body.path);
    if (ctx !== active) throw new RuntimeError('root-changed');
    if (root === ctx.root && !ctx.error) { await persistFolder(root); return { rootId: ctx.rootId, vault: vaultPayload(ctx) }; }
    next = context(root);
    next.kind = await classifyFolder(root);
    const targetSettings = (await readSettings(root)).settings;
    const targetPrivacy = (await connectionFor(next, targetSettings, { refresh: false })).privacy;
    const remembered = await consentState(targetPrivacy);
    if (remembered.valid && !remembered.migrated) await rememberConsent(targetPrivacy, false);
    next.watcher = watchContext(next);
    await fs.stat(root);
    if (next.error) throw new RuntimeError('folder-unavailable', 503);
    await persistFolder(root);
    ctx.watcher?.close(); clearTimeout(ctx.timer);
    active = next; rowUndos.clear(); invalidateAI(ctx);
    broadcast('root-changed', { rootId: next.rootId });
    return { rootId: next.rootId, vault: vaultPayload(next) };
  } catch (e) { next?.watcher?.close(); throw e instanceof RuntimeError ? e : new RuntimeError('folder-unavailable', 503); }
  finally { switching = false; void ensure(active); }
}

// アイコンのスプライトは HTML に埋め込んで返す。外部ファイル参照の <use> は描画のたびに取り直しになり、一瞬アイコンが消えるため。
const withSprite = async (html) => html.replace('<!--SPRITE-->', (await fs.readFile(path.join(PUB, 'icons.svg'), 'utf8')).replace('<svg ', '<svg class="sprite" aria-hidden="true" '));

// 描画の前に要る設定 (外観・自動切り替え) を index.html に埋め込む。色が既定から切り替わる一瞬のちらつきを防ぐ。
// type=application/json のブロックは実行されないので、CSP (script-src 'self') に触れない。< は \u003c にして、</script> で閉じられないようにする
const withBoot = async (html) => {
  const ctx = active;
  const { settings } = ctx.error ? { settings: null } : await readSettings(ctx.root).catch(() => ({ settings: null }));
  const json = JSON.stringify({ ...(settings ? bootPayload(settings) : {}), runtime: { rootId: ctx.rootId, version: VERSION, appId: 'tooddae', capabilities: CAPABILITIES } }).replace(/</g, '\\u003c');
  return html.replace('<!--BOOT-->', () => `<script type="application/json" id="boot">${json}</script>`);
};

async function serveStatic(pathname, res) {
  let rel;
  try {
    rel = pathname === '/' ? 'index.html' : pathname === '/design' ? 'design.html' : decodeURIComponent(pathname.slice(1));
  } catch {
    return send(res, 400, 'bad request', 'text/plain');
  }
  const file = path.resolve(PUB, rel);
  const type = TYPES[path.extname(file)];
  if (!file.startsWith(PUB + path.sep) || !type) return send(res, 404, 'not found', 'text/plain');
  try {
    const body = await fs.readFile(file);
    send(res, 200, rel === 'index.html' ? await withBoot(await withSprite(body.toString())) : body, type);
  } catch {
    send(res, 404, 'not found', 'text/plain');
  }
}

const AI_LOCAL = new Set(['not-configured', 'no-consent', 'no-key', 'no-model', 'no-base-url', 'empty-note', 'too-large', 'unsupported-effort', 'unsupported-provider', 'bad-instructions']);
const server = http.createServer(async (req, res) => {
  const ctx = active;
  try {
    if (!HOSTS.has(req.headers.host)) return send(res, 403, { error: 'bad host' });
    const url = new URL(req.url, `http://${req.headers.host}`), { pathname } = url;
    if (req.method === 'GET') {
      if (pathname === '/auth/callback') {
        if (READONLY) return send(res, 403, 'Read-only', 'text/plain');
        if (switching) return send(res, 409, 'Busy', 'text/plain');
        operations++;
        try {
          const connectionRevision = ctx.authRevision;
          const guard = async () => {
            if (READONLY || active !== ctx || switching) throw new RuntimeError('root-changed');
            // finishLogin は credential store の排他区間内。ここで refresh/write に再入しない。
            await aiSnapshot(ctx, { refresh: false });
            if (ctx.authRevision !== connectionRevision) throw new subscriptions.SubscriptionError('connection-changed', 409);
            return true;
          };
          await subscriptions.finishLogin({ connectionRevision, guard, code: url.searchParams.get('code'), state: url.searchParams.get('state'), clientId: url.searchParams.get('client_id'), error: url.searchParams.get('error'), currentRootId: ctx.rootId });
          ctx.consentRevision++; invalidateAI(ctx); broadcast('ai-status', { rootId: ctx.rootId });
          return send(res, 200, 'TOODDAE connected. Return to the app and test the connection.', 'text/plain');
        } finally { operations--; }
      }
      if (pathname === '/api/status') return send(res, 200, status());
      if (pathname === '/api/events') return events(req, res);
      if (!pathname.startsWith('/api/')) return serveStatic(pathname, res);
      checkContext(req, ctx); await available(ctx);
      let data;
      if (pathname === '/api/state') data = await state(ctx);
      else if (pathname === '/api/settings') data = await settingsPayload(ctx);
      else if (pathname === '/api/write/notes') data = { today: V.localDate(), ...await searchNotes(ctx.root, { q: url.searchParams.get('q') ?? '', limit: url.searchParams.get('limit') ?? 120, cursor: url.searchParams.get('cursor') ?? '' }) };
      else if (pathname === '/api/write/note') data = await readNote(ctx.root, Object.fromEntries(url.searchParams));
      else if (pathname === '/api/write/history') data = { versions: await listHistory(ctx.root, Object.fromEntries(url.searchParams)) };
      else return send(res, 404, { error: 'not found' });
      checkContext(req, ctx);
      return send(res, 200, { ...data, rootId: ctx.rootId });
    }
    const action = ACTIONS[pathname] ?? ADMIN[pathname];
    if (req.method !== 'POST' || (!action && pathname !== '/api/folder/connect')) return send(res, 404, { error: 'not found' });
    if (READONLY) return send(res, 403, { error: 'read-only' });
    if (req.headers.origin !== `http://${req.headers.host}` || !/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']))) return send(res, 403, { error: 'bad origin' });
    checkContext(req, ctx);
    const body = await readJson(req, LIMITS[pathname]);
    checkContext(req, ctx);
    if (pathname === '/api/folder/connect') return send(res, 200, await connectFolder(ctx, body));
    operations++;
    try {
      if (ACTIONS[pathname]) await available(ctx);
      const data = await action(ctx, body, V.localDate());
      checkContext(req, ctx);
      send(res, 200, { ...data, rootId: ctx.rootId });
    } finally { operations--; }
  } catch (e) {
    if (e instanceof subscriptions.SubscriptionError) { if (authFailed({ code: e.code, providerStatus: ['provider-error', 'invalid_grant', 'scope-required'].includes(e.code) ? e.status : 0 })) { invalidateAI(ctx); broadcast('ai-status', { rootId: ctx.rootId }); } return send(res, e.status >= 400 && e.status <= 599 ? e.status : 502, { error: 'auth', code: e.code }); }
    if (e instanceof RuntimeError) return send(res, e.status, { error: e.code, rootId: active.rootId });
    if (e instanceof NoteConflict) return send(res, 409, { error: 'conflict', current: e.current });
    if (e instanceof V.Conflict) return send(res, 409, { error: 'conflict', ...(e.changedFiles ? { changedFiles: e.changedFiles } : {}) });
    if (e instanceof AiError && authFailed(e)) { invalidateAI(ctx); broadcast('ai-status', { rootId: ctx.rootId }); }
    if (e instanceof AiError) return send(res, ['test-required', 'settings-changed', 'request-conflict', 'busy'].includes(e.code) ? 409 : AI_LOCAL.has(e.code) ? (e.code === 'no-consent' ? 403 : 400) : 502, { error: 'ai', code: e.code, ...(e.message !== e.code ? { detail: e.message } : {}) });
    if (e instanceof V.BadInput) return send(res, 400, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'internal' });
  }
});

// 再起動。監視役 (launchd) がいればそのまま終了して任せる。いなければ自分で新しいプロセスを起こしてから終了する
// (新プロセスはポートが空くまで待つ。端末を閉じても生き残るよう切り離して起動)。
async function restart() {
  if (switching || operations) return;
  switching = true;
  await privateHome();
  if (!SUPERVISED) {
    const log = openSync(path.join(home(), 'server.log'), 'a', 0o600);
    spawn(process.execPath, [path.join(APP, 'server.js')], {
      cwd: APP,
      detached: true,
      stdio: ['ignore', log, log],
      env: { ...process.env, VAULT: active.root, DAYLINE_RESPAWN: '1' },
    }).unref();
    closeSync(log);
  }
  for (const r of clients) r.end();
  server.close(() => process.exit(0));
  server.closeAllConnections?.();
  setTimeout(() => process.exit(0), 1500).unref();
}

setInterval(() => { for (const r of clients) r.write(': ping\n\n'); }, 25000).unref();
setInterval(() => { if (ready) void ensure(active); }, 60000).unref();

let tries = 0;
server.on('error', (e) => {
  // 再起動で起こされた新プロセスは、古いプロセスがポートを手放すまで待つ
  if (e.code === 'EADDRINUSE' && process.env.DAYLINE_RESPAWN === '1' && ++tries < 60) {
    return void setTimeout(() => server.listen(PORT, '127.0.0.1'), 250);
  }
  console.error(e);
  process.exit(1);
});
server.on('listening', async () => {
  // listen に勝ったプロセスだけが初期ファイルを書ける。
  try {
    if (initial.create && !READONLY) await seedDefault(active.root, V.localDate());
    active.root = await validateFolder(active.root, { writable: !READONLY });
    active.kind = await classifyFolder(active.root);
    active.watcher = watchContext(active);
  } catch { active.error = 'folder-unavailable'; }
  switching = false;
  await ensure(active);
  ready = true;
  console.log(`TOODDAE  http://localhost:${PORT}`);
});
server.listen(PORT, '127.0.0.1');
