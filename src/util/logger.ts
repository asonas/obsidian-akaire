/**
 * Plugin diagnostic logger. Writes to the DevTools console only.
 *
 * By default only warnings and errors are emitted, in line with the Obsidian
 * plugin guidelines (the developer console should not show debug noise out of
 * the box). To follow plugin internals during development, open DevTools
 * (Cmd+Opt+I on macOS, Ctrl+Shift+I on Windows/Linux) and run:
 *
 *   window.akaireDebug = true
 *
 * Filter the console by `[akaire]` to follow plugin diagnostics.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function debugEnabled(): boolean {
  return Boolean((globalThis as { akaireDebug?: unknown }).akaireDebug);
}

export function log(level: LogLevel, message: string, data?: unknown): void {
  if ((level === 'info' || level === 'debug') && !debugEnabled()) return;
  const consoleFn =
    level === 'error' ? console.error : level === 'warn' ? console.warn : console.debug;
  if (data === undefined) {
    consoleFn(`[akaire] ${message}`);
  } else {
    consoleFn(`[akaire] ${message}`, data);
  }
}
