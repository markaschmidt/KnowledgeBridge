import {
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  FileSystemAdapter,
  FuzzySuggestModal,
  TFile,
  MarkdownView,
} from 'obsidian';
import type { App } from 'obsidian';
import { randomUUID } from 'node:crypto';
import { connectVault } from './connection.js';
import type { Note } from '@knowledge-bridge/core';
import { startVaultBridge } from './bridge.js';

interface Settings {
  registryPath: string;
  profilePath: string;
  editorWrites: boolean;
  additionalRegistries: string;
}
export default class KnowledgeBridgePlugin extends Plugin {
  settings: Settings = {
    registryPath: '',
    profilePath: '',
    editorWrites: false,
    additionalRegistries: '',
  };
  private bridge?: Awaited<ReturnType<typeof startVaultBridge>>;
  async onload(): Promise<void> {
    this.settings = { ...this.settings, ...(await this.loadData()) };
    this.addSettingTab(new KnowledgeBridgeSettings(this.app, this));
    await this.restartBridge().catch(
      (error) => new Notice(`Knowledge Bridge writes: ${error.message}`),
    );
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
  onunload(): void {
    void this.bridge?.close().catch(() => {});
  }
  async restartBridge(): Promise<void> {
    await this.bridge?.close();
    this.bridge = undefined;
    if (!this.settings.editorWrites) return;
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter))
      throw new Error('Desktop filesystem vault required');
    const vault = this.app.vault;
    this.bridge = await startVaultBridge(
      adapter.getBasePath(),
      () =>
        this.settings.editorWrites
          ? [this.settings.registryPath, ...this.settings.additionalRegistries.split(/\r?\n/)]
              .map((p) => p.trim())
              .filter(Boolean)
          : [],
      {
        file: (path: string) => {
          const file = vault.getAbstractFileByPath(path);
          return file instanceof TFile ? file : null;
        },
        create: (path, text) => vault.create(path, text),
        process: (file: TFile, transform) => vault.process(file, transform),
        read: (file: TFile) => vault.read(file),
        trash: (file: TFile, system) => vault.trash(file, system),
        assertSaved: (path, expected) => {
          for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
            const view = leaf.view;
            if (
              view instanceof MarkdownView &&
              view.file?.path === path &&
              view.editor.getValue() !== expected
            )
              throw new Error(
                'This note has unsaved editor changes. Save it in Obsidian, then review again.',
              );
          }
        },
      },
    );
  }
  async connection() {
    if (!this.settings.registryPath || !this.settings.profilePath)
      throw new Error(
        'Connect a registry and approved workspace profile in Knowledge Bridge settings',
      );
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter))
      throw new Error('Desktop filesystem vault required');
    return connectVault(
      adapter.getBasePath(),
      this.settings.registryPath,
      this.settings.profilePath,
    );
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
class KnowledgeBridgeSettings extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: KnowledgeBridgePlugin,
  ) {
    super(app, plugin);
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Knowledge Bridge' });
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
    new Setting(containerEl)
      .setName('Additional editor registries')
      .setDesc(
        'One absolute registry path per line, for example the other editor’s registry. Only approved workspaces in these registries can write to this vault.',
      )
      .addTextArea((text) =>
        text.setValue(this.plugin.settings.additionalRegistries).onChange(async (value) => {
          this.plugin.settings.additionalRegistries = value;
          await this.plugin.saveData(this.plugin.settings);
        }),
      );
    new Setting(containerEl)
      .setName('Enable editor writes')
      .setDesc(
        'Allow reviewed changes from connected editors. Each workspace must separately permit creation, editing, or deletion. Deleted notes go to this vault’s .trash folder.',
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.editorWrites).onChange(async (value) => {
          this.plugin.settings.editorWrites = value;
          await this.plugin.saveData(this.plugin.settings);
          try {
            await this.plugin.restartBridge();
            new Notice(value ? 'Editor write bridge enabled' : 'Editor write bridge disabled');
          } catch (error) {
            new Notice(error instanceof Error ? error.message : 'Could not start write bridge');
          }
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
