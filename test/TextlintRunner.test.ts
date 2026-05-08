import { afterEach, describe, it, expect } from 'vitest';
import { TextlintRunner } from '../src/core/TextlintRunner';
import { spawn as nodeSpawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const FAKE_OK = path.resolve(__dirname, 'fixtures/fake-textlint.sh');
const FAKE_MISSING = path.resolve(__dirname, 'fixtures/fake-textlint-missing.sh');
const FAKE_NO_RULES = path.resolve(__dirname, 'fixtures/fake-textlint-no-rules.sh');
const FAKE_RECORD_ARGS = path.resolve(__dirname, 'fixtures/fake-textlint-record-args.sh');

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

  it('treats "No rules found" stdout as available with empty messages', async () => {
    const runner = new TextlintRunner({
      binary: FAKE_NO_RULES,
      spawn: nodeSpawn,
    });
    const result = await runner.lint('/tmp/note.md');
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.messages).toHaveLength(0);
    }
  });

  describe('defaultConfigPath fallback', () => {
    let tmpRoot: string;
    let argLog: string;

    afterEach(() => {
      if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    });

    function setup() {
      tmpRoot = mkdtempSync(path.join(tmpdir(), 'akaire-textlint-'));
      argLog = path.join(tmpRoot, 'args.log');
      process.env.AKAIRE_FAKE_ARG_LOG = argLog;
      return tmpRoot;
    }

    it('passes --config to textlint when no .textlintrc found upward', async () => {
      const root = setup();
      const noteDir = path.join(root, 'notes');
      const note = path.join(noteDir, 'note.md');
      const defaultConfig = path.join(root, 'default.textlintrc.json');
      const fs = await import('node:fs');
      fs.mkdirSync(noteDir, { recursive: true });
      fs.writeFileSync(note, '# hello');
      fs.writeFileSync(defaultConfig, '{"rules":{}}');

      const runner = new TextlintRunner({
        binary: FAKE_RECORD_ARGS,
        spawn: nodeSpawn,
        defaultConfigPath: defaultConfig,
      });
      const result = await runner.lint(note);
      expect(result.available).toBe(true);
      const recorded = readFileSync(argLog, 'utf8').split('\n').filter(Boolean);
      expect(recorded).toContain('--config');
      expect(recorded).toContain(defaultConfig);
    });

    it('does NOT pass --config when an upward .textlintrc exists', async () => {
      const root = setup();
      const noteDir = path.join(root, 'notes');
      const note = path.join(noteDir, 'note.md');
      const defaultConfig = path.join(root, 'default.textlintrc.json');
      const fs = await import('node:fs');
      fs.mkdirSync(noteDir, { recursive: true });
      // user-owned .textlintrc at the root of the tmp tree
      fs.writeFileSync(path.join(root, '.textlintrc.json'), '{"rules":{}}');
      fs.writeFileSync(defaultConfig, '{"rules":{}}');
      fs.writeFileSync(note, '# hello');

      const runner = new TextlintRunner({
        binary: FAKE_RECORD_ARGS,
        spawn: nodeSpawn,
        defaultConfigPath: defaultConfig,
      });
      const result = await runner.lint(note);
      expect(result.available).toBe(true);
      const recorded = readFileSync(argLog, 'utf8').split('\n').filter(Boolean);
      expect(recorded).not.toContain('--config');
    });
  });
});
