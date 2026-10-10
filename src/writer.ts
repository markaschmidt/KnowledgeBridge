import { digest, type ChangePreview, type ChangeResult } from '@knowledge-bridge/core/service';

/** Host adapter keeps Obsidian APIs out of the shared policy package. */
export interface VaultWriter<File> {
  file(path: string): File | null;
  create(path: string, content: string): Promise<unknown>;
  process(file: File, transform: (current: string) => string): Promise<string>;
  read(file: File): Promise<string>;
  trash(file: File, system: false): Promise<void>;
  assertSaved?(path: string, expected: string | null): void;
}
export async function writeInVault<File>(
  vault: VaultWriter<File>,
  preview: ChangePreview,
): Promise<ChangeResult> {
  vault.assertSaved?.(preview.path, preview.before);
  const result: ChangeResult = {
    status: 'applied',
    operation: preview.operation,
    vaultId: preview.vaultId,
    path: preview.path,
  };
  if (preview.operation === 'create') {
    if (vault.file(preview.path)) throw new Error('A note already exists at this path');
    await vault.create(preview.path, preview.after!);
    return { ...result, revision: digest(preview.after!) };
  }
  const file = vault.file(preview.path);
  if (!file) throw new Error('The note is no longer available in Obsidian');
  const unchanged = (current: string) => {
    if (digest(current) !== preview.expectedRevision)
      throw new Error('The note changed after review. Reopen the builder.');
  };
  if (preview.operation === 'update') {
    // The comparison is INSIDE Obsidian's atomic read/modify operation.
    await vault.process(file, (current) => {
      unchanged(current);
      return preview.after!;
    });
    return { ...result, revision: digest(preview.after!) };
  }
  unchanged(await vault.read(file));
  // Never call Vault.delete. Obsidian retains the actual file, including any
  // last-moment external edit between this check and moving it to local trash.
  await vault.trash(file, false);
  return {
    ...result,
    recovery:
      'Restore the note from this vault’s .trash folder. Obsidian chooses the trash filename.',
  };
}
