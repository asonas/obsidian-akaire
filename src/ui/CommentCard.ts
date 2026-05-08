import type { ReviewComment } from '../types';

export interface CommentCardCallbacks {
  onApply(commentId: string): void;
  onDismiss(commentId: string): void;
  onJump(commentId: string): void;
}

const SEVERITY_LABEL: Record<ReviewComment['severity'], string> = {
  warning: '要修正',
  suggestion: '提案',
  info: '補足',
};

export function renderCommentCard(
  parent: HTMLElement,
  comment: ReviewComment,
  index: number,
  stale: boolean,
  cb: CommentCardCallbacks
): HTMLElement {
  const card = parent.createEl('div', {
    cls: `akaire-card${stale ? ' is-stale' : ''}`,
    attr: { 'data-severity': comment.severity },
  });

  card.createEl('span', {
    cls: 'akaire-card__num',
    text: formatIndex(index),
  });

  if (stale) {
    card.createEl('span', { cls: 'akaire-card__stale', text: '無効' });
  }

  card.createEl('span', {
    cls: 'akaire-card__sev',
    text: SEVERITY_LABEL[comment.severity] ?? comment.severity,
  });

  card.createEl('p', {
    cls: 'akaire-card__quote',
    text: comment.quote,
  });

  card.createEl('p', {
    cls: 'akaire-card__msg',
    text: comment.message,
  });

  if (comment.suggestion) {
    const sug = card.createEl('div', { cls: 'akaire-card__suggestion' });
    sug.createEl('span', {
      cls: 'akaire-card__suggestion__label',
      text: '修正案',
    });
    sug.appendText(comment.suggestion);
  }

  const buttons = card.createEl('div', { cls: 'akaire-card__buttons' });

  if (comment.suggestion) {
    const apply = buttons.createEl('button', {
      text: '適用',
      cls: 'is-primary',
      attr: { type: 'button', title: '修正案を本文に反映する' },
    });
    apply.addEventListener('click', () => cb.onApply(comment.id));
  }
  const jump = buttons.createEl('button', {
    text: '本文へ移動',
    attr: { type: 'button', title: 'エディタの該当箇所へ移動する' },
  });
  jump.addEventListener('click', () => cb.onJump(comment.id));

  const dismiss = buttons.createEl('button', {
    text: '閉じる',
    attr: { type: 'button', title: 'このコメントを非表示にする' },
  });
  dismiss.addEventListener('click', () => cb.onDismiss(comment.id));

  return card;
}

function formatIndex(i: number): string {
  // ① ② … ⑳ にしたいが、20以降はただの数字にフォールバック
  const circled = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  return i >= 1 && i <= 20 ? circled[i - 1] : String(i);
}
