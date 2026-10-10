import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './helpers.js';
import { connectVault } from '../src/connection.js';

test('independently installed core preserves Obsidian scope and capture boundaries', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const { vaultId, service } = await connectVault(f.vault, f.registry, f.profile);
  assert.equal(vaultId, 'notes');
  assert.match((await service.read(vaultId, 'Project/Decision.md')).text, /linked design decision/);
  await assert.rejects(service.read(vaultId, 'Other/Secret.md'));
  const capture = await service.capture({
    vaultId,
    requestId: 'plugin-split',
    title: 'Plugin handoff',
    content: '[[Decision]]',
    source: 'obsidian',
  });
  assert.match(capture.path, /^Project\/Inbox\//);
});
test('Obsidian cannot bind a foreign vault or export a sealed note', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const other = join(f.base, 'unregistered');
  await mkdir(other);
  await assert.rejects(connectVault(other, f.registry, f.profile), /Register/);
  const { service, vaultId } = await connectVault(f.vault, f.registry, f.profile);
  await writeFile(join(f.vault, 'Project', 'Decision.md'), 'SLATE1:sealed');
  await assert.rejects(service.read(vaultId, 'Project/Decision.md'));
});
