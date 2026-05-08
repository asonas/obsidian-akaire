import { describe, it, expect, vi } from 'vitest';
import { ReviewSession, EditorBridge } from '../src/core/ReviewSession';
import type { PersistedAnchor, ReviewComment } from '../src/types';

function makeEditorBridge(initial: string): EditorBridge & { text: string } {
  const obj = {
    text: initial,
    getText() { return this.text; },
    replaceRange(text: string, from: number, to: number) {
      this.text = this.text.slice(0, from) + text + this.text.slice(to);
    },
    setHighlights: vi.fn(),
    clearHighlights: vi.fn(),
  };
  return obj as any;
}

const sampleComment: ReviewComment = {
  id: 'c1',
  quote: '冗長な表現',
  contextBefore: 'これは',
  contextAfter: 'です',
  severity: 'suggestion',
  message: '簡潔に',
};

describe('ReviewSession.runReview diff', () => {
  it('only sends changed paragraphs', async () => {
    const editor = makeEditorBridge('para A\n\npara B\n\npara C');
    const captured: string[] = [];
    const fakeRunner = {
      review: vi.fn(async (args: any) => {
        captured.push(args.text);
        return { comments: [], newSessionId: 's' };
      }),
      chat: vi.fn(),
    };
    const fakeTextlint = { lint: async () => ({ available: true, messages: [] }) };
    const fakeResolver = { resolvePrompt: async () => ({ systemPrompt: '', sources: [] }) };

    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: fakeRunner, textlint: fakeTextlint, promptResolver: fakeResolver,
      vaultDir: '/v',
    });

    await session.runReview('full');     // 全段落をベースラインに登録
    editor.text = 'para A\n\npara B changed\n\npara C';
    await session.runReview('diff');     // 2段落目だけが対象

    expect(captured[1]).toBe('para B changed');
  });
});

describe('ReviewSession.runReview full', () => {
  it('calls runner.review and stores returned comments', async () => {
    const editor = makeEditorBridge('これは冗長な表現です。');
    const fakeRunner = {
      review: vi.fn(async () => ({
        comments: [sampleComment],
        newSessionId: 's1',
      })),
      chat: vi.fn(),
    };
    const fakeTextlint = {
      lint: vi.fn(async () => ({ available: true, messages: [] })),
    };
    const fakeResolver = {
      resolvePrompt: vi.fn(async () => ({ systemPrompt: 'be terse', sources: [] })),
    };

    const session = new ReviewSession({
      notePath: 'note.md',
      editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: fakeRunner,
      textlint: fakeTextlint,
      promptResolver: fakeResolver,
      vaultDir: '/vault',
    });

    await session.runReview('full');

    expect(fakeRunner.review).toHaveBeenCalledOnce();
    expect(session.comments).toEqual([sampleComment]);
    expect(session.sessionId).toBe('s1');
  });

  it('always starts a fresh claude session (sessionId: null)', async () => {
    const editor = makeEditorBridge('text');
    const fakeRunner = {
      review: vi.fn(async () => ({ comments: [], newSessionId: 's-new' })),
      chat: vi.fn(),
    };
    const fakeTextlint = { lint: async () => ({ available: true, messages: [] }) };
    const fakeResolver = { resolvePrompt: async () => ({ systemPrompt: '', sources: [] }) };
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: fakeRunner, textlint: fakeTextlint, promptResolver: fakeResolver,
      vaultDir: '/v',
    });
    session.sessionId = 's-old';

    await session.runReview('full');

    expect(fakeRunner.review).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: null })
    );
    // 新しいセッションIDで上書きされる（チャットはここに繋がる）
    expect(session.sessionId).toBe('s-new');
  });

  it('clears previous unresolved anchors before adding new ones', async () => {
    const editor = makeEditorBridge('これは冗長な表現です。');
    const second: ReviewComment = {
      id: 'c2', quote: '冗長な表現', contextBefore: 'これは',
      contextAfter: 'です', severity: 'warning', message: '別の指摘',
    };
    const fakeRunner = {
      review: vi.fn()
        .mockResolvedValueOnce({ comments: [sampleComment], newSessionId: 's1' })
        .mockResolvedValueOnce({ comments: [second], newSessionId: 's2' }),
      chat: vi.fn(),
    };
    const fakeTextlint = { lint: async () => ({ available: true, messages: [] }) };
    const fakeResolver = { resolvePrompt: async () => ({ systemPrompt: '', sources: [] }) };
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: fakeRunner, textlint: fakeTextlint, promptResolver: fakeResolver,
      vaultDir: '/v',
    });

    await session.runReview('full');
    expect(session.getVisibleItems().map((i) => i.comment.id)).toEqual(['c1']);

    await session.runReview('full');

    // 旧 c1 は未解決のまま積み残しではなく、c2 のみ表示される
    expect(session.getVisibleItems().map((i) => i.comment.id)).toEqual(['c2']);
  });

  it('preserves resolved anchors as history across reviews', async () => {
    const editor = makeEditorBridge('これは冗長な表現です。');
    const second: ReviewComment = {
      id: 'c2', quote: '冗長な表現', contextBefore: 'これは',
      contextAfter: 'です', severity: 'warning', message: '別の指摘',
    };
    const fakeRunner = {
      review: vi.fn()
        .mockResolvedValueOnce({ comments: [{ ...sampleComment, suggestion: '冗長' }], newSessionId: 's1' })
        .mockResolvedValueOnce({ comments: [second], newSessionId: 's2' }),
      chat: vi.fn(),
    };
    const fakeTextlint = { lint: async () => ({ available: true, messages: [] }) };
    const fakeResolver = { resolvePrompt: async () => ({ systemPrompt: '', sources: [] }) };
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: fakeRunner, textlint: fakeTextlint, promptResolver: fakeResolver,
      vaultDir: '/v',
    });

    await session.runReview('full');
    session.keepAsIs('c1'); // 解決済み（kept）にする
    await session.runReview('full');

    // session.comments 履歴には c1 と c2 両方が残る
    expect(session.comments.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    // 表示は c2 のみ（c1 は resolved のため）
    expect(session.getVisibleItems().map((i) => i.comment.id)).toEqual(['c2']);
  });
});

