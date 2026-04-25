import { execFileSync } from 'node:child_process';
import { log } from './logger';

const cache = new Map<string, string>();

/**
 * Resolve an absolute binary path via the user's login shell so that
 * mise / asdf / homebrew shims are visible. macOS GUI apps (including
 * Obsidian launched from Finder) inherit only `/usr/bin:/bin:/usr/sbin:/sbin`,
 * so a plain `spawn('textlint', ...)` produces ENOENT.
 *
 * Returns the resolved absolute path, or the original `name` if resolution
 * fails so the caller still gets a recognizable spawn error.
 */
export function resolveBinary(name: string): string {
  if (cache.has(name)) {
    const cached = cache.get(name)!;
    log('debug', 'resolveBinary cache hit', { name, cached });
    return cached;
  }

  const shells = ['/bin/zsh', '/bin/bash'];
  for (const shell of shells) {
    try {
      const out = execFileSync(shell, ['-lc', `command -v ${name}`], {
        encoding: 'utf8',
        timeout: 3000,
      });
      const resolved = out.trim();
      log('info', 'resolveBinary attempted', {
        name,
        shell,
        resolved,
        envPath: process.env.PATH,
      });
      if (resolved) {
        cache.set(name, resolved);
        return resolved;
      }
    } catch (e) {
      log('warn', 'resolveBinary shell error', {
        name,
        shell,
        error: (e as Error).message,
      });
    }
  }

  log('error', 'resolveBinary failed, using bare name', { name });
  cache.set(name, name);
  return name;
}
