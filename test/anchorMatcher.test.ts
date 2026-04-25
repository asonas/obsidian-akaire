import { describe, it, expect } from 'vitest';
import { findAnchor } from '../src/editor/anchorMatcher';

describe('findAnchor', () => {
  it('returns offset when quote matches uniquely', () => {
    const text = 'これは冗長な表現です。\n別の段落';
    const result = findAnchor(text, {
      quote: '冗長な表現',
      contextBefore: 'これは',
      contextAfter: 'です',
      lineHint: 0,
    });
    expect(result).toEqual({
      from: text.indexOf('冗長な表現'),
      to: text.indexOf('冗長な表現') + '冗長な表現'.length,
      stale: false,
    });
  });

  it('disambiguates duplicates by lineHint', () => {
    const text =
      'foo bar baz\nfoo bar baz\nfoo bar baz';
    const result = findAnchor(text, {
      quote: 'foo bar',
      contextBefore: '',
      contextAfter: ' baz',
      lineHint: 1,
    });
    expect(result.from).toBe('foo bar baz\n'.length);
    expect(result.stale).toBe(false);
  });

  it('returns stale=true when quote not found', () => {
    const text = 'まったく別の文章';
    const result = findAnchor(text, {
      quote: '冗長な表現',
      contextBefore: 'これは',
      contextAfter: 'です',
      lineHint: 0,
    });
    expect(result.stale).toBe(true);
  });
});
