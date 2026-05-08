import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import type { TextlintResult, TextlintMessage } from '../types';
import { log } from '../util/logger';

export type SpawnFn = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string }
) => ChildProcess;

const TEXTLINTRC_NAMES = [
  '.textlintrc',
  '.textlintrc.json',
  '.textlintrc.js',
  '.textlintrc.yml',
  '.textlintrc.yaml',
];

function findUpwardTextlintrc(start: string): boolean {
  let dir = start;
  while (true) {
    for (const name of TEXTLINTRC_NAMES) {
      if (existsSync(join(dir, name))) return true;
    }
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

export class TextlintRunner {
  constructor(
    private opts: {
      binary: string;
      preArgs?: string[];
      spawn: SpawnFn;
      // .textlintrc がノートの祖先ディレクトリに無い場合に使う既定の設定ファイル。
      // Akaireはプラグインフォルダに同梱した.textlintrc.jsonを渡す。
      defaultConfigPath?: string;
    }
  ) {}

  async lint(filePath: string): Promise<TextlintResult> {
    // textlint は CWD から `.textlintrc` を探すので、ファイルのあるディレクトリを cwd にする
    const cwd = isAbsolute(filePath) ? dirname(filePath) : undefined;
    const useDefault =
      !!this.opts.defaultConfigPath &&
      !!cwd &&
      !findUpwardTextlintrc(cwd) &&
      existsSync(this.opts.defaultConfigPath);
    const args = [
      ...(this.opts.preArgs ?? []),
      ...(useDefault ? ['--config', this.opts.defaultConfigPath!] : []),
      '-f',
      'json',
      filePath,
    ];
    log('info', 'TextlintRunner.lint spawn', {
      binary: this.opts.binary,
      args,
      cwd,
      useDefaultConfig: useDefault,
    });
    return new Promise((resolve) => {
      const child = this.opts.spawn(this.opts.binary, args, cwd ? { cwd } : undefined);
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => { stdout += d.toString(); });
      child.stderr?.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (e) => {
        log('error', 'TextlintRunner spawn error', { binary: this.opts.binary, error: e.message });
        resolve({ available: false, reason: `spawn error: ${e.message}` });
      });
      child.on('close', (code) => {
        log('info', 'TextlintRunner closed', { code, stdoutLen: stdout.length, stderr: stderr.trim() });
        if (code !== 0 && code !== 1) {
          resolve({ available: false, reason: `exit ${code}: ${stderr.trim()}` });
          return;
        }
        // textlint は .textlintrc が見つからないとき exit 1 と共に
        // "== No rules found ==" を stdout に書き出す。バイナリ自体は動いている
        // ので "見つからない" 扱いにせず、findings 0 件として扱う。
        if (/No rules? found/i.test(stdout)) {
          log('info', 'TextlintRunner no rules configured', { cwd });
          resolve({ available: true, messages: [] });
          return;
        }
        try {
          const arr = JSON.parse(stdout);
          const messages: TextlintMessage[] = (arr[0]?.messages ?? []).map(
            (m: TextlintMessage) => m
          );
          resolve({ available: true, messages });
        } catch (e) {
          resolve({ available: false, reason: `parse failed: ${(e as Error).message}` });
        }
      });
    });
  }
}
