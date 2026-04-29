import { bundledLanguages, bundledLanguagesInfo } from "shiki/langs";

import type { ResolvedTheme } from "@redux/ui/components/theme";

export const LANGUAGE_LOADERS = bundledLanguages;

export const THEME_LOADERS = {
  "github-dark": () => import("@shikijs/themes/github-dark"),
  "github-light": () => import("@shikijs/themes/github-light"),
} as const;

export type MarkdownLanguageId = keyof typeof LANGUAGE_LOADERS;
export type MarkdownThemeId = keyof typeof THEME_LOADERS;

export const PRELOADED_LANGUAGES: readonly MarkdownLanguageId[] = [
  "shellscript",
  "javascript",
  "jsx",
  "typescript",
  "tsx",
  "json",
  "python",
  "html",
  "css",
  "sql",
  "yaml",
  "markdown",
] as const;

export const THEME_IDS = Object.keys(THEME_LOADERS) as MarkdownThemeId[];

const KNOWN_LANGUAGE_IDS = new Set<string>(Object.keys(LANGUAGE_LOADERS));
const LANGUAGE_ALIASES = new Map<string, MarkdownLanguageId>();
const PLAIN_TEXT_LANGUAGE_IDS = new Set([
  "text",
  "txt",
  "plaintext",
  "plain",
  "math",
]);

for (const language of bundledLanguagesInfo) {
  LANGUAGE_ALIASES.set(language.id, language.id as MarkdownLanguageId);

  for (const alias of language.aliases ?? []) {
    LANGUAGE_ALIASES.set(
      alias.toLowerCase(),
      language.id as MarkdownLanguageId,
    );
  }
}

export function isMarkdownLanguage(
  language: string,
): language is MarkdownLanguageId {
  return KNOWN_LANGUAGE_IDS.has(language);
}

export function isPlainTextLanguage(language: string) {
  return language === "text" || language === "math";
}

export function normalizeMarkdownLanguage(info: string | undefined): string {
  const firstToken = info?.trim().split(/\s+/, 1)[0]?.toLowerCase();

  if (!firstToken) {
    return "text";
  }

  const baseLanguage = firstToken.split("{", 1)[0]?.trim();

  if (!baseLanguage) {
    return "text";
  }

  if (PLAIN_TEXT_LANGUAGE_IDS.has(baseLanguage)) {
    return "text";
  }

  const normalizedLanguage = LANGUAGE_ALIASES.get(baseLanguage);
  if (normalizedLanguage) {
    return normalizedLanguage;
  }

  if (KNOWN_LANGUAGE_IDS.has(baseLanguage)) {
    return baseLanguage;
  }

  return "text";
}

export function getShikiTheme(theme: ResolvedTheme): MarkdownThemeId {
  return theme === "dark" ? "github-dark" : "github-light";
}
