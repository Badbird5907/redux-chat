"use client";

import { MarkdownRenderer } from "./markdown-renderer";

interface StaticMarkdownProps {
  content: string;
  className?: string;
}

export function StaticMarkdown({ content, className }: StaticMarkdownProps) {
  return (
    <MarkdownRenderer className={className} content={content} mode="static" />
  );
}
