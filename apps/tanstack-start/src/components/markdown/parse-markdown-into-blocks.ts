import { marked } from "marked";

export type MarkdownBlock =
  | {
      type: "markdown";
      raw: string;
    }
  | {
      type: "code";
      raw: string;
      code: string;
      info?: string;
      isClosed: boolean;
    };

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isClosedFencedCodeBlock(raw: string) {
  const openingFenceMatch = /^ {0,3}([`~]{3,})[^\n]*(?:\n|$)/.exec(raw);

  if (!openingFenceMatch) {
    return true;
  }

  const openingFence = openingFenceMatch[1];
  if (!openingFence) {
    return true;
  }
  const openingFenceCharacter = openingFence.charAt(0);
  if (!openingFenceCharacter) {
    return true;
  }

  const closingFencePattern = new RegExp(
    `^ {0,3}${escapeRegex(openingFenceCharacter)}{${openingFence.length},}\\s*$`,
  );
  const lines = raw.split(/\r?\n/);

  if (lines.length <= 1) {
    return false;
  }

  return lines.slice(1).some((line) => closingFencePattern.test(line));
}

export function parseMarkdownIntoBlocks(markdown: string): MarkdownBlock[] {
  if (!markdown) {
    return [];
  }

  const blocks: MarkdownBlock[] = [];

  for (const token of marked.lexer(markdown)) {
    if (token.type === "space" || typeof token.raw !== "string") {
      continue;
    }

    if (token.raw.length === 0) {
      continue;
    }

    if (token.type === "code") {
      const { raw, text, lang } = token as {
        type: "code";
        raw: string;
        text: string;
        lang?: string;
      };
      const trimmedLang = lang?.trim();
      blocks.push({
        type: "code",
        raw,
        code: text,
        info: trimmedLang !== "" ? trimmedLang : undefined,
        isClosed: isClosedFencedCodeBlock(raw),
      });
      continue;
    }

    blocks.push({
      type: "markdown",
      raw: token.raw,
    });
  }

  return blocks.length > 0
    ? blocks
    : [
        {
          type: "markdown",
          raw: markdown,
        },
      ];
}
