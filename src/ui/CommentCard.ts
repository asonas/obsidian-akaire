import type { ReviewComment } from '../types';

export interface CommentCardCallbacks {
  onApply(commentId: string): void;
  onDismiss(commentId: string): void;
  onJump(commentId: string): void;
}

export function renderCommentCard(
  parent: HTMLElement,
  comment: ReviewComment,
  stale: boolean,
  cb: CommentCardCallbacks
): HTMLElement {
  const card = parent.createEl('div', {
    cls: `editor-card editor-card-${comment.severity}${stale ? ' editor-card-stale' : ''}`,
  });
  if (stale) {
    card.createEl('span', { cls: 'editor-stale-badge', text: 'stale' });
  }
  card.createEl('blockquote', { text: comment.quote });
  card.createEl('p', { text: comment.message });

  const buttons = card.createEl('div', { cls: 'editor-card-buttons' });
  buttons.createEl('button', { text: 'Jump', attr: { type: 'button' } })
    .addEventListener('click', () => cb.onJump(comment.id));
  if (comment.suggestion) {
    buttons.createEl('button', { text: 'Apply', attr: { type: 'button' } })
      .addEventListener('click', () => cb.onApply(comment.id));
  }
  buttons.createEl('button', { text: 'Dismiss', attr: { type: 'button' } })
    .addEventListener('click', () => cb.onDismiss(comment.id));

  return card;
}