describe('ReviewSession.applyComment', () => {
  it('replaces anchor range with suggestion and marks resolved', async () => {
    const editor = makeEditorBridge('これは冗長な表現です。');
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: null as any, textlint: null as any, promptResolver: null as any,
      vaultDir: '/v',
    });
    (session as any).addCommentAnchor({
      ...sampleComment, suggestion: '冗長',
    });

    session.applyComment('c1');

    expect(editor.text).toBe('これは冗長です。');
    expect(session.comments.find((c) => c.id === 'c1')).toBeTruthy();
    expect((session as any).anchors.get('c1').status).toBe('applied');
  });
});

describe('ReviewSession.closeComment', () => {
  it('hides comment from visible items without adding kept context', async () => {
    const editor = makeEditorBridge('これは冗長な表現です。');
    const fakeRunner = {
      review: vi.fn()
        .mockResolvedValueOnce({ comments: [sampleComment], newSessionId: 's1' })
        .mockResolvedValueOnce({ comments: [], newSessionId: 's2' }),
      chat: vi.fn(),
    };
    const fakeTextlint = { lint: async () => ({ available: true, messages: [] }) };
    const fakeResolver = { resolvePrompt: async () => ({ systemPrompt: '', sources: [] }) };
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: fakeRunner, textlint: fakeTextlint, promptResolver: fakeResolver,
      vaultDir: '/v',
    });

    await session.runReview('full');
    session.closeComment('c1');

    expect(session.getVisibleItems()).toHaveLength(0);

    await session.runReview('full');

    // close は Claude に「このままにする」コンテキストを伝えない
    const secondCall = fakeRunner.review.mock.calls[1][0];
    expect(secondCall.keepAsIs ?? []).toHaveLength(0);
  });
});

