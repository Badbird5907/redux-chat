import { marked } from "marked";

function formatInlineMath(expression: string) {
  const trimmedExpression = expression.trim();

  return trimmedExpression.length > 0
    ? `$$ ${trimmedExpression} $$`
    : expression;
}

function formatDisplayMath(
  expression: string,
  linePrefix: string,
  lineEnding: "\n" | "\r\n",
) {
  const trimmedExpression = expression.trim();

  if (trimmedExpression.length === 0) {
    return expression;
  }

  const indentedExpression = trimmedExpression
    .split(/\r?\n/)
    .map((line) => `${linePrefix}${line}`)
    .join(lineEnding);

  return `$$${lineEnding}${indentedExpression}${lineEnding}${linePrefix}$$`;
}

function normalizePlainTextMathDelimiters(segment: string) {
  const lineEnding: "\n" | "\r\n" = segment.includes("\r\n") ? "\r\n" : "\n";

  const displayMathNormalized = segment.replace(
    /(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]/g,
    (match, expression: string, offset: number, source: string) => {
      const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
      const linePrefix = source.slice(lineStart, offset);

      if (/[^ \t>]/.test(linePrefix)) {
        return match;
      }

      return formatDisplayMath(expression, linePrefix, lineEnding);
    },
  );

  return displayMathNormalized.replace(
    /(?<!\\)\\\(([\s\S]*?)(?<!\\)\\\)/g,
    (_match, expression: string) => formatInlineMath(expression),
  );
}

function normalizeNonCodeMarkdown(segment: string) {
  let normalized = "";
  let cursor = 0;
  let plainTextStart = 0;

  while (cursor < segment.length) {
    if (segment[cursor] !== "`") {
      cursor += 1;
      continue;
    }

    let fenceLength = 1;
    while (segment[cursor + fenceLength] === "`") {
      fenceLength += 1;
    }

    const closingFence = "`".repeat(fenceLength);
    const closingIndex = segment.indexOf(closingFence, cursor + fenceLength);

    if (closingIndex === -1) {
      break;
    }

    normalized += normalizePlainTextMathDelimiters(
      segment.slice(plainTextStart, cursor),
    );
    normalized += segment.slice(cursor, closingIndex + fenceLength);
    cursor = closingIndex + fenceLength;
    plainTextStart = cursor;
  }

  return (
    normalized + normalizePlainTextMathDelimiters(segment.slice(plainTextStart))
  );
}

export function normalizeMarkdownMathDelimiters(markdown: string) {
  if (!markdown) {
    return markdown;
  }

  const tokens = marked.lexer(markdown);
  const reconstructed = tokens
    .map((token) => {
      if (typeof token.raw !== "string") {
        return "";
      }

      if (token.type === "code") {
        return token.raw;
      }

      return normalizeNonCodeMarkdown(token.raw);
    })
    .join("");

  return reconstructed.length > 0 ? reconstructed : markdown;
}
