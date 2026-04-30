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

function normalizeInlineCodeAwareMath(segment: string) {
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

function getOpeningFence(line: string) {
  return /^ {0,3}([`~]{3,})[^\n]*$/.exec(line)?.[1];
}

function isClosingFence(line: string, openingFence: string) {
  const fenceCharacter = openingFence.charAt(0);

  return new RegExp(
    `^ {0,3}${fenceCharacter}{${openingFence.length},}\\s*$`,
  ).test(line);
}

export function normalizeStreamdownMath(markdown: string) {
  if (!markdown) {
    return markdown;
  }

  const lineEnding: "\n" | "\r\n" = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const segments: string[] = [];
  const plainTextBuffer: string[] = [];
  let activeFence: string | null = null;
  let fencedBlockBuffer: string[] = [];

  const flushPlainTextBuffer = () => {
    if (plainTextBuffer.length === 0) {
      return;
    }

    segments.push(
      normalizeInlineCodeAwareMath(plainTextBuffer.join(lineEnding)),
    );
    plainTextBuffer.length = 0;
  };

  const flushFencedBlockBuffer = () => {
    if (fencedBlockBuffer.length === 0) {
      return;
    }

    segments.push(fencedBlockBuffer.join(lineEnding));
    fencedBlockBuffer = [];
  };

  for (const line of lines) {
    if (activeFence) {
      fencedBlockBuffer.push(line);

      if (isClosingFence(line, activeFence)) {
        activeFence = null;
        flushFencedBlockBuffer();
      }

      continue;
    }

    const openingFence = getOpeningFence(line);
    if (openingFence) {
      flushPlainTextBuffer();
      activeFence = openingFence;
      fencedBlockBuffer.push(line);
      continue;
    }

    plainTextBuffer.push(line);
  }

  flushPlainTextBuffer();
  flushFencedBlockBuffer();

  return segments.join(lineEnding);
}
