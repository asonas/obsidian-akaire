import type { ReviewComment, PersistedAnchor, ChatMessage, AnchorStatus } from '../types';
import { findAnchor } from '../editor/anchorMatcher';
import { splitParagraphs, paragraphHash, diffParagraphs } from '../util/paragraphHash';
import { log } from '../util/logger';
import type { ClaudeRunner } from './ClaudeRunner';
import type { TextlintRunner } from './TextlintRunner';
import type { PromptResolver } from './PromptResolver';

export interface EditorBridge {
  getText(): string;
  replaceRange(text: string, from: number, to: number): void;
  setHighlights(marks: Array<{ from: number; to: number; commentId: string }>): void;
  clearHighlights(): void;
}

export interface AnchorStoreApi {
  loadState(notePath: string): Promise<{ anchors: PersistedAnchor[]; chat: ChatMessage[] }>;
  saveState(notePath: string, state: { anchors: PersistedAnchor[]; chat: ChatMessage[] }): Promise<void>;
  saveDebug?(notePath: string, label: string, payload: unknown): Promise<void>;
}

export interface ReviewSessionOpts {
  notePath: string;
  editor: EditorBridge;
  anchorStore: AnchorStoreApi;
  runner: Pick<ClaudeRunner, 'review' | 'chat'>;
  textlint: Pick<TextlintRunner, 'lint'>;
  promptResolver: Pick<PromptResolver, 'resolvePrompt'>;
  vaultDir: string;
}

interface ActiveAnchor {
  comment: ReviewComment;
  from: number;
  to: number;
  stale: boolean;
  status: AnchorStatus;
}

export class ReviewSession {
  comments: ReviewComment[] = [];
  sessionId: string | null = null;
  chatLog: ChatMessage[] = [];
  private anchors: Map<string, ActiveAnchor> = new Map();
  private lastReviewedHash: Map<string, string> = new Map();

  constructor(private opts: ReviewSessionOpts) {}

  get notePath(): string {
    return this.opts.notePath;
  }

  async rehydrate(): Promise<void> {
    const state = await this.opts.anchorStore.loadState(this.opts.notePath);
    const text = this.opts.editor.getText();
    for (const p of state.anchors) {
      const hit = findAnchor(text, p);
      // 旧フォーマット互換: status 欠落 + resolved=true は applied として扱う
      const status: AnchorStatus =
        p.status ?? (p.resolved ? 'applied' : 'pending');
      this.anchors.set(p.id, {
        comment: p.comment,
        from: hit.from,
        to: hit.to,
        stale: hit.stale,
        status,
      });
      this.comments.push(p.comment);
    }
    this.chatLog = state.chat;
    this.refreshHighlights();
  }

  async persist(): Promise<void> {
    const persisted: PersistedAnchor[] = [];
    const text = this.opts.editor.getText();
    for (const [, a] of this.anchors) {
      persisted.push({
        id: a.comment.id,
        quote: a.comment.quote,
        contextBefore: a.comment.contextBefore,
        contextAfter: a.comment.contextAfter,
        lineHint: text.substring(0, a.from).split('\n').length - 1,
        comment: a.comment,
        resolved: a.status !== 'pending',
        status: a.status,
      });
    }
    await this.opts.anchorStore.saveState(this.opts.notePath, {
      anchors: persisted,
      chat: this.chatLog,
    });
  }

