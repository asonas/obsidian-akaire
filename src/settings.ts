import { App, PluginSettingTab, Setting } from 'obsidian';
import type EditorPlugin from './main';

export type LlmProvider = 'claude' | 'codex' | 'ollama';

export type AkaireSettings = {
  provider: LlmProvider;
  claudeModel: string;
  codexModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
};

export const DEFAULT_SETTINGS: AkaireSettings = {
  provider: 'claude',
  claudeModel: 'sonnet',
  codexModel: '',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'gpt-oss',
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
      this.addTextSetting('Ollama URL', 'ローカル Ollama API のベース URL', 'ollamaBaseUrl');
      this.addTextSetting('Ollama model', '事前に pull 済みのモデル名', 'ollamaModel');
    }
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
