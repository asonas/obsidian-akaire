import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
    },
    rules: {
      // Auto-fix replaces setTimeout/clearTimeout with activeWindow.* which
      // breaks our vitest tests (no Obsidian DOM in node). Not in the bot's
      // required list, so we keep node-friendly globals.
      "obsidianmd/prefer-active-window-timers": "off",
      "obsidianmd/prefer-active-doc": "off",
      // Bot did not require these; auto-fix migrating createEl→createDiv etc.
      // is safe but expansive. Leave off so review-bot output stays focused.
      "obsidianmd/prefer-create-el": "off",
      // Not in bot's required list; minAppVersion bump is a separate decision.
      "obsidianmd/no-unsupported-api": "off",
      // `any` is banned project-wide. Validate at the boundary into `unknown`,
      // then narrow with type guards or explicit assertions.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "test/**"],
  },
]);
