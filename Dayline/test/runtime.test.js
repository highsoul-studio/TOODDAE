// 実際の picker・所有者のフォルダには触れない。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chooseFolder, classifyFolder, revealFolder, initialFolder, persistFolder, seedDefault, validateFolder, WELCOME } from '../lib/runtime.js';

test('runtime config: private atomic path, explicit override, missing saved path, fresh-default-only Welcome', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tooddae-runtime-')));
  const before = { ...process.env };
  process.env.DAYLINE_HOME = path.join(root, 'private'); delete process.env.VAULT;
  process.env.DAYLINE_DEFAULT_VAULT = path.join(root, 'default');
  try {
    const initial = await initialFolder(); assert.equal(initial.create, true);
    assert.equal(await seedDefault(initial.root, '2026-10-06'), true);
    assert.equal(await fs.readFile(path.join(initial.root, 'Write/2026-10-06.md'), 'utf8'), WELCOME);
    assert.equal(await seedDefault(initial.root, '2026-10-07'), false);
    await assert.rejects(fs.stat(path.join(initial.root, 'Write/2026-10-07.md')), { code: 'ENOENT' });
    const chosen = path.join(root, 'chosen'); await fs.mkdir(chosen);
    await persistFolder(await validateFolder(chosen));
    assert.deepEqual(await initialFolder(), { root: chosen, create: false });
    assert.equal((await fs.stat(path.join(root, 'private/runtime.json'))).mode & 0o777, 0o600);
    assert.equal((await fs.stat(path.join(root, 'private'))).mode & 0o777, 0o700);
    await fs.rmdir(chosen);
    assert.equal((await initialFolder()).root, chosen, 'missing saved path must not become default');
    await assert.rejects(validateFolder(chosen));
    await assert.rejects(validateFolder(root), /folder-unavailable/);
    await assert.rejects(validateFolder(path.parse(root).root, { writable: false }), /folder-unavailable/, 'filesystem root includes the private home');
    await assert.rejects(validateFolder('relative'), /folder-unavailable/);
    process.env.VAULT = initial.root; assert.deepEqual(await initialFolder(), { root: initial.root, create: false });
  } finally {
    for (const key of ['DAYLINE_HOME', 'DAYLINE_DEFAULT_VAULT', 'VAULT']) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('picker fixed argv, cancellation and platform fallback never mutate configuration', async () => {
  const selected = '/tmp/folder with \' quotes $(echo nope)';
  let captured;
  assert.deepEqual(await chooseFolder({ platform: 'darwin', run: async (...args) => { captured = args; return { stdout: selected + '\n' }; } }), { path: selected });
  assert.equal(captured[0], '/usr/bin/osascript'); assert.equal(captured[1].length, 2);
  assert.ok(!captured[1][1].includes(selected));
  assert.deepEqual(await chooseFolder({ platform: 'darwin', run: async () => { throw { stderr: 'User canceled. (-128)' }; } }), { cancelled: true });
  assert.deepEqual(await chooseFolder({ platform: 'linux' }), { manual: true });
  await assert.rejects(chooseFolder({ platform: 'darwin', run: async () => { throw Error('timeout'); } }), /folder-unavailable/);
});

test('Finder reveal uses fixed argv, preserves special characters and does not invoke a shell', async () => {
  const root = "/tmp/folder ' $(never run) spaces"; let captured;
  assert.deepEqual(await revealFolder(root, { platform: 'darwin', run: async (...args) => { captured = args; } }), { ok: true });
  assert.deepEqual(captured.slice(0, 2), ['/usr/bin/open', ['-a', 'Finder', root]]);
  await assert.rejects(revealFolder(root, { platform: 'linux' }), /unsupported-platform/);
  await assert.rejects(revealFolder(root, { platform: 'darwin', run: async () => { throw Error('failed'); } }), /reveal-failed/);
  assert.match(WELCOME, /# Welcome to TOODDAE/); assert.ok(!/[가-힣]/.test(WELCOME));
  assert.match(WELCOME, /Model suggestions may be retrieved automatically/);
  assert.match(WELCOME, /only when you choose Organize/);
});

test('folder classification uses canonical host-home boundaries, not runtime HOME or guessed drive letters', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tooddae-kind-')));
  try {
    const cloud = path.join(root, 'Library/CloudStorage/Provider/Notes'), fake = path.join(root, 'Library/CloudStorageExtra/Notes');
    await fs.mkdir(cloud, { recursive: true }); await fs.mkdir(fake, { recursive: true });
    await fs.mkdir(path.join(root, 'Desktop')); await fs.mkdir(path.join(root, 'Library/Mobile Documents/Docs'), { recursive: true });
    await fs.symlink(cloud, path.join(root, 'alias'));
    for (const folder of [cloud, path.join(root, 'alias'), path.join(root, 'Library/Mobile Documents/Docs')]) assert.equal(await classifyFolder(folder, { platform: 'darwin', hostHome: root }), 'drive');
    assert.equal(await classifyFolder(fake, { platform: 'darwin', hostHome: root }), 'local');
    assert.equal(await classifyFolder(path.join(root, 'Desktop'), { platform: 'darwin', hostHome: root }), 'unknown');
    assert.equal(await classifyFolder(cloud, { platform: 'darwin', hostHome: '/real-host-home', resolve: async value => value }), 'local', 'runtime HOME lookalike is not the host FileProvider root');
    assert.equal(await classifyFolder('/Volumes/GoogleDrive/Notes', { platform: 'darwin', hostHome: root, resolve: async value => value }), 'drive');
    assert.equal(await classifyFolder('/Volumes/GoogleDriveBackup', { platform: 'darwin', hostHome: root, resolve: async value => value }), 'unknown');
    let calls = 0;
    const win = { platform: 'win32', hostHome: 'C:\\Users\\Person', resolve: async value => value, run: async (file, args, options) => { calls++; assert.equal(file, 'powershell.exe'); assert.deepEqual(args.slice(0, 4), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command']); assert.match(args[4], /DriveInfo/); assert.ok(!args[4].includes('untrusted')); assert.equal(options.timeout, 2000); return { stdout: 'Network\r\n' }; } };
    assert.equal(await classifyFolder('G:\\untrusted name', win), 'drive'); assert.equal(calls, 1);
    assert.equal(await classifyFolder('G:\\Notes', { ...win, run: async () => ({ stdout: 'Unknown' }) }), 'unknown');
    assert.equal(await classifyFolder('C:\\Notes', { ...win, run: async () => ({ stdout: 'Fixed' }) }), 'local');
    assert.equal(await classifyFolder('G:', win), 'unknown'); assert.equal(calls, 1);
    assert.equal(await classifyFolder('\\\\server\\share\\Notes', win), 'drive'); assert.equal(calls, 1);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
