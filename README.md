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

Choose the provider and model in Obsidian's Akaire settings. Claude Code and Codex reuse their existing CLI authentication. For Ollama, configure its API URL and optional HTTP headers, then run the connection test to load models already pulled on that server. Custom headers can be used for Cloudflare Access service-token authentication.

## Requirements

- Obsidian 1.13.0 or newer. Desktop only, because the plugin shells out to a CLI.
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

Akaire sends the reviewed note through the selected provider. Claude Code and Codex are spawned as subprocesses and communicate with their configured remote services. Ollama requests are sent to the configured base URL, which defaults to `http://localhost:11434`. Custom Ollama headers are stored using Obsidian SecretStorage and are included in both connection tests and chat requests. The bundled textlint integration runs entirely locally.

Claude Code and Codex authentication is handled by the selected CLI. For Ollama, Akaire stores and sends only the custom headers entered in its settings. Akaire does not include telemetry or an auto-update mechanism.

## Local system access

The Obsidian community directory flags two capabilities that Akaire uses by design. Both are required for the plugin to function, and what they are used for is described below.

- **Shell execution (`child_process`)**: Akaire spawns the selected Claude Code or Codex CLI and, for a vault-owned custom configuration, the `textlint` CLI. No shell is involved. The note body is passed through stdin rather than interpolated into a command.
- **Direct filesystem access (`fs`)**: Akaire uses the Node.js filesystem API to locate installed CLI executables on `PATH`, detect project-local `.textlintrc(.json)` files, and read the current note for the bundled textlint fallback. The configuration files and note are limited to the vault tree, while executable candidates can be outside the vault. Akaire does not write files through the Node.js filesystem API; per-note anchor state and inherited `.editor.md` files are handled through the Obsidian vault adapter.

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