describe('ReviewSession.keepAsIs', () => {
  it('hides comment from visible items', () => {
    const editor = makeEditorBridge('これは冗長な表現です。');
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: null as any, textlint: null as any, promptResolver: null as any,
      vaultDir: '/v',
    });
    (session as any).addCommentAnchor(sampleComment);

    session.keepAsIs('c1');

    expect(session.getVisibleItems()).toHaveLength(0);
  });

  it('preserves kept anchors across runReview (not dropped)', async () => {
    const editor = makeEditorBridge('これは冗長な表現です。');
    const c2: ReviewComment = {
      id: 'c2', quote: '冗長な表現', contextBefore: 'これは',
      contextAfter: 'です', severity: 'info', message: '別の指摘',
    };
    const fakeRunner = {
      review: vi.fn()
        .mockResolvedValueOnce({ comments: [sampleComment], newSessionId: 's1' })
        .mockResolvedValueOnce({ comments: [c2], newSessionId: 's2' }),
      chat: vi.fn(),
    };
    const fakeTextlint = { lint: async () => ({ available: true, messages: [] }) };
    const fakeResolver = { resolvePrompt: async () => ({ systemPrompt: '', sources: [] }) };
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: fakeRunner, textlint: fakeTextlint, promptResolver: fakeResolver,
      vaultDir: '/v',
    });

    await session.runReview('full');
    session.keepAsIs('c1');
    await session.runReview('full');

    // 履歴上には c1（kept）と c2（pending）両方が残る
    expect(session.comments.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });

  it('caps kept context at the 20 most recent items', async () => {
    const editor = makeEditorBridge('A B C');
    // 25 件分の kept 状態を仕込む。古い順に c1..c25
    const stored: PersistedAnchor[] = [];
    for (let i = 1; i <= 25; i++) {
      stored.push({
        id: `c${i}`,
        quote: 'A',
        contextBefore: '',
        contextAfter: ' B',
        lineHint: 0,
        comment: {
          id: `c${i}`, quote: `quote-${i}`, contextBefore: '', contextAfter: '',
          severity: 'info', message: `msg-${i}`,
        },
        resolved: true,
        status: 'kept',
      });
    }
    const fakeRunner = {
      review: vi.fn(async () => ({ comments: [], newSessionId: 's' })),
      chat: vi.fn(),
    };
    const fakeTextlint = { lint: async () => ({ available: true, messages: [] }) };
    const fakeResolver = { resolvePrompt: async () => ({ systemPrompt: '', sources: [] }) };
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: stored, chat: [] }), saveState: async () => {} },
      runner: fakeRunner, textlint: fakeTextlint, promptResolver: fakeResolver,
      vaultDir: '/v',
    });
    await session.rehydrate();

    await session.runReview('full');

    const call = fakeRunner.review.mock.calls[0][0];
    expect(call.keepAsIs).toHaveLength(20);
    // 直近 20 件 = c6..c25 が残る
    expect(call.keepAsIs[0].message).toBe('msg-6');
    expect(call.keepAsIs[19].message).toBe('msg-25');
  });

  it('passes kept anchors to runner.review on next review', async () => {
    const editor = makeEditorBridge('これは冗長な表現です。');
    const fakeRunner = {
      review: vi.fn()
        .mockResolvedValueOnce({ comments: [sampleComment], newSessionId: 's1' })
        .mockResolvedValueOnce({ comments: [], newSessionId: 's2' }),
      chat: vi.fn(),
    };
    const fakeTextlint = { lint: async () => ({ available: true, messages: [] }) };
    const fakeResolver = { resolvePrompt: async () => ({ systemPrompt: '', sources: [] }) };
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: fakeRunner, textlint: fakeTextlint, promptResolver: fakeResolver,
      vaultDir: '/v',
    });

    await session.runReview('full');
    session.keepAsIs('c1');
    await session.runReview('full');

    const secondCall = fakeRunner.review.mock.calls[1][0];
    expect(secondCall.keepAsIs).toBeDefined();
    expect(secondCall.keepAsIs).toHaveLength(1);
    expect(secondCall.keepAsIs[0].quote).toBe('冗長な表現');
    expect(secondCall.keepAsIs[0].message).toBe('簡潔に');
  });
});

