import { createBundledHighlighter, createSingletonShorthands } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

import type { ResolvedTheme } from "@redux/ui/components/theme";

const LANGUAGE_LOADERS = {
  css: () => import("@shikijs/langs/css"),
  diff: () => import("@shikijs/langs/diff"),
  dockerfile: () => import("@shikijs/langs/dockerfile"),
  go: () => import("@shikijs/langs/go"),
  graphql: () => import("@shikijs/langs/graphql"),
  html: () => import("@shikijs/langs/html"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  jsx: () => import("@shikijs/langs/jsx"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  markdown: () => import("@shikijs/langs/markdown"),
  php: () => import("@shikijs/langs/php"),
  powershell: () => import("@shikijs/langs/powershell"),
  prisma: () => import("@shikijs/langs/prisma"),
  python: () => import("@shikijs/langs/python"),
  ruby: () => import("@shikijs/langs/ruby"),
  rust: () => import("@shikijs/langs/rust"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  sql: () => import("@shikijs/langs/sql"),
  toml: () => import("@shikijs/langs/toml"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  xml: () => import("@shikijs/langs/xml"),
  yaml: () => import("@shikijs/langs/yaml"),
} as const;

const THEME_LOADERS = {
  "github-dark": () => import("@shikijs/themes/github-dark"),
  "github-light": () => import("@shikijs/themes/github-light"),
} as const;

type MarkdownLanguageId = keyof typeof LANGUAGE_LOADERS;
type MarkdownThemeId = keyof typeof THEME_LOADERS;
type MarkdownHighlighter = Awaited<ReturnType<typeof singletonGetHighlighter>>;

const PRELOADED_LANGUAGES: readonly MarkdownLanguageId[] = [
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

const KNOWN_LANGUAGE_IDS = new Set<MarkdownLanguageId>(
  Object.keys(LANGUAGE_LOADERS) as MarkdownLanguageId[],
);
const THEME_IDS = Object.keys(THEME_LOADERS) as MarkdownThemeId[];

const LANGUAGE_ALIASES: Record<string, MarkdownLanguageId | "text"> = {
  bash: "shellscript",
  cjs: "javascript",
  console: "shellscript",
  cts: "typescript",
  docker: "dockerfile",
  gql: "graphql",
  js: "javascript",
  json5: "json",
  jsonc: "json",
  md: "markdown",
  mts: "typescript",
  ps: "powershell",
  ps1: "powershell",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "shellscript",
  shell: "shellscript",
  text: "text",
  toml: "toml",
  ts: "typescript",
  txt: "text",
  xml: "xml",
  yml: "yaml",
  zsh: "shellscript",
};

const createHighlighter = createBundledHighlighter<
  MarkdownLanguageId,
  MarkdownThemeId
>({
  engine: () => createJavaScriptRegexEngine(),
  langs: LANGUAGE_LOADERS,
  themes: THEME_LOADERS,
});

const { getSingletonHighlighter: singletonGetHighlighter } =
  createSingletonShorthands(createHighlighter);

const loadedLanguages = new Set<string>(PRELOADED_LANGUAGES);

function isMarkdownLanguage(language: string): language is MarkdownLanguageId {
  return KNOWN_LANGUAGE_IDS.has(language as MarkdownLanguageId);
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

  return LANGUAGE_ALIASES[baseLanguage] ?? baseLanguage;
}

export function getShikiTheme(theme: ResolvedTheme): MarkdownThemeId {
  return theme === "dark" ? "github-dark" : "github-light";
}

export async function getShikiHighlighter(): Promise<MarkdownHighlighter> {
  return singletonGetHighlighter({
    langs: [...PRELOADED_LANGUAGES],
    themes: THEME_IDS,
  });
}

export async function ensureShikiLanguage(language: string) {
  if (language === "text" || language === "math") {
    return null;
  }

  if (!isMarkdownLanguage(language)) {
    return null;
  }

  if (loadedLanguages.has(language)) {
    return language;
  }

  try {
    const highlighter = await getShikiHighlighter();
    await highlighter.loadLanguage(language);
    loadedLanguages.add(language);
    return language;
  } catch {
    return null;
  }
}
