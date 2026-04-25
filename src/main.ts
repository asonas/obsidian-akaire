import { Plugin, MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';
import { spawn } from 'node:child_process';
import { EditorView } from '@codemirror/view';
import { SidebarView, VIEW_TYPE_EDITOR } from './ui/SidebarView';
import { ReviewSession } from './core/ReviewSession';
import { ClaudeRunner } from './core/ClaudeRunner';
import { TextlintRunner } from './core/TextlintRunner';
import { AnchorStore } from './core/AnchorStore';
import { PromptResolver } from './core/PromptResolver';
import { makeFsApi, makeAnchorFsApi } from './util/obsidianFs';
import { anchorField, setAnchorMarks, clearAnchorMarks } from './editor/decoration';

export default class EditorPlugin extends Plugin {
  private session: ReviewSession | null = null;
  private runner!: ClaudeRunner;
  private textlint!: TextlintRunner;
  private anchorStore!: AnchorStore;
  private promptResolver!: PromptResolver;
  private currentAbort: AbortController | null = null;

  async onload() {
    const vaultRoot = (this.app.vault.adapter as any).basePath as string;

    this.runner = new ClaudeRunner({
      claudeBinary: 'claude',
      spawn,
      timeoutMs: 30_000,
    });
    this.textlint = new TextlintRunner({
      binary: 'npx',
      spawn,
    });
    this.anchorStore = new AnchorStore({
      vaultRoot,
      fs: makeAnchorFsApi(this.app),
    });
    this.promptResolver = new PromptResolver({
      vaultRoot,
      fs: makeFsApi(this.app),
    });

    this.registerView(VIEW_TYPE_EDITOR, (leaf) => new SidebarView(leaf));
    this.registerEditorExtension(anchorField);

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => this.onLeafChange(leaf))
    );

    this.addCommand({
      id: 'review-changed',
      name: 'Editor: Review changed paragraphs',
      callback: () => this.runReview('diff'),
    });
    this.addCommand({
      id: 'review-full',
      name: 'Editor: Review whole note',
      callback: () => this.runReview('full'),
    });
    this.addCommand({
      id: 'open-sidebar',
      name: 'Editor: Open sidebar',
      callback: () => this.activateView(),
    });
    this.addRibbonIcon('edit-3', 'Open Editor', () => this.activateView());
  }

  async onunload() {
    this.currentAbort?.abort();
    if (this.session) await this.session.persist();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_EDITOR);
  }

  private async onLeafChange(leaf: WorkspaceLeaf | null): Promise<void> {
    this.currentAbort?.abort();
    const sidebars = this.app.workspace.getLeavesOfType(VIEW_TYPE_EDITOR);
    const sidebarView = sidebars[0]?.view as SidebarView | undefined;

    if (this.session) {
      await this.session.persist();
      this.session = null;
      sidebarView?.unbind?.();
    }
    if (!leaf) return;
    const view = leaf.view;
    if (!(view instanceof MarkdownView) || !view.file) return;
    this.session = await this.makeSession(view);

    // frontmatter から sessionId を読む
    const cache = this.app.metadataCache.getFileCache(view.file);
    const fmSessionId = cache?.frontmatter?.editor_session;
    if (typeof fmSessionId === 'string') {
      this.session.sessionId = fmSessionId;
    }

    await this.session.rehydrate();

    const cm = (view.editor as any).cm as EditorView;
    sidebarView?.bind?.(this.session, cm);

    // textlintの可用性を確認しバナー表示
    const probe = await this.textlint.lint(view.file.path);
    if (!probe.available) {
      sidebarView?.setBanner(`textlint が見つかりません — ${probe.reason}`);
    } else {
      sidebarView?.setBanner(null);
    }
  }

  private async makeSession(view: MarkdownView): Promise<ReviewSession> {
    const file = view.file as TFile;
    const editor = view.editor;
    const cm = (view.editor as any).cm as EditorView;
    const bridge = {
      getText: () => editor.getValue(),
      replaceRange: (text: string, from: number, to: number) => {
        const fromPos = editor.offsetToPos(from);
        const toPos = editor.offsetToPos(to);
        editor.replaceRange(text, fromPos, toPos);
      },
      setHighlights: (marks: Array<{ from: number; to: number; commentId: string }>) => {
        cm.dispatch({
          effects: setAnchorMarks.of(
            marks.map((m) => ({ ...m, source: 'ai' as const }))
          ),
        });
      },
      clearHighlights: () => {
        cm.dispatch({ effects: clearAnchorMarks.of() });
      },
    };
    const vaultRoot = (this.app.vault.adapter as any).basePath as string;
    return new ReviewSession({
      notePath: file.path,
      editor: bridge,
      anchorStore: this.anchorStore,
      runner: this.runner,
      textlint: this.textlint,
      promptResolver: this.promptResolver,
      vaultDir: vaultRoot,
    });
  }

  private async runReview(mode: 'full' | 'diff'): Promise<void> {
    if (!this.session) return;
    this.currentAbort?.abort();
    this.currentAbort = new AbortController();
    try {
      await this.session.runReview(mode, this.currentAbort.signal);
    } catch (e) {
      if ((e as Error).message === 'aborted') return;
      console.error('[editor-plugin] review failed', e);
      return;
    }
    // sessionId を frontmatter に書き戻す
    if (this.session.sessionId) {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view?.file) {
        await this.app.fileManager.processFrontMatter(view.file, (fm) => {
          if (fm.editor_session !== this.session!.sessionId) {
            fm.editor_session = this.session!.sessionId;
          }
        });
      }
    }
    // サイドバーをリフレッシュ
    const sb = this.app.workspace.getLeavesOfType(VIEW_TYPE_EDITOR)[0]?.view as SidebarView | undefined;
    sb?.refresh?.();
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_EDITOR);
    if (existing.length > 0) leaf = existing[0];
    else {
      leaf = workspace.getRightLeaf(false);
      await leaf?.setViewState({ type: VIEW_TYPE_EDITOR, active: true });
    }
    if (leaf) workspace.revealLeaf(leaf);
  }
}