describe('ReviewSession.getVisibleItems', () => {
  it('excludes resolved comments after apply', () => {
    const editor = makeEditorBridge('これは冗長な表現です。');
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: null as any, textlint: null as any, promptResolver: null as any,
      vaultDir: '/v',
    });
    (session as any).addCommentAnchor({ ...sampleComment, suggestion: '冗長' });

    expect(session.getVisibleItems()).toHaveLength(1);

    session.applyComment('c1');

    expect(session.getVisibleItems()).toHaveLength(0);
  });

  it('excludes kept comments after keepAsIs', () => {
    const editor = makeEditorBridge('これは冗長な表現です。');
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: null as any, textlint: null as any, promptResolver: null as any,
      vaultDir: '/v',
    });
    (session as any).addCommentAnchor(sampleComment);

    session.keepAsIs('c1');

    expect(session.getVisibleItems()).toHaveLength(0);
  });

  it('returns stale flag with each visible item', () => {
    const editor = makeEditorBridge('まったく違う文章');
    const stored: PersistedAnchor[] = [{
      id: 'c1', quote: '冗長な表現', contextBefore: 'これは',
      contextAfter: 'です', lineHint: 0, comment: sampleComment, resolved: false,
    }];
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: stored, chat: [] }), saveState: async () => {} },
      runner: null as any, textlint: null as any, promptResolver: null as any,
      vaultDir: '/v',
    });

    return session.rehydrate().then(() => {
      const items = session.getVisibleItems();
      expect(items).toHaveLength(1);
      expect(items[0].stale).toBe(true);
      expect(items[0].comment.id).toBe('c1');
    });
  });
});

describe('ReviewSession.sendChatMessage', () => {
  it('forwards to runner.chat with current sessionId', async () => {
    const editor = makeEditorBridge('text');
    const fakeRunner = {
      review: vi.fn(),
      chat: vi.fn(async () => ({ reply: 'ok' })),
    };
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: fakeRunner, textlint: null as any, promptResolver: null as any,
      vaultDir: '/v',
    });
    session.sessionId = 's1';

    const reply = await session.sendChatMessage('hi');

    expect(reply).toBe('ok');
    expect(fakeRunner.chat).toHaveBeenCalledWith({
      message: 'hi', sessionId: 's1', vaultDir: '/v',
    });
  });

  it('appends user and ai messages to chatLog and persists them', async () => {
    const editor = makeEditorBridge('text');
    const fakeRunner = {
      review: vi.fn(),
      chat: vi.fn(async () => ({ reply: '了解しました' })),
    };
    const saved: any[] = [];
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: {
        loadState: async () => ({ anchors: [], chat: [] }),
        saveState: async (_p: string, state: any) => { saved.push(state); },
      },
      runner: fakeRunner, textlint: null as any, promptResolver: null as any,
      vaultDir: '/v',
    });
    session.sessionId = 's1';

    await session.sendChatMessage('もっと厳しく');

    expect(session.chatLog.map((m) => m.kind)).toEqual(['user', 'ai']);
    expect(session.chatLog[0].text).toBe('もっと厳しく');
    expect(session.chatLog[1].text).toBe('了解しました');
    expect(saved.at(-1).chat.map((m: any) => m.kind)).toEqual(['user', 'ai']);
  });

  it('records error messages in chatLog when chat fails', async () => {
    const editor = makeEditorBridge('text');
    const fakeRunner = {
      review: vi.fn(),
      chat: vi.fn(async () => { throw new Error('boom'); }),
    };
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: fakeRunner, textlint: null as any, promptResolver: null as any,
      vaultDir: '/v',
    });
    session.sessionId = 's1';

    await expect(session.sendChatMessage('test')).rejects.toThrow('boom');
    expect(session.chatLog.map((m) => m.kind)).toEqual(['user', 'err']);
  });
});

