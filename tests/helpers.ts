import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { profileSchema } from '@knowledge-bridge/core';
import { saveJson, approveProfile, KnowledgeService } from '@knowledge-bridge/core/service';

export async function fixture() {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'obsidian-integrated-test-'))),
    vault = join(base, 'vault');
  await mkdir(join(vault, 'Project', 'Inbox'), { recursive: true });
  await mkdir(join(vault, 'Other'), { recursive: true });
  await writeFile(
    join(vault, 'Project', 'Architecture.md'),
    '---\naliases: [Design]\ntags: [project]\n---\n# Architecture\nUse local retrieval for workspace knowledge. See [[Decision]].\n',
  );
  await writeFile(join(vault, 'Project', 'Decision.md'), '# Decision\nA linked design decision.\n');
  await writeFile(
    join(vault, 'Other', 'Secret.md'),
    '# Secret\nA different project contains the keyword retrieval.\n',
  );
  const registry = join(base, 'registry.json'),
    profile = join(base, 'workspace.json');
  const config = profileSchema.parse({
    version: 1,
    workspaceId: 'project-a',
    name: 'Project A',
    scopes: [{ vaultId: 'notes', include: ['Project/**/*.md'], captureFolder: 'Project/Inbox' }],
  });
  await saveJson(registry, {
    version: 1,
    vaults: [{ id: 'notes', name: 'Synthetic notes', root: vault, rhen: 'auto' }],
    approvals: {},
  });
  await saveJson(profile, config);
  await approveProfile(registry, profile);
  const clean = async () => {
    const within = relative(await realpath(tmpdir()), await realpath(base));
    if (isAbsolute(within) || !/^obsidian-integrated-test-[a-zA-Z0-9]+$/.test(within))
      throw new Error('Refusing cleanup outside synthetic fixture root');
    await rm(base, { recursive: true, force: true });
  };
  return {
    base,
    vault,
    registry,
    profile,
    config,
    service: new KnowledgeService(registry, profile),
    clean,
  };
}
