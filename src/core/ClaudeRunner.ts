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

export interface KeepAsIsItem {
  quote: string;
  message: string;
  suggestion?: string;
}

export interface ReviewArgs {
  text: string;
  systemPrompt: string;
  textlintFindings?: unknown[];
  keepAsIs?: KeepAsIsItem[];
  sessionId: string | null;
  vaultDir: string;
  signal?: AbortSignal;
}

export interface ReviewResult {
  comments: ReviewComment[];
  newSessionId: string;
  // デバッグ用に Claude の生 stdout（JSON）と、structured_output が
  // あればそれを返す。永続化して動作不審の原因調査に使う。
  rawStdout?: string;
  structuredOutput?: unknown;
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

// Claude Code の代表的な組み込みツール一式。校正タスクではどれも不要なので
// すべて無効化する。Claude Code のバージョンで未知のツールが追加されても
// 既知の一覧で網羅できる範囲をカバーすればよい（未知のものはそもそも使わ
// れる頻度が低いはず）。
const DISALLOWED_TOOLS = [
  'Bash', 'BashOutput', 'KillShell',
  'Read', 'Write', 'Edit', 'MultiEdit',
  'Glob', 'Grep',
  'NotebookEdit',
  'WebFetch', 'WebSearch',
  'Task', 'Agent',
  'SlashCommand', 'Skill',
  'AskUserQuestion', 'ExitPlanMode',
  'TodoWrite',
  'ListMcpResourcesTool', 'ReadMcpResourceTool',
].join(',');

export const REVIEW_SCHEMA = {
  type: 'object',
  required: ['comments'],
  properties: {
    comments: {
      type: 'array',
      items: {
        type: 'object',
        // contextBefore / contextAfter を必須化。anchor を確定させるために
        // 必要な周辺テキスト（10〜30 文字）を必ず付けてもらう。
        required: ['id', 'quote', 'contextBefore', 'contextAfter', 'severity', 'message'],
        properties: {
          id: { type: 'string', minLength: 1 },
          quote: { type: 'string', minLength: 1 },
          // 周辺文字列を空にされると anchor を一意に決められないので最低 1 文字を要求。
          contextBefore: { type: 'string', minLength: 1 },
          contextAfter: { type: 'string', minLength: 1 },
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
  const kept = args.keepAsIs && args.keepAsIs.length
    ? `\n\n<kept_as_is>\n${JSON.stringify(args.keepAsIs)}\n</kept_as_is>\nNote: ユーザは過去のレビューで上記の箇所を「このままにする」と明示的に判断しました。同じ箇所・同じ趣旨での再指摘は避けてください。`
    : '';
  return [
    '次の文章をレビューし、以下のJSON schemaに**厳密に**従ったJSONオブジェクトのみを返してください。',
    '前置きや説明文、コードフェンス（```）は不要です。**JSON以外の文字は一切出力しないでください**。',
    '出力は `{` で始まり `}` で終わる単一のJSONオブジェクトです。それ以外（思考過程、補足、見出しなど）は禁止です。',
    '',
    '各コメントの quote / contextBefore / contextAfter は、エディタ側で該当箇所を**一意に特定**するための情報です:',
    '- quote: 指摘対象の文字列を本文から**そのまま逐語的に**抜き出す（句読点や記号も改変しない）。',
    '- contextBefore: 本文中で quote の直前に現れる10〜30文字を、原文のまま抜き出す（空文字は不可）。',
    '- contextAfter:  本文中で quote の直後に現れる10〜30文字を、原文のまま抜き出す（空文字は不可）。',
    '同じ文字列が複数回現れる場合は、context によって候補を一意に絞れるように選んでください。',
    'id は各コメントで一意な短い文字列にしてください（例: c1, c2, c3, ...）。',
    '',
    '<schema>',
    JSON.stringify(REVIEW_SCHEMA),
    '</schema>',
    '',
    '<text>',
    args.text,
    '</text>',
  ].join('\n') + findings + kept;
}

export class ClaudeRunner {
  constructor(private opts: ClaudeRunnerOpts) {}

  async review(args: ReviewArgs): Promise<ReviewResult> {
    const userPrompt = buildReviewUserPrompt(args);
    const argv = this.buildArgs(args);
    const { stdout, sessionId } = await this.run(argv, userPrompt, args.vaultDir, args.signal);

    const outerMaybe = this.parseClaudeJson(stdout);
    let inner: { comments?: unknown };
    if (outerMaybe.structured_output && typeof outerMaybe.structured_output === 'object') {
      inner = outerMaybe.structured_output;
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
      rawStdout: stdout,
      structuredOutput: outerMaybe.structured_output,
    };
  }

  async chat(args: ChatArgs): Promise<{ reply: string }> {
    const argv = this.buildChatArgs(args);
    const { stdout } = await this.run(argv, args.message, args.vaultDir, args.signal);
    const parsed = this.parseClaudeJson(stdout);
    return { reply: parsed.result };
  }

  private buildArgs(args: ReviewArgs): string[] {
    // レビューには本文を stdin で渡しているので Claude にファイルシステムを
    // 見せる必要がない。--add-dir を外すことでツール使用ループを回避し、
    // 起動オーバーヘッドと推論時間を抑える。
    //
    // --json-schema は使わない。スキーマ強制は Claude 側で構造化出力の
    // 検証ループが回り、推論時間が大きく伸びる傾向がある。プロンプトで
    // schema を提示しつつ、JSON 抽出は extractJsonObject で寛容にパース
    // するフォールバック側に責任を寄せる。
    //
    // --disallowed-tools で全ツールを無効化する。校正タスクには本文以外
    // 不要なため、Claude 側でツール使用を検討する余地を消して TTFB を縮
    // めることが目的。
    const a: string[] = [
      '-p',
      '--output-format', 'json',
      '--disallowed-tools', DISALLOWED_TOOLS,
      '--append-system-prompt', args.systemPrompt,
    ];
    if (this.opts.model) {
      a.push('--model', this.opts.model);
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
    const t0 = Date.now();
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
      let firstStdoutAt: number | null = null;
      const timer = setTimeout(() => {
        const elapsedMs = Date.now() - t0;
        log('error', 'ClaudeRunner timeout', {
          elapsedMs,
          firstStdoutMs: firstStdoutAt ? firstStdoutAt - t0 : null,
          stdoutLen: stdout.length,
          stderr: stderr.slice(0, 500),
        });
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

      child.stdout?.on('data', (d: Buffer) => {
        if (firstStdoutAt === null) {
          firstStdoutAt = Date.now();
          log('info', 'ClaudeRunner first stdout', {
            ttfbMs: firstStdoutAt - t0,
          });
        }
        stdout += d.toString();
      });
      child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('error', (e) => {
        clearTimeout(timer);
        if (abortHandler) signal?.removeEventListener('abort', abortHandler);
        log('error', 'ClaudeRunner spawn error', {
          error: e.message,
          elapsedMs: Date.now() - t0,
        });
        reject(new ClaudeRunError(`spawn failed: ${e.message}`, stderr));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (abortHandler) signal?.removeEventListener('abort', abortHandler);
        const totalMs = Date.now() - t0;
        log('info', 'ClaudeRunner closed', {
          code,
          totalMs,
          ttfbMs: firstStdoutAt ? firstStdoutAt - t0 : null,
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
            totalMs,
            hasStructuredOutput: parsed.structured_output !== undefined,
            resultPreview: parsed.result.slice(0, 200),
          });
          resolve({ stdout, stderr, sessionId: parsed.session_id });
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          log('error', 'ClaudeRunner parse failed', {
            error: err.message,
            totalMs,
            stdoutPreview: stdout.slice(0, 500),
          });
          reject(err);
        }
      });

      if (child.stdin) {
        // EPIPE can fire asynchronously if claude exits before consuming stdin
        // (a short-circuit error, or a stub in tests). Swallow it; the exit
        // path is handled by the close handler above.
        child.stdin.on('error', () => {});
        child.stdin.write(stdin);
        child.stdin.end();
      }
    });
  }

  private parseClaudeJson(
    stdout: string,
  ): { result: string; session_id: string; structured_output?: unknown } {
    try {
      const obj = JSON.parse(stdout) as Partial<{
        result: unknown;
        session_id: unknown;
        structured_output: unknown;
      }>;
      if (typeof obj.result !== 'string' || typeof obj.session_id !== 'string') {
        throw new Error('missing fields');
      }
      return {
        result: obj.result,
        session_id: obj.session_id,
        structured_output: obj.structured_output,
      };
    } catch (e) {
      throw new ClaudeRunError(`Invalid claude JSON: ${(e as Error).message}`, stdout);
    }
  }
}