  async runReview(mode: 'full' | 'diff', signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;
    const { systemPrompt } = await this.opts.promptResolver.resolvePrompt(
      this.opts.notePath
    );
    if (signal?.aborted) return;
    const absoluteFilePath = `${this.opts.vaultDir}/${this.opts.notePath}`;
    const textlintResult = await this.opts.textlint.lint(absoluteFilePath);
    if (signal?.aborted) return;
    const findings = textlintResult.available ? textlintResult.messages : [];

    const text = this.opts.editor.getText();
    const reviewText = mode === 'full' ? text : this.diffText(text);

    const result = await this.opts.runner.review({
      text: reviewText,
      systemPrompt,
      textlintFindings: findings,
      // 「このままにする」と判断された箇所は次回以降のレビューで Claude に
      // 文脈として渡し、同趣旨の再指摘を抑止する。
      keepAsIs: this.collectKeepAsIs(),
      // レビューは毎回フレッシュなセッションで実行する。
      // --resume で過去会話を引きずると、修正済み箇所まで再指摘されるため。
      sessionId: null,
      vaultDir: this.opts.vaultDir,
      signal,
    });
    if (signal?.aborted) return;

    this.sessionId = result.newSessionId;
    this.dropUnresolvedAnchors();
    const anchorReport: Array<{
      id: string; quote: string; ctxBefore: string; ctxAfter: string;
      from: number; to: number; stale: boolean;
    }> = [];
    for (const c of result.comments) {
      const a = this.addCommentAnchor(c);
      anchorReport.push({
        id: c.id,
        quote: c.quote,
        ctxBefore: c.contextBefore ?? '',
        ctxAfter: c.contextAfter ?? '',
        from: a.from,
        to: a.to,
        stale: a.stale,
      });
    }
    log('info', 'ReviewSession anchors resolved', { anchors: anchorReport });
    this.refreshHighlights();
    this.updateBaseline(text);
    // デバッグ用に Claude の生レスポンスと anchor 解決結果を保存する
    if (this.opts.anchorStore.saveDebug) {
      try {
        await this.opts.anchorStore.saveDebug(this.opts.notePath, 'last-review', {
          ts: new Date().toISOString(),
          mode,
          newSessionId: result.newSessionId,
          rawStdoutPreview: result.rawStdout?.slice(0, 4000),
          structuredOutput: result.structuredOutput,
          comments: result.comments,
          anchorReport,
          textPreview: text.slice(0, 500),
          textLength: text.length,
        });
      } catch (e) {
        log('warn', 'saveDebug failed', { error: (e as Error).message });
      }
    }
    await this.persist();
  }

  getVisibleItems(): Array<{ comment: ReviewComment; stale: boolean }> {
    const items: Array<{ comment: ReviewComment; stale: boolean }> = [];
    for (const c of this.comments) {
      const a = this.anchors.get(c.id);
      if (!a || a.status !== 'pending') continue;
      items.push({ comment: c, stale: a.stale });
    }
    return items;
  }

  applyComment(commentId: string): void {
    this.reanchorAll();
    const a = this.anchors.get(commentId);
    if (!a || !a.comment.suggestion) return;
    if (a.stale) return;
    this.opts.editor.replaceRange(a.comment.suggestion, a.from, a.to);
    a.status = 'applied';
    this.refreshHighlights();
    void this.persist();
  }

  keepAsIs(commentId: string): void {
    const a = this.anchors.get(commentId);
    if (!a) return;
    a.status = 'kept';
    this.refreshHighlights();
    void this.persist();
  }

  closeComment(commentId: string): void {
    const a = this.anchors.get(commentId);
    if (!a) return;
    // 自分で別表現に直したか、単に非表示にしたい場合。Claude へは伝えない。
    a.status = 'dismissed';
    this.refreshHighlights();
    void this.persist();
  }

  getAnchorRange(commentId: string): { from: number; to: number } | null {
    this.reanchorAll();
    const a = this.anchors.get(commentId);
    if (!a || a.stale) return null;
    return { from: a.from, to: a.to };
  }

  async sendChatMessage(message: string, signal?: AbortSignal): Promise<string> {
    if (!this.sessionId) {
      throw new Error('no session yet — run review first');
    }
    this.chatLog.push({ kind: 'user', text: message, ts: Date.now() });
    try {
      const result = await this.opts.runner.chat({
        message,
        sessionId: this.sessionId,
        vaultDir: this.opts.vaultDir,
        signal,
      });
      this.chatLog.push({ kind: 'ai', text: result.reply, ts: Date.now() });
      await this.persist();
      return result.reply;
    } catch (e) {
      this.chatLog.push({ kind: 'err', text: (e as Error).message, ts: Date.now() });
      await this.persist();
      throw e;
    }
  }

