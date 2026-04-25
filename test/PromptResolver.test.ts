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

  it('walks up directories collecting .editor.md, top-down concat', async () => {
    const fs = makeFs({
      '/vault/.editor.md': 'be polite',
      '/vault/blog/.editor.md': 'use blog tone',
      '/vault/blog/post.md':
        '---\neditor_prompt: "no jargon"\n---\nbody',
    });
    const resolver = new PromptResolver({ vaultRoot: '/vault', fs });

    const result = await resolver.resolvePrompt('/vault/blog/post.md');

    expect(result.systemPrompt).toContain('be polite');
    expect(result.systemPrompt).toContain('use blog tone');
    expect(result.systemPrompt).toContain('no jargon');
    const beforeBlog = result.systemPrompt.indexOf('be polite');
    const blog = result.systemPrompt.indexOf('use blog tone');
    const post = result.systemPrompt.indexOf('no jargon');
    expect(beforeBlog).toBeLessThan(blog);
    expect(blog).toBeLessThan(post);
    expect(result.sources).toEqual([
      '/vault/.editor.md',
      '/vault/blog/.editor.md',
      '/vault/blog/post.md',
    ]);
  });

  it('skips ancestor .editor.md when editor_prompt_inherit is false', async () => {
    const fs = makeFs({
      '/vault/.editor.md': 'be polite',
      '/vault/note.md':
        '---\neditor_prompt: "no jargon"\neditor_prompt_inherit: false\n---\nbody',
    });
    const resolver = new PromptResolver({ vaultRoot: '/vault', fs });

    const result = await resolver.resolvePrompt('/vault/note.md');

    expect(result.systemPrompt).not.toContain('be polite');
    expect(result.systemPrompt).toContain('no jargon');
    expect(result.sources).toEqual(['/vault/note.md']);
  });
});