describe('ReviewSession.persistence', () => {
  it('persists immediately after a successful runReview', async () => {
    const editor = makeEditorBridge('これは冗長な表現です。');
    const fakeRunner = {
      review: vi.fn(async () => ({ comments: [sampleComment], newSessionId: 's' })),
      chat: vi.fn(),
    };
    const fakeTextlint = { lint: async () => ({ available: true, messages: [] }) };
    const fakeResolver = { resolvePrompt: async () => ({ systemPrompt: '', sources: [] }) };
    const saveState = vi.fn(async () => {});

    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState },
      runner: fakeRunner, textlint: fakeTextlint, promptResolver: fakeResolver,
      vaultDir: '/v',
    });

    await session.runReview('full');

    expect(saveState).toHaveBeenCalled();
    const lastCall = saveState.mock.calls.at(-1) as any;
    expect(lastCall?.[1].anchors).toHaveLength(1);
  });

  it('rehydrate restores chatLog from store', async () => {
    const editor = makeEditorBridge('テキスト');
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: {
        loadState: async () => ({
          anchors: [],
          chat: [
            { kind: 'user', text: 'もっと短く', ts: 1 },
            { kind: 'ai', text: '了解', ts: 2 },
          ],
        }),
        saveState: async () => {},
      },
      runner: null as any, textlint: null as any, promptResolver: null as any,
      vaultDir: '/v',
    });

    await session.rehydrate();

    expect(session.chatLog).toHaveLength(2);
    expect(session.chatLog[1].text).toBe('了解');
  });
});

describe('ReviewSession.rehydrate', () => {
  it('loads anchors from store and matches them to current text', async () => {
    const editor = makeEditorBridge('これは冗長な表現です。');
    const stored: PersistedAnchor[] = [{
      id: 'c1', quote: '冗長な表現', contextBefore: 'これは',
      contextAfter: 'です', lineHint: 0, comment: sampleComment, resolved: false,
    }];

    const session = new ReviewSession({
      notePath: 'note.md',
      editor,
      anchorStore: {
        loadState: async () => ({ anchors: stored, chat: [] }),
        saveState: async () => {},
      },
      runner: null as any,
      textlint: null as any,
      promptResolver: null as any,
      vaultDir: '/vault',
    });

    await session.rehydrate();

    expect(session.comments).toHaveLength(1);
    expect(editor.setHighlights).toHaveBeenCalled();
  });
});

describe('ReviewSession.runReview abort', () => {
  it('returns early if signal is aborted before runner.review', async () => {
    const editor = makeEditorBridge('text');
    const fakeRunner = { review: vi.fn(), chat: vi.fn() };
    const fakeTextlint = { lint: vi.fn(async () => ({ available: true, messages: [] })) };
    const fakeResolver = { resolvePrompt: vi.fn(async () => ({ systemPrompt: '', sources: [] })) };

    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: fakeRunner, textlint: fakeTextlint, promptResolver: fakeResolver,
      vaultDir: '/v',
    });

    const ac = new AbortController();
    ac.abort();
    await session.runReview('full', ac.signal);

    expect(fakeRunner.review).not.toHaveBeenCalled();
  });
});

describe('ReviewSession.rehydrate stale', () => {
  it('marks anchors as stale when quote not found in current text', async () => {
    const editor = makeEditorBridge('まったく違う文章');
    const stored: PersistedAnchor[] = [{
      id: 'c1', quote: '冗長な表現', contextBefore: 'これは',
      contextAfter: 'です', lineHint: 0, comment: sampleComment, resolved: false,
    }];

    const session = new ReviewSession({
      notePath: 'note.md', editor,
      anchorStore: { loadState: async () => ({ anchors: stored, chat: [] }), saveState: async () => {} },
      runner: null as any, textlint: null as any, promptResolver: null as any,
      vaultDir: '/vault',
    });

    await session.rehydrate();

    expect(session.comments).toHaveLength(1);
    // refreshHighlights は stale=true のエントリを除外するので空のマークを渡す
    expect(editor.setHighlights).toHaveBeenCalledWith([]);
  });
});

