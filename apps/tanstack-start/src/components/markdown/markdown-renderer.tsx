"use client";

import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { Streamdown } from "streamdown";
import type { ThemeInput } from "streamdown";

import { cn } from "@redux/ui/lib/utils";

import { normalizeStreamdownMath } from "./normalize-streamdown-math";
import { streamdownComponents } from "./streamdown-components";

const streamdownPlugins = {
  code,
  math,
} as const;

const shikiTheme: [ThemeInput, ThemeInput] = ["github-light", "github-dark"];

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
  mode: "static" | "streaming";
  reasoning?: boolean;
}

export function MarkdownRenderer({
  content,
  className,
  isStreaming = false,
  mode,
  reasoning = false,
}: MarkdownRendererProps) {
  if (!content) {
    return null;
  }

  const normalizedContent = normalizeStreamdownMath(content);

  return (
    <Streamdown
      className={cn(
        "chat-markdown",
        reasoning && "chat-markdown--reasoning",
        className,
      )}
      components={streamdownComponents}
      controls={false}
      isAnimating={isStreaming}
      lineNumbers={false}
      mode={mode}
      plugins={streamdownPlugins}
      shikiTheme={shikiTheme}
    >
      {normalizedContent}
    </Streamdown>
  );
}
