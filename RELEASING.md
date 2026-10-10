# Independent releases

This repository owns **Knowledge Bridge** and version 0.4.0. It is one of three sibling repositories under `ObsidianLiths/KnowledgeBridge`: `obsidian-plugin`, `ide-extension` and `core`. Each has its own origin, main branch, CI and version tags. The ObsidianLiths hub records their commit pointers; it does not combine their histories.

The shared core is an immutable commit-pinned archive dependency bundled into each consumer. Editing the core checkout never changes an installed consumer. Adopt a new core commit explicitly, regenerate the consumer lockfile, run its tests and make a separate consumer release. Keep schema version 1 compatibility or introduce an explicit migration before changing registry/profile contracts.

Release tags equal the package version, for example `0.4.0`. Push a version tag only after reviewing changes and running checks. The release workflow verifies the tag, checks all three operating systems and uploads that repository's artifact. The Obsidian plugin also requires matching manifest and versions.json entries. Do not reuse tags.

The editor extension retains `markaschmidt.obsidian-integrated`, its command/configuration IDs and local storage location. The companion retains plugin ID `obsidian-integrated` and its saved settings. These compatibility IDs are intentional; visible titles are Knowledge Bridge and Obsidian IDE Knowledge Bridge. Existing scopes and approvals require no rename or broadening.

Releases on GitHub do not imply Marketplace or Obsidian community-directory publication. Use Install from VSIX for the editor and copy the release assets into the existing plugin folder for Obsidian. Preserve plugin data.json and machine-local vault registries.
