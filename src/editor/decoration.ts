import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet } from '@codemirror/view';

export interface AnchorMark {
  from: number;
  to: number;
  commentId: string;
  source: 'ai' | 'textlint';
}

export const setAnchorMarks = StateEffect.define<AnchorMark[]>();
export const clearAnchorMarks = StateEffect.define<void>();

export const anchorField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setAnchorMarks)) {
        const builder = new RangeSetBuilder<Decoration>();
        for (const m of e.value.sort((a, b) => a.from - b.from)) {
          builder.add(
            m.from,
            m.to,
            Decoration.mark({
              class: m.source === 'ai' ? 'editor-anchor-ai' : 'editor-anchor-textlint',
              attributes: { 'data-comment-id': m.commentId },
            })
          );
        }
        deco = builder.finish();
      } else if (e.is(clearAnchorMarks)) {
        deco = Decoration.none;
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});
