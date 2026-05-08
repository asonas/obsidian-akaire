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
import { resolveBinary } from './util/resolveBinary';
import { log } from './util/logger';
import { anchorField, setAnchorMarks, clearAnchorMarks } from './editor/decoration';

export default class EditorPlugin extends Plugin {
  private session: ReviewSession | null = null;
  private runner!: ClaudeRunner;
  private textlint!: TextlintRunner;
  private anchorStore!: AnchorStore;
  private promptResolver!: PromptResolver;
  private currentAbort: AbortController | null = null;
  private leafGen = 0;

  async onload() {
    const vaultRoot = (this.app.vault.adapter as any).basePath as string;
    log('info', 'plugin onload start', {
      vaultRoot,
      processPath: process.env.PATH,
      processCwd: process.cwd(),
    });

    const claudeBin = resolveBinary('claude');
    const textlintBin = resolveBinary('textlint');
    log('info', 'binaries resolved', { claudeBin, textlintBin });

    this.runner = new ClaudeRunner({
      claudeBinary: claudeBin,
      spawn,
      timeoutMs: 180_000, // claude -p は10〜60秒かかることがあるので余裕を持つ
      model: 'sonnet',
    });
    // プラグイン同梱の .textlintrc.json をフォールバックとして渡す。
    // ノート祖先に .textlintrc が見つかればそちらを優先するので、
    // ユーザ独自の設定は壊れない。
    const defaultTextlintConfig = this.manifest.dir
      ? `${vaultRoot}/${this.manifest.dir}/.textlintrc.json`
      : undefined;
    this.textlint = new TextlintRunner({
      binary: textlintBin,
      spawn,
      defaultConfigPath: defaultTextlintConfig,
    });
    log('info', 'textlint default config', { defaultTextlintConfig });
    this.anchorStore = new AnchorStore({
      vaultRoot,
      fs: makeAnchorFsApi(this.app),
    });
    this.promptResolver = new PromptResolver({
      vaultRoot,
      fs: makeFsApi(this.app),
    });

    this.registerView(VIEW_TYPE_EDITOR, (leaf) => {
      const v = new SidebarView(leaf);
      v.setActions({
        onReviewFull: () => this.runReview('full'),
        onReviewDiff: () => this.runReview('diff'),
      });
      return v;
    });
    this.registerEditorExtension(anchorField);

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => this.onLeafChange(leaf))
    );

    // プラグイン再読み込み時、既にmarkdownノートが開いていれば initial probe
    this.app.workspace.onLayoutReady(() => {
      this.onLeafChange(this.app.workspace.activeLeaf);
    });

    this.addCommand({
      id: 'review-changed',
      name: 'Akaire: Review changed paragraphs',
      callback: () => this.runReview('diff'),
    });
    this.addCommand({
      id: 'review-full',
      name: 'Akaire: Review whole note',
      callback: () => this.runReview('full'),
    });
    this.addCommand({
      id: 'open-sidebar',
      name: 'Akaire: Open sidebar',
      callback: () => this.activateView(),
    });
    this.addRibbonIcon('edit-3', 'Open Akaire', () => this.activateView());
  }

  async onunload() {
    this.currentAbort?.abort();
    if (this.session) await this.session.persist();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_EDITOR);
  }

  private async onLeafChange(leaf: WorkspaceLeaf | null): Promise<void> {
    const sidebars = this.app.workspace.getLeavesOfType(VIEW_TYPE_EDITOR);
    const sidebarView = sidebars[0]?.view as SidebarView | undefined;

    const view = leaf?.view instanceof MarkdownView ? leaf.view : null;
    const targetFile = view?.file ?? null;

    // 非markdownリーフ（サイドバー自身、設定画面など）にフォーカスが移っただけの
    // ケースでは現在のバインディングを保持する。これがないと Jump で本文に
    // 飛ばしたり、サイドバーを直接クリックしただけでセッションがリセットされる。
    if (!targetFile || !view) {
      return;
    }

    // 同じファイルなら EditorView 参照だけ更新して終了（再描画しない）
    if (this.session && this.session.notePath === targetFile.path) {
      const cm = (view.editor as any).cm as EditorView;
      sidebarView?.setEditorView?.(cm);
      // サイドバーがまだセッションにバインドされていなければここで結ぶ。
      // （プラグイン起動後にサイドバーを開いた場合や、同じファイルを開いたまま
      //  サイドバーを後から開いた場合、bind() が一度も呼ばれずに残るため。）
      if (sidebarView && !sidebarView.hasSession()) {
        sidebarView.bind(this.session, cm);
      }
      return;
    }

    // ここから本物の切り替え
    this.currentAbort?.abort();
    const myGen = ++this.leafGen;

    if (this.session) {
      await this.session.persist();
      if (myGen !== this.leafGen) return;
      this.session = null;
      sidebarView?.unbind?.();
    }

    const newSession = await this.makeSession(view);
    if (myGen !== this.leafGen) return;

    // frontmatter から sessionId を読む
    const cache = this.app.metadataCache.getFileCache(view.file);
    const fmSessionId = cache?.frontmatter?.editor_session;
    if (typeof fmSessionId === 'string') newSession.sessionId = fmSessionId;

    await newSession.rehydrate();
    if (myGen !== this.leafGen) return;
    this.session = newSession;

    const cm = (view.editor as any).cm as EditorView;
    sidebarView?.bind?.(this.session, cm);

    // textlintの可用性を確認しバナー表示
    const absoluteFilePath = `${(this.app.vault.adapter as any).basePath}/${view.file.path}`;
    log('info', 'onLeafChange probing textlint', { filePath: view.file.path, absoluteFilePath });
    const probe = await this.textlint.lint(absoluteFilePath);
    if (myGen !== this.leafGen) return;
    log('info', 'textlint probe result', probe);
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
    log('info', 'runReview invoked', { mode, hasSession: !!this.session });
    if (!this.session) return;
    this.currentAbort?.abort();
    this.currentAbort = new AbortController();

    const startView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const targetFile = startView?.file;

    const sidebar = (): SidebarView | undefined =>
      this.app.workspace.getLeavesOfType(VIEW_TYPE_EDITOR)[0]?.view as SidebarView | undefined;

    sidebar()?.setPhase?.('reviewing');

    try {
      await this.session.runReview(mode, this.currentAbort.signal);
      log('info', 'runReview completed', {
        sessionId: this.session.sessionId,
        commentCount: this.session.comments.length,
      });
      sidebar()?.setBanner?.(null);
      sidebar()?.markReviewed?.();
    } catch (e) {
      if ((e as Error).message === 'aborted') {
        sidebar()?.setPhase?.('idle');
        return;
      }
      log('error', 'runReview failed', { error: (e as Error).message });
      sidebar()?.setBanner?.(`レビュー失敗: ${(e as Error).message}`);
      return;
    }
    // 開始時のファイルがまだ同じなら frontmatter に書き戻す
    if (this.session.sessionId && targetFile) {
      const currentView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (currentView?.file?.path === targetFile.path) {
        await this.app.fileManager.processFrontMatter(targetFile, (fm) => {
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

    // 既存のセッションがあるのにサイドバーが未バインドなら結ぶ。
    // Obsidian起動時はサイドバーが閉じた状態で onLeafChange が走るため、
    // 後からサイドバーを開いても active-leaf-change が発火するまでバインドされない。
    const sidebarView = leaf?.view as SidebarView | undefined;
    const mdView = workspace.getActiveViewOfType(MarkdownView);
    if (sidebarView && this.session && mdView?.file?.path === this.session.notePath) {
      const cm = (mdView.editor as any).cm as EditorView;
      sidebarView.bind(this.session, cm);
    }
  }
}
