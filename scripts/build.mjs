import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'es2022',
  external: ['obsidian'],
  outfile: 'main.js',
  sourcemap: true,
});
await mkdir('dist/obsidian-integrated', { recursive: true });
for (const file of ['main.js', 'manifest.json', 'versions.json'])
  await copyFile(file, 'dist/obsidian-integrated/' + file);
