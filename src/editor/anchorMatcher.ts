export interface AnchorQuery {
  quote: string;
  contextBefore: string;
  contextAfter: string;
  lineHint: number;
}

export interface AnchorHit {
  from: number;
  to: number;
  stale: boolean;
}

export function findAnchor(text: string, q: AnchorQuery): AnchorHit {
  const occurrences: number[] = [];
  let pos = 0;
  while (true) {
    const i = text.indexOf(q.quote, pos);
    if (i < 0) break;
    occurrences.push(i);
    pos = i + 1;
  }

  if (occurrences.length === 0) {
    return { from: 0, to: 0, stale: true };
  }

  if (occurrences.length === 1) {
    return makeHit(occurrences[0], q.quote);
  }

  const ctxFiltered = occurrences.filter((i) => {
    const before = text.substring(Math.max(0, i - q.contextBefore.length), i);
    const after = text.substring(
      i + q.quote.length,
      i + q.quote.length + q.contextAfter.length
    );
    return before === q.contextBefore && after === q.contextAfter;
  });
  if (ctxFiltered.length === 1) {
    return makeHit(ctxFiltered[0], q.quote);
  }

  const candidates = ctxFiltered.length > 0 ? ctxFiltered : occurrences;
  const target = pickClosestByLine(text, candidates, q.lineHint);
  return makeHit(target, q.quote);
}

function makeHit(from: number, quote: string): AnchorHit {
  return { from, to: from + quote.length, stale: false };
}

function pickClosestByLine(
  text: string,
  offsets: number[],
  lineHint: number
): number {
  return offsets
    .map((off) => ({ off, line: text.substring(0, off).split('\n').length - 1 }))
    .reduce((best, cur) =>
      Math.abs(cur.line - lineHint) < Math.abs(best.line - lineHint)
        ? cur
        : best
    ).off;
}
