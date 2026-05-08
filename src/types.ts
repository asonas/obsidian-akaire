export interface ReviewComment {
  id: string;
  quote: string;
  contextBefore: string;
  contextAfter: string;
  severity: 'info' | 'suggestion' | 'warning';
  message: string;
  suggestion?: string;
}

export type AnchorStatus = 'pending' | 'applied' | 'kept' | 'dismissed';

export interface PersistedAnchor {
  id: string;
  quote: string;
  contextBefore: string;
  contextAfter: string;
  lineHint: number;
  comment: ReviewComment;
  // 互換のため resolved は残す。新ストア書き込みでは status から派生して入れる。
  resolved: boolean;
  status?: AnchorStatus;
}

export interface ChatMessage {
  kind: 'user' | 'ai' | 'err';
  text: string;
  ts: number;
}

export interface TextlintMessage {
  line: number;
  column: number;
  ruleId: string;
  message: string;
  severity: 1 | 2;
}

export type TextlintResult =
  | { available: false; reason: string }
  | { available: true; messages: TextlintMessage[] };
