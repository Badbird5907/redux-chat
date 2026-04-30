"use client";

import { MarkdownRenderer } from "./markdown-renderer";

interface StreamingMarkdownProps {
  content: string;
  isStreaming?: boolean;
  reasoning?: boolean;
  className?: string;
}

export function StreamingMarkdown({
  content,
  isStreaming = false,
  reasoning = false,
  className,
}: StreamingMarkdownProps) {
  return (
    <MarkdownRenderer
      className={className}
      content={content}
      isStreaming={isStreaming}
      mode="streaming"
      reasoning={reasoning}
    />
  );
}
