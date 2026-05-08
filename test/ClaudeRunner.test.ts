import { describe, it, expect } from 'vitest';
import { ClaudeRunner, buildReviewUserPrompt, REVIEW_SCHEMA } from '../src/core/ClaudeRunner';
import { spawn as nodeSpawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const FAKE_OK = path.resolve(__dirname, 'fixtures/fake-claude.sh');
const FAKE_ERR = path.resolve(__dirname, 'fixtures/fake-claude-error.sh');
const FAKE_CHAT = path.resolve(__dirname, 'fixtures/fake-claude-chat.sh');
const FAKE_SLOW = path.resolve(__dirname, 'fixtures/fake-claude-slow.sh');
const FAKE_PROSE = path.resolve(__dirname, 'fixtures/fake-claude-prose.sh');
const FAKE_STRUCTURED = path.resolve(__dirname, 'fixtures/fake-claude-structured.sh');
const FAKE_RECORD_ARGS = path.resolve(__dirname, 'fixtures/fake-claude-record-args.sh');

describe('ClaudeRunner.review', () => {
  it('parses comments and returns session id', async () => {
    const runner = new ClaudeRunner({
      claudeBinary: FAKE_OK,
      spawn: nodeSpawn,
      timeoutMs: 5000,
    });

    const result = await runner.review({
      text: 'これは冗長な表現です',
      systemPrompt: 'be terse',
      sessionId: null,
      vaultDir: '/tmp',
    });

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].quote).toBe('冗長な表現');
    expect(result.newSessionId).toBe('fake-session-123');
  });

  it('uses structured_output when claude returns it (--json-schema path)', async () => {
    const runner = new ClaudeRunner({
      claudeBinary: FAKE_STRUCTURED,
      spawn: nodeSpawn,
      timeoutMs: 5000,
    });

    const result = await runner.review({
      text: 'x',
      systemPrompt: 'y',
      sessionId: null,
      vaultDir: '/tmp',
    });

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].quote).toBe('冗長');
    expect(result.newSessionId).toBe('fake-session-structured');
  });

  it('extracts JSON when result is wrapped in natural-language prose', async () => {
    const runner = new ClaudeRunner({
      claudeBinary: FAKE_PROSE,
      spawn: nodeSpawn,
      timeoutMs: 5000,
    });

    const result = await runner.review({
      text: 'x',
      systemPrompt: 'y',
      sessionId: null,
      vaultDir: '/tmp',
    });

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].quote).toBe('冗長');
    expect(result.newSessionId).toBe('fake-session-prose');
  });

  it('throws ClaudeRunError on non-zero exit', async () => {
    const runner = new ClaudeRunner({
      claudeBinary: FAKE_ERR,
      spawn: nodeSpawn,
      timeoutMs: 5000,
    });

    await expect(
      runner.review({
        text: 'x',
        systemPrompt: 'y',
        sessionId: null,
        vaultDir: '/tmp',
      })
    ).rejects.toThrow(/exit 1/);
  });
});

describe('buildReviewUserPrompt', () => {
  it('embeds the JSON schema text so the model can see it', () => {
    const prompt = buildReviewUserPrompt({
      text: 'これは冗長です',
      systemPrompt: '',
      sessionId: null,
      vaultDir: '/tmp',
    });

    expect(prompt).toContain(JSON.stringify(REVIEW_SCHEMA));
    expect(prompt).toContain('これは冗長です');
  });

  it('explicitly tells the model to return JSON only', () => {
    const prompt = buildReviewUserPrompt({
      text: 'x',
      systemPrompt: '',
      sessionId: null,
      vaultDir: '/tmp',
    });
    expect(prompt).toMatch(/JSON.*のみ|only.*JSON/i);
  });

  it('includes kept-as-is items when provided', () => {
    const prompt = buildReviewUserPrompt({
      text: 'これは冗長な表現です',
      systemPrompt: '',
      sessionId: null,
      vaultDir: '/tmp',
      keepAsIs: [
        { quote: '冗長な表現', message: '簡潔に' },
      ],
    });
    expect(prompt).toContain('<kept_as_is>');
    expect(prompt).toContain('冗長な表現');
    expect(prompt).toContain('簡潔に');
  });

  it('does not include kept_as_is block when list is empty', () => {
    const prompt = buildReviewUserPrompt({
      text: 'x',
      systemPrompt: '',
      sessionId: null,
      vaultDir: '/tmp',
      keepAsIs: [],
    });
    expect(prompt).not.toContain('<kept_as_is>');
  });
});

