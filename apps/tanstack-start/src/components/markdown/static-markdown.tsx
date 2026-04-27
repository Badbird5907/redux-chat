"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";

import { cn } from "@redux/ui/lib/utils";

import {
  createMarkdownComponents,
  rehypePlugins,
  remarkPlugins,
} from "./markdown-components";

interface StaticMarkdownProps {
  content: string;
  className?: string;
}

export function StaticMarkdown({ content, className }: StaticMarkdownProps) {
  const components = useMemo(() => createMarkdownComponents(), []);

  if (!content) {
    return null;
  }

  return (
    <div className={cn("chat-markdown", className)}>
      <ReactMarkdown
        components={components}
        rehypePlugins={rehypePlugins}
        remarkPlugins={remarkPlugins}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
