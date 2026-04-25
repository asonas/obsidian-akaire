import { createHash } from 'node:crypto';

export interface Paragraph {
  id: string;
  text: string;
  from: number;
  to: number;
}

export function splitParagraphs(text: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  // Split on one or more blank lines (two or more consecutive newlines)
  const parts = text.split(/\n{2,}/);
  let offset = 0;
  let idx = 0;

  for (const part of parts) {
    if (part.length === 0) {
      // skip empty parts (e.g. trailing newlines)
      offset += 1;
      continue;
    }
    const from = offset;
    const to = from + part.length;
    paragraphs.push({ id: `p${idx++}`, text: part, from, to });
    // advance past the part and the separator that was consumed
    offset = to;
    // find the actual separator length in the original text
    const remaining = text.slice(offset);
    const sepMatch = remaining.match(/^\n{2,}/);
    if (sepMatch) {
      offset += sepMatch[0].length;
    }
  }

  return paragraphs;
}

export function paragraphHash(text: string): string {
  return createHash('sha1').update(text).digest('hex').slice(0, 16);
}

export function diffParagraphs(
  prev: Map<string, string>,
  current: Paragraph[]
): Paragraph[] {
  return current.filter((p) => {
    const h = paragraphHash(p.text);
    return prev.get(p.id) !== h;
  });
}