describe('ClaudeRunner.chat', () => {
  it('returns reply text', async () => {
    const runner = new ClaudeRunner({
      claudeBinary: FAKE_CHAT,
      spawn: nodeSpawn,
      timeoutMs: 5000,
    });
    const r = await runner.chat({
      message: 'もっと固く',
      sessionId: 'fake-session-123',
      vaultDir: '/tmp',
    });
    expect(r.reply).toContain('固い表現');
  });
});

describe('ClaudeRunner model option', () => {
  it('passes --model when provided', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'akaire-args-'));
    const argLog = path.join(dir, 'args.log');
    const recordingSpawn: typeof nodeSpawn = (cmd, args, opts) =>
      nodeSpawn(cmd, args as string[], { ...opts, env: { ...process.env, AKAIRE_FAKE_ARG_LOG: argLog } } as any);

    const runner = new ClaudeRunner({
      claudeBinary: FAKE_RECORD_ARGS,
      spawn: recordingSpawn,
      timeoutMs: 5000,
      model: 'sonnet',
    });

    await runner.review({
      text: 'x',
      systemPrompt: 'y',
      sessionId: null,
      vaultDir: '/tmp',
    });

    const args = readFileSync(argLog, 'utf8').split('\n');
    const idx = args.indexOf('--model');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('sonnet');
  });

  it('omits --model when not provided', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'akaire-args-'));
    const argLog = path.join(dir, 'args.log');
    const recordingSpawn: typeof nodeSpawn = (cmd, args, opts) =>
      nodeSpawn(cmd, args as string[], { ...opts, env: { ...process.env, AKAIRE_FAKE_ARG_LOG: argLog } } as any);

    const runner = new ClaudeRunner({
      claudeBinary: FAKE_RECORD_ARGS,
      spawn: recordingSpawn,
      timeoutMs: 5000,
    });

    await runner.review({
      text: 'x',
      systemPrompt: 'y',
      sessionId: null,
      vaultDir: '/tmp',
    });

    const args = readFileSync(argLog, 'utf8').split('\n');
    expect(args).not.toContain('--model');
  });
});

describe('ClaudeRunner review args (tool use disabled)', () => {
  it('disables all tools via --disallowed-tools to skip Claude Code tool deliberation', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'akaire-args-'));
    const argLog = path.join(dir, 'args.log');
    const recordingSpawn: typeof nodeSpawn = (cmd, args, opts) =>
      nodeSpawn(cmd, args as string[], { ...opts, env: { ...process.env, AKAIRE_FAKE_ARG_LOG: argLog } } as any);

    const runner = new ClaudeRunner({
      claudeBinary: FAKE_RECORD_ARGS,
      spawn: recordingSpawn,
      timeoutMs: 5000,
    });

    await runner.review({
      text: 'x',
      systemPrompt: 'y',
      sessionId: null,
      vaultDir: '/tmp',
    });

    const args = readFileSync(argLog, 'utf8').split('\n');
    expect(args).toContain('--disallowed-tools');
  });
});

describe('ClaudeRunner review args (schema not enforced via flag)', () => {
  it('does NOT pass --json-schema to claude (we rely on prompt + parser fallback)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'akaire-args-'));
    const argLog = path.join(dir, 'args.log');
    const recordingSpawn: typeof nodeSpawn = (cmd, args, opts) =>
      nodeSpawn(cmd, args as string[], { ...opts, env: { ...process.env, AKAIRE_FAKE_ARG_LOG: argLog } } as any);

    const runner = new ClaudeRunner({
      claudeBinary: FAKE_RECORD_ARGS,
      spawn: recordingSpawn,
      timeoutMs: 5000,
    });

    await runner.review({
      text: 'x',
      systemPrompt: 'y',
      sessionId: null,
      vaultDir: '/tmp',
    });

    const args = readFileSync(argLog, 'utf8').split('\n');
    expect(args).not.toContain('--json-schema');
  });
});

describe('ClaudeRunner.review timeout', () => {
  it('rejects after timeoutMs', async () => {
    const runner = new ClaudeRunner({
      claudeBinary: FAKE_SLOW,
      spawn: nodeSpawn,
      timeoutMs: 200,
    });
    await expect(
      runner.review({
        text: 'x',
        systemPrompt: 'y',
        sessionId: null,
        vaultDir: '/tmp',
      })
    ).rejects.toThrow(/timeout/);
  });
});
