import { readFile } from 'node:fs/promises';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const tag = process.argv[2] ?? pkg.version;
if (tag !== pkg.version) throw new Error('Release tag must equal package version');
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const versions = JSON.parse(await readFile('versions.json', 'utf8'));
if (manifest.version !== tag || versions[tag] !== manifest.minAppVersion)
  throw new Error('Manifest and versions.json must match the release');
console.log('Release version verified:', tag);
