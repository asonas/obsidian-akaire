import { App, FileSystemAdapter, normalizePath } from 'obsidian';
import type { FsApi } from '../core/PromptResolver';
import type { AnchorFsApi } from '../core/AnchorStore';
import { log } from './logger';

/**
 * Obsidian の `vault.adapter.read` は **vault 相対パス**しか受け付けない
 * （絶対パスを渡すと no such file エラーになる）。
 * PromptResolver / AnchorStore は絶対パスでファイルを指定するので、
 * vaultRoot のプレフィックスを剥がしてから adapter に渡す。
 */
function toVaultRelative(p: string, vaultRoot: string): string {
  const np = normalizePath(p);
  if (np.startsWith(vaultRoot + '/')) return np.slice(vaultRoot.length + 1);
  if (np === vaultRoot) return '';
  return np; // 既に相対 or vault外（後者はadapter.readで失敗してnullになる）
}

function getVaultRoot(app: App): string {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    throw new Error('Akaire requires a FileSystemAdapter (desktop only).');
  }
  return adapter.getBasePath();
}

const joinPath = (...parts: string[]) =>
  normalizePath(parts.join('/').replace(/\/+/g, '/'));

export function makeFsApi(app: App): FsApi {
  const vaultRoot = getVaultRoot(app);
  return {
    readFile: async (p) => {
      const rel = toVaultRelative(p, vaultRoot);
      try {
        const content = await app.vault.adapter.read(rel);
        return content;
      } catch (e) {
        log('debug', 'makeFsApi.readFile miss', { path: p, rel, error: (e as Error).message });
        return null;
      }
    },
    pathJoin: joinPath,
    relative: (from, to) => to.replace(from + '/', ''),
  };
}

export function makeAnchorFsApi(app: App): AnchorFsApi {
  const vaultRoot = getVaultRoot(app);
  return {
    readFile: async (p) => {
      const rel = toVaultRelative(p, vaultRoot);
      try { return await app.vault.adapter.read(rel); }
      catch { return null; }
    },
    writeFile: async (p, c) => {
      const rel = toVaultRelative(p, vaultRoot);
      return app.vault.adapter.write(rel, c);
    },
    mkdirp: async (p) => {
      const rel = toVaultRelative(p, vaultRoot);
      const exists = await app.vault.adapter.exists(rel);
      if (!exists) await app.vault.adapter.mkdir(rel);
    },
    pathJoin: joinPath,
    dirname: (p) => p.substring(0, p.lastIndexOf('/')),
  };
}