  private dropUnresolvedAnchors(): void {
    // applied / kept は履歴・コンテキストとして残す。pending のみ捨てて
    // 新しいレビュー結果に置き換える。
    const keepIds = new Set<string>();
    for (const [id, a] of this.anchors) {
      if (a.status !== 'pending') keepIds.add(id);
    }
    for (const id of [...this.anchors.keys()]) {
      if (!keepIds.has(id)) this.anchors.delete(id);
    }
    this.comments = this.comments.filter((c) => keepIds.has(c.id));
  }

  private collectKeepAsIs(): Array<{ quote: string; message: string; suggestion?: string }> {
    const out: Array<{ quote: string; message: string; suggestion?: string }> = [];
    for (const a of this.anchors.values()) {
      if (a.status !== 'kept') continue;
      out.push({
        quote: a.comment.quote,
        message: a.comment.message,
        ...(a.comment.suggestion ? { suggestion: a.comment.suggestion } : {}),
      });
    }
    // Claude へ送るプロンプトの肥大化を抑えるため、kept は直近 N 件のみに絞る。
    // anchors は挿入順（= 古い順）なので末尾 N 件が「最近 kept にした」もの。
    const KEEP_AS_IS_LIMIT = 20;
    return out.slice(-KEEP_AS_IS_LIMIT);
  }

  private addCommentAnchor(c: ReviewComment): ActiveAnchor {
    const text = this.opts.editor.getText();
    // Claude が同じ id を複数返してくると anchors Map が上書きされるので
    // 衝突を検出して内部 id を再採番する。元の id は comment.id に残す。
    if (this.anchors.has(c.id)) {
      const newId = `${c.id}__dup-${this.anchors.size}`;
      log('warn', 'duplicate comment id, renaming internal key', {
        originalId: c.id, newKey: newId,
      });
      c = { ...c, id: newId };
    }
    // 新規コメントは Claude が行番号を返さないので lineHint なし。
    // 複数候補を context で絞れない場合は stale 扱いにする。
    const hit = findAnchor(text, {
      quote: c.quote,
      contextBefore: c.contextBefore ?? '',
      contextAfter: c.contextAfter ?? '',
    });
    const anchor: ActiveAnchor = {
      comment: c,
      from: hit.from,
      to: hit.to,
      stale: hit.stale,
      status: 'pending',
    };
    this.anchors.set(c.id, anchor);
    this.comments.push(c);
    return anchor;
  }

  private updateBaseline(text: string): void {
    const paras = splitParagraphs(text);
    this.lastReviewedHash.clear();
    for (const p of paras) {
      this.lastReviewedHash.set(p.id, paragraphHash(p.text));
    }
  }

  private diffText(text: string): string {
    if (this.lastReviewedHash.size === 0) return text;
    const paras = splitParagraphs(text);
    const changed = diffParagraphs(this.lastReviewedHash, paras);
    return changed.map((p) => p.text).join('\n\n');
  }

  private refreshHighlights(): void {
    this.reanchorAll();
    const marks = [...this.anchors.values()]
      .filter((a) => !a.stale && a.status === 'pending')
      .map((a) => ({ from: a.from, to: a.to, commentId: a.comment.id }));
    this.opts.editor.setHighlights(marks);
  }

  // 本文が編集 / 適用で変わった後、quote と context から各 anchor の offset を
  // 引き直す。stored on the anchor itself は immutable な quote/context のみで、
  // from/to は派生値として再計算する。
  private reanchorAll(): void {
    const text = this.opts.editor.getText();
    for (const a of this.anchors.values()) {
      // applied 後は本文が書き換わっているので追跡不要。kept は表示しないが、
      // 必要なら quote/context は保持されるので再アンカーしても害はない。
      if (a.status === 'applied') continue;
      const hit = findAnchor(text, {
        quote: a.comment.quote,
        contextBefore: a.comment.contextBefore ?? '',
        contextAfter: a.comment.contextAfter ?? '',
      });
      a.from = hit.from;
      a.to = hit.to;
      a.stale = hit.stale;
    }
  }
}
