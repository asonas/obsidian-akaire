import { ItemView, WorkspaceLeaf } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { renderCommentCard, CommentCardCallbacks } from './CommentCard';
import type { ReviewComment } from '../types';
import type { ReviewSession } from '../core/ReviewSession';

export const VIEW_TYPE_EDITOR = 'editor-plugin-sidebar';

export type SidebarPhase = 'idle' | 'reviewing' | 'reviewed' | 'error';

export interface SidebarActions {
  onReviewFull: () => void;
  onReviewDiff: () => void;
}

const CHAT_HINTS = [
  'もっと厳しく',
  '別の言い回しを3案',
  '導入を2割短く',
  '結論部の論理を再点検',
];

export class SidebarView extends ItemView {
  private currentSession: ReviewSession | null = null;
  private currentEditorView: EditorView | null = null;
  private actions: SidebarActions | null = null;

  private elPhase!: HTMLElement;
  private elMeta!: HTMLElement;
  private elActions!: HTMLElement;
  private elState!: HTMLElement;
  private elSection!: HTMLElement;
  private elCards!: HTMLElement;
  private elLegend!: HTMLElement;
  private elChatLog!: HTMLElement;
  private elChatInput!: HTMLTextAreaElement;
  private elChatSend!: HTMLButtonElement;
  private elChatHints!: HTMLElement;
  private elChatLocked!: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE_EDITOR; }
  getDisplayText(): string { return 'Akaire'; }
  getIcon(): string { return 'edit-3'; }

  setActions(actions: SidebarActions): void {
    this.actions = actions;
    this.wireActions();
  }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    const wrap = root.createEl('div', { cls: 'akaire-root' });

    // ---- header
    const header = wrap.createEl('div', { cls: 'akaire-header' });
    const title = header.createEl('div', { cls: 'akaire-title' });
    title.createEl('span', { cls: 'akaire-title__kanji', text: '赤入れ' });
    title.createEl('span', { cls: 'akaire-title__roma', text: 'Akaire' });
    this.elPhase = header.createEl('span', {
      cls: 'akaire-phase',
      text: '待機',
      attr: { 'data-phase': 'idle' },
    });

    // ---- meta line (file, last-reviewed)
    this.elMeta = wrap.createEl('div', { cls: 'akaire-meta' });

    // ---- action bar
    this.elActions = wrap.createEl('div', { cls: 'akaire-actions' });
    this.elActions.createEl('button', {
      text: '全文をレビュー',
      cls: 'is-primary',
      attr: { type: 'button', 'data-action': 'review-full' },
    });
    this.elActions.createEl('button', {
      text: '差分のみ',
      attr: { type: 'button', 'data-action': 'review-diff' },
    });

    // ---- transient state (empty / reviewing / error)
    this.elState = wrap.createEl('div', { cls: 'akaire-state' });

    // ---- comments section
    this.elSection = wrap.createEl('div');
    const head = this.elSection.createEl('div', { cls: 'akaire-section-head' });
    head.createEl('h4', {
      cls: 'akaire-section-head__title',
      text: '指摘',
    });
    head.createEl('span', {
      cls: 'akaire-section-head__count',
      attr: { id: 'akaire-section-count' },
      text: '— 件',
    });
    this.elLegend = this.elSection.createEl('div', { cls: 'akaire-legend' });
    this.elCards = this.elSection.createEl('div', { cls: 'akaire-cards' });
    this.elSection.style.display = 'none';

    // ---- chat
    const chat = wrap.createEl('div', { cls: 'akaire-chat' });
    const chatHead = chat.createEl('div', { cls: 'akaire-chat__head' });
    chatHead.createEl('h4', {
      cls: 'akaire-chat__title',
      text: '編集者と対話する',
    });
    chatHead.createEl('p', {
      cls: 'akaire-chat__sub',
      text: 'レビュー結果について追問できます。同じ会話セッションが続きます。',
    });

    this.elChatHints = chat.createEl('div', { cls: 'akaire-chat__hints' });
    for (const hint of CHAT_HINTS) {
      const chip = this.elChatHints.createEl('button', {
        cls: 'akaire-chat__hint',
        text: hint,
        attr: { type: 'button' },
      });
      chip.addEventListener('click', () => {
        this.elChatInput.value = this.elChatInput.value
          ? `${this.elChatInput.value}\n${hint}`
          : hint;
        this.elChatInput.focus();
      });
    }

    this.elChatLog = chat.createEl('div', { cls: 'akaire-chat__log' });

    this.elChatLocked = chat.createEl('p', {
      cls: 'akaire-chat__locked',
      text: '— レビュー実行後に対話できます',
    });

    const form = chat.createEl('div', { cls: 'akaire-chat__form' });
    this.elChatInput = form.createEl('textarea', {
      cls: 'akaire-chat__input',
      attr: { placeholder: '例: もっと厳しく見て', rows: '3' },
    }) as HTMLTextAreaElement;
    this.elChatSend = form.createEl('button', {
      cls: 'akaire-chat__send',
      text: '送る',
      attr: { type: 'button' },
    }) as HTMLButtonElement;

    chat.createEl('div', {
      cls: 'akaire-chat__shortcut',
      text: '⌘ + Enter で送信',
    });

    this.attachChatHandler();
    this.renderEmpty();
    this.updateChatLockUI();
    this.wireActions();
  }

  async onClose(): Promise<void> {}

  bind(session: ReviewSession, editorView: EditorView): void {
    this.currentSession = session;
    this.currentEditorView = editorView;
    this.refresh();
    this.renderChatHistory();
    this.updateChatLockUI();
    this.updateMeta();
    if (session.comments.length > 0) {
      this.setPhase('reviewed');
    }
  }

  setEditorView(editorView: EditorView): void {
    this.currentEditorView = editorView;
  }

  unbind(): void {
    this.currentSession = null;
    this.currentEditorView = null;
    this.setBanner(null);
    this.elCards?.empty();
    this.elChatLog?.empty();
    this.renderEmpty();
    this.updateChatLockUI();
    this.updateMeta();
  }

  refresh(): void {
    if (!this.currentSession) {
      this.renderEmpty();
      return;
    }
    const items = this.currentSession.comments.map((c) => ({
      comment: c,
      stale: false,
    }));
    this.renderCards(items, {
      onApply: (id) => { this.currentSession!.applyComment(id); this.refresh(); },
      onDismiss: (id) => { this.currentSession!.dismissComment(id); this.refresh(); },
      onJump: (id) => this.jumpTo(id),
    });
    this.updateChatLockUI();
  }

  markReviewed(at: Date = new Date()): void {
    this.setPhase('reviewed');
    this.updateMeta(at);
  }

  renderCards(comments: Array<{ comment: ReviewComment; stale: boolean }>, cb: CommentCardCallbacks): void {
    if (!this.elCards) return;
    this.elCards.empty();

    if (comments.length === 0) {
      this.elSection.style.display = 'none';
      this.setStateBlock({
        kind: 'empty',
        title: '指摘なし',
        body: 'このノートに対する指摘はありません。差分レビューや、対話で追問することもできます。',
      });
      return;
    }

    this.clearStateBlock();
    this.elSection.style.display = '';

    const countEl = this.containerEl.querySelector('#akaire-section-count') as HTMLElement | null;
    if (countEl) countEl.setText(`${comments.length} 件`);

    this.renderLegend(comments.map((c) => c.comment.severity));

    let idx = 0;
    for (const item of comments) {
      idx++;
      renderCommentCard(this.elCards, item.comment, idx, item.stale, cb);
    }
  }

  private renderLegend(severities: Array<ReviewComment['severity']>): void {
    if (!this.elLegend) return;
    this.elLegend.empty();
    const counts: Record<ReviewComment['severity'], number> = {
      warning: 0, suggestion: 0, info: 0,
    };
    for (const s of severities) counts[s]++;

    const items: Array<{ key: ReviewComment['severity']; label: string }> = [
      { key: 'warning', label: '要修正' },
      { key: 'suggestion', label: '提案' },
      { key: 'info', label: '補足' },
    ];

    for (const it of items) {
      const wrap = this.elLegend.createEl('span', {
        cls: `akaire-legend__item${counts[it.key] === 0 ? ' is-zero' : ''}`,
      });
      wrap.createEl('span', { cls: `akaire-legend__bar akaire-legend__bar--${it.key}` });
      wrap.createEl('span', { cls: 'akaire-legend__label', text: it.label });
      wrap.createEl('span', { cls: 'akaire-legend__count', text: String(counts[it.key]) });
    }
  }

  /** legacy banner API — routes errors to the state block */
  setBanner(text: string | null): void {
    if (!text) {
      this.setPhase('idle');
      this.clearStateBlock();
      return;
    }
    this.setPhase('error');
    this.setStateBlock({
      kind: 'error',
      title: 'エラー',
      body: text,
    });
  }

  setPhase(phase: SidebarPhase, label?: string): void {
    if (!this.elPhase) return;
    const labelByPhase: Record<SidebarPhase, string> = {
      idle: '待機',
      reviewing: '校正中',
      reviewed: '完了',
      error: 'エラー',
    };
    this.elPhase.setAttribute('data-phase', phase);
    this.elPhase.setText(label ?? labelByPhase[phase]);

    if (phase === 'reviewing') {
      this.setStateBlock({
        kind: 'reviewing',
        title: 'Claudeが原稿を読んでいます',
        body: '完了まで通常10〜60秒ほどかかります。長文の場合はそれ以上かかることがあります。',
      });
      this.elActions
        ?.querySelectorAll('button')
        .forEach((b) => ((b as HTMLButtonElement).disabled = true));
    } else {
      this.elActions
        ?.querySelectorAll('button')
        .forEach((b) => ((b as HTMLButtonElement).disabled = false));
    }
  }

  private setStateBlock(opts: {
    kind: 'empty' | 'reviewing' | 'error';
    title: string;
    body: string;
    hint?: string;
  }): void {
    if (!this.elState) return;
    this.elState.empty();
    this.elState.setAttribute('data-kind', opts.kind);
    this.elState.style.display = '';
    this.elState.createEl('p', { cls: 'akaire-state__title', text: opts.title });
    this.elState.createEl('p', { cls: 'akaire-state__body', text: opts.body });
    if (opts.hint) {
      this.elState.createEl('p', { cls: 'akaire-state__hint', text: opts.hint });
    }
  }
  private clearStateBlock(): void {
    if (!this.elState) return;
    this.elState.empty();
    this.elState.style.display = 'none';
  }

  private renderEmpty(): void {
    this.elCards?.empty();
    this.elSection.style.display = 'none';
    this.setPhase('idle');
    this.setStateBlock({
      kind: 'empty',
      title: 'ノートを開いてください',
      body: 'Markdownノートをアクティブにすると、ここから「全文をレビュー」または「差分のみ」をすぐに実行できます。',
      hint: 'コマンドパレット: Akaire: Review whole note',
    });
  }

  private updateMeta(reviewedAt?: Date): void {
    if (!this.elMeta) return;
    this.elMeta.empty();
    if (!this.currentSession) {
      this.elMeta.createEl('span', {
        cls: 'akaire-meta__label',
        text: '対象 :',
      });
      this.elMeta.createEl('span', {
        cls: 'akaire-meta__file',
        text: '—',
      });
      return;
    }
    const path = (this.currentSession as any).opts?.notePath ?? '';
    const baseName = path.split('/').pop() || path;
    this.elMeta.createEl('span', {
      cls: 'akaire-meta__label',
      text: '対象 :',
    });
    this.elMeta.createEl('span', {
      cls: 'akaire-meta__file',
      text: baseName,
    });
    if (reviewedAt) {
      this.elMeta.createEl('span', { cls: 'akaire-meta__sep', text: '·' });
      this.elMeta.createEl('span', {
        cls: 'akaire-meta__label',
        text: '最終レビュー',
      });
      this.elMeta.createEl('span', {
        cls: 'akaire-meta__time',
        text: formatTime(reviewedAt),
      });
    }
  }

  private updateChatLockUI(): void {
    if (!this.elChatInput) return;
    const hasSession = !!this.currentSession?.sessionId;
    this.elChatInput.disabled = !hasSession;
    this.elChatSend.disabled = !hasSession;
    this.elChatLocked.style.display = hasSession ? 'none' : '';
    if (this.elChatHints) {
      this.elChatHints.style.display = hasSession ? '' : 'none';
    }
  }

  private wireActions(): void {
    if (!this.actions || !this.elActions) return;
    const full = this.elActions.querySelector('[data-action="review-full"]') as HTMLButtonElement | null;
    const diff = this.elActions.querySelector('[data-action="review-diff"]') as HTMLButtonElement | null;
    if (full) full.onclick = () => this.actions!.onReviewFull();
    if (diff) diff.onclick = () => this.actions!.onReviewDiff();
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
    if (!this.elChatSend || !this.elChatInput || !this.elChatLog) return;

    const send = async () => {
      if (!this.currentSession || !this.elChatInput.value) return;
      if (!this.currentSession.sessionId) return;
      const msg = this.elChatInput.value;
      this.appendChatMsg('user', msg);
      this.elChatInput.value = '';
      this.elChatSend.disabled = true;
      try {
        const reply = await this.currentSession.sendChatMessage(msg);
        this.appendChatMsg('ai', reply);
      } catch (e) {
        this.appendChatMsg('err', (e as Error).message);
      } finally {
        this.updateChatLockUI();
      }
    };

    this.elChatSend.onclick = send;
    this.elChatInput.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        send();
      }
    });
  }

  private appendChatMsg(kind: 'user' | 'ai' | 'err', text: string): void {
    const msg = this.elChatLog.createEl('div', {
      cls: `akaire-chat__msg akaire-chat__msg--${kind}`,
    });
    msg.createEl('div', { cls: 'akaire-chat__msg__body', text });
    this.elChatLog.scrollTop = this.elChatLog.scrollHeight;
  }

  private renderChatHistory(): void {
    if (!this.elChatLog) return;
    this.elChatLog.empty();
    if (!this.currentSession) return;
    for (const msg of this.currentSession.chatLog) {
      this.appendChatMsg(msg.kind, msg.text);
    }
  }
}

function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
