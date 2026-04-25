import { Plugin, WorkspaceLeaf } from 'obsidian';
import { SidebarView, VIEW_TYPE_EDITOR } from './ui/SidebarView';

export default class EditorPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE_EDITOR, (leaf) => new SidebarView(leaf));

    this.addRibbonIcon('edit-3', 'Open Editor', async () => {
      await this.activateView();
    });

    this.addCommand({
      id: 'open-editor-sidebar',
      name: 'Open Editor sidebar',
      callback: () => this.activateView(),
    });
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_EDITOR);
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_EDITOR);
    if (existing.length > 0) {
      leaf = existing[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      await leaf?.setViewState({ type: VIEW_TYPE_EDITOR, active: true });
    }
    if (leaf) workspace.revealLeaf(leaf);
  }
}
