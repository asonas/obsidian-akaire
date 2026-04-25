import { ItemView, WorkspaceLeaf } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { renderCommentCard, CommentCardCallbacks } from './CommentCard';
import type { ReviewComment } from '../types';
import type { ReviewSession } from '../core/ReviewSession';

export const VIEW_TYPE_EDITOR = 'editor-plugin-sidebar';

export class SidebarView extends ItemView {
  private currentSession: ReviewSession | null = null;
  private currentEditorView: EditorView | null = null;

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

  bind(session: ReviewSession, editorView: EditorView): void {
    this.currentSession = session;
    this.currentEditorView = editorView;
    this.refresh();
    this.attachChatHandler();
  }

  unbind(): void {
    this.currentSession = null;
    this.currentEditorView = null;
    this.setBanner(null);
    const cards = this.containerEl.querySelector('#editor-cards') as HTMLElement;
    cards?.empty();
  }

  refresh(): void {
    if (!this.currentSession) return;
    const items = this.currentSession.comments.map((c) => ({
      comment: c,
      stale: false,
    }));
    this.renderCards(items, {
      onApply: (id) => { this.currentSession!.applyComment(id); this.refresh(); },
      onDismiss: (id) => { this.currentSession!.dismissComment(id); this.refresh(); },
      onJump: (id) => this.jumpTo(id),
    });
  }

  renderCards(comments: Array<{ comment: ReviewComment; stale: boolean }>, cb: CommentCardCallbacks): void {
    const cards = this.containerEl.querySelector('#editor-cards');
    if (!cards) return;
    cards.empty();
    for (const item of comments) {
      renderCommentCard(cards as HTMLElement, item.comment, item.stale, cb);
    }
  }

  setBanner(text: string | null): void {
    const banner = this.containerEl.querySelector('#editor-banner') as HTMLElement;
    if (!banner) return;
    if (!text) { banner.empty(); banner.style.display = 'none'; return; }
    banner.style.display = 'block';
    banner.setText(text);
  }

  private jumpTo(commentId: string): void {
    if (!this.currentEditorView || !this.currentSession) return;
    const a = (this.currentSession as any).anchors.get(commentId);
    if (!a) return;
    this.currentEditorView.dispatch({
      selection: { anchor: a.from, head: a.to },
      scrollIntoView: true,
    });
  }

  private attachChatHandler(): void {
    const sendBtn = this.containerEl.querySelector('#editor-chat-send') as HTMLButtonElement | null;
    const input = this.containerEl.querySelector('#editor-chat-input') as HTMLTextAreaElement | null;
    const log = this.containerEl.querySelector('#editor-chat-log') as HTMLElement | null;
    if (!sendBtn || !input || !log) return;
    sendBtn.onclick = async () => {
      if (!this.currentSession || !input.value) return;
      const msg = input.value;
      log.createEl('div', { cls: 'editor-chat-user', text: 'you: ' + msg });
      input.value = '';
      try {
        const reply = await this.currentSession.sendChatMessage(msg);
        log.createEl('div', { cls: 'editor-chat-ai', text: 'ai: ' + reply });
      } catch (e) {
        log.createEl('div', { cls: 'editor-chat-error', text: 'err: ' + (e as Error).message });
      }
    };
  }
}
