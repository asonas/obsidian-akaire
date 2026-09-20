import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type EditorPlugin from './main';

export type LlmProvider = 'claude' | 'codex' | 'ollama';

export type AkaireSettings = {
  provider: LlmProvider;
  claudeModel: string;
  codexModel: string;
  ollamaBaseUrl: string;
  ollamaHeaders: string;
  ollamaModel: string;
  ollamaModels: string[];
};

export const DEFAULT_SETTINGS: AkaireSettings = {
  provider: 'claude',
  claudeModel: 'sonnet',
  codexModel: '',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaHeaders: '',
  ollamaModel: 'gpt-oss',
  ollamaModels: [],
};

export class AkaireSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: EditorPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('LLM provider')
      .setDesc('レビューと対話に使うプロバイダ')
      .addDropdown((dropdown) => dropdown
        .addOption('claude', 'Claude code')
        .addOption('codex', 'Codex CLI')
        .addOption('ollama', 'Ollama')
        .setValue(this.plugin.settings.provider)
        .onChange(async (value) => {
          this.plugin.settings.provider = value as LlmProvider;
          await this.plugin.saveSettings();
          this.display();
        }));

    if (this.plugin.settings.provider === 'claude') {
      this.addTextSetting('Claude model', '空欄なら Claude Code の既定値を使います', 'claudeModel');
    } else if (this.plugin.settings.provider === 'codex') {
      this.addTextSetting('Codex model', '空欄なら Codex CLI の既定値を使います', 'codexModel');
    } else {
      this.addOllamaSettings();
    }
  }

  private addOllamaSettings(): void {
    this.addTextSetting(
      'Ollama URL',
      'Ollama API のベース URL。Cloudflare Access 経由の URL も指定できます',
      'ollamaBaseUrl',
    );

    new Setting(this.containerEl)
      .setName('HTTP headers')
      .setDesc('1行に1つ「name: value」で入力します。値は Obsidian のプラグインデータに保存されます')
      .addTextArea((text) => {
        text
          .setPlaceholder('Cf-access-client-id: ...\nCf-access-client-secret: ...')
          .setValue(this.plugin.settings.ollamaHeaders)
          .onChange((value) => {
            this.plugin.settings.ollamaHeaders = value;
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 42;
      });

    new Setting(this.containerEl)
      .setName('Connection')
      .setDesc('接続を確認し、このサーバーで利用できるモデルを取得します')
      .addButton((button) => button
        .setButtonText('Test connection')
        .onClick(async () => {
          button.setDisabled(true).setButtonText('Testing…');
          try {
            const models = await this.plugin.testOllamaConnection();
            this.plugin.settings.ollamaModels = models;
            if (models.length > 0 && !models.includes(this.plugin.settings.ollamaModel)) {
              this.plugin.settings.ollamaModel = models[0];
            }
            await this.plugin.saveSettings();
            new Notice(models.length > 0
              ? `Ollama に接続しました。${models.length}件のモデルを取得しました`
              : 'Ollama に接続しましたが、利用できるモデルがありません');
            this.display();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Ollama への接続に失敗しました: ${message}`, 8_000);
            button.setDisabled(false).setButtonText('Test connection');
          }
        }));

    new Setting(this.containerEl)
      .setName('Ollama model')
      .setDesc(this.plugin.settings.ollamaModels.length > 0
        ? 'このサーバーにダウンロード済みのモデル'
        : '接続テストを実行するとモデルを選択できます')
      .addDropdown((dropdown) => {
        for (const model of this.plugin.settings.ollamaModels) {
          dropdown.addOption(model, model);
        }
        if (this.plugin.settings.ollamaModel
          && !this.plugin.settings.ollamaModels.includes(this.plugin.settings.ollamaModel)) {
          dropdown.addOption(this.plugin.settings.ollamaModel, this.plugin.settings.ollamaModel);
        }
        dropdown
          .setValue(this.plugin.settings.ollamaModel)
          .setDisabled(this.plugin.settings.ollamaModels.length === 0)
          .onChange(async (value) => {
            this.plugin.settings.ollamaModel = value;
            await this.plugin.saveSettings();
          });
      });
  }

  private addTextSetting(
    name: string,
    description: string,
    key: 'claudeModel' | 'codexModel' | 'ollamaBaseUrl' | 'ollamaModel',
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(description)
      .addText((text) => text
        .setValue(this.plugin.settings[key])
        .onChange(async (value) => {
          this.plugin.settings[key] = value.trim();
          await this.plugin.saveSettings();
        }));
  }
}
