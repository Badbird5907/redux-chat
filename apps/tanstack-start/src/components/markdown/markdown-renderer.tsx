"use client";

import type { ThemeInput } from "streamdown";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { Streamdown } from "streamdown";

import { cn } from "@redux/ui/lib/utils";

import { streamdownComponents } from "./streamdown-components";

const mathPlugin = createMathPlugin({ singleDollarTextMath: true });

const streamdownPlugins = {
  code,
  math: mathPlugin,
} as const;

const shikiTheme: [ThemeInput, ThemeInput] = ["github-light", "github-dark"];

interface MarkdownRendererProps {
  content: string;
  className?: string;
  controls?: boolean;
  isStreaming?: boolean;
  mode: "static" | "streaming";
  reasoning?: boolean;
}

export function MarkdownRenderer({
  content,
  className,
  controls = true,
  isStreaming = false,
  mode,
  reasoning = false,
}: MarkdownRendererProps) {
  if (!content) {
    return null;
  }

  return (
    <Streamdown
      className={cn(
        "chat-markdown",
        reasoning && "chat-markdown--reasoning",
        className,
      )}
      components={streamdownComponents}
      controls={controls}
      isAnimating={isStreaming}
      lineNumbers={false}
      mode={mode}
      plugins={streamdownPlugins}
      shikiTheme={shikiTheme}
    >
      {content}
    </Streamdown>
  );
}
