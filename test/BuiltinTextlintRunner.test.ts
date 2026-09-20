import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BuiltinTextlintRunner } from '../src/core/BuiltinTextlintRunner';

describe('BuiltinTextlintRunner', () => {
  it('lints a Markdown file without an external textlint binary', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'akaire-builtin-textlint-'));
    const file = path.join(dir, 'note.md');
    writeFileSync(file, 'これはﾊﾝｶｸカナです。');

    const result = await new BuiltinTextlintRunner().lint(file);

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.messages.some((message) => message.ruleId === 'no-hankaku-kana')).toBe(true);
    }
  });
});
