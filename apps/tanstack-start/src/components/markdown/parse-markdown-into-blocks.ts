import { marked } from "marked";

export function parseMarkdownIntoBlocks(markdown: string): string[] {
  if (!markdown) {
    return [];
  }

  const blocks = marked.lexer(markdown).flatMap((token) => {
    if (token.type === "space" || typeof token.raw !== "string") {
      return [];
    }

    return token.raw.length > 0 ? [token.raw] : [];
  });

  return blocks.length > 0 ? blocks : [markdown];
}
