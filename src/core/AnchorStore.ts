import type { PersistedAnchor } from '../types';

export interface AnchorFsApi {
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
  mkdirp(path: string): Promise<void>;
  pathJoin(...parts: string[]): string;
  dirname(path: string): string;
}

export class AnchorStore {
  constructor(
    private opts: { vaultRoot: string; fs: AnchorFsApi }
  ) {}

  async load(notePath: string): Promise<PersistedAnchor[]> {
    const filePath = this.pathFor(notePath);
    const content = await this.opts.fs.readFile(filePath);
    if (!content) return [];
    try {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed.anchors) ? parsed.anchors : [];
    } catch {
      return [];
    }
  }

  async save(notePath: string, anchors: PersistedAnchor[]): Promise<void> {
    const filePath = this.pathFor(notePath);
    await this.opts.fs.mkdirp(this.opts.fs.dirname(filePath));
    await this.opts.fs.writeFile(
      filePath,
      JSON.stringify({ anchors }, null, 2)
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
