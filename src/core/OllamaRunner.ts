import { randomUUID } from 'node:crypto';
import { requestUrl } from 'obsidian';
import type { ReviewComment } from '../types';
import { extractJsonObject } from '../util/extractJsonObject';
import { buildReviewUserPrompt, REVIEW_SCHEMA } from './ClaudeRunner';
import type { ChatArgs, ReviewArgs, ReviewResult } from './ReviewRunner';

type OllamaMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export class OllamaRunner {
  private sessions = new Map<string, OllamaMessage[]>();

  constructor(private opts: { baseUrl: string; model: string }) {}

  async review(args: ReviewArgs): Promise<ReviewResult> {
    const messages: OllamaMessage[] = [
      { role: 'system', content: args.systemPrompt },
      { role: 'user', content: buildReviewUserPrompt(args) },
    ];
    const content = await this.request(messages, REVIEW_SCHEMA, args.signal);
    const parsed = extractJsonObject(content) as { comments?: unknown };
    if (!Array.isArray(parsed.comments)) throw new Error('Ollama schema mismatch');
    const sessionId = randomUUID();
    this.sessions.set(sessionId, [...messages, { role: 'assistant', content }]);
    return {
      comments: parsed.comments as ReviewComment[],
      newSessionId: sessionId,
      rawStdout: content,
      structuredOutput: parsed,
    };
  }

  async chat(args: ChatArgs): Promise<{ reply: string }> {
    const messages = this.sessions.get(args.sessionId);
    if (!messages) throw new Error('Ollama conversation is no longer available; run review again');
    messages.push({ role: 'user', content: args.message });
    const reply = await this.request(messages, undefined, args.signal);
    messages.push({ role: 'assistant', content: reply });
    return { reply };
  }

  private async request(messages: OllamaMessage[], format: unknown, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) throw new Error('aborted');
    const response = await requestUrl({
      url: `${this.opts.baseUrl.replace(/\/$/, '')}/api/chat`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.opts.model, messages, stream: false, ...(format ? { format } : {}) }),
      throw: false,
    });
    if (signal?.aborted) throw new Error('aborted');
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Ollama HTTP ${response.status}: ${response.text}`);
    }
    const body = response.json as { message?: { content?: string }; error?: string };
    if (body.error) throw new Error(body.error);
    if (!body.message?.content) throw new Error('Ollama returned no message');
    return body.message.content;
  }
}
