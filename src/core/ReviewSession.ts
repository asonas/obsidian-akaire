import type { ReviewComment, PersistedAnchor } from '../types';
import { findAnchor } from '../editor/anchorMatcher';
import { splitParagraphs, paragraphHash, diffParagraphs } from '../util/paragraphHash';

export interface EditorBridge {
  getText(): string;
  replaceRange(text: string, from: number, to: number): void;
  setHighlights(marks: Array<{ from: number; to: number; commentId: string }>): void;
  clearHighlights(): void;
}

export interface AnchorStoreApi {
  load(notePath: string): Promise<PersistedAnchor[]>;
  save(notePath: string, anchors: PersistedAnchor[]): Promise<void>;
}

export interface ReviewSessionOpts {
  notePath: string;
  editor: EditorBridge;
  anchorStore: AnchorStoreApi;
  runner: any;
  textlint: any;
  promptResolver: any;
  vaultDir: string;
}

interface ActiveAnchor {
  comment: ReviewComment;
  from: number;
  to: number;
  stale: boolean;
  resolved: boolean;
}

export class ReviewSession {
  comments: ReviewComment[] = [];
  sessionId: string | null = null;
  private anchors: Map<string, ActiveAnchor> = new Map();
  private lastReviewedHash: Map<string, string> = new Map();

  constructor(private opts: ReviewSessionOpts) {}

  async rehydrate(): Promise<void> {
    const persisted = await this.opts.anchorStore.load(this.opts.notePath);
    const text = this.opts.editor.getText();
    for (const p of persisted) {
      const hit = findAnchor(text, p);
      this.anchors.set(p.id, {
        comment: p.comment,
        from: hit.from,
        to: hit.to,
        stale: hit.stale,
        resolved: p.resolved,
      });
      this.comments.push(p.comment);
    }
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
        resolved: a.resolved,
      });
    }
    await this.opts.anchorStore.save(this.opts.notePath, persisted);
  }

  async runReview(mode: 'full' | 'diff', signal?: AbortSignal): Promise<void> {
    const { systemPrompt } = await this.opts.promptResolver.resolvePrompt(
      this.opts.notePath
    );
    const textlintResult = await this.opts.textlint.lint(this.opts.notePath);
    const findings = textlintResult.available ? textlintResult.messages : [];

    const text = this.opts.editor.getText();
    const reviewText = mode === 'full' ? text : this.diffText(text);

    const result = await this.opts.runner.review({
      text: reviewText,
      systemPrompt,
      textlintFindings: findings,
      sessionId: this.sessionId,
      vaultDir: this.opts.vaultDir,
      signal,
    });

    this.sessionId = result.newSessionId;
    for (const c of result.comments) {
      this.addCommentAnchor(c);
    }
    this.refreshHighlights();
    this.updateBaseline(text);
  }

  applyComment(commentId: string): void {
    const a = this.anchors.get(commentId);
    if (!a || !a.comment.suggestion) return;
    this.opts.editor.replaceRange(a.comment.suggestion, a.from, a.to);
    a.resolved = true;
    this.refreshHighlights();
  }

  dismissComment(commentId: string): void {
    const a = this.anchors.get(commentId);
    if (!a) return;
    a.resolved = true;
    this.refreshHighlights();
  }

  async sendChatMessage(message: string, signal?: AbortSignal): Promise<string> {
    if (!this.sessionId) {
      throw new Error('no session yet — run review first');
    }
    const result = await this.opts.runner.chat({
      message,
      sessionId: this.sessionId,
      vaultDir: this.opts.vaultDir,
      signal,
    });
    return result.reply;
  }

  private addCommentAnchor(c: ReviewComment): void {
    const text = this.opts.editor.getText();
    const hit = findAnchor(text, {
      quote: c.quote,
      contextBefore: c.contextBefore,
      contextAfter: c.contextAfter,
      lineHint: 0,
    });
    this.anchors.set(c.id, {
      comment: c,
      from: hit.from,
      to: hit.to,
      stale: hit.stale,
      resolved: false,
    });
    this.comments.push(c);
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
    const marks = [...this.anchors.values()]
      .filter((a) => !a.stale && !a.resolved)
      .map((a) => ({ from: a.from, to: a.to, commentId: a.comment.id }));
    this.opts.editor.setHighlights(marks);
  }
}
