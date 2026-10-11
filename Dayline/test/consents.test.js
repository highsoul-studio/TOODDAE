import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { consentIdentity, consentState, rememberConsent } from '../lib/consents.js';

const objectFor = (root, extra = {}) => ({ root, provider: 'openai', base: 'https://api.openai.com/v1', mode: 'apikey', credential: 'FAKE-CREDENTIAL', ...extra });
test('consent bindings omit model/effort and isolate root/provider/base/mode/credential; private no-secret storage', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tooddae-consent-')), old = process.env.DAYLINE_HOME;
  process.env.DAYLINE_HOME = path.join(root, 'private');
  try {
    const identity = consentIdentity(objectFor(path.join(root, 'vault')));
    assert.deepEqual(await consentState(identity), { valid: true, migrated: false, grant: undefined });
    await assert.rejects(fs.stat(process.env.DAYLINE_HOME), { code: 'ENOENT' });
    await rememberConsent(identity, true);
    assert.equal((await consentState(identity)).grant, true);
    assert.deepEqual(consentIdentity({ ...objectFor(path.join(root, 'vault')), model: 'new', effort: 'high' }), identity);
    for (const patch of [{ root: path.join(root, 'another') }, { provider: 'deepseek' }, { base: 'https://other.invalid' }, { mode: 'chatgpt' }, { credential: 'FAKE-CHANGED' }]) assert.notEqual(consentIdentity(objectFor(path.join(root, 'vault'), patch)).key, identity.key);
    const text = await fs.readFile(path.join(process.env.DAYLINE_HOME, 'consents.json'), 'utf8');
    for (const secret of ['FAKE-CREDENTIAL', root, 'api.openai.com']) assert.ok(!text.includes(secret));
    assert.equal((await fs.stat(path.join(process.env.DAYLINE_HOME, 'consents.json'))).mode & 0o777, 0o600);
    const rotated = consentIdentity(objectFor(path.join(root, 'vault'), { credential: 'FAKE-CHANGED' }));
    await rememberConsent(rotated, true);
    await rememberConsent(identity, false, { revokeScope: true });
    assert.equal((await consentState(identity)).grant, false); assert.equal((await consentState(rotated)).grant, false);
  } finally { if (old === undefined) delete process.env.DAYLINE_HOME; else process.env.DAYLINE_HOME = old; await fs.rm(root, { recursive: true, force: true }); }
});
test('corrupt and symlinked consent stores fail closed and are never overwritten', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tooddae-consent-bad-')), old = process.env.DAYLINE_HOME;
  process.env.DAYLINE_HOME = root;
  const identity = consentIdentity(objectFor(path.join(root, 'vault'))), file = path.join(root, 'consents.json');
  try {
    for (const text of ['{bad', JSON.stringify({ version: 1, roots: [], grants: {} }), JSON.stringify({ version: 1, roots: {}, grants: { arbitrary: true } })]) {
      await fs.writeFile(file, text); assert.equal((await consentState(identity)).valid, false);
      await assert.rejects(rememberConsent(identity, true), /consent-store-invalid/);
      assert.equal(await fs.readFile(file, 'utf8'), text);
    }
    await fs.rm(file); const outside = path.join(root, 'outside'); await fs.writeFile(outside, '{}'); await fs.symlink(outside, file);
    assert.equal((await consentState(identity)).valid, false); await assert.rejects(rememberConsent(identity, true), /consent-store-invalid/);
    assert.equal(await fs.readFile(outside, 'utf8'), '{}');
  } finally { if (old === undefined) delete process.env.DAYLINE_HOME; else process.env.DAYLINE_HOME = old; await fs.rm(root, { recursive: true, force: true }); }
});
