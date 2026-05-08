import { describe, it, expect } from 'vitest';
import { AnchorStore, AnchorFsApi } from '../src/core/AnchorStore';
import type { PersistedAnchor, ChatMessage } from '../src/types';

function makeFs(): { fs: AnchorFsApi; files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    fs: {
      readFile: async (p) => files.get(p) ?? null,
      writeFile: async (p, c) => { files.set(p, c); },
      mkdirp: async () => {},
      pathJoin: (...parts) => parts.join('/').replace(/\/+/g, '/'),
      dirname: (p) => p.substring(0, p.lastIndexOf('/')),
    },
  };
}

const sample: PersistedAnchor = {
  id: 'a1',
  quote: '冗長な表現',
  contextBefore: 'これは',
  contextAfter: 'です。',
  lineHint: 5,
  comment: {
    id: 'a1',
    quote: '冗長な表現',
    contextBefore: 'これは',
    contextAfter: 'です。',
    severity: 'suggestion',
    message: '簡潔に',
  },
  resolved: false,
};

describe('AnchorStore', () => {
  it('roundtrips anchors through save and load', async () => {
    const { fs } = makeFs();
    const store = new AnchorStore({ vaultRoot: '/vault', fs });

    await store.save('blog/post.md', [sample]);
    const loaded = await store.load('blog/post.md');

    expect(loaded).toEqual([sample]);
  });

  it('returns empty array when file does not exist', async () => {
    const { fs } = makeFs();
    const store = new AnchorStore({ vaultRoot: '/vault', fs });
    expect(await store.load('missing.md')).toEqual([]);
  });

  it('returns empty array on malformed JSON', async () => {
    const { fs, files } = makeFs();
    files.set('/vault/.editor-state/broken.md.json', 'not json {');
    const store = new AnchorStore({ vaultRoot: '/vault', fs });
    expect(await store.load('broken.md')).toEqual([]);
  });

  it('roundtrips full state including chat through saveState/loadState', async () => {
    const { fs } = makeFs();
    const store = new AnchorStore({ vaultRoot: '/vault', fs });
    const chat: ChatMessage[] = [
      { kind: 'user', text: 'もっと厳しく', ts: 1 },
      { kind: 'ai', text: '了解しました', ts: 2 },
    ];

    await store.saveState('blog/post.md', { anchors: [sample], chat });
    const loaded = await store.loadState('blog/post.md');

    expect(loaded.anchors).toEqual([sample]);
    expect(loaded.chat).toEqual(chat);
  });

  it('loadState reads legacy files (anchors only) with empty chat', async () => {
    const { fs, files } = makeFs();
    files.set(
      '/vault/.editor-state/legacy.md.json',
      JSON.stringify({ anchors: [sample] }),
    );
    const store = new AnchorStore({ vaultRoot: '/vault', fs });

    const loaded = await store.loadState('legacy.md');
    expect(loaded.anchors).toEqual([sample]);
    expect(loaded.chat).toEqual([]);
  });
});
