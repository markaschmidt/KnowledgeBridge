import {
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  FileSystemAdapter,
  FuzzySuggestModal,
  TFile,
} from 'obsidian';
import type { App } from 'obsidian';
import { realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { KnowledgeService, readRegistry } from '@obsidian-integrated/local-service';
import type { Note } from '@obsidian-integrated/core';

interface Settings {
  registryPath: string;
  profilePath: string;
}
export default class IntegratedPlugin extends Plugin {
  settings: Settings = { registryPath: '', profilePath: '' };
  async onload(): Promise<void> {
    this.settings = { ...this.settings, ...(await this.loadData()) };
    this.addSettingTab(new IntegratedSettings(this.app, this));
    const handle = (operation: () => Promise<void>) => {
      void operation().catch(
        (error) =>
          new Notice(error instanceof Error ? error.message : 'Knowledge operation failed'),
      );
    };
    this.addCommand({
      id: 'browse-scope',
      name: 'Browse active workspace knowledge',
      callback: () =>
        handle(async () => {
          const { vaultId, service } = await this.connection();
          const { notes } = await service.snapshot();
          new NotePicker(
            this.app,
            notes.filter((n) => n.vaultId === vaultId),
          ).open();
        }),
    });
    this.addCommand({
      id: 'capture-selection',
      name: 'Capture selection to workspace inbox',
      editorCallback: (editor, view) =>
        handle(async () => {
          if (!view.file) throw new Error('Open a note first');
          const { vaultId, service } = await this.connection();
          // Do not export an editor's decrypted text merely because a Rhen session is unlocked.
          await service.read(vaultId, view.file.path);
          const content = editor.getSelection();
          if (!content) throw new Error('Select text to capture');
          const result = await service.capture({
            vaultId,
            requestId: randomUUID(),
            title: `From ${view.file.basename}`,
            content,
            source: 'obsidian',
          });
          new Notice(`Saved ${result.path}`);
        }),
    });
    this.addCommand({
      id: 'scoped-links',
      name: 'Show scoped native graph links',
      callback: () =>
        handle(async () => {
          const active = this.app.workspace.getActiveFile();
          if (!active) throw new Error('Open a note first');
          const { vaultId, service } = await this.connection();
          const { notes } = await service.snapshot();
          const allowed = notes.filter((n) => n.vaultId === vaultId),
            paths = new Set(allowed.map((n) => n.path));
          if (!paths.has(active.path)) throw new Error('Active note is outside the approved scope');
          const resolved = this.app.metadataCache.resolvedLinks;
          const neighbors = allowed.filter(
            (n) =>
              n.path !== active.path &&
              (resolved[active.path]?.[n.path] || resolved[n.path]?.[active.path]),
          );
          new NotePicker(this.app, neighbors).open();
        }),
    });
  }
  async connection() {
    if (!this.settings.registryPath || !this.settings.profilePath)
      throw new Error(
        'Connect a registry and approved workspace profile in Obsidian Integrated settings',
      );
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter))
      throw new Error('Desktop filesystem vault required');
    const root = await realpath(adapter.getBasePath());
    const registry = await readRegistry(this.settings.registryPath),
      vault = registry.vaults.find((v) => v.root === root);
    if (!vault)
      throw new Error('Register this vault from the Cursor or VS Code extension settings');
    return {
      vaultId: vault.id,
      service: new KnowledgeService(this.settings.registryPath, this.settings.profilePath),
    };
  }
}
class NotePicker extends FuzzySuggestModal<Note> {
  constructor(
    app: App,
    private notes: Note[],
  ) {
    super(app);
    this.setPlaceholder('Search approved notes');
  }
  getItems() {
    return this.notes;
  }
  getItemText(note: Note) {
    return `${note.title} — ${note.path}`;
  }
  onChooseItem(note: Note) {
    const file = this.app.vault.getAbstractFileByPath(note.path);
    if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
  }
}
class IntegratedSettings extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: IntegratedPlugin,
  ) {
    super(app, plugin);
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Obsidian Integrated' });
    containerEl.createEl('p', {
      text: 'Vault registration and workspace scopes are managed in the Cursor / VS Code extension. Select that same private registry and approved profile here. This plugin never unlocks Rhen notes.',
    });
    new Setting(containerEl)
      .setName('Vault registry')
      .setDesc('Absolute path shown by Manage Vaults and Workspace → Show registry location.')
      .addText((text) =>
        text.setValue(this.plugin.settings.registryPath).onChange(async (value) => {
          this.plugin.settings.registryPath = value;
          await this.plugin.saveData(this.plugin.settings);
        }),
      );
    new Setting(containerEl)
      .setName('Workspace profile')
      .setDesc('Absolute path to the approved workspace.json profile for this Obsidian session.')
      .addText((text) =>
        text.setValue(this.plugin.settings.profilePath).onChange(async (value) => {
          this.plugin.settings.profilePath = value;
          await this.plugin.saveData(this.plugin.settings);
        }),
      );
    new Setting(containerEl).setName('Validate connection').addButton((button) =>
      button.setButtonText('Check').onClick(async () => {
        try {
          const { service } = await this.plugin.connection();
          const status = await service.status();
          new Notice(`Connected to ${status.name}`);
        } catch (error) {
          new Notice(error instanceof Error ? error.message : 'Connection failed');
        }
      }),
    );
  }
}
