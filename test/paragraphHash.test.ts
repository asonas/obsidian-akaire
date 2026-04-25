import { describe, it, expect } from 'vitest';
import { splitParagraphs, paragraphHash, diffParagraphs } from '../src/util/paragraphHash';

describe('splitParagraphs', () => {
  it('splits by blank lines and keeps offsets', () => {
    const text = 'first\nline\n\nsecond para\n\nthird';
    const result = splitParagraphs(text);
    expect(result).toEqual([
      { id: 'p0', text: 'first\nline', from: 0, to: 10 },
      { id: 'p1', text: 'second para', from: 12, to: 23 },
      { id: 'p2', text: 'third', from: 25, to: 30 },
    ]);
  });
});

describe('diffParagraphs', () => {
  it('detects new and changed paragraphs', () => {
    const oldHashes = new Map([
      ['p0', paragraphHash('first')],
      ['p1', paragraphHash('second')],
    ]);
    const newParas = [
      { id: 'p0', text: 'first', from: 0, to: 5 },
      { id: 'p1', text: 'second changed', from: 7, to: 21 },
      { id: 'p2', text: 'third', from: 23, to: 28 },
    ];
    const changed = diffParagraphs(oldHashes, newParas);
    expect(changed.map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});
