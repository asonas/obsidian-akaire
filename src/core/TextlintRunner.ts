import type { ChildProcess } from 'node:child_process';
import type { TextlintResult, TextlintMessage } from '../types';
import { log } from '../util/logger';

export type SpawnFn = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string }
) => ChildProcess;

export class TextlintRunner {
  constructor(private opts: { binary: string; preArgs?: string[]; spawn: SpawnFn }) {}

  async lint(filePath: string): Promise<TextlintResult> {
    const args = [...(this.opts.preArgs ?? []), '-f', 'json', filePath];
    log('info', 'TextlintRunner.lint spawn', { binary: this.opts.binary, args });
    return new Promise((resolve) => {
      const child = this.opts.spawn(this.opts.binary, args);
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
