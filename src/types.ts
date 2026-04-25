export interface ReviewComment {
  id: string;
  quote: string;
  contextBefore: string;
  contextAfter: string;
  severity: 'info' | 'suggestion' | 'warning';
  message: string;
  suggestion?: string;
}

export interface PersistedAnchor {
  id: string;
  quote: string;
  contextBefore: string;
  contextAfter: string;
  lineHint: number;
  comment: ReviewComment;
  resolved: boolean;
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
