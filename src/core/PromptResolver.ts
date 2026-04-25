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
    const content = await this.opts.fs.readFile(filePath);
    if (!content) return { systemPrompt: '', sources: [] };

    const fm = this.extractFrontmatter(content);
    const editorPrompt = fm?.editor_prompt as string | undefined;
    if (!editorPrompt) return { systemPrompt: '', sources: [] };

    return {
      systemPrompt: editorPrompt,
      sources: [filePath],
    };
  }

  private extractFrontmatter(content: string): Record<string, unknown> | null {
    const match = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) return null;
    try {
      return parseYaml(match[1]);
    } catch {
      return null;
    }
  }
}
