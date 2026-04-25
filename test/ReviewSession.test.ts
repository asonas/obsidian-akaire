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
      anchorStore: { load: async () => [], save: async () => {} },
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
      anchorStore: { load: async () => [], save: async () => {} },
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
});

describe('ReviewSession.applyComment', () => {
  it('replaces anchor range with suggestion and marks resolved', async () => {
    const editor = makeEditorBridge('これは冗長な表現です。');
    const session = new ReviewSession({
      notePath: 'n.md', editor,
      anchorStore: { load: async () => [], save: async () => {} },
      runner: null as any, textlint: null as any, promptResolver: null as any,
      vaultDir: '/v',
    });
    (session as any).addCommentAnchor({
      ...sampleComment, suggestion: '冗長',
    });

    session.applyComment('c1');

    expect(editor.text).toBe('これは冗長です。');
    expect(session.comments.find((c) => c.id === 'c1')).toBeTruthy();
    expect((session as any).anchors.get('c1').resolved).toBe(true);
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
      anchorStore: { load: async () => [], save: async () => {} },
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
        load: async () => stored,
        save: async () => {},
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
