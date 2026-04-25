import { describe, it, expect } from 'vitest';
import { AnchorStore, AnchorFsApi } from '../src/core/AnchorStore';
import type { PersistedAnchor } from '../src/types';

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
});
