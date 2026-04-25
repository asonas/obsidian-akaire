import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { log } from './logger';

const cache = new Map<string, string>();

/**
 * Resolve an absolute binary path by checking well-known install locations.
 *
 * macOS GUI apps (including Obsidian launched from Finder) inherit only
 * `/usr/bin:/bin:/usr/sbin:/sbin`. Shell-based resolution (`/bin/zsh -lc ...`)
 * is unreliable because login shells source `.zprofile`/`.profile`, but most
 * users put mise / asdf / homebrew setup in `.zshrc` (interactive shell only).
 *
 * Direct path probing is the most robust option here.
 */
const KNOWN_DIRS = [
  `${homedir()}/.local/bin`,                   // 例: ~/.local/bin/claude
  `${homedir()}/.local/share/mise/shims`,      // mise が管理するすべてのバイナリ
  '/opt/homebrew/bin',                         // homebrew (Apple Silicon)
  '/usr/local/bin',                            // homebrew (Intel) / 汎用
];

export function resolveBinary(name: string): string {
  if (cache.has(name)) return cache.get(name)!;

  for (const dir of KNOWN_DIRS) {
    const candidate = `${dir}/${name}`;
    if (existsSync(candidate)) {
      log('info', 'resolveBinary found', { name, path: candidate });
      cache.set(name, candidate);
      return candidate;
    }
  }

  log('warn', 'resolveBinary fallback to bare name', {
    name,
    triedDirs: KNOWN_DIRS,
  });
  cache.set(name, name);
  return name;
}
