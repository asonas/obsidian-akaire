/**
 * Plugin debug logger. Writes to the DevTools console only.
 *
 * Open DevTools in Obsidian (Cmd+Opt+I on macOS, Ctrl+Shift+I on Windows/Linux)
 * and filter by `[akaire]` to follow plugin diagnostics.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export function log(level: LogLevel, message: string, data?: unknown): void {
  const consoleFn =
    level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (data === undefined) {
    consoleFn(`[akaire] ${message}`);
  } else {
    consoleFn(`[akaire] ${message}`, data);
  }
}
