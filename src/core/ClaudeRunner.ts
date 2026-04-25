import type { ChildProcess } from 'node:child_process';
import type { ReviewComment } from '../types';

export type SpawnFn = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string }
) => ChildProcess;

export interface ClaudeRunnerOpts {
  claudeBinary: string;
  spawn: SpawnFn;
  timeoutMs: number;
}

export interface ReviewArgs {
  text: string;
  systemPrompt: string;
  textlintFindings?: unknown[];
  sessionId: string | null;
  vaultDir: string;
}

export interface ReviewResult {
  comments: ReviewComment[];
  newSessionId: string;
}

export interface ChatArgs {
  message: string;
  sessionId: string;
  vaultDir: string;
}

export class ClaudeRunError extends Error {
  constructor(message: string, public stderr: string) {
    super(message);
  }
}

export class ClaudeRunner {
  constructor(private opts: ClaudeRunnerOpts) {}

  async review(args: ReviewArgs): Promise<ReviewResult> {
    const userPrompt = this.buildReviewPrompt(args);
    const argv = this.buildArgs(args, true);
    const { stdout, sessionId } = await this.run(argv, userPrompt, args.vaultDir);

    const outerMaybe = this.parseClaudeJson(stdout);
    const inner = JSON.parse(outerMaybe.result);
    if (!Array.isArray(inner.comments)) {
      throw new ClaudeRunError('Schema mismatch', stdout);
    }

    return {
      comments: inner.comments as ReviewComment[],
      newSessionId: sessionId,
    };
  }

  async chat(args: ChatArgs): Promise<{ reply: string }> {
    const argv = this.buildChatArgs(args);
    const { stdout } = await this.run(argv, args.message, args.vaultDir);
    const parsed = this.parseClaudeJson(stdout);
    return { reply: parsed.result };
  }

  private buildArgs(args: ReviewArgs, structured: boolean): string[] {
    const a: string[] = [
      '-p',
      '--output-format', 'json',
      '--add-dir', args.vaultDir,
      '--append-system-prompt', args.systemPrompt,
    ];
    if (structured) {
      a.push('--json-schema', JSON.stringify({
        type: 'object',
        required: ['comments'],
        properties: {
          comments: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'quote', 'severity', 'message'],
              properties: {
                id: { type: 'string' },
                quote: { type: 'string' },
                contextBefore: { type: 'string' },
                contextAfter: { type: 'string' },
                severity: { enum: ['info', 'suggestion', 'warning'] },
                message: { type: 'string' },
                suggestion: { type: 'string' },
              },
            },
          },
        },
      }));
    }
    if (args.sessionId) {
      a.push('--resume', args.sessionId);
    }
    return a;
  }

  private buildChatArgs(args: ChatArgs): string[] {
    return [
      '-p',
      '--output-format', 'json',
      '--add-dir', args.vaultDir,
      '--resume', args.sessionId,
    ];
  }

  private buildReviewPrompt(args: ReviewArgs): string {
    const findings = args.textlintFindings && args.textlintFindings.length
      ? `\n\n<textlint_findings>\n${JSON.stringify(args.textlintFindings)}\n</textlint_findings>\nNote: textlintは形式エラーを既に指摘しています。重複を避け、内容・論理・読みやすさを見てください。`
      : '';
    return `次の文章をレビューし、JSON schemaに従ってコメントを返してください。\n\n<text>\n${args.text}\n</text>${findings}`;
  }

  private async run(
    argv: string[],
    stdin: string,
    cwd: string
  ): Promise<{ stdout: string; stderr: string; sessionId: string }> {
    return new Promise((resolve, reject) => {
      const child = this.opts.spawn(this.opts.claudeBinary, argv, { cwd });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new ClaudeRunError('timeout', stderr));
      }, this.opts.timeoutMs);

      child.stdout?.on('data', (d) => { stdout += d.toString(); });
      child.stderr?.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(new ClaudeRunError(`spawn failed: ${e.message}`, stderr));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new ClaudeRunError(`exit ${code}`, stderr));
          return;
        }
        try {
          const parsed = this.parseClaudeJson(stdout);
          resolve({ stdout, stderr, sessionId: parsed.session_id });
        } catch (e) {
          reject(e);
        }
      });

      if (child.stdin) {
        child.stdin.write(stdin);
        child.stdin.end();
      }
    });
  }

  private parseClaudeJson(stdout: string): { result: string; session_id: string } {
    try {
      const obj = JSON.parse(stdout);
      if (typeof obj.result !== 'string' || typeof obj.session_id !== 'string') {
        throw new Error('missing fields');
      }
      return obj;
    } catch (e) {
      throw new ClaudeRunError(`Invalid claude JSON: ${(e as Error).message}`, stdout);
    }
  }
}
