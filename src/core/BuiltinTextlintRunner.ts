import { readFile } from 'node:fs/promises';
import { TextlintKernel } from '@textlint/kernel';
import markdownPlugin from '@textlint/textlint-plugin-markdown';
import invalidControlCharacter from '@textlint-rule/textlint-rule-no-invalid-control-character';
import unmatchedPair from '@textlint-rule/textlint-rule-no-unmatched-pair';
import mixedPeriod from 'textlint-rule-ja-no-mixed-period';
import maxComma from 'textlint-rule-max-comma';
import maxKanji from 'textlint-rule-max-kanji-continuous-len';
import noExclamationQuestionMark from 'textlint-rule-no-exclamation-question-mark';
import noHankakuKana from 'textlint-rule-no-hankaku-kana';
import noNfd from 'textlint-rule-no-nfd';
import noZeroWidthSpaces from 'textlint-rule-no-zero-width-spaces';
import sentenceLength from 'textlint-rule-sentence-length';
import type { TextlintResult } from '../types';

export class BuiltinTextlintRunner {
  private linter = new TextlintKernel();

  async lint(filePath: string): Promise<TextlintResult> {
    const text = await readFile(filePath, 'utf8');
    const result = await this.linter.lintText(text, {
      ext: '.md',
      filePath,
      plugins: [{ pluginId: '@textlint/markdown', plugin: markdownPlugin }],
      rules: [
        { ruleId: 'sentence-length', rule: sentenceLength, options: { max: 100 } },
        { ruleId: 'max-comma', rule: maxComma, options: { max: 3 } },
        { ruleId: 'max-kanji-continuous-len', rule: maxKanji, options: { max: 6 } },
        { ruleId: 'ja-no-mixed-period', rule: mixedPeriod, options: { periodMark: '。' } },
        { ruleId: 'no-exclamation-question-mark', rule: noExclamationQuestionMark },
        { ruleId: 'no-hankaku-kana', rule: noHankakuKana },
        { ruleId: 'no-nfd', rule: noNfd },
        { ruleId: 'no-invalid-control-character', rule: invalidControlCharacter },
        { ruleId: 'no-unmatched-pair', rule: unmatchedPair },
        { ruleId: 'no-zero-width-spaces', rule: noZeroWidthSpaces },
      ],
    });
    return {
      available: true,
      messages: result.messages.map((message) => ({
        line: message.loc.start.line,
        column: message.loc.start.column,
        ruleId: message.ruleId,
        message: message.message,
        severity: message.severity === 2 ? 2 : 1,
      })),
    };
  }
}
