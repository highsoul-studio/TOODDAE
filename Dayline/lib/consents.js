// 端末ごとの送信同意。保存するのは接続のハッシュと真偽値だけで、キー・token・ノートは保存しない。
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { home } from './secrets.js';
import { privateHome } from './runtime.js';
import { BadInput, exclusive } from './vault.js';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const file = () => path.join(home(), 'consents.json');
const empty = () => ({ version: 1, roots: {}, grants: {} });
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export function consentIdentity({ root, provider, base, mode, credential }) {
  const rootId = digest(path.resolve(root));
  const scope = digest([rootId, provider, base, mode]);
  return { rootId, scope, key: `${scope}.${digest(credential)}` };
}
async function load() {
  try {
    if ((await fs.lstat(home())).isSymbolicLink() || (await fs.lstat(file())).isSymbolicLink()) throw Error('unsafe');
    const stat = await fs.stat(file()); if (stat.size > 262144) throw Error('large');
    const value = JSON.parse(await fs.readFile(file(), 'utf8'));
    if (!object(value) || Object.keys(value).some(k => !['version', 'roots', 'grants'].includes(k)) || value.version !== 1 || !object(value.roots) || !object(value.grants)) throw Error('shape');
    if (Object.entries(value.roots).some(([k, v]) => !/^[a-f0-9]{64}$/.test(k) || v !== true) || Object.entries(value.grants).some(([k, v]) => !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(k) || typeof v !== 'boolean')) throw Error('entry');
    return value;
  } catch (e) { if (e.code === 'ENOENT') return empty(); throw new BadInput('consent-store-invalid'); }
}
export async function consentState(identity) {
  try {
    const data = await load();
    return { valid: true, migrated: !!data.roots[identity.rootId], grant: data.grants[identity.key] };
  } catch { return { valid: false, migrated: true, grant: false }; }
}
export async function rememberConsent(identity, granted, { revokeScope = false } = {}) {
  return exclusive(file(), async () => {
    const data = await load();
    data.roots[identity.rootId] = true;
    if (revokeScope) for (const key of Object.keys(data.grants)) if (key.startsWith(identity.scope + '.')) data.grants[key] = false;
    data.grants[identity.key] = !!granted;
    if (Object.keys(data.roots).length > 256 || Object.keys(data.grants).length > 1000) throw new BadInput('consent-store-full');
    await privateHome();
    const tmp = path.join(home(), `.consents-${randomUUID()}.tmp`);
    try { await fs.writeFile(tmp, JSON.stringify(data) + '\n', { flag: 'wx', mode: 0o600 }); await fs.rename(tmp, file()); }
    finally { await fs.rm(tmp, { force: true }); }
  });
}
