import { ItemView, WorkspaceLeaf } from 'obsidian';

export const VIEW_TYPE_EDITOR = 'editor-plugin-sidebar';

export class SidebarView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE_EDITOR; }
  getDisplayText(): string { return 'Editor'; }
  getIcon(): string { return 'edit-3'; }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1];
    root.empty();
    root.createEl('h4', { text: 'Editor' });
    root.createEl('div', { cls: 'editor-banner', attr: { id: 'editor-banner' } });
    root.createEl('div', { cls: 'editor-cards', attr: { id: 'editor-cards' } });
    root.createEl('hr');
    const chat = root.createEl('div', { cls: 'editor-chat' });
    chat.createEl('div', { attr: { id: 'editor-chat-log' } });
    const input = chat.createEl('textarea', {
      attr: { id: 'editor-chat-input', placeholder: '会話する…' },
    });
    chat.createEl('button', { text: '送信', attr: { id: 'editor-chat-send' } });
  }

  async onClose(): Promise<void> {}
}
