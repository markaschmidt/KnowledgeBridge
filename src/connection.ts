import { realpath } from 'node:fs/promises';
import { KnowledgeService, readRegistry } from '@knowledge-bridge/core/service';

export async function connectVault(rootPath: string, registryPath: string, profilePath: string) {
  const root = await realpath(rootPath);
  const registry = await readRegistry(registryPath);
  const vault = registry.vaults.find((v) => v.root === root);
  if (!vault) throw new Error('Register this vault in Obsidian IDE Knowledge Bridge settings');
  return { vaultId: vault.id, service: new KnowledgeService(registryPath, profilePath) };
}
