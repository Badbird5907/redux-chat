"use client";

import { MarkdownRenderer } from "./markdown-renderer";

interface StaticMarkdownProps {
  content: string;
  className?: string;
  controls?: boolean;
}

export function StaticMarkdown({
  content,
  className,
  controls,
}: StaticMarkdownProps) {
  return (
    <MarkdownRenderer
      className={className}
      content={content}
      controls={controls}
      mode="static"
    />
  );
}