describe('ReviewSession.getAnchorRange', () => {
  it('re-resolves offset against current text', async () => {
    const editor = makeEditorBridge('foo bar baz');
    const cmt: ReviewComment = {
      id: 'c1', quote: 'bar', contextBefore: 'foo ', contextAfter: ' baz',
      severity: 'info', message: 'x',
    };
    const stored: PersistedAnchor[] = [{
      id: 'c1', quote: 'bar', contextBefore: 'foo ', contextAfter: ' baz',
      lineHint: 0, comment: cmt, resolved: false,
    }];
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: stored, chat: [] }), saveState: async () => {} },
      runner: null as any, textlint: null as any, promptResolver: null as any,
      vaultDir: '/v',
    });
    await session.rehydrate();

    expect(session.getAnchorRange('c1')).toEqual({ from: 4, to: 7 });

    // 外部からの編集で前方に文字が挿入されたケース
    editor.text = 'XYZfoo bar baz';
    expect(session.getAnchorRange('c1')).toEqual({ from: 7, to: 10 });
  });

  it('returns null for unknown id', () => {
    const editor = makeEditorBridge('text');
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: null as any, textlint: null as any, promptResolver: null as any,
      vaultDir: '/v',
    });
    expect(session.getAnchorRange('missing')).toBe(null);
  });
});

describe('ReviewSession anchor reanchoring', () => {
  it('refreshHighlights sends offsets that match the current text after a previous apply', async () => {
    const editor = makeEditorBridge('AAA冗長な表現XXX 別箇所YYY');
    const c1: ReviewComment = {
      id: 'c1', quote: '冗長な表現', contextBefore: 'AAA', contextAfter: 'XXX',
      severity: 'suggestion', message: '簡潔に', suggestion: '冗長',
    };
    const c2: ReviewComment = {
      id: 'c2', quote: '別箇所', contextBefore: 'XXX ', contextAfter: 'YYY',
      severity: 'info', message: '別の指摘',
    };
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: null as any, textlint: null as any, promptResolver: null as any,
      vaultDir: '/v',
    });
    (session as any).addCommentAnchor(c1);
    (session as any).addCommentAnchor(c2);

    // c1 を適用すると本文が縮み、c2 の正しい offset がずれる
    session.applyComment('c1');

    // setHighlights には最新本文に対する正しい offset が渡るべき
    const last = (editor.setHighlights as any).mock.calls.at(-1)[0] as Array<{ from: number; to: number; commentId: string }>;
    const c2mark = last.find((m) => m.commentId === 'c2')!;
    const got = editor.text.slice(c2mark.from, c2mark.to);
    expect(got).toBe('別箇所');
  });

  it('applyComment on a later anchor still works correctly after an earlier text edit', async () => {
    const editor = makeEditorBridge('foo bar baz qux');
    const c1: ReviewComment = {
      id: 'c1', quote: 'qux', contextBefore: 'baz ', contextAfter: '',
      severity: 'suggestion', message: 'x', suggestion: 'QUX',
    };
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: [], chat: [] }), saveState: async () => {} },
      runner: null as any, textlint: null as any, promptResolver: null as any,
      vaultDir: '/v',
    });
    (session as any).addCommentAnchor(c1);

    // 外部編集で先頭に文字が挿入される（offset がずれる）
    editor.text = 'ZZZfoo bar baz qux';

    session.applyComment('c1');

    expect(editor.text).toBe('ZZZfoo bar baz QUX');
  });
});

describe('ReviewSession.applyComment stale guard', () => {
  it('does not apply when anchor is stale', async () => {
    const editor = makeEditorBridge('まったく違う文章');
    const stored: PersistedAnchor[] = [{
      id: 'c1', quote: '冗長な表現', contextBefore: 'これは',
      contextAfter: 'です', lineHint: 0,
      comment: { ...sampleComment, suggestion: '冗長' }, resolved: false,
    }];
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { loadState: async () => ({ anchors: stored, chat: [] }), saveState: async () => {} },
      runner: null as any, textlint: null as any, promptResolver: null as any,
      vaultDir: '/v',
    });
    await session.rehydrate();

    session.applyComment('c1');

    expect(editor.text).toBe('まったく違う文章'); // 変更なし
  });
});
