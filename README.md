# Akaire (赤入れ)

An Obsidian plugin that runs your notes through a local AI client and shows the feedback inline. The name comes from 赤入れ, the red-pen marks Japanese editors leave on a manuscript.

I wanted a writing reviewer that lives inside Obsidian instead of a separate tab or chat window. Open a note, run a command, read comments next to the paragraphs they apply to.

## What it does

- Sends a note (or just the paragraphs you have changed since the last review) to the selected LLM provider.
- Renders comments in a sidebar, anchored to the paragraph each one is about.
- Runs a bundled set of textlint rules in parallel and lists the lint results alongside the AI comments.
- Stores review sessions in the note's frontmatter so reopening the file keeps the comments visible.

## Supported LLM providers

- Claude Code CLI
- Codex CLI
- Ollama

Choose the provider and model in Obsidian's Akaire settings. Claude Code and Codex reuse their existing CLI authentication. Ollama uses its local HTTP API; its model must already be pulled.

## Requirements

- Obsidian 1.7.2 or newer. Desktop only, because the plugin shells out to a CLI.
- The CLI for the selected remote provider: [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) or [Codex](https://developers.openai.com/codex/cli/).
- For Ollama, a running local server and a pulled model.

Akaire includes its default textlint engine and rules, so textlint does not need to be installed separately. If the note has a `.textlintrc` in one of its parent directories, Akaire uses the external `textlint` CLI for that custom configuration.

## Installation

The plugin is not yet listed in the Obsidian community plugin browser. For now you can install it manually:

1. Build the plugin (see [Development](#development)) or grab `manifest.json`, `main.js`, and `styles.css` from a release.
2. Copy those three files into `<your-vault>/.obsidian/plugins/akaire/`.
3. Enable Akaire in Settings, Community plugins.

## Usage

Open a note and run one of these from the command palette (the commands are listed under "Akaire" in the palette):

- `Review whole note` reviews the entire note.
- `Review changed paragraphs` reviews only the paragraphs that changed since the last review.
- `Open sidebar` shows the comment sidebar.

You can give the selected LLM per-note instructions in the frontmatter:

```yaml
---
editor_prompt: "Blog tone, です・ます調, annotate jargon"
---
```

If you drop a `.editor.md` file inside a directory, its contents are appended to the prompt for every note under that directory. Set `editor_prompt_inherit: false` in a note's frontmatter to opt out of that inheritance.

## Per-note state

Comment anchors are stored under `.editor-state/` at the root of your vault. Add it to your vault's `.gitignore` if you sync the vault with git.

## Network use

Akaire sends the reviewed note through the selected provider. Claude Code and Codex are spawned as subprocesses and communicate with their configured remote services. Ollama requests are sent to the configured base URL, which defaults to `http://localhost:11434`. The bundled textlint integration runs entirely locally.

Authentication is handled by the selected CLI, not by Akaire. Akaire never reads or stores provider credentials, and it does not include telemetry or an auto-update mechanism.

## Local system access

The Obsidian community directory flags two capabilities that Akaire uses by design. Both are required for the plugin to function, and what they are used for is described below.

- **Shell execution (`child_process`)**: Akaire spawns the selected Claude Code or Codex CLI and, for a vault-owned custom configuration, the `textlint` CLI. No shell is involved. The note body is passed through stdin rather than interpolated into a command.
- **Direct filesystem access (`fs`)**: Akaire reads and writes a small set of files using the Node.js `fs` module rather than the Obsidian `Vault` API. Specifically, it writes per-note anchor state under `.editor-state/` at the vault root, reads `.editor.md` files for prompt inheritance, and resolves a project-local `.textlintrc(.json)` walked up from the note's directory. All of these paths sit inside the vault tree. Direct filesystem access is used because the `Vault` API does not cover dotfiles outside of `data.json`, and because the `claude` and `textlint` CLIs themselves need real filesystem paths to operate on. Akaire does not read or modify any file outside the vault tree.

## Development

```bash
npm install
npm run dev      # esbuild in watch mode
npm test         # vitest
npm run build    # production build into dist/
```

The source layout:

- `src/core/`: prompt resolution, provider and textlint runners, anchor storage, the review session.
- `src/editor/`: CodeMirror anchor matching and decoration.
- `src/ui/`: sidebar view and comment cards.
- `src/util/`: paragraph hashing, vault filesystem helpers, JSON extraction.

The fixtures under `test/fixtures/` simulate the Claude Code CLI so the runner can be tested without calling the real binary.

## License

MIT. See [LICENSE](LICENSE).
