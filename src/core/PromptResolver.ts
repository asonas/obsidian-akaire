import { parse as parseYaml } from 'yaml';

export interface FsApi {
  readFile(path: string): Promise<string | null>;
  pathJoin(...parts: string[]): string;
  relative(from: string, to: string): string;
}

export interface ResolvePromptResult {
  systemPrompt: string;
  sources: string[];
}

export class PromptResolver {
  constructor(
    private opts: { vaultRoot: string; fs: FsApi }
  ) {}

  async resolvePrompt(filePath: string): Promise<ResolvePromptResult> {
    const noteContent = await this.opts.fs.readFile(filePath);
    const fm = noteContent ? this.extractFrontmatter(noteContent) : null;
    const inherit = fm?.editor_prompt_inherit !== false;

    const fragments: string[] = [];
    const sources: string[] = [];

    if (inherit) {
      const dirChain = this.collectAncestorDirs(filePath);
      for (const dir of dirChain) {
        const editorMdPath = this.opts.fs.pathJoin(dir, '.editor.md');
        const content = await this.opts.fs.readFile(editorMdPath);
        if (content) {
          fragments.push(`## from ${this.opts.fs.relative(this.opts.vaultRoot, editorMdPath)}\n\n${content.trim()}`);
          sources.push(editorMdPath);
        }
      }
    }

    const editorPrompt = fm?.editor_prompt as string | undefined;
    if (editorPrompt) {
      fragments.push(`## from ${this.opts.fs.relative(this.opts.vaultRoot, filePath)}\n\n${editorPrompt.trim()}`);
      sources.push(filePath);
    }

    return {
      systemPrompt: fragments.join('\n\n'),
      sources,
    };
  }

  private collectAncestorDirs(filePath: string): string[] {
    const rel = this.opts.fs.relative(this.opts.vaultRoot, filePath);
    const segments = rel.split('/').slice(0, -1);
    const dirs: string[] = [this.opts.vaultRoot];
    let acc = this.opts.vaultRoot;
    for (const seg of segments) {
      acc = this.opts.fs.pathJoin(acc, seg);
      dirs.push(acc);
    }
    return dirs;
  }

  private extractFrontmatter(content: string): Record<string, unknown> | null {
    const match = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) return null;
    try {
      const parsed = parseYaml(match[1]) as unknown;
      if (parsed === null || typeof parsed !== 'object') return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
