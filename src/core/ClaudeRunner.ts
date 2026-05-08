import type { ChildProcess } from 'node:child_process';
import type { ReviewComment } from '../types';
import { log } from '../util/logger';
import { extractJsonObject } from '../util/extractJsonObject';

export type SpawnFn = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string }
) => ChildProcess;

export interface ClaudeRunnerOpts {
  claudeBinary: string;
  spawn: SpawnFn;
  timeoutMs: number;
  model?: string;
}

export interface ReviewArgs {
  text: string;
  systemPrompt: string;
  textlintFindings?: unknown[];
  sessionId: string | null;
  vaultDir: string;
  signal?: AbortSignal;
}

export interface ReviewResult {
  comments: ReviewComment[];
  newSessionId: string;
}

export interface ChatArgs {
  message: string;
  sessionId: string;
  vaultDir: string;
  signal?: AbortSignal;
}

export class ClaudeRunError extends Error {
  constructor(message: string, public stderr: string) {
    super(message);
  }
}

export const REVIEW_SCHEMA = {
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
} as const;

export function buildReviewUserPrompt(args: ReviewArgs): string {
  const findings = args.textlintFindings && args.textlintFindings.length
    ? `\n\n<textlint_findings>\n${JSON.stringify(args.textlintFindings)}\n</textlint_findings>\nNote: textlintは形式エラーを既に指摘しています。重複を避け、内容・論理・読みやすさを見てください。`
    : '';
  return [
    '次の文章をレビューし、以下のJSON schemaに**厳密に**従ったJSONオブジェクトのみを返してください。',
    '前置きや説明文、コードフェンス（```）は不要です。JSON以外の文字を出力しないでください。',
    '',
    '<schema>',
    JSON.stringify(REVIEW_SCHEMA),
    '</schema>',
    '',
    '<text>',
    args.text,
    '</text>',
  ].join('\n') + findings;
}

export class ClaudeRunner {
  constructor(private opts: ClaudeRunnerOpts) {}

  async review(args: ReviewArgs): Promise<ReviewResult> {
    const userPrompt = buildReviewUserPrompt(args);
    const argv = this.buildArgs(args, true);
    const { stdout, sessionId } = await this.run(argv, userPrompt, args.vaultDir, args.signal);

    const outerMaybe = this.parseClaudeJson(stdout);
    let inner: { comments?: unknown };
    if (outerMaybe.structured_output && typeof outerMaybe.structured_output === 'object') {
      inner = outerMaybe.structured_output as { comments?: unknown };
    } else {
      try {
        inner = extractJsonObject(outerMaybe.result) as { comments?: unknown };
      } catch (e) {
        throw new ClaudeRunError(
          `Claude did not return structured output: ${(e as Error).message}`,
          outerMaybe.result,
        );
      }
    }
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
    const { stdout } = await this.run(argv, args.message, args.vaultDir, args.signal);
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
    if (this.opts.model) {
      a.push('--model', this.opts.model);
    }
    if (structured) {
      a.push('--json-schema', JSON.stringify(REVIEW_SCHEMA));
    }
    if (args.sessionId) {
      a.push('--resume', args.sessionId);
    }
    return a;
  }

  private buildChatArgs(args: ChatArgs): string[] {
    const a: string[] = [
      '-p',
      '--output-format', 'json',
      '--add-dir', args.vaultDir,
      '--resume', args.sessionId,
    ];
    if (this.opts.model) {
      a.push('--model', this.opts.model);
    }
    return a;
  }

  private async run(
    argv: string[],
    stdin: string,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<{ stdout: string; stderr: string; sessionId: string }> {
    log('info', 'ClaudeRunner.run spawn', {
      binary: this.opts.claudeBinary,
      argv,
      cwd,
      stdinLen: stdin.length,
    });
    return new Promise((resolve, reject) => {
      const child = this.opts.spawn(this.opts.claudeBinary, argv, { cwd });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new ClaudeRunError('timeout', stderr));
      }, this.opts.timeoutMs);

      let abortHandler: (() => void) | null = null;
      if (signal) {
        abortHandler = () => {
          child.kill('SIGKILL');
          reject(new ClaudeRunError('aborted', stderr));
        };
        signal.addEventListener('abort', abortHandler);
      }

      child.stdout?.on('data', (d) => { stdout += d.toString(); });
      child.stderr?.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (e) => {
        clearTimeout(timer);
        if (abortHandler) signal?.removeEventListener('abort', abortHandler);
        log('error', 'ClaudeRunner spawn error', { error: e.message });
        reject(new ClaudeRunError(`spawn failed: ${e.message}`, stderr));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (abortHandler) signal?.removeEventListener('abort', abortHandler);
        log('info', 'ClaudeRunner closed', {
          code,
          stdoutLen: stdout.length,
          stderr: stderr.slice(0, 500),
        });
        if (code !== 0) {
          reject(new ClaudeRunError(`exit ${code}`, stderr));
          return;
        }
        try {
          const parsed = this.parseClaudeJson(stdout);
          log('info', 'ClaudeRunner parsed', {
            sessionId: parsed.session_id,
            hasStructuredOutput: parsed.structured_output !== undefined,
            resultPreview: parsed.result.slice(0, 200),
          });
          resolve({ stdout, stderr, sessionId: parsed.session_id });
        } catch (e) {
          log('error', 'ClaudeRunner parse failed', {
            error: (e as Error).message,
            stdoutPreview: stdout.slice(0, 500),
          });
          reject(e);
        }
      });

      if (child.stdin) {
        child.stdin.write(stdin);
        child.stdin.end();
      }
    });
  }

  private parseClaudeJson(
    stdout: string,
  ): { result: string; session_id: string; structured_output?: unknown } {
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
