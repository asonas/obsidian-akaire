import { Plugin } from 'obsidian';

export default class EditorPlugin extends Plugin {
  async onload() {
    console.log('[editor-plugin] loaded');
  }

  async onunload() {
    console.log('[editor-plugin] unloaded');
  }
}
