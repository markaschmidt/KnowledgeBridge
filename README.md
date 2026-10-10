# Knowledge Bridge

The desktop Obsidian companion for workspace-scoped knowledge sharing with Cursor and VS Code. The editor extension lives in [Obsidian IDE Knowledge Bridge](https://github.com/markaschmidt/Obsidian-IDE-Knowledge-Bridge); policy and retrieval live in [Knowledge Bridge Core](https://github.com/markaschmidt/KnowledgeBridgeCore). Each repository releases independently.

## Install or update

Download `main.js` and `manifest.json` from this repository's release and place them in your vault's `.obsidian/plugins/obsidian-integrated/` folder, then reload the plugin. Its visible name is **Knowledge Bridge**. The existing plugin ID remains `obsidian-integrated` so settings and upgrades keep their identity; preserve `data.json`. Do not install a second copy under another ID. Community-directory submission has not been performed.

In Knowledge Bridge settings, enter the private registry and approved workspace profile paths shown by the editor extension. The Obsidian window follows that explicit profile; switching IDE windows does not change it automatically. Vault registration and workspace scopes remain in **Obsidian IDE Knowledge Bridge: Manage Vaults and Workspace**.

Commands browse authorized notes, show scoped incoming/outgoing links from Obsidian's native graph, and capture selected text into an approved inbox. Capture refuses sealed or Rhen-denied source notes. Version 0.5 adds the authenticated local write bridge: reviewed creation, revision-checked edits via Vault.process, and recoverable deletion via Vault.trash. Enable editor writes and connect each editor registry in settings; each workspace must separately grant the operation. See [setup, use and recovery](WRITES.md). The bridge never unlocks Rhen.

## Develop and release

Node.js 22.16+, npm and Git are required for development. Run `npm ci` and `npm run check`. The build bundles a pinned core version and produces `dist/obsidian-integrated/`; the plugin has no runtime dependency on sibling repositories, Node on PATH, or a running IDE.

Bump `package.json`, `manifest.json` and `versions.json` together, then push a tag equal to the version (without a v prefix). CI tests all three desktop operating systems and releases the plugin assets. To adopt a core update, change the pinned Git commit in `package.json`, run `npm install`, review the lockfile and run this repository's checks. Plugin and editor versions can advance separately while the profile contract stays compatible.

Migration and versioning details are in [RELEASING.md](RELEASING.md). Tests use synthetic notes; live Obsidian/Rhen UI acceptance remains manual.
