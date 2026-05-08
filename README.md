# Akaire (赤入れ)

An Obsidian plugin that runs your notes through Claude Code and shows the feedback inline. The name comes from 赤入れ, the red-pen marks Japanese editors leave on a manuscript.

I wanted a writing reviewer that lives inside Obsidian instead of a separate tab or chat window. Open a note, run a command, read comments next to the paragraphs they apply to.

## What it does

- Sends a note (or just the paragraphs you have changed since the last review) to Claude Code.
- Renders comments in a sidebar, anchored to the paragraph each one is about.
- Runs textlint in parallel when it is installed and lists the lint results alongside the AI comments.
- Stores review sessions in the note's frontmatter so reopening the file keeps the comments visible.

## Supported AI models

Claude only, via the Claude Code CLI. The actual model is whatever Claude Code is configured to use (set with `claude --model ...` or through Claude Code's own config). Other providers are not planned right now because the plugin reads Claude Code's streaming JSON output format directly.

## Requirements

- Obsidian 1.5 or newer. Desktop only, because the plugin shells out to a CLI.
- [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) installed and reachable as `claude` on your PATH.
- Optional: [textlint](https://textlint.github.io/) if you want grammar and style checks in the same sidebar.

## Installation

The plugin is not yet listed in the Obsidian community plugin browser. For now you can install it manually:

1. Build the plugin (see [Development](#development)) or grab `manifest.json`, `main.js`, and `styles.css` from a release.
2. Copy those three files into `<your-vault>/.obsidian/plugins/obsidian-akaire/`.
3. Enable Akaire in Settings, Community plugins.

## Usage

Open a note and run one of these from the command palette:

- `Akaire: Review whole note` reviews the entire note.
- `Akaire: Review changed paragraphs` reviews only the paragraphs that changed since the last review.
- `Akaire: Open sidebar` shows the comment sidebar.

You can give Claude per-note instructions in the frontmatter:

```yaml
---
editor_prompt: "Blog tone, です・ます調, annotate jargon"
---
```

If you drop a `.editor.md` file inside a directory, its contents are appended to the prompt for every note under that directory. Set `editor_prompt_inherit: false` in a note's frontmatter to opt out of that inheritance.

## Per-note state

Comment anchors are stored under `.editor-state/` next to your vault. Add it to your vault's `.gitignore` if you sync the vault with git.

## Development

```bash
npm install
npm run dev      # esbuild in watch mode
npm test         # vitest
npm run build    # production build into dist/
```

The source layout:

- `src/core/`: prompt resolution, the Claude and textlint runners, anchor storage, the review session.
- `src/editor/`: CodeMirror anchor matching and decoration.
- `src/ui/`: sidebar view and comment cards.
- `src/util/`: paragraph hashing, vault filesystem helpers, JSON extraction.

The fixtures under `test/fixtures/` simulate the Claude Code CLI so the runner can be tested without calling the real binary.

## License

MIT. See [LICENSE](LICENSE).
