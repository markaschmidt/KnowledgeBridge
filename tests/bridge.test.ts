import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  prepareChange,
  applyChange,
  readEndpoint,
  saveJson,
  approveProfile,
  digest,
} from '@knowledge-bridge/core/service';
import { startVaultBridge } from '../src/bridge.js';
import { writeInVault, type VaultWriter } from '../src/writer.js';
import { fixture } from './helpers.js';

async function connected() {
  const f = await fixture();
  f.config.scopes[0]!.write = { update: true, delete: true };
  await saveJson(f.profile, f.config);
  await approveProfile(f.registry, f.profile);
  let writes = 0;
  const writer: VaultWriter<string> = {
    file: (path) => (existsSync(join(f.vault, path)) ? path : null),
    create: async (path, text) => {
      await writeFile(join(f.vault, path), text, { flag: 'wx' });
      writes++;
    },
    process: async (path, transform) => {
      const text = transform(await readFile(join(f.vault, path), 'utf8'));
      await writeFile(join(f.vault, path), text);
      writes++;
      return text;
    },
    read: (path) => readFile(join(f.vault, path), 'utf8'),
    trash: async (path, system) => {
      assert.equal(system, false);
      await mkdir(join(f.vault, '.trash'), { recursive: true });
      await rename(join(f.vault, path), join(f.vault, '.trash', 'deleted.md'));
      writes++;
    },
  };
  let registries = [f.registry];
  const bridge = await startVaultBridge(f.vault, () => registries, writer);
  return {
    ...f,
    writer,
    writes: () => writes,
    revoke: () => {
      registries = [];
    },
    clean: async () => {
      await bridge.close();
      await f.clean();
    },
  };
}

test('authenticated bridge creates, reads, updates and trashes with graph freshness and identical retries', async (t) => {
  const f = await connected();
  t.after(f.clean);
  const scope = (await f.service.pickerScope()).revision;
  const created = await prepareChange(
    f.service,
    {
      operation: 'create',
      vaultId: 'notes',
      path: 'Project/Inbox/Handoff.md',
      content: '# Handoff\n[[Decision]]\nnewknowledgeword',
    },
    scope,
  );
  const id = randomUUID();
  const result = await applyChange(f.service, created, id);
  assert.deepEqual(await applyChange(f.service, created, id), result);
  assert.equal(f.writes(), 1);
  const note = await f.service.read('notes', created.path);
  assert.equal(
    (await f.service.neighbors('notes', note.path)).outgoing[0]?.path,
    'Project/Decision.md',
  );
  const edited = await prepareChange(
    f.service,
    {
      operation: 'update',
      vaultId: 'notes',
      path: note.path,
      expectedRevision: note.revision,
      content: '# Handoff\n[[Architecture]]\nrevisedknowledgeword',
    },
    scope,
  );
  const editId = randomUUID();
  await applyChange(f.service, edited, editId);
  await applyChange(f.service, edited, editId); // Lost-response retry must not write twice.
  assert.equal(f.writes(), 2);
  assert.equal(
    (await f.service.neighbors('notes', note.path)).outgoing[0]?.path,
    'Project/Architecture.md',
  );
  const current = await f.service.read('notes', note.path);
  const deleted = await prepareChange(
    f.service,
    { operation: 'delete', vaultId: 'notes', path: note.path, expectedRevision: current.revision },
    scope,
  );
  const deleteId = randomUUID();
  assert.match((await applyChange(f.service, deleted, deleteId)).recovery!, /\.trash/);
  await applyChange(f.service, deleted, deleteId);
  assert.equal(f.writes(), 3);
  assert.equal(await readFile(join(f.vault, '.trash/deleted.md'), 'utf8'), current.text);
  await assert.rejects(f.service.read('notes', note.path), /unavailable/);
});

test('bridge rejects stale content, changed Rhen policy, revoked registry, and conflicting receipts', async (t) => {
  const f = await connected();
  t.after(f.clean);
  const note = await f.service.read('notes', 'Project/Decision.md'),
    scope = (await f.service.pickerScope()).revision;
  const draft = {
    operation: 'update' as const,
    vaultId: 'notes',
    path: note.path,
    expectedRevision: note.revision,
    content: '# Edited',
  };
  const review = await prepareChange(f.service, draft, scope);
  await writeFile(join(f.vault, note.path), '# Concurrent');
  await assert.rejects(applyChange(f.service, review, randomUUID()), /changed/);
  assert.equal(f.writes(), 0);
  await writeFile(join(f.vault, note.path), note.text);
  const id = randomUUID();
  await applyChange(f.service, review, id);
  await assert.rejects(applyChange(f.service, { ...review, after: '# Forged' }, id), /conflicts/);
  const policy = join(f.vault, '.obsidian/plugins/rhen-info-vault');
  await mkdir(policy, { recursive: true });
  await saveJson(join(policy, 'data.json'), { lockedFiles: [note.path], lockedFolders: [] });
  await assert.rejects(applyChange(f.service, review, randomUUID()), /Rhen policy changed/);
  f.revoke();
  await assert.rejects(applyChange(f.service, review, randomUUID()), /not connected/);
  assert.equal(f.writes(), 1);
});

test('native writer checks revisions inside process and refuses dirty editor state', async () => {
  let saved = false;
  const preview = {
    operation: 'update' as const,
    vaultId: 'notes',
    path: 'A.md',
    before: 'old',
    after: 'new',
    expectedRevision: digest('old'),
    scopeRevision: '',
    policyRevision: '',
  };
  const writer: VaultWriter<string> = {
    file: () => 'A.md',
    create: async () => {},
    read: async () => 'old',
    trash: async () => {},
    process: async (_file, transform) => {
      const text = transform('concurrent');
      saved = true;
      return text;
    },
  };
  await assert.rejects(writeInVault(writer, preview), /changed after review/);
  assert.equal(saved, false);
  writer.assertSaved = () => {
    throw new Error('unsaved editor changes');
  };
  await assert.rejects(writeInVault(writer, preview), /unsaved/);
});

test('loopback endpoint rejects absent auth, browser origins and unauthorized profiles', async (t) => {
  const f = await connected();
  t.after(f.clean);
  const endpoint = await readEndpoint(f.vault),
    url = `http://127.0.0.1:${endpoint.port}/change`;
  assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 403);
  assert.equal(
    (
      await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${endpoint.token}`, origin: 'https://example.invalid' },
        body: '{}',
      })
    ).status,
    403,
  );
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${endpoint.token}` },
    body: '{}',
  });
  assert.equal(response.status, 409);
  assert.equal(f.writes(), 0);
});
