import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import {
  KnowledgeService,
  loadApproved,
  mutationRequestSchema,
  prepareChange,
  publishEndpoint,
  removeEndpoint,
  digest,
  type ChangeResult,
} from '@knowledge-bridge/core/service';
import { readRhenPolicy } from '@knowledge-bridge/core/rhen';
import { writeInVault, type VaultWriter } from './writer.js';

/** Local authenticated transport. Scope authority comes from user-selected registries. */
export async function startVaultBridge<File>(
  rootPath: string,
  registries: () => string[],
  writer: VaultWriter<File>,
) {
  const root = await realpath(rootPath);
  const token = randomBytes(32).toString('hex');
  let closing = false;
  let queue: Promise<unknown> = Promise.resolve();
  const receipts = new Map<
    string,
    { hash: string; expires: number; result: Promise<ChangeResult> }
  >();
  const execute = async (input: unknown): Promise<ChangeResult> => {
    if (closing) throw new Error('Knowledge Bridge is stopping');
    const request = mutationRequestSchema.parse(input);
    const registryPath = await realpath(request.registryPath);
    const allowed = await Promise.all(registries().map((path) => realpath(path)));
    if (!allowed.includes(registryPath))
      throw new Error('This editor registry is not connected in Knowledge Bridge settings');
    const service = new KnowledgeService(registryPath, request.profilePath);
    const { bindings } = await loadApproved(registryPath, request.profilePath);
    const binding = bindings.find((b) => b.vault.id === request.vaultId);
    if (!binding || binding.vault.root !== root)
      throw new Error('This request belongs to a different vault');
    if ((await service.pickerScope()).revision !== request.scopeRevision)
      throw new Error('Workspace scope changed. Reopen the builder.');
    if (
      (await (await readRhenPolicy(root, binding.vault.rhen)).revision()) !== request.policyRevision
    )
      throw new Error('Rhen policy changed. Reopen the builder.');
    const hash = digest(JSON.stringify(request));
    const key = `${registryPath}\0${request.profilePath}\0${request.requestId}`;
    const previous = receipts.get(key);
    if (previous) {
      if (previous.hash !== hash)
        throw new Error('Change request ID conflicts with an earlier request');
      return previous.result;
    }
    for (const [id, receipt] of receipts) if (receipt.expires <= Date.now()) receipts.delete(id);
    if (receipts.size >= 128)
      throw new Error('Too many recent changes. Wait 15 minutes before starting another.');
    const result = queue.then(async () => {
      if (closing) throw new Error('Knowledge Bridge is stopping');
      const {
        requestId: _id,
        scopeRevision,
        policyRevision,
        registryPath: _registry,
        profilePath: _profile,
        ...draft
      } = request;
      const preview = await prepareChange(service, draft, scopeRevision);
      if (preview.policyRevision !== policyRevision)
        throw new Error('Rhen policy changed after review. Reopen the builder.');
      // Recheck the registry allowlist after waiting behind another write.
      if (!(await Promise.all(registries().map((path) => realpath(path)))).includes(registryPath))
        throw new Error('Editor write connection was revoked');
      return writeInVault(writer, preview);
    });
    receipts.set(key, { hash, expires: Date.now() + 15 * 60_000, result });
    queue = result.catch(() => {});
    return result;
  };
  const server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    const auth = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    if (
      req.method !== 'POST' ||
      req.url !== '/change' ||
      req.headers.origin ||
      req.headers.host !== `127.0.0.1:${port}` ||
      req.socket.remoteAddress !== '127.0.0.1' ||
      auth.length !== expected.length ||
      !timingSafeEqual(auth, expected)
    ) {
      res.writeHead(403).end(JSON.stringify({ error: 'Unauthorized bridge request' }));
      return;
    }
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 300000) throw new Error('Change request is too large');
        chunks.push(chunk);
      }
      const result = await execute(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      res.end(JSON.stringify(result));
    } catch (error) {
      res
        .writeHead(409)
        .end(JSON.stringify({ error: error instanceof Error ? error.message : 'Change failed' }));
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxConnections = 16;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not start Knowledge Bridge');
  try {
    await publishEndpoint(root, { version: 1, port: address.port, token });
  } catch (error) {
    server.close();
    throw error;
  }
  return {
    async close() {
      closing = true;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await queue;
      await removeEndpoint(root, token);
    },
  };
}
