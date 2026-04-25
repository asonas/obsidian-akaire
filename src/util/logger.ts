import { mkdirSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Plugin debug logger. Writes to a fixed file inside the repo
 * checkout so logs survive Obsidian restarts and can be tailed
 * from the terminal during development.
 *
 * The log path is intentionally hardcoded to the dev repo. Override via
 * `AKAIRE_LOG_FILE` env var if running from a different checkout.
 */
const DEFAULT_LOG_FILE =
  '/Users/asonas/ghq/github.com/asonas/obsidian-akaire/log/akaire.log';

const LOG_FILE = process.env.AKAIRE_LOG_FILE ?? DEFAULT_LOG_FILE;

let initialized = false;
function init(): void {
  if (initialized) return;
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
    initialized = true;
  } catch {
    // 書き出せなくても落とさない
  }
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export function log(level: LogLevel, message: string, data?: unknown): void {
  init();
  const ts = new Date().toISOString();
  const dataStr = data === undefined ? '' : ' ' + safeJson(data);
  const line = `${ts} [${level}] ${message}${dataStr}\n`;
  try {
    appendFileSync(LOG_FILE, line);
  } catch {
    // 書き出せなくても落とさない
  }
  // 開発中はDevToolsでも見えるようにする
  const consoleFn =
    level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  consoleFn(`[akaire] ${message}`, data ?? '');
}

function safeJson(data: unknown): string {
  try {
    return JSON.stringify(data, (_k, v) => {
      if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
      return v;
    });
  } catch {
    return String(data);
  }
}

export function logPath(): string {
  return LOG_FILE;
}
