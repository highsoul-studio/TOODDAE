const boot = (() => {
  try { return JSON.parse(document.querySelector('#boot')?.textContent || '{}') || {}; }
  catch { return {}; }
})();

export const runtime = Object.freeze({ appId: 'tooddae', version: '', rootId: '', ...(boot.runtime ?? {}) });
const rootless = new Set(['/api/status']);
const guards = new Map();
const aiBlocks = new Set();
let lastAiPayload = { aiReady: false };
let stale = false;

export function isStale() { return stale; }
export function registerRootGuard(name, guard) { guards.set(name, guard); return () => guards.delete(name); }
export async function prepareRootSwitch() {
  for (const [name, guard] of guards) {
    const result = await guard();
    if (result !== true) return { ok: false, source: name, reason: result || 'unfinished' };
  }
  return { ok: true };
}

export function markRootChanged(rootId) {
  if (stale || !rootId || rootId === runtime.rootId) return;
  stale = true;
  document.documentElement.dataset.rootStale = 'true';
  dispatchEvent(new CustomEvent('tooddae-root-changed', { detail: { rootId } }));
}

export async function request(path, { method = 'GET', body, signal, cache = 'no-store', root = !rootless.has(path), allowRootChange = false } = {}) {
  if (root && stale) throw Object.assign(new Error('root-changed'), { status: 409, code: 'root-changed' });
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (root && runtime.rootId) headers['X-TOODDAE-Root'] = runtime.rootId;
  const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal, cache });
  const data = await response.json().catch(() => ({}));
  if (root && stale && !allowRootChange) throw Object.assign(new Error('root-changed'), { status: 409, code: 'root-changed' });
  if (!response.ok) {
    if (response.status === 409 && data.error === 'root-changed') markRootChanged(data.rootId);
    throw Object.assign(new Error(data.code || data.error || response.statusText), { ...data, status: response.status });
  }
  if (root && !allowRootChange && data.rootId && data.rootId !== runtime.rootId) {
    markRootChanged(data.rootId);
    throw Object.assign(new Error('root-changed'), { status: 409, code: 'root-changed' });
  }
  return data;
}

export const get = (path, options) => request(path, options);
export const post = (path, body = {}, options) => request(path, { ...options, method: 'POST', body });

// SSE は同じブラウザの全タブで 1 本だけにする。
// HTTP/1.1 はオリジンごとに同時接続が約 6 本までで、タブごとに SSE を持つと、開いたタブが増えたところで
// 新しい fetch (チェックの保存・状態の取得など) が応答なしのまま待たされ続け、リロードするまで戻らない。
// Web Locks で「SSE を持つタブ」を 1 つ決め、受けたイベントは BroadcastChannel で他のタブへ配る。
// そのタブが閉じるとロックが外れ、待っていた別のタブが引き継ぐ。どちらも使えない環境では、従来どおり各タブで接続する。
const subscribers = new Set();
const each = (name, event) => { for (const handlers of [...subscribers]) handlers[name]?.(event); };
const EVENT_TYPES = ['context', 'root-changed', 'ai-status', 'change'];
const channel = typeof BroadcastChannel === 'function' && navigator.locks ? new BroadcastChannel('tooddae-events') : null;
let source = null;
let connected = false;
let leading = false;
let started = false;

// 受け取ったイベントを、このタブの購読者へ渡す (自分で受けた分も、他のタブから届いた分も同じ経路)
function deliver(type, data) {
  if (type === 'open') { connected = true; each('open'); return; }
  if (type === 'error') { connected = false; each('error'); return; }
  if (type === 'context') {
    const value = JSON.parse(data || '{}');
    if (value.rootId && value.rootId !== runtime.rootId) markRootChanged(value.rootId);
    each('context', value);
  } else if (type === 'root-changed') {
    const value = JSON.parse(data || '{}');
    markRootChanged(value.rootId);
    each('rootChanged', value);
  } else if (type === 'ai-status') get('/api/settings').then(publishAiReadiness).catch(() => publishAiReadiness({ aiReady: false }));
  else if (type === 'change') each('change', { data });
}
function openSource() {
  source = new EventSource('/api/events');
  const relay = (type, data) => { deliver(type, data); channel?.postMessage({ type, data }); };
  for (const type of EVENT_TYPES) source.addEventListener(type, (event) => relay(type, event.data));
  source.onopen = () => relay('open');
  source.onerror = () => relay('error');
}
function startEvents() {
  if (started) return;
  started = true;
  if (!channel) { openSource(); return; }
  channel.onmessage = (message) => {
    const { type, data } = message.data || {};
    if (type === 'hello') { if (leading && connected) channel.postMessage({ type: 'open' }); return; }
    if (!leading) deliver(type, data);
  };
  channel.postMessage({ type: 'hello' }); // 既に接続しているタブがあれば、今の状態を返してもらう
  navigator.locks.request('tooddae-events', () => new Promise(() => {
    leading = true;
    openSource(); // タブが閉じる/移動すると、ロックと接続が一緒に外れる
  }));
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && started) { if (connected) each('open'); each('resume'); } // 見えなかった間の変更を取り直す
});

export function openEvents(handlers = {}) {
  subscribers.add(handlers);
  startEvents();
  if (connected && handlers.open) queueMicrotask(() => subscribers.has(handlers) && handlers.open());
  return { close() { subscribers.delete(handlers); } };
}

export function publishAiReadiness(payload) {
  lastAiPayload = { ...lastAiPayload, ...payload };
  dispatchEvent(new CustomEvent('tooddae-ai-readiness', { detail: { ...lastAiPayload, aiReady: !!lastAiPayload.aiReady && aiBlocks.size === 0 } }));
}
export function setAiReadinessBlocked(source, blocked) {
  blocked ? aiBlocks.add(source) : aiBlocks.delete(source);
  publishAiReadiness(lastAiPayload);
}
