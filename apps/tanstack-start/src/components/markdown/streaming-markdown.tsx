"use client";

import { MarkdownRenderer } from "./markdown-renderer";

interface StreamingMarkdownProps {
  content: string;
  controls?: boolean;
  isStreaming?: boolean;
  reasoning?: boolean;
  className?: string;
}

export function StreamingMarkdown({
  content,
  controls,
  isStreaming = false,
  reasoning = false,
  className,
}: StreamingMarkdownProps) {
  return (
    <MarkdownRenderer
      className={className}
      content={content}
      controls={controls}
      isStreaming={isStreaming}
      mode="streaming"
      reasoning={reasoning}
    />
  );
}
