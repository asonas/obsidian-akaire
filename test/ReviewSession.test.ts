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
