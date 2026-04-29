"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";

import { cn } from "@redux/ui/lib/utils";

import {
  createMarkdownComponents,
  rehypePlugins,
  remarkPlugins,
} from "./markdown-components";
import { normalizeMarkdownMathDelimiters } from "./normalize-markdown-math";

interface StaticMarkdownProps {
  content: string;
  className?: string;
}

export function StaticMarkdown({ content, className }: StaticMarkdownProps) {
  const components = useMemo(() => createMarkdownComponents(), []);
  const normalizedContent = useMemo(
    () => normalizeMarkdownMathDelimiters(content),
    [content],
  );

  if (!normalizedContent) {
    return null;
  }

  return (
    <div className={cn("chat-markdown", className)}>
      <ReactMarkdown
        components={components}
        rehypePlugins={rehypePlugins}
        remarkPlugins={remarkPlugins}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
