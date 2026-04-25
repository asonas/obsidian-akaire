import { describe, it, expect } from 'vitest';
import { ClaudeRunner } from '../src/core/ClaudeRunner';
import { spawn as nodeSpawn } from 'node:child_process';
import path from 'node:path';

const FAKE_OK = path.resolve(__dirname, 'fixtures/fake-claude.sh');
const FAKE_ERR = path.resolve(__dirname, 'fixtures/fake-claude-error.sh');

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
