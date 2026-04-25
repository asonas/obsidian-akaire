import { describe, it, expect } from 'vitest';
import { PromptResolver, FsApi } from '../src/core/PromptResolver';

function makeFs(files: Record<string, string>): FsApi {
  return {
    readFile: async (p) => files[p] ?? null,
    pathJoin: (...parts) => parts.join('/').replace(/\/+/g, '/'),
    relative: (from, to) => to.replace(from + '/', ''),
  };
}

describe('PromptResolver', () => {
  it('returns frontmatter editor_prompt when present', async () => {
    const fs = makeFs({
      '/vault/note.md':
        '---\neditor_prompt: "be terse"\n---\nbody',
    });
    const resolver = new PromptResolver({ vaultRoot: '/vault', fs });

    const result = await resolver.resolvePrompt('/vault/note.md');

    expect(result.systemPrompt).toContain('be terse');
    expect(result.sources).toEqual(['/vault/note.md']);
  });
});
