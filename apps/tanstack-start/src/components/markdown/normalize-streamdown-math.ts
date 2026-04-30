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

function isBlankLine(line: string) {
  return /^[\t ]*$/.test(line);
}

function isIndentedCodeLine(line: string) {
  return /^(?: {4,}|\t)/.test(line);
}

function shouldStartIndentedCodeBlock(line: string, plainTextBuffer: string[]) {
  if (!isIndentedCodeLine(line)) {
    return false;
  }

  const previousLine = plainTextBuffer.at(-1);
  return previousLine === undefined || isBlankLine(previousLine);
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
  let activeIndentedCodeBlock = false;
  let protectedBlockBuffer: string[] = [];

  const flushPlainTextBuffer = () => {
    if (plainTextBuffer.length === 0) {
      return;
    }

    segments.push(
      normalizeInlineCodeAwareMath(plainTextBuffer.join(lineEnding)),
    );
    plainTextBuffer.length = 0;
  };

  const flushProtectedBlockBuffer = () => {
    if (protectedBlockBuffer.length === 0) {
      return;
    }

    segments.push(protectedBlockBuffer.join(lineEnding));
    protectedBlockBuffer = [];
  };

  for (const line of lines) {
    if (activeFence) {
      protectedBlockBuffer.push(line);

      if (isClosingFence(line, activeFence)) {
        activeFence = null;
        flushProtectedBlockBuffer();
      }

      continue;
    }

    if (activeIndentedCodeBlock) {
      if (isIndentedCodeLine(line) || isBlankLine(line)) {
        protectedBlockBuffer.push(line);
        continue;
      }

      activeIndentedCodeBlock = false;
      flushProtectedBlockBuffer();
    }

    const openingFence = getOpeningFence(line);
    if (openingFence) {
      flushPlainTextBuffer();
      activeFence = openingFence;
      protectedBlockBuffer.push(line);
      continue;
    }

    if (shouldStartIndentedCodeBlock(line, plainTextBuffer)) {
      flushPlainTextBuffer();
      activeIndentedCodeBlock = true;
      protectedBlockBuffer.push(line);
      continue;
    }

    plainTextBuffer.push(line);
  }

  flushPlainTextBuffer();
  flushProtectedBlockBuffer();

  return segments.join(lineEnding);
}
