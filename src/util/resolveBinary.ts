import { execFileSync } from 'node:child_process';

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
  if (cache.has(name)) return cache.get(name)!;
  try {
    const out = execFileSync('/bin/bash', ['-lc', `command -v ${name}`], {
      encoding: 'utf8',
      timeout: 3000,
    });
    const resolved = out.trim();
    if (resolved) {
      cache.set(name, resolved);
      return resolved;
    }
  } catch {
    // fall through
  }
  cache.set(name, name);
  return name;
}
