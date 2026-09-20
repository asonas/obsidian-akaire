import { spawn } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexRunner } from '../src/core/CodexRunner';

const FAKE_CODEX = path.resolve(__dirname, 'fixtures/fake-codex.sh');

describe('CodexRunner', () => {
  it('parses the Codex JSONL agent message', async () => {
    const runner = new CodexRunner({
      binary: FAKE_CODEX,
      spawn,
      timeoutMs: 5_000,
    });

    const result = await runner.review({
      text: 'これは冗長です',
      systemPrompt: '簡潔にレビューする',
      sessionId: null,
      vaultDir: '/tmp',
    });

    expect(result.newSessionId).toBe('codex-session-1');
    expect(result.comments[0].quote).toBe('冗長');
  });
});
