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

- Obsidian 1.7.2 or newer. Desktop only, because the plugin shells out to a CLI.
- [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) installed and reachable as `claude` on your PATH.
- Optional: [textlint](https://textlint.github.io/) if you want grammar and style checks in the same sidebar. Akaire ships a default `.textlintrc.json` that enables `textlint-rule-preset-ja-technical-writing`, so you also need that preset installed where your `textlint` binary can resolve it (e.g. `npm i -g textlint textlint-rule-preset-ja-technical-writing`). If your vault already has its own `.textlintrc` upward from the note, that one is used instead.

## Installation

The plugin is not yet listed in the Obsidian community plugin browser. For now you can install it manually:

1. Build the plugin (see [Development](#development)) or grab `manifest.json`, `main.js`, `styles.css`, and `.textlintrc.json` from a release.
2. Copy those four files into `<your-vault>/.obsidian/plugins/akaire/`.
3. Enable Akaire in Settings, Community plugins.

## Usage

Open a note and run one of these from the command palette (the commands are listed under "Akaire" in the palette):

- `Review whole note` reviews the entire note.
- `Review changed paragraphs` reviews only the paragraphs that changed since the last review.
- `Open sidebar` shows the comment sidebar.

You can give Claude per-note instructions in the frontmatter:

```yaml
---
editor_prompt: "Blog tone, です・ます調, annotate jargon"
---
```

If you drop a `.editor.md` file inside a directory, its contents are appended to the prompt for every note under that directory. Set `editor_prompt_inherit: false` in a note's frontmatter to opt out of that inheritance.

## Per-note state

Comment anchors are stored under `.editor-state/` at the root of your vault. Add it to your vault's `.gitignore` if you sync the vault with git.

## Network use

Akaire itself does not make any network requests. The plugin spawns the `claude` CLI as a subprocess, and Claude Code in turn talks to Anthropic's servers (`api.anthropic.com`) to produce the review. The text of the note you are reviewing is sent to Anthropic as part of that request. The optional `textlint` integration runs entirely locally and does not use the network.

Authentication is handled by Claude Code, not by Akaire. You log in once with `claude` (or configure an Anthropic API key) and Akaire piggy-backs on that session. Akaire never reads, stores, or transmits your credentials, and it does not include any telemetry or auto-update mechanism.

## Local system access

The Obsidian community directory flags two capabilities that Akaire uses by design. Both are required for the plugin to function, and what they are used for is described below.

- **Shell execution (`child_process`)**: Akaire spawns the `claude` CLI (and, when configured, the `textlint` CLI) as child processes to perform reviews. No other shell commands are executed. Command-line arguments are constructed from configuration values and the path of the file being reviewed; the note body is passed through stdin rather than through the shell.
- **Direct filesystem access (`fs`)**: Akaire reads and writes a small set of files using the Node.js `fs` module rather than the Obsidian `Vault` API. Specifically, it writes per-note anchor state under `.editor-state/` at the vault root, reads `.editor.md` files for prompt inheritance, and resolves a project-local `.textlintrc(.json)` walked up from the note's directory. All of these paths sit inside the vault tree. Direct filesystem access is used because the `Vault` API does not cover dotfiles outside of `data.json`, and because the `claude` and `textlint` CLIs themselves need real filesystem paths to operate on. Akaire does not read or modify any file outside the vault tree.

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
