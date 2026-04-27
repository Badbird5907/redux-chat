import { createBundledHighlighter, createSingletonShorthands } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";

import {
  isMarkdownLanguage,
  isPlainTextLanguage,
  LANGUAGE_LOADERS,
  PRELOADED_LANGUAGES,
  THEME_IDS,
  THEME_LOADERS,
  type MarkdownLanguageId,
  type MarkdownThemeId,
} from "./shiki-config";
import type {
  HighlightErrorMessage,
  HighlightSuccessMessage,
  WorkerRequestMessage,
} from "./shiki-worker-types";

type MarkdownHighlighter = Awaited<ReturnType<typeof singletonGetHighlighter>>;

const workerScope = self as typeof globalThis & {
  onmessage: ((event: MessageEvent<WorkerRequestMessage>) => void) | null;
  postMessage: (
    message: HighlightSuccessMessage | HighlightErrorMessage,
  ) => void;
};
const createHighlighter = createBundledHighlighter<
  MarkdownLanguageId,
  MarkdownThemeId
>({
  engine: () => createOnigurumaEngine(import("shiki/wasm")),
  langs: LANGUAGE_LOADERS,
  themes: THEME_LOADERS,
});
const { getSingletonHighlighter: singletonGetHighlighter } =
  createSingletonShorthands(createHighlighter);

const highlightedHtmlCache = new Map<string, string>();
const languageLoaders = new Map<
  MarkdownLanguageId,
  Promise<MarkdownLanguageId | null>
>();

async function getShikiHighlighter(): Promise<MarkdownHighlighter> {
  return singletonGetHighlighter({
    langs: [...PRELOADED_LANGUAGES],
    themes: THEME_IDS,
  });
}

async function ensureShikiLanguage(
  language: string,
): Promise<MarkdownLanguageId | null> {
  if (isPlainTextLanguage(language) || !isMarkdownLanguage(language)) {
    return null;
  }

  const highlighter = await getShikiHighlighter();
  if (highlighter.getLoadedLanguages().includes(language)) {
    return language;
  }

  const existingLoad = languageLoaders.get(language);
  if (existingLoad) {
    return existingLoad;
  }

  const loadLanguage = highlighter
    .loadLanguage(language)
    .then(() => language)
    .catch(() => null)
    .finally(() => {
      languageLoaders.delete(language);
    });

  languageLoaders.set(language, loadLanguage);
  return loadLanguage;
}

workerScope.onmessage = async (
  event: MessageEvent<WorkerRequestMessage>,
) => {
  const message = event.data;

  if (message.type !== "highlight") {
    return;
  }

  const cachedHtml = highlightedHtmlCache.get(message.cacheKey);
  if (cachedHtml !== undefined) {
    const response: HighlightSuccessMessage = {
      type: "success",
      requestId: message.requestId,
      cacheKey: message.cacheKey,
      html: cachedHtml,
    };
    workerScope.postMessage(response);
    return;
  }

  try {
    const shikiLanguage = await ensureShikiLanguage(message.language);

    if (!shikiLanguage) {
      throw new Error(`Unsupported language: ${message.language}`);
    }

    const highlighter = await getShikiHighlighter();
    const html = highlighter.codeToHtml(message.code, {
      lang: shikiLanguage,
      theme: message.theme,
    });

    highlightedHtmlCache.set(message.cacheKey, html);

    const response: HighlightSuccessMessage = {
      type: "success",
      requestId: message.requestId,
      cacheKey: message.cacheKey,
      html,
    };
    workerScope.postMessage(response);
  } catch (error) {
    const response: HighlightErrorMessage = {
      type: "error",
      requestId: message.requestId,
      cacheKey: message.cacheKey,
      error:
        error instanceof Error
          ? error.message
          : "Unknown Shiki worker error",
    };
    workerScope.postMessage(response);
  }
};

export {};
