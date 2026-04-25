import { describe, it, expect } from 'vitest';
import { TextlintRunner } from '../src/core/TextlintRunner';
import { spawn as nodeSpawn } from 'node:child_process';
import path from 'node:path';

const FAKE_OK = path.resolve(__dirname, 'fixtures/fake-textlint.sh');
const FAKE_MISSING = path.resolve(__dirname, 'fixtures/fake-textlint-missing.sh');

describe('TextlintRunner', () => {
  it('returns parsed messages on success', async () => {
    const runner = new TextlintRunner({
      binary: FAKE_OK,
      spawn: nodeSpawn,
    });
    const result = await runner.lint('/tmp/note.md');
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].ruleId).toBe('no-doubled-joshi');
    }
  });

  it('returns available=false when binary fails', async () => {
    const runner = new TextlintRunner({
      binary: FAKE_MISSING,
      spawn: nodeSpawn,
    });
    const result = await runner.lint('/tmp/note.md');
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toMatch(/exit 127/);
    }
  });
});
