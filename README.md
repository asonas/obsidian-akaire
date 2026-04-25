# Obsidian Editor Plugin

Local AI editor that reviews your writing using Claude Code CLI, complementing textlint for grammar.

## Requirements

- Obsidian 1.5+
- Claude Code CLI (`claude` in PATH)
- Optional: textlint (`npx textlint --version` が動くこと)

## Configuration per note

Frontmatter:

```yaml
editor_prompt: "ブログ向け、です・ます調、専門用語は注釈"
editor_session: <auto>            # 初回レビュー時に自動で書き込まれる
editor_prompt_inherit: false      # 上位ディレクトリの .editor.md を無視
```

Directory inheritance: `<dir>/.editor.md` の内容が配下のノートのプロンプトに連結されます。

## State

`.editor-state/` 以下にコメントアンカーが保存されます。`.gitignore` に追加してください。

## Commands

- `Editor: Review whole note` — ノート全文をレビュー
- `Editor: Review changed paragraphs` — 前回レビュー以降に変更された段落のみをレビュー
- `Editor: Open sidebar` — サイドバーを開く

## Development

```bash
npm install
npm run dev   # esbuild
npm test      # vitest (22 tests)
npm run build # production build
```

## Architecture

- `src/core/` — PromptResolver, ClaudeRunner, TextlintRunner, AnchorStore, ReviewSession
- `src/editor/` — anchorMatcher, decoration (CodeMirror)
- `src/ui/` — SidebarView, CommentCard
- `src/util/` — paragraphHash, obsidianFs

詳細は `docs/superpowers/specs/2026-04-25-obsidian-editor-plugin-design.md` を参照（リポジトリ外）。
