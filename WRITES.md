# Bidirectional notes (v0.5)

Knowledge Bridge supports scoped Markdown create, read, update and recoverable delete. Cursor and VS Code use the same Action selector, vault selector, document chips and Before/After review. The agent can prepare a draft; the user chooses its exact target and applies it.

## One-time setup

1. Install the v0.5+ editor VSIX and the v0.5+ Obsidian companion from their separate GitHub releases. Preserve existing registries and plugin data.json.
2. In the editor, run **Manage Vaults and Workspace → Configure a vault for this workspace**. An existing capture folder enables creation. Independently select **Edit existing notes** and/or **Move notes to vault trash**. These grants apply only to this approved workspace profile and its existing path/tag filters.
3. Use **Show registry location** and put that path in Obsidian's **Knowledge Bridge → Vault registry** setting. When using both editors, add the second editor's registry under **Additional editor registries**, one path per line. The registry must register the currently open vault.
4. Enable **Editor writes** in the Obsidian plugin. Keep that vault open. The active profile setting is used by Obsidian's browse/graph commands; the write bridge independently validates the exact approved profile bound to each editor request, so simultaneous workspaces do not merge scopes.
5. Run **Enable /obsidian in This Workspace** to update the shipped skill. Edited/custom skills are preserved.

Existing profiles retain their previous approval hash and permissions until you change them. Omitting captureFolder disables creation; omitting write disables both update and delete. A read-only scope omits all three grants. Adding a permission changes the profile hash and requires approval. No tool can approve its own profile.

## Use it

- Read: submit `/obsidian`, choose the vault (automatically chosen when only one is scoped), select documents and **Add to chat**.
- Create: ask `/obsidian create a note with these decisions…`. The agent calls `knowledge_change` with a draft. Choose the vault, enter a new Markdown path inside its capture folder, inspect **Review change**, then **Create note**.
- Edit: ask `/obsidian update a note with these findings…`. Select one document, inspect/edit the complete Markdown draft, review Before/After, then **Save changes**. Preserve required tags, frontmatter and wiki links. Without an agent draft, selecting a document loads its full text; **Load current note** can reload it explicitly.
- Delete: ask `/obsidian delete a note`, select one document, review its exact path and contents, then **Move to trash**. Other notes' link text is left intact; links to the deleted note may become unresolved.

The shared builder's **Action** selector also exposes all four operations. **Write to Obsidian** opens it with selected editor text as a new-note draft. On a host without MCP Apps, `knowledge_change` gives instructions to open this same editor builder and paste the draft. Older elicitation forms remain available for reading, not mutation. Noninteractive CLI clients retain scoped read/search and the separately authorized legacy create-only `knowledge_capture` tool; there is no unattended update/delete tool.

## Revision and recovery behavior

Nothing is written while drafting or reviewing. Editing the draft invalidates its visible review. Each review is bound to the offered document revision, vault binding, approved profile and Rhen policy. Cancel before Apply closes the handle. Once Apply starts, cancellation cannot retract an accepted write.

The Obsidian bridge serializes Knowledge Bridge mutations in its process, repeats authorization, and compares the current text inside **Vault.process** for updates. A changed, sealed, excluded or newly locked note is refused. Open Markdown views with unsaved content are refused. Only complete notes up to 40,000 characters can be edited or reviewed for deletion; a truncated retrieval excerpt cannot silently become a full-note replacement.

Deletion uses **Vault.trash(file, false)**, never permanent deletion. Restore the file from the vault's hidden **.trash** folder using the file manager, then reopen the picker. Obsidian chooses the trash filename. Restore is manual in v0.5. Obsidian does not expose a revision-conditional trash operation: the plugin checks immediately before trashing; a concurrent external edit in that narrow interval is retained in trash, not merged or permanently removed.

Identical retries of one review retrieve the same in-memory result for the lifetime of that plugin session (15-minute receipt retention). Request IDs cannot be reused with different data. After a timeout, check the note and retry the same review; after restarting Obsidian, reopen and review current state. Durable receipts, automatic conflict merging, rename/move, multi-device sync conflict handling and offline existing-note writes are not implemented. Update/delete refuse when the companion is unavailable. Legacy create-only capture still works offline.

## Local connection and boundaries

The plugin listens only on a randomly selected **127.0.0.1** port. A fresh 256-bit bearer token is stored in the vault's hidden `.knowledge-bridge/connection.json`, with restrictive creation permissions. The client accepts only that fixed loopback host. Requests require the token, exact Host header, no browser Origin, a bounded body, an allowed editor registry, an approved profile and a matching vault root. Exclude `.knowledge-bridge/` from Git and any backup/sync configuration that includes hidden application state. It contains a local credential, not note bodies. Do not share it.

This is an integration permission boundary, not an OS sandbox against another process with the same account's filesystem rights. Rhen compatibility still relies on its disk policy; there is no authenticated live Rhen policy/mutation transaction. Rapid policy changes and concurrent external writers require live acceptance; no plugin bypasses Rhen or exports decrypted editor buffers.

Changes remain ordinary Markdown, so Obsidian's normal metadata cache and graph observe them. Shared lexical/graph retrieval revalidates disk state on its next operation; there is no persistent vector index in this preview.

## Evidence and host limits

Synthetic tests cover scoped CRUD, graph freshness, revision conflicts, Rhen changes, registry revocation, recoverable trash, retry deduplication, authentication, complete-content review and cancellation. The common UI is exercised in a real browser. Obsidian API behavior is tested through its adapter contract, not a live personal vault. Signed-in Cursor/VS Code Agent chat and live Obsidian/Rhen acceptance remain manual.

Official references: [Obsidian Vault process and trash](https://docs.obsidian.md/Plugins/Vault), [Cursor MCP Apps](https://cursor.com/docs/mcp), and [VS Code MCP](https://code.visualstudio.com/api/extension-guides/ai/mcp).
