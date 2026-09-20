import type { ReviewComment } from '../types';

export type KeepAsIsItem = {
  quote: string;
  message: string;
  suggestion?: string;
};

export type ReviewArgs = {
  text: string;
  systemPrompt: string;
  textlintFindings?: unknown[];
  keepAsIs?: KeepAsIsItem[];
  sessionId: string | null;
  vaultDir: string;
  signal?: AbortSignal;
};

export type ReviewResult = {
  comments: ReviewComment[];
  newSessionId: string;
  rawStdout?: string;
  structuredOutput?: unknown;
};

export type ChatArgs = {
  message: string;
  sessionId: string;
  vaultDir: string;
  signal?: AbortSignal;
};

export type ReviewRunner = {
  review(args: ReviewArgs): Promise<ReviewResult>;
  chat(args: ChatArgs): Promise<{ reply: string }>;
};
