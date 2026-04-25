import { App } from 'obsidian';
import type { FsApi } from '../core/PromptResolver';
import type { AnchorFsApi } from '../core/AnchorStore';

export function makeFsApi(app: App): FsApi {
  return {
    readFile: async (p) => {
      try {
        return await app.vault.adapter.read(p);
      } catch {
        return null;
      }
    },
    pathJoin: (...parts) => parts.join('/').replace(/\/+/g, '/'),
    relative: (from, to) => to.replace(from + '/', ''),
  };
}

export function makeAnchorFsApi(app: App): AnchorFsApi {
  return {
    readFile: async (p) => {
      try { return await app.vault.adapter.read(p); }
      catch { return null; }
    },
    writeFile: async (p, c) => app.vault.adapter.write(p, c),
    mkdirp: async (p) => {
      const exists = await app.vault.adapter.exists(p);
      if (!exists) await app.vault.adapter.mkdir(p);
    },
    pathJoin: (...parts) => parts.join('/').replace(/\/+/g, '/'),
    dirname: (p) => p.substring(0, p.lastIndexOf('/')),
  };
}
