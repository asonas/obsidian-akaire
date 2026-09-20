import type { ChildProcess } from 'node:child_process';
import type { ReviewComment } from '../types';
import { extractJsonObject } from '../util/extractJsonObject';
import { buildReviewUserPrompt } from './ClaudeRunner';
import type { ChatArgs, ReviewArgs, ReviewResult } from './ReviewRunner';

type SpawnFn = (cmd: string, args: string[], opts?: { cwd?: string }) => ChildProcess;

export class CodexRunner {
  constructor(private opts: {
    binary: string;
    spawn: SpawnFn;
    timeoutMs: number;
    model?: string;
  }) {}

  async review(args: ReviewArgs): Promise<ReviewResult> {
    const prompt = `${args.systemPrompt}\n\n${buildReviewUserPrompt(args)}`;
    const argv = [
      'exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check',
      '-c', 'approval_policy="never"',
    ];
    if (this.opts.model) argv.push('--model', this.opts.model);
    argv.push('-');
    const result = await this.run(argv, prompt, args.vaultDir, args.signal);
    const parsed = extractJsonObject(result.reply) as { comments?: unknown };
    if (!Array.isArray(parsed.comments)) throw new Error('Codex schema mismatch');
    return {
      comments: parsed.comments as ReviewComment[],
      newSessionId: result.sessionId,
      rawStdout: result.stdout,
      structuredOutput: parsed,
    };
  }

  async chat(args: ChatArgs): Promise<{ reply: string }> {
    const argv = [
      'exec', 'resume', '--json',
      '-c', 'sandbox_mode="read-only"',
      '-c', 'approval_policy="never"',
    ];
    if (this.opts.model) argv.push('--model', this.opts.model);
    argv.push(args.sessionId, '-');
    return { reply: (await this.run(argv, args.message, args.vaultDir, args.signal)).reply };
  }

  private run(argv: string[], stdin: string, cwd: string, signal?: AbortSignal): Promise<{
    stdout: string;
    reply: string;
    sessionId: string;
  }> {
    return new Promise((resolve, reject) => {
      const child = this.opts.spawn(this.opts.binary, argv, { cwd });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (error) reject(error);
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(new Error('Codex timeout'));
      }, this.opts.timeoutMs);
      const abort = () => {
        child.kill('SIGKILL');
        finish(new Error('aborted'));
      };
      signal?.addEventListener('abort', abort);
      child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
      child.on('error', (error) => finish(new Error(`Codex spawn failed: ${error.message}`)));
      child.on('close', (code) => {
        if (settled) return;
        if (code !== 0) {
          finish(new Error(`Codex exited with ${code}: ${stderr.trim()}`));
          return;
        }
        try {
          let sessionId = '';
          let reply = '';
          for (const line of stdout.split('\n').filter(Boolean)) {
            const event = JSON.parse(line) as {
              type?: string;
              thread_id?: string;
              item?: { type?: string; text?: string };
            };
            if (event.type === 'thread.started' && event.thread_id) sessionId = event.thread_id;
            if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
              reply = event.item.text ?? reply;
            }
          }
          if (!sessionId || !reply) throw new Error('missing thread or agent message');
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          resolve({ stdout, reply, sessionId });
        } catch (error) {
          finish(new Error(`Invalid Codex JSONL: ${(error as Error).message}`));
        }
      });
      child.stdin?.on('error', () => {});
      child.stdin?.end(stdin);
    });
  }
}
