import {
  App,
  Notice,
  PluginSettingTab,
  SecretComponent,
  Setting,
  type SettingDefinitionItem,
} from 'obsidian';
import type EditorPlugin from './main';

export type LlmProvider = 'claude' | 'codex' | 'ollama';

export type AkaireSettings = {
  provider: LlmProvider;
  claudeModel: string;
  codexModel: string;
  ollamaBaseUrl: string;
  ollamaHeadersSecret: string;
  ollamaModel: string;
  ollamaModels: string[];
};

export const DEFAULT_SETTINGS: AkaireSettings = {
  provider: 'claude',
  claudeModel: 'sonnet',
  codexModel: '',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaHeadersSecret: '',
  ollamaModel: 'gpt-oss',
  ollamaModels: [],
};

type SettingKey = Exclude<keyof AkaireSettings, 'ollamaHeadersSecret' | 'ollamaModels'>;

export class AkaireSettingTab extends PluginSettingTab {
  private testingOllama = false;

  constructor(app: App, private plugin: EditorPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem<SettingKey>[] {
    const modelOptions = Object.fromEntries(
      this.plugin.settings.ollamaModels.map((model) => [model, model]),
    );
    if (this.plugin.settings.ollamaModel
      && !(this.plugin.settings.ollamaModel in modelOptions)) {
      modelOptions[this.plugin.settings.ollamaModel] = this.plugin.settings.ollamaModel;
    }

    return [
      {
        name: 'LLM provider',
        desc: 'レビューと対話に使うプロバイダ',
        control: {
          type: 'dropdown',
          key: 'provider',
          options: {
            claude: 'Claude code',
            codex: 'Codex CLI',
            ollama: 'Ollama',
          },
        },
      },
      {
        name: 'Claude model',
        desc: '空欄なら Claude Code の既定値を使います',
        visible: () => this.plugin.settings.provider === 'claude',
        control: {
          type: 'text',
          key: 'claudeModel',
        },
      },
      {
        name: 'Codex model',
        desc: '空欄なら Codex CLI の既定値を使います',
        visible: () => this.plugin.settings.provider === 'codex',
        control: {
          type: 'text',
          key: 'codexModel',
        },
      },
      {
        name: 'Ollama URL',
        desc: 'Ollama API のベース URL。Cloudflare Access 経由の URL も指定できます',
        visible: () => this.plugin.settings.provider === 'ollama',
        control: {
          type: 'text',
          key: 'ollamaBaseUrl',
        },
      },
      {
        name: 'HTTP headers',
        desc: '1行に1つ「name: value」を記載したシークレットを選択します',
        visible: () => this.plugin.settings.provider === 'ollama',
        render: (setting: Setting) => {
          setting.addComponent((element) => new SecretComponent(this.app, element)
            .setValue(this.plugin.settings.ollamaHeadersSecret)
            .onChange(async (value) => {
              this.plugin.settings.ollamaHeadersSecret = value;
              await this.plugin.saveSettings();
            }));
        },
      },
      {
        name: this.testingOllama ? 'Testing connection…' : 'Test connection',
        desc: '接続を確認し、このサーバーで利用できるモデルを取得します',
        visible: () => this.plugin.settings.provider === 'ollama',
        disabled: () => this.testingOllama,
        action: () => {
          void this.testOllamaConnection();
        },
      },
      {
        name: 'Ollama model',
        desc: this.plugin.settings.ollamaModels.length > 0
          ? 'このサーバーにダウンロード済みのモデル'
          : '接続テストを実行するとモデルを選択できます',
        visible: () => this.plugin.settings.provider === 'ollama',
        control: {
          type: 'dropdown',
          key: 'ollamaModel',
          options: modelOptions,
          disabled: () => this.plugin.settings.ollamaModels.length === 0,
        },
      },
    ];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    switch (key) {
      case 'provider':
        if (value !== 'claude' && value !== 'codex' && value !== 'ollama') return;
        this.plugin.settings.provider = value;
        break;
      case 'claudeModel':
      case 'codexModel':
      case 'ollamaBaseUrl':
      case 'ollamaModel':
        if (typeof value !== 'string') return;
        this.plugin.settings[key] = value.trim();
        break;
      default:
        return;
    }

    await this.plugin.saveSettings();
    if (key === 'provider') this.refreshDomState();
  }

  private async testOllamaConnection(): Promise<void> {
    if (this.testingOllama) return;
    this.testingOllama = true;
    this.update();
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Ollama への接続に失敗しました: ${message}`, 8_000);
    } finally {
      this.testingOllama = false;
      this.update();
    }
  }
}
