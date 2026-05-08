# obsidian-akaire コミュニティ公開フロー

## 公開前チェックリスト

| 項目 | 状態 |
|---|---|
| `manifest.json` | OK |
| `README.md` | OK |
| `LICENSE` | **未** ← 追加必須 |
| GitHub remote | **未** |
| Git tag / GitHub Release | **未** |

## プラグインID再考

公式ガイドラインでは `id` / `name` に `obsidian-` プレフィックスや `Obsidian` を含めない方針。一度公開したIDは変更不可なので、`id: "obsidian-akaire"` → `"akaire"` にリネームしておくのが無難。`name: "Akaire"` はそのままでよい。

## 提出ステップ

### 1. LICENSE 追加

MIT推奨。`gh repo create` 時に `--license mit` で生成するか、別途ファイルを作成。

### 2. GitHubリポジトリ作成 + push

```sh
gh repo create asonas/obsidian-akaire --public --source=. --license mit --remote=origin --push
```

### 3. ビルド

```sh
pnpm run build
```

### 4. GitHub Release 作成

タグは `v` プレフィックスなしで `manifest.json` の `version` と完全一致させる。`main.js` / `manifest.json` / `styles.css` は **個別ファイルとしてアセット添付**（source.zip に含まれているだけではNG）。

```sh
gh release create 0.0.1 --title "0.0.1" --notes "Initial release" \
  dist/main.js manifest.json styles.css
```

### 5. obsidianmd/obsidian-releases へPR

```sh
gh repo fork obsidianmd/obsidian-releases --clone --remote=true
cd obsidian-releases
```

`community-plugins.json` の **末尾に追加**:

```json
{
  "id": "akaire",
  "name": "Akaire",
  "author": "asonas",
  "description": "Local AI editor that reviews your writing using Claude Code CLI",
  "repo": "asonas/obsidian-akaire"
}
```

注意点:

- `id` は `manifest.json` と完全一致
- `repo` は `owner/name` 形式（URLではない）
- 末尾のカンマやJSON構文エラーで自動チェックが落ちる

### 6. ブランチを切ってPR

```sh
git checkout -b add-akaire
git add community-plugins.json
git commit -m "Add Akaire plugin"
git push origin add-akaire
gh pr create --repo obsidianmd/obsidian-releases --base master --web
```

## PRテンプレートのチェックリスト

PR作成時、以下のテンプレートが自動で読み込まれる。すべて自分で確認してチェックを入れる。

- [ ] 高品質と認める／メンテを継続する誓約
- [ ] テストプラットフォーム: Windows / macOS / Linux / Android / iOS のどれで検証したか
- [ ] GitHub Release に `main.js` / `manifest.json` / `styles.css` が個別ファイルとしてアップ済み
- [ ] Release名が `manifest.json` の version と完全一致（`v` なし）
- [ ] `manifest.json` の `id` と `community-plugins.json` の `id` が一致
- [ ] README に目的・使い方が書かれている
- [ ] [Developer policies](https://docs.obsidian.md/Developer+policies) を読み、準拠していると判断した
- [ ] [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) を読み、self-review 済み
- [ ] LICENSE がある
- [ ] 他プラグインのコードを使っている場合、ライセンス互換性とREADMEへの帰属表示OK

## 審査の流れ

- 自動チェック（GitHub Actions の bot）が manifest 整合性、release ファイルの存在、ID重複などを検証
- 自動チェック通過後、Obsidianチームが手動レビュー（コードを実際に読まれる）
- 修正リクエストが来ることが多いので気長に対応
- マージは **Obsidianチームメンバーのみが可能**。他のコミュニティメンバーはコメントだけ
- 早ければ数日、レビュー混雑時は数週間〜1ヶ月

## 提出前の自己レビュー推奨ポイント

よく指摘される箇所:

- `console.log` をプロダクションで残さない
- `innerHTML` の使用を避け、`createEl()` などObsidian APIを使う
- グローバル名前空間に変数を漏らさない
- `setTimeout` / `setInterval` は `registerInterval()` でライフサイクルに登録
- 設定タブのラベルにアクセシビリティ配慮

## 最短コマンド列まとめ

```sh
cd /Users/asonas/ghq/github.com/asonas/obsidian-akaire

# 1. LICENSE作成 / manifest.json の id を "akaire" に変更（任意）
git add -A
git commit -m "Prepare for community release: LICENSE, rename id"

# 2. GitHub repo作成 + push
gh repo create asonas/obsidian-akaire --public --source=. --license mit --remote=origin --push

# 3. ビルド + リリース
pnpm run build
gh release create 0.0.1 --title "0.0.1" --notes "Initial release" \
  dist/main.js manifest.json styles.css

# 4. obsidian-releases にPR
gh repo fork obsidianmd/obsidian-releases --clone --remote=true
cd obsidian-releases
# community-plugins.json を編集してエントリ追加
git checkout -b add-akaire
git commit -am "Add Akaire plugin"
git push origin add-akaire
gh pr create --repo obsidianmd/obsidian-releases --base master --web
```

## 参考リンク

- [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
- [Submit your plugin - Developer Documentation](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)
- [Submission requirements for plugins](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins)
- [Developer policies](https://docs.obsidian.md/Developer+policies)
- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
