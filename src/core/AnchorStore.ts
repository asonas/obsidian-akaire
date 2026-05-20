import type { PersistedAnchor, ChatMessage } from '../types';

export interface AnchorFsApi {
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
  mkdirp(path: string): Promise<void>;
  pathJoin(...parts: string[]): string;
  dirname(path: string): string;
}

export interface PersistedState {
  anchors: PersistedAnchor[];
  chat: ChatMessage[];
}

export class AnchorStore {
  constructor(
    private opts: { vaultRoot: string; fs: AnchorFsApi }
  ) {}

  async load(notePath: string): Promise<PersistedAnchor[]> {
    const state = await this.loadState(notePath);
    return state.anchors;
  }

  async save(notePath: string, anchors: PersistedAnchor[]): Promise<void> {
    const existing = await this.loadState(notePath);
    await this.saveState(notePath, { anchors, chat: existing.chat });
  }

  async loadState(notePath: string): Promise<PersistedState> {
    const filePath = this.pathFor(notePath);
    const content = await this.opts.fs.readFile(filePath);
    if (!content) return { anchors: [], chat: [] };
    try {
      const parsed = JSON.parse(content) as Partial<{
        anchors: unknown;
        chat: unknown;
      }>;
      return {
        anchors: Array.isArray(parsed.anchors) ? (parsed.anchors as PersistedAnchor[]) : [],
        chat: Array.isArray(parsed.chat) ? (parsed.chat as ChatMessage[]) : [],
      };
    } catch {
      return { anchors: [], chat: [] };
    }
  }

  async saveState(notePath: string, state: PersistedState): Promise<void> {
    const filePath = this.pathFor(notePath);
    await this.opts.fs.mkdirp(this.opts.fs.dirname(filePath));
    await this.opts.fs.writeFile(
      filePath,
      JSON.stringify(state, null, 2)
    );
  }

  // デバッグ用に任意のラベル付き JSON を保存する。レビュー結果の生 JSON や
  // anchor 解決の入出力を記録して、anchor がズレた等の動作不審の原因調査に使う。
  async saveDebug(notePath: string, label: string, payload: unknown): Promise<void> {
    const filePath = this.opts.fs.pathJoin(
      this.opts.vaultRoot,
      '.editor-state',
      notePath + `.${label}.json`
    );
    await this.opts.fs.mkdirp(this.opts.fs.dirname(filePath));
    await this.opts.fs.writeFile(
      filePath,
      JSON.stringify(payload, null, 2)
    );
  }

  private pathFor(notePath: string): string {
    return this.opts.fs.pathJoin(
      this.opts.vaultRoot,
      '.editor-state',
      notePath + '.json'
    );
  }
}
