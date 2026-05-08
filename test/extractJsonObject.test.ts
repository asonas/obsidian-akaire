import { describe, it, expect } from 'vitest';
import { extractJsonObject } from '../src/util/extractJsonObject';

describe('extractJsonObject', () => {
  it('parses a bare JSON object string', () => {
    const obj = extractJsonObject('{"comments":[{"id":"c1"}]}');
    expect(obj).toEqual({ comments: [{ id: 'c1' }] });
  });

  it('parses JSON wrapped in ```json fences', () => {
    const text = '前置き\n```json\n{"comments":[{"id":"c1"}]}\n```\nおまけ';
    const obj = extractJsonObject(text);
    expect(obj).toEqual({ comments: [{ id: 'c1' }] });
  });

  it('parses JSON wrapped in unlabeled ``` fences', () => {
    const text = '結果は次の通りです:\n```\n{"comments":[]}\n```';
    const obj = extractJsonObject(text);
    expect(obj).toEqual({ comments: [] });
  });

  it('extracts an embedded JSON object from surrounding prose', () => {
    const text = 'レビューの要点をまとめます。{"comments":[{"id":"c1","quote":"q"}]} 以上です。';
    const obj = extractJsonObject(text);
    expect(obj).toEqual({ comments: [{ id: 'c1', quote: 'q' }] });
  });

  it('handles nested objects and braces inside strings', () => {
    const text = 'foo {"comments":[{"id":"c1","message":"hello {world}"}]} bar';
    const obj = extractJsonObject(text);
    expect(obj).toEqual({
      comments: [{ id: 'c1', message: 'hello {world}' }],
    });
  });

  it('throws when no JSON object is present', () => {
    expect(() => extractJsonObject('完全な散文です。JSONはありません。')).toThrow();
  });

  it('throws when only malformed JSON is present', () => {
    expect(() => extractJsonObject('{"broken": ')).toThrow();
  });
});
